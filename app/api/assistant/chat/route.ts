import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";
import { makeToolRegistry } from "@/server/mcp";
import { runAgentLoop } from "@/server/ai/agent";
import { classifyTopic, OFF_TOPIC_MESSAGES } from "@/server/ai/guardrails";
import type { AiMessage } from "@/server/ai/types";

// One expensive container per process, built from process.env (mirrors app/api/mcp/route.ts).
let containerPromise: Promise<Awaited<ReturnType<typeof buildContainer>>> | null = null;

function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] assistant build failed:", err);
      containerPromise = null; // allow retry on next request
      throw err;
    });
  }
  return containerPromise;
}

const MAX_MESSAGES = 50;

// Tools that change persisted data — the app must refresh its state after these.
const MUTATION_TOOLS = new Set([
  "create_plan",
  "update_plan",
  "delete_plan",
  "fork_plan",
  "set_default_plan",
  "add_income",
  "update_income",
  "delete_income",
  "add_expense",
  "update_expense",
  "delete_expense",
  "add_cashflow_change",
  "update_cashflow_change",
  "delete_cashflow_change",
  "add_loan",
  "update_loan",
  "delete_loan",
  "create_share_object",
  "update_share_object",
  "delete_share_object",
]);

function planIdsFromArgs(args: Record<string, any>): string[] {
  const ids = [args?.plan_id, args?._id].filter((v) => typeof v === "string" && v.length > 0);
  return [...new Set(ids)];
}

export async function POST(req: NextRequest) {
  const container = await getContainer();

  // Resolve the session exactly like http/app.ts Authenticate: auth-token header
  // wins, then the signed session_id cookie.
  let session_id =
    req.headers.get("auth-token") || req.headers.get("authtoken") || "";
  const signedCookie = req.cookies.get("session_id")?.value;
  if (signedCookie) {
    const verified = container.VerifyCookie(signedCookie, container.cookieSecret);
    if (verified) session_id = verified;
  }
  if (!session_id) {
    return NextResponse.json({ error: { message: "unauthenticated" } }, { status: 401 });
  }

  const session = await container.session_list.FindByActiveSessionId(session_id);
  if (!session) {
    return NextResponse.json({ error: { message: "unauthenticated" } }, { status: 401 });
  }
  const user_id = session.user_id;
  await container.app.CheckSession({ user_id, session_id });

  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const messages = parseMessages(body?.messages);
  if (!messages) {
    return NextResponse.json(
      { error: { message: "messages must be a non-empty array of { role, content } (max 50)" } },
      { status: 400 }
    );
  }

  // Guardrail gate: block clear-cut off-topic requests BEFORE any LLM cost.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const verdict = lastUserMessage ? classifyTopic(lastUserMessage.content) : { decision: "allow" as const };
  if (verdict.decision === "block") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", code: "OFF_TOPIC", message: OFF_TOPIC_MESSAGES[verdict.reason] ?? "That's outside what I can help with." })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Optional session_id: must be a string; ownership checked via GetChatSession.
  let chatSessionId: string | null = null;
  if (body?.session_id !== undefined && body?.session_id !== null) {
    if (typeof body.session_id !== "string" || body.session_id.length === 0) {
      return NextResponse.json(
        { error: { message: "session_id must be a string" } },
        { status: 400 }
      );
    }
    chatSessionId = body.session_id;
  }

  // Load stored history for the given session (404 if missing or not owned).
  let storedHistory: { role: "user" | "assistant"; content: string }[] = [];
  if (chatSessionId) {
    try {
      const stored = await container.app.GetChatSession({ user_id, session_id: chatSessionId });
      // Token economy: replay only the recent tail of the conversation, cap
      // oversized single messages, and remind the model which tools already ran
      // (so resumed turns skip re-discovery like whoami/list_plans).
      storedHistory = (Array.isArray(stored.messages) ? stored.messages : [])
        .slice(-30)
        .map((m: any) => {
          const base = typeof m.content === "string" ? m.content.slice(0, 4000) : "";
          const tools = Array.isArray(m.tools) ? m.tools : [];
          const suffix =
            tools.length > 0
              ? `\n\n(earlier in this chat I ran tools: ${tools.join(", ")})`
              : "";
          return { role: m.role, content: base + suffix };
        });
    } catch {
      return NextResponse.json({ error: { message: "session not found" } }, { status: 404 });
    }
  }

  if (!container.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: { message: "AI not configured" } }, { status: 503 });
  }

  // Create the session up front so the FIRST SSE event can carry its id.
  // It is only ever created when a message actually arrives; if the turn fails
  // before anything is persisted, the empty session is rolled back (finally).
  let chatSessionCreatedHere = false;
  if (!chatSessionId) {
    const firstUserMessage = messages.find((m) => m.role === "user");
    const created = await container.app.CreateChatSession({
      user_id,
      title: firstUserMessage ? firstUserMessage.content.slice(0, 60) : undefined,
    });
    chatSessionId = created.session_id;
    chatSessionCreatedHere = true;
  }

  // Model context = stored history + the incoming messages (the client is not
  // trusted to repeat history, so storedHistory is never duplicated).
  const contextMessages: AiMessage[] = [...storedHistory, ...messages];

  const registry = makeToolRegistry(container);
  const encoder = new TextEncoder();

  let collectedSegments: string[] = [];
  let currentSegment = "";
  let hadToolActivity = false;
  let streamErrored = false;
  const ranTools = new Set<string>();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "session", id: chatSessionId })}\n\n`)
      );
      try {
        await runAgentLoop({
          ctx: { user_id },
          messages: contextMessages,
          registry,
          provider: container.ai_provider,
          onEvent: (event) => {
            if (event.type === "text") {
              currentSegment += event.text;
            }
            if (event.type === "tool_call") {
              ranTools.add(event.name);
              if (currentSegment) {
                collectedSegments.push(currentSegment);
                currentSegment = "";
              }
              if (MUTATION_TOOLS.has(event.name)) {
                // Tell the app its local state is stale so it can refresh.
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "mutation",
                      tools: [event.name],
                      plan_ids: planIdsFromArgs(event.args),
                    })}\n\n`
                  )
                );
              }
            }
            if (event.type === "tool_result") {
              hadToolActivity = true;
            }
            if (event.type === "error") {
              streamErrored = true;
              // Agent-loop failures never throw — surface them to server logs
              // (Vercel) with enough context to debug.
              console.error(
                `[fi-plan] assistant error (user=${user_id}, session=${chatSessionId}): ${event.code ? `[${event.code}] ` : ""}${event.message}`
              );
            }
            if (event.type === "tool_result" && !event.ok) {
              console.error(
                `[fi-plan] assistant tool failure (user=${user_id}, session=${chatSessionId}): ${event.name} -> ${event.error || "unknown"}`
              );
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          },
        });
      } catch (e: any) {
        streamErrored = true;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: String(e?.message || e) })}\n\n`)
        );
      } finally {
        const persisted = await persistChat();
        // Roll back a session that was created for this request but never got a
        // message persisted (LLM/stream failure) — no empty sessions in the list.
        if (chatSessionCreatedHere && !persisted) {
          await container.app
            .DeleteChatSession({ user_id, session_id: chatSessionId! })
            .catch((e: any) => console.error("[fi-plan] empty-session rollback failed:", e?.message || e));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  const userMessages = messages.filter((m) => m.role === "user");

  async function persistChat(): Promise<boolean> {
    if (currentSegment) {
      collectedSegments.push(currentSegment);
      currentSegment = "";
    }
    const assistantText = collectedSegments.join("\n\n").trim();
    if (streamErrored || (!assistantText && !hadToolActivity)) return false;
    for (const message of userMessages) {
      await appendMessage(message.role, message.content);
    }
    if (assistantText)
      await appendMessage("assistant", assistantText, ranTools.size ? [...ranTools] : undefined);
    return true;
  }

  async function appendMessage(role: "user" | "assistant", content: string, tools?: string[]) {
    try {
      await container.app.AppendChatMessage({
        user_id,
        session_id: chatSessionId!,
        role,
        content,
        tools,
      });
    } catch (e: any) {
      console.error("[fi-plan] chat persistence failed:", e?.message || e);
    }
  }

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

export function GET() {
  return new NextResponse("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

function parseMessages(raw: unknown): AiMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out: AiMessage[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const role = (item as any).role;
    const content = (item as any).content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || !content.trim()) return null;
    out.push({ role, content });
  }
  return out;
}

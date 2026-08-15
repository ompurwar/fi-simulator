import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";
import { makeToolRegistry } from "@/server/mcp";
import { runAgentLoop } from "@/server/ai/agent";
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

  if (!container.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: { message: "AI not configured" } }, { status: 503 });
  }

  const registry = makeToolRegistry(container);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runAgentLoop({
          ctx: { user_id },
          messages,
          registry,
          provider: container.ai_provider,
          onEvent: (event) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          },
        });
      } catch (e: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: String(e?.message || e) })}\n\n`)
        );
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
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

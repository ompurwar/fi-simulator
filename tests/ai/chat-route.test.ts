import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildContainer } from "@/server/di/container";
import { NextRequest } from "next/server";

// The route builds its own container from process.env — set env BEFORE importing it.
const mongo = await MongoMemoryServer.create();
process.env.DB_URL = mongo.getUri();
process.env.DB_NAME = "fi_plan_test_ai_chat";
process.env.COOKIE_SECRET = "test-cookie-secret";

const { POST, GET } = await import("../../app/api/assistant/chat/route");

async function chat(body: unknown, headers: Record<string, string> = {}) {
  const res = await POST(
    new NextRequest("http://localhost:3001/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, text: await res.text() };
}

function parseSse(text: string): any[] {
  const events: any[] = [];
  for (const frame of text.split("\n\n")) {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload && payload !== "[DONE]") events.push(JSON.parse(payload));
    }
  }
  return events;
}

// Text-only Anthropic SSE (no tool_use) so the agent loop completes with text.
const TEXT_ONLY_SSE = [
  { type: "message_start", message: { id: "msg_1" } },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
  { type: "content_block_stop", index: 0 },
  { type: "message_stop" },
];

function sseBody(events: any[]): ReadableStream<Uint8Array> {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

// Assistant turn that creates a plan (a mutation tool).
const CREATE_PLAN_SSE = [
  { type: "message_start", message: { id: "msg_1" } },
  { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "create_plan", input: {} } },
  { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"title":"Assistant Made","monthly_income":100000,"monthly_expense":40000}' } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Created your plan." } },
  { type: "content_block_stop", index: 1 },
  { type: "message_stop" },
];

describe("in-app assistant chat route", () => {
  let session_id: string;
  let user_id: string;

  beforeAll(async () => {
    // Same env as the route → same database; the route's own container will see this session.
    const container = await buildContainer();
    const session = await container.app.Signup({
      email: `chat-${Date.now()}@test.com`,
      password: "secret123",
      first_name: "Chat",
      last_name: "User",
    });
    session_id = session.session_id;
    user_id = session.user_id;
  });

  it("rejects POST without a session (401)", async () => {
    const res = await chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(401);
  });

  it("rejects a valid session with a 503 when the server has no API key", async () => {
    const res = await chat(
      { messages: [{ role: "user", content: "hi" }] },
      { "auth-token": session_id }
    );
    expect(res.status).toBe(503);
    expect(res.text).toContain("AI not configured");
  });

  it("blocks off-topic requests via the guardrail gate — no LLM, no session, friendly error", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const res = await chat(
      { messages: [{ role: "user", content: "write a python function to sort a list" }] },
      { "auth-token": session_id }
    );
    const events = parseSse(res.text);

    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "OFF_TOPIC" });
    expect(events[0].message).toContain("financial planning assistant");
    expect(res.text).toContain("[DONE]");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("allows small talk and plan questions through the guardrail gate", async () => {
    const res = await chat(
      { messages: [{ role: "user", content: "what's my current runway?" }] },
      { "auth-token": session_id }
    );
    // No API key here → the request passes the guardrail and hits the 503 key check.
    expect(res.status).toBe(503);
  });

  it("rejects a malformed messages payload (400)", async () => {
    const res = await chat({ messages: "nope" }, { "auth-token": session_id });
    expect(res.status).toBe(400);
  });

  it("rejects a non-string session_id (400)", async () => {
    const res = await chat(
      { session_id: 123, messages: [{ role: "user", content: "hi" }] },
      { "auth-token": session_id }
    );
    expect(res.status).toBe(400);
  });

  it("answers GET with 405", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });

  describe("chat session persistence (with a stubbed provider)", () => {
    let keyedPost: typeof POST;
    let container: Awaited<ReturnType<typeof buildContainer>>;

    beforeAll(async () => {
      // The route caches its container per module instance. The instance above
      // was already built without a key, so reset the module registry and
      // re-import so a fresh route module builds its container with
      // ANTHROPIC_API_KEY from process.env.
      process.env.ANTHROPIC_API_KEY = "test-key";
      vi.resetModules();
      const keyed = await import("../../app/api/assistant/chat/route");
      keyedPost = keyed.POST;
      container = await buildContainer();
    });

    afterEach(() => vi.restoreAllMocks());

    async function chatKeyed(body: unknown) {
      const res = await keyedPost(
        new NextRequest("http://localhost:3001/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "auth-token": session_id },
          body: JSON.stringify(body),
        })
      );
      return { status: res.status, text: await res.text() };
    }

    it("emits the session event first and appends user + assistant messages", async () => {
      const created = await container.app.CreateChatSession({ user_id, title: "First" });
      const sid = created.session_id;
      await container.app.AppendChatMessage({ user_id, session_id: sid, role: "user", content: "stored hello" });
      await container.app.AppendChatMessage({ user_id, session_id: sid, role: "assistant", content: "stored hi back" });

      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(sseBody(TEXT_ONLY_SSE), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      );

      const res = await chatKeyed({
        session_id: sid,
        messages: [{ role: "user", content: "continue" }],
      });
      expect(res.status).toBe(200);
      const events = parseSse(res.text);
      expect(events[0]).toEqual({ type: "session", id: sid });
      expect(events).toContainEqual({ type: "text", text: "Hello" });
      expect(events[events.length - 1]).toEqual({ type: "done" });

      const stored = await container.app.GetChatSession({ user_id, session_id: sid });
      expect(stored.messages).toHaveLength(4);
      expect(stored.messages[0]).toMatchObject({ role: "user", content: "stored hello" });
      expect(stored.messages[1]).toMatchObject({ role: "assistant", content: "stored hi back" });
      expect(stored.messages[2]).toMatchObject({ role: "user", content: "continue" });
      expect(stored.messages[3]).toMatchObject({ role: "assistant", content: "Hello world" });
      // history was not duplicated into the stored session
      expect(stored.messages.filter((m: any) => m.content === "stored hello").length).toBe(1);
    });

    it("creates a session when no session_id is given", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(sseBody(TEXT_ONLY_SSE), { status: 200 })
      );

      const res = await chatKeyed({
        messages: [{ role: "user", content: "what is my runway" }],
      });
      expect(res.status).toBe(200);
      const events = parseSse(res.text);
      expect(events[0].type).toBe("session");
      expect(events[0].id).toBeTruthy();

      const sessions = await container.app.ListChatSessions({ user_id });
      expect(sessions.some((s: any) => s._id === events[0].id)).toBe(true);

      const stored = await container.app.GetChatSession({ user_id, session_id: events[0].id });
      expect(stored.title).toBe("what is my runway");
      expect(stored.messages).toHaveLength(2);
      expect(stored.messages[0]).toMatchObject({ role: "user", content: "what is my runway" });
      expect(stored.messages[1]).toMatchObject({ role: "assistant", content: "Hello world" });
    });

    it("returns 404 for a session_id the user does not own", async () => {
      const other = await container.app.Signup({
        email: `other-${Date.now()}@test.com`,
        password: "secret123",
        first_name: "Other",
        last_name: "User",
      });
      const created = await container.app.CreateChatSession({ user_id: other.user_id });
      const res = await chatKeyed({
        session_id: created.session_id,
        messages: [{ role: "user", content: "hi" }],
      });
      expect(res.status).toBe(404);
    });

    it("persists the user's question even when the stream errors (no silent data loss)", async () => {
      const created = await container.app.CreateChatSession({ user_id });
      const sid = created.session_id;

      // Non-200 → the provider throws → the loop emits an error event
      vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 429 }));

      const res = await chatKeyed({
        session_id: sid,
        messages: [{ role: "user", content: "boom" }],
      });
      expect(res.status).toBe(200);
      const events = parseSse(res.text);
      expect(events.some((e) => e.type === "error")).toBe(true);

      const stored = await container.app.GetChatSession({ user_id, session_id: sid });
      expect(stored.messages).toHaveLength(1);
      expect(stored.messages[0]).toMatchObject({ role: "user", content: "boom" });
    });

    it("keeps a session created for a failed turn, with the user's question recorded", async () => {
      // Non-200 → the provider throws → the loop errors after the question is saved
      vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 429 }));

      const res = await chatKeyed({
        messages: [{ role: "user", content: "will fail" }],
      });
      expect(res.status).toBe(200);
      const events = parseSse(res.text);
      const sessionId = events[0].id;

      expect(events.some((e) => e.type === "error")).toBe(true);
      const sessions = await container.app.ListChatSessions({ user_id });
      expect(sessions.some((s: any) => s._id === sessionId)).toBe(true);
      const stored = await container.app.GetChatSession({ user_id, session_id: sessionId });
      expect(stored.messages).toHaveLength(1);
      expect(stored.messages[0]).toMatchObject({ role: "user", content: "will fail" });
    });

    it("retry re-runs over stored history without duplicating the user message", async () => {
      const created = await container.app.CreateChatSession({ user_id, title: "retry test" });
      const sid = created.session_id;
      await container.app.AppendChatMessage({ user_id, session_id: sid, role: "user", content: "what is my runway" });

      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(sseBody(TEXT_ONLY_SSE), { status: 200 })
      );

      const res = await chatKeyed({ session_id: sid, retry: true, messages: [] });
      expect(res.status).toBe(200);
      const events = parseSse(res.text);
      expect(events[0]).toEqual({ type: "session", id: sid });
      expect(events.some((e) => e.type === "text")).toBe(true);

      // exactly ONE user message + ONE assistant reply — no duplicate prompt
      const stored = await container.app.GetChatSession({ user_id, session_id: sid });
      expect(stored.messages).toHaveLength(2);
      expect(stored.messages[0]).toMatchObject({ role: "user", content: "what is my runway" });
      expect(stored.messages[1]).toMatchObject({ role: "assistant", content: "Hello world" });
    });

    it("rejects retry without a session_id (400)", async () => {
      const res = await chatKeyed({ retry: true, messages: [] });
      expect(res.status).toBe(400);
    });

    it("emits a mutation event when the assistant calls a mutating tool", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(sseBody(CREATE_PLAN_SSE), { status: 200 })
      );

      const res = await chatKeyed({
        messages: [{ role: "user", content: "create a plan called Assistant Made" }],
      });
      expect(res.status).toBe(200);
      const events = parseSse(res.text);

      const mutation = events.find((e) => e.type === "mutation");
      expect(mutation).toMatchObject({ type: "mutation", tools: ["create_plan"] });

      // and the plan really was persisted
      const plans = await container.app.GetPlan({ user_id });
      expect(plans.some((p: any) => p.title === "Assistant Made")).toBe(true);
    });
  });
});

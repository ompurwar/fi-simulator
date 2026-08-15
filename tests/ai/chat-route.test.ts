import { describe, expect, it, beforeAll } from "vitest";
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

describe("in-app assistant chat route", () => {
  let session_id: string;

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

  it("rejects a malformed messages payload (400)", async () => {
    const res = await chat({ messages: "nope" }, { "auth-token": session_id });
    expect(res.status).toBe(400);
  });

  it("answers GET with 405", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});

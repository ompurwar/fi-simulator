import { describe, it, expect, beforeAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildContainer } from "@/server/di/container";
import { NextRequest } from "next/server";

// The route builds its own container from process.env — set env BEFORE importing it.
const mongo = await MongoMemoryServer.create();
process.env.DB_URL = mongo.getUri();
process.env.DB_NAME = "fi_plan_test_mcp";
process.env.COOKIE_SECRET = "test-cookie-secret";

const { POST, GET } = await import("../../app/api/mcp/route");

async function rpc(method: string, params: any, token?: string, id = 1) {
  const body = { jsonrpc: "2.0", id, method, params };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await POST(new NextRequest("http://localhost:3001/api/mcp", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, text: await res.text() };
}

describe("MCP over HTTP (stateless route)", () => {
  let container: Awaited<ReturnType<typeof buildContainer>>;
  let user_id: string;
  let token: string;

  beforeAll(async () => {
    container = await buildContainer();
    const session = await container.app.Signup({ email: `mcp-${Date.now()}@test.com`, password: "secret123", first_name: "MCP", last_name: "User" });
    user_id = session.user_id;
    const created = await container.app.CreateApiToken({ user_id, name: "test-agent" });
    token = created.api_token;
  });

  it("initializes over POST and lists the plan via an authenticated tools/call", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "vitest", version: "1" } }, token, 0);
    expect(init.status).toBe(200);
    expect(init.text).toContain("protocolVersion");

    const call = await rpc("tools/call", { name: "list_plans", arguments: {} }, token);
    expect(call.status).toBe(200);
    const parsed = JSON.parse(call.text);
    const text = parsed.result?.content?.[0]?.text;
    expect(JSON.parse(text).ok).toBe(true);
  });

  it("rejects tools/call without a token (UNAUTHORIZED)", async () => {
    const call = await rpc("tools/call", { name: "list_plans", arguments: {} }, undefined);
    const parsed = JSON.parse(call.text);
    const text = parsed.result?.content?.[0]?.text;
    expect(JSON.parse(text).error.code).toBe("UNAUTHORIZED");
  });

  it("rejects tools/call with a revoked token", async () => {
    await container.app.RevokeApiToken({ user_id, token_id: (await container.app.ListApiTokens({ user_id }))[0]._id });
    const call = await rpc("tools/call", { name: "list_plans", arguments: {} }, token);
    const parsed = JSON.parse(call.text);
    const text = parsed.result?.content?.[0]?.text;
    expect(JSON.parse(text).error.code).toBe("UNAUTHORIZED");
  });

  it("answers GET without 500 (SSE stream or 405, per spec)", async () => {
    const res = await GET(new NextRequest("http://localhost:3001/api/mcp", { method: "GET", headers: { Accept: "text/event-stream" } }));
    expect([200, 405]).toContain(res.status);
  });
});

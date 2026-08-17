import { describe, it, expect, beforeAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createHash } from "crypto";
import { buildContainer } from "@/server/di/container";
import { NextRequest } from "next/server";
import { oauthGet, oauthPost } from "@/server/mcp/oauth/handlers";

const mongo = await MongoMemoryServer.create();
process.env.DB_URL = mongo.getUri();
process.env.DB_NAME = "fi_plan_test_oauth";
process.env.COOKIE_SECRET = "test-cookie-secret";
process.env.MCP_ENABLED = "true";
process.env.CLIENT_APPLICATION = "http://localhost:3001";

const ORIGIN = "http://localhost:3001";
const REDIRECT_URI = "http://localhost:4000/callback";

let container: Awaited<ReturnType<typeof buildContainer>>;

function s256(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function get(path: string, searchParams: Record<string, string> = {}, cookie?: string) {
  const url = new URL(`${ORIGIN}${path}`);
  for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
  const req = new NextRequest(url.toString(), {
    method: "GET",
    headers: cookie ? { Cookie: `session_id=${cookie}` } : {},
  });
  return oauthGet(req, container);
}

async function post(path: string, body: Record<string, string>, cookie?: string, contentType = "application/json") {
  const req = new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType, ...(cookie ? { Cookie: `session_id=${cookie}` } : {}) },
    body: contentType.includes("form") ? new URLSearchParams(body).toString() : JSON.stringify(body),
  });
  return oauthPost(req, container);
}

describe("OAuth 2.1 MCP authorization server", () => {
  let sessionCookie: string;
  let client_id: string;

  beforeAll(async () => {
    container = await buildContainer();
    const session = await container.app.Signup({
      email: `oauth-${Date.now()}@test.com`,
      password: "secret123",
      first_name: "OAuth",
      last_name: "User",
    });
    sessionCookie = container.UnsafeSign(session.session_id, container.cookieSecret);
  });

  it("serves OAuth metadata at /.well-known/oauth-authorization-server", async () => {
    const res = await get("/api/mcp/.well-known/oauth-authorization-server");
    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta.authorization_endpoint).toContain("/api/mcp/oauth/authorize");
    expect(meta.token_endpoint).toContain("/api/mcp/oauth/token");
    expect(meta.code_challenge_methods_supported).toContain("S256");
  });

  it("registers a dynamic MCP client (RFC 7591)", async () => {
    const req = new NextRequest(`${ORIGIN}/api/mcp/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "claude-desktop", redirect_uris: [REDIRECT_URI] }),
    });
    const direct = await oauthPost(req, container);
    expect(direct.status).toBe(200);
    const client = await direct.json();
    expect(client.client_id).toMatch(/^fp_oc_/);
    expect(client.redirect_uris).toContain(REDIRECT_URI);
    expect(client.token_endpoint_auth_method).toBe("none");
    client_id = client.client_id;
  });

  it("rejects registration with a bogus redirect_uri", async () => {
    const req = new NextRequest(`${ORIGIN}/api/mcp/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "x", redirect_uris: ["not-a-url"] }),
    });
    const res = await oauthPost(req, container);
    expect(res.status).toBe(400);
  });

  it("redirects unauthenticated /authorize to the app login (oauth flow param)", async () => {
    const res = await get("/api/mcp/oauth/authorize", {
      client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: s256("verifier-1"),
      code_challenge_method: "S256",
      state: "st-1",
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("/login?oauth=fp_oar_");
  });

  it("completes the flow with a valid session and issues a code (IndMoney-style)", async () => {
    const res = await get(
      "/api/mcp/oauth/authorize",
      {
        client_id,
        redirect_uri: REDIRECT_URI,
        code_challenge: s256("verifier-1"),
        code_challenge_method: "S256",
        state: "st-1",
      },
      sessionCookie
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") || "");
    expect(location.origin).toBe("http://localhost:4000");
    expect(location.searchParams.get("code")).toMatch(/^fp_ocd_/);
    expect(location.searchParams.get("state")).toBe("st-1");
    globalThis.__code = location.searchParams.get("code") as string;
  });

  it("rejects code exchange with a wrong PKCE verifier", async () => {
    const res = await post(
      "/api/mcp/oauth/token",
      {
        grant_type: "authorization_code",
        client_id,
        code: (globalThis as any).__code,
        code_verifier: "wrong-verifier",
        redirect_uri: REDIRECT_URI,
      },
      undefined,
      "application/x-www-form-urlencoded"
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_grant");
  });

  it("exchanges the code with the correct verifier and issues tokens", async () => {
    const res = await post(
      "/api/mcp/oauth/token",
      {
        grant_type: "authorization_code",
        client_id,
        code: (globalThis as any).__code,
        code_verifier: "verifier-1",
        redirect_uri: REDIRECT_URI,
      },
      undefined,
      "application/x-www-form-urlencoded"
    );
    expect(res.status).toBe(200);
    const tokens = await res.json();
    expect(tokens.access_token).toMatch(/^fp_oa_/);
    expect(tokens.refresh_token).toMatch(/^fp_or_/);
    expect(tokens.token_type).toBe("Bearer");
    globalThis.__access = tokens.access_token;
    globalThis.__refresh = tokens.refresh_token;
  });

  it("codes are single-use — a second exchange fails", async () => {
    const res = await post(
      "/api/mcp/oauth/token",
      {
        grant_type: "authorization_code",
        client_id,
        code: (globalThis as any).__code,
        code_verifier: "verifier-1",
        redirect_uri: REDIRECT_URI,
      },
      undefined,
      "application/x-www-form-urlencoded"
    );
    expect(res.status).toBe(400);
  });

  it("MCP tools accept the OAuth access token (fp_oa_)", async () => {
    const { POST: mcpPost } = await import("../../app/api/mcp/route");
    const res = await mcpPost(
      new NextRequest(`${ORIGIN}/api/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${(globalThis as any).__access}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_plans", arguments: {} } }),
      })
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(await res.text());
    const text = parsed.result?.content?.[0]?.text;
    expect(JSON.parse(text).ok).toBe(true);
  });

  it("refreshes tokens (refresh_token grant) and rotates", async () => {
    const res = await post(
      "/api/mcp/oauth/token",
      {
        grant_type: "refresh_token",
        client_id,
        refresh_token: (globalThis as any).__refresh,
      },
      undefined,
      "application/x-www-form-urlencoded"
    );
    expect(res.status).toBe(200);
    const tokens = await res.json();
    expect(tokens.access_token).toMatch(/^fp_oa_/);
  });

  it("revokes the access token — MCP then rejects it with 401", async () => {
    const res = await post("/api/mcp/oauth/revoke", { token: (globalThis as any).__access });
    expect(res.status).toBe(200);

    const { POST: mcpPost } = await import("../../app/api/mcp/route");
    const mcpRes = await mcpPost(
      new NextRequest(`${ORIGIN}/api/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${(globalThis as any).__access}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_plans", arguments: {} } }),
      })
    );
    expect(mcpRes.status).toBe(401);
  });

  it("rejects the MCP authorize continue without a session", async () => {
    const res = await post("/api/mcp/oauth/authorize", { oauth_id: "fp_oar_none" });
    expect(res.status).toBe(401);
  });
});

import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";
import { makeMcpServer, resolveApiToken, makeAuthInfo } from "@/server/mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

// Stateless MCP endpoint: stateless transports are single-use by design ("cannot
// be reused across requests"), so each POST gets a fresh transport; the SDK
// Protocol forbids double connect, so each request also gets a fresh McpServer
// (tool registration is cheap; the expensive container is cached below).
// Auth: `Authorization: Bearer fp_<token>` resolved per-request and injected via
// the SDK's first-class authInfo channel. Missing/invalid tokens get a spec-compliant
// HTTP 401 + WWW-Authenticate so MCP clients (GitHub Copilot, ChatGPT, Claude Desktop)
// surface the auth failure instead of silently failing tool calls.
// Origin check: the MCP spec requires origin validation (DNS-rebinding protection).
// Browser requests (Origin header present) must match the allowlist — the app's own
// origin (CLIENT_APPLICATION) plus MCP_ALLOWED_ORIGINS. Server-to-server clients
// (Copilot, ChatGPT, curl, OpenCode) send no Origin and are always allowed.
let containerPromise: Promise<Awaited<ReturnType<typeof buildContainer>>> | null = null;

function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] MCP server build failed:", err);
      containerPromise = null; // allow retry on next request
      throw err;
    });
  }
  return containerPromise;
}

function isMcpEnabled(container: Awaited<ReturnType<typeof buildContainer>>): boolean {
  return container.env.MCP_ENABLED === "true";
}

function originAllowed(container: Awaited<ReturnType<typeof buildContainer>>, origin: string): boolean {
  const allowed = new Set(
    [
      new URL(container.env.CLIENT_APPLICATION).origin,
      ...(container.env.MCP_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
    ].map((o) => (o.endsWith("/") ? o.slice(0, -1) : o))
  );
  return allowed.has(origin);
}

function authFailure(): NextResponse {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "unauthorized: missing or invalid API token" }, id: null },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
  );
}

export async function GET(req: NextRequest) {
  const container = await getContainer();
  if (!isMcpEnabled(container)) {
    return new NextResponse(null, { status: 404 });
  }
  const server = makeMcpServer(container);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(req);
  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export async function POST(req: NextRequest) {
  const container = await getContainer();
  if (!isMcpEnabled(container)) {
    return new NextResponse(null, { status: 404 });
  }

  const origin = req.headers.get("origin");
  if (origin && !originAllowed(container, origin)) {
    return new NextResponse(null, { status: 403 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  let authInfo;
  if (token) {
    try {
      const ctx = await resolveApiToken(container, token);
      authInfo = makeAuthInfo(ctx.user_id);
    } catch {
      authInfo = undefined;
    }
  }
  if (!authInfo) {
    return authFailure();
  }

  const server = makeMcpServer(container);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(req, { authInfo });
  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

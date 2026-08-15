import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";
import { makeMcpServer, resolveApiToken, makeAuthInfo } from "@/server/mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

// Stateless MCP endpoint: stateless transports are single-use by design ("cannot
// be reused across requests"), so each POST gets a fresh transport; the SDK
// Protocol forbids double connect, so each request also gets a fresh McpServer
// (tool registration is cheap; the expensive container is cached below).
// Auth: `Authorization: Bearer fp_<token>` resolved per-request and injected via
// the SDK's first-class authInfo channel.
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

export async function GET(req: NextRequest) {
  const container = await getContainer();
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

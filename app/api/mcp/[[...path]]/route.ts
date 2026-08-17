import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";
import { oauthGet, oauthPost } from "@/server/mcp/oauth/handlers";

// OAuth 2.1 MCP authorization server — the "Sign in with Fi-Plan" flow for
// external MCP clients (Claude Desktop, ChatGPT, GitHub Copilot, …), same
// pattern as IndMoney's MCP: clients discover the metadata endpoint below,
// register dynamically, then complete PKCE authorization via the app login.
//
// Endpoints (discovered from the metadata doc, path-relative to /api/mcp):
//   GET  /api/mcp/.well-known/oauth-authorization-server   metadata (RFC 8414)
//   POST /api/mcp/oauth/register                            client registration (RFC 7591)
//   GET  /api/mcp/oauth/authorize                           start authorization → /login?oauth=
//   POST /api/mcp/oauth/authorize                           continue (session) → code → redirect
//   POST /api/mcp/oauth/token                               code/refresh exchange (RFC 6749)
//   POST /api/mcp/oauth/revoke                              token revocation (RFC 7009)
//
// Tokens issued by this server are opaque and stored hashed (GenerateHash +
// cookieSecret, like API tokens); /api/mcp accepts them as
// `Authorization: Bearer fp_oa_<token>` alongside API tokens (fp_).
let containerPromise: Promise<Awaited<ReturnType<typeof buildContainer>>> | null = null;

function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] OAuth server build failed:", err);
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

async function enabled(): Promise<boolean> {
  const container = await getContainer();
  return container.env.MCP_ENABLED === "true";
}

export async function GET(req: NextRequest) {
  if (!(await enabled())) return new NextResponse(null, { status: 404 });
  const container = await getContainer();
  return oauthGet(req, container);
}

export async function POST(req: NextRequest) {
  if (!(await enabled())) return new NextResponse(null, { status: 404 });
  const container = await getContainer();
  return oauthPost(req, container);
}

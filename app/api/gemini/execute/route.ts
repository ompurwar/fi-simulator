import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";
import { resolveApiToken } from "@/server/mcp/auth";
import type { ToolContext } from "@/server/mcp/types";

let containerPromise: Promise<Awaited<ReturnType<typeof buildContainer>>> | null = null;

function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] Gemini execute build container failed:", err);
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

/**
 * POST /api/gemini/execute
 * Direct tool execution endpoint for Google Gemini function calling.
 * Authenticates via Authorization: Bearer fp_<token> or fp_oa_<token>.
 */
export async function POST(req: NextRequest) {
  const container = await getContainer();

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Missing Bearer API token in Authorization header" } },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  let ctx: ToolContext;
  try {
    if (token.startsWith("fp_oa_")) {
      const oauthCtx = await container.oauth_service.verifyAccessToken(token);
      ctx = { user_id: oauthCtx.user_id, role: "user" };
    } else {
      ctx = await resolveApiToken(container, token);
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: err?.message || "Invalid or expired API token" } },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON" } },
      { status: 400 }
    );
  }

  // Support both direct { name, args } and Gemini { functionCall: { name, args } }
  const toolName = body.functionCall?.name || body.name;
  const toolArgs = body.functionCall?.args || body.args || {};

  if (!toolName || typeof toolName !== "string") {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "Missing tool name in body (expected 'name' or 'functionCall.name')" } },
      { status: 400 }
    );
  }

  const registry = makeToolRegistry(container);
  const result = await callRegistryTool(registry, ctx, toolName, toolArgs);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        name: toolName,
        error: result.error,
        functionResponse: {
          name: toolName,
          response: { error: result.error },
        },
      },
      { status: result.error.code === "UNKNOWN_TOOL" ? 404 : result.error.code === "FORBIDDEN" ? 403 : 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    name: toolName,
    response: result.data,
    functionResponse: {
      name: toolName,
      response: result.data,
    },
  });
}

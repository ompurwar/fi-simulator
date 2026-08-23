/** Shared Next.js route wiring for the OAuth endpoints — container cache + MCP_ENABLED gate. */

import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "../../di/container";
import type { Container } from "../../di/container";

let containerPromise: Promise<Container> | null = null;

export function getOauthContainer(): Promise<Container> {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] OAuth server build failed:", err);
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

export async function oauthEnabled(container: Container): Promise<boolean> {
  return container.env.MCP_ENABLED === "true";
}

export function disabled(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

type OauthHandler = (req: NextRequest, container: Container) => Promise<NextResponse> | NextResponse;

/** Build a route handler that resolves the container, applies the MCP_ENABLED gate, then delegates. */
export function oauthRoute(handler: OauthHandler) {
  return async function route(req: NextRequest) {
    const container = await getOauthContainer();
    if (!(await oauthEnabled(container))) return disabled();
    return handler(req, container);
  };
}

import { NextRequest, NextResponse } from "next/server";
import { buildContainer, type Container } from "@/server/di/container";

/**
 * IndMoney MCP OAuth callback.
 *
 * The browser lands here after the user approves the consent screen on
 * indmoney.com (authorization code + state echo). The code is exchanged for
 * the read-only token via the MCP SDK (finishAuthorization), then the user
 * is bounced back to the Net Worth page.
 */
let containerPromise: Promise<Container> | null = null;
function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] networth container build failed:", err);
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  let target = "/networth?connected=error";
  if (error) {
    target = `/networth?connected=error&reason=${encodeURIComponent(error)}`;
  } else if (code && state) {
    try {
      const container = await getContainer();
      await container.networth_service.HandleCallback({ state, code });
      target = "/networth?connected=1";
    } catch (e: any) {
      console.error("[fi-plan] networth oauth callback failed:", e?.message || e);
    }
  }

  return NextResponse.redirect(new URL(target, req.nextUrl.origin));
}

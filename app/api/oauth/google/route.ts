import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";

/** /api/oauth/google — builds the Google authorization URL and redirects. */
export async function GET(req: NextRequest) {
  const container = await buildContainer();
  const state = Math.random().toString(36).slice(2);
  const url = container.googleOAuth.getAuthUrl(state);
  return NextResponse.redirect(url);
}

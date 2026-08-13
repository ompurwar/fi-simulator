import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/server/di/container";
import { buildApp } from "@/server/http/app";
import { SignCookie } from "@/server/infrastructure/crypto";

/**
 * Google OAuth callback. Since the OAuth flows live in the embedded server
 * (which handles /oauth/google redirect and token exchange), this route
 * delegates to the embedded server and, on success, sets the signed
 * session_id cookie + redirects to CLIENT_APPLICATION/onboarding.
 */
let appPromise: Promise<ReturnType<typeof buildApp>> | null = null;
async function getApp() {
  if (!appPromise) {
    appPromise = buildContainer().then((c) => buildApp(c));
  }
  return appPromise;
}

export async function GET(req: NextRequest) {
  const app = await getApp();
  const res = await app(req);

  // If the embedded server returned a session_id cookie, keep it and redirect.
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && setCookie.includes("session_id")) {
    const redirectRes = NextResponse.redirect(
      new URL("/onboarding", req.nextUrl.origin)
    );
    redirectRes.headers.set("Set-Cookie", setCookie);
    return redirectRes;
  }
  return res;
}

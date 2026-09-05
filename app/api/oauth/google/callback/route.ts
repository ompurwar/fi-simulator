import { NextRequest, NextResponse } from "next/server";
import { buildContainer, type Container } from "@/server/di/container";
import { CompleteGoogleOAuth } from "@/server/application/googleOAuthFlow";

const SESSION_COOKIE_MAX_AGE = 86400;
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * Google OAuth callback. The browser lands here after the consent screen with
 * an authorization code. The code is exchanged for a profile, the user is
 * logged in (or created on first visit), session cookies are set in the same
 * signed format as the embedded server, and the user is bounced to
 * /onboarding (which routes already-onboarded users on to /plan).
 */
let containerPromise: Promise<Container> | null = null;
function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] google oauth container build failed:", err);
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const error = params.get("error");

  if (!code || error) {
    return NextResponse.redirect(
      new URL(`/login?google_error=${encodeURIComponent(error || "cancelled")}`, origin)
    );
  }

  try {
    const container = await getContainer();
    const outcome = await CompleteGoogleOAuth(container, code);

    if (outcome.kind === "email_taken") {
      return NextResponse.redirect(new URL("/login?google_error=email_taken", origin));
    }

    const target =
      outcome.kind === "signup" ? "/onboarding?oauth_signup=success" : "/onboarding";
    const res = NextResponse.redirect(new URL(target, origin));
    const signed = (value: string) => container.UnsafeSign(value, container.cookieSecret);

    res.cookies.set("session_id", signed(outcome.session_id), {
      maxAge: SESSION_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "none",
      secure: true,
    });
    res.cookies.set("fp_access", signed(outcome.tokens.access_token), {
      maxAge: outcome.tokens.expires_in,
      path: "/",
      sameSite: "none",
      secure: true,
    });
    res.cookies.set("fp_refresh", signed(outcome.tokens.refresh_token), {
      maxAge: REFRESH_COOKIE_MAX_AGE,
      path: "/api/auth",
      sameSite: "none",
      secure: true,
    });
    return res;
  } catch (e: any) {
    console.error("[fi-plan] google oauth callback failed:", e?.message || e);
    return NextResponse.redirect(new URL("/login?google_error=auth_failed", origin));
  }
}

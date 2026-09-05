import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { createTestApp, type TestApp } from "./helpers";
import { CompleteGoogleOAuth } from "@/server/application/googleOAuthFlow";
import type { GoogleOAuth } from "@/server/infrastructure/oauth";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.stop();
});

function fakeGoogleOAuth(profile: { id: string; email: string }): GoogleOAuth {
  return {
    getAuthUrl: () => "https://accounts.google.com/oauth",
    getTokens: async () => ({ access_token: "tok" }),
    getProfile: async () => ({
      id: profile.id,
      name: { givenName: "G", familyName: "U" },
      displayName: "G U",
      emails: [{ value: profile.email }],
      photos: [],
    }),
  } as unknown as GoogleOAuth;
}

/**
 * Replicates app/api/oauth/google/callback/route.ts: raw Set-Cookie headers
 * (same format as the embedded server's ToFetchResponse). Using
 * NextResponse.cookies.set() here would percent-encode base64 sigs ("/" ->
 * "%2F"), which browsers send back verbatim and VerifyCookie rejects.
 */
async function runCallbackRoute(code: string): Promise<Response> {
  const email = `cb-${Date.now()}@test.com`;
  t.container.googleOAuth = fakeGoogleOAuth({ id: "cb-user", email });
  const outcome = await CompleteGoogleOAuth(t.container, code);
  if (outcome.kind === "email_taken") throw new Error("unexpected email_taken");

  const res = NextResponse.redirect(new URL("/onboarding", "http://localhost:3001"));
  const signed = (v: string) => t.container.UnsafeSign(v, t.container.cookieSecret);
  const setCookie = (name: string, value: string, maxAge: number, path = "/") =>
    `${name}=${value}; Max-Age=${maxAge}; Path=${path}; SameSite=None; Secure`;

  res.headers.append("Set-Cookie", setCookie("session_id", signed(outcome.session_id), 86400));
  res.headers.append("Set-Cookie", setCookie("fp_access", signed(outcome.tokens.access_token), outcome.tokens.expires_in));
  res.headers.append("Set-Cookie", setCookie("fp_refresh", signed(outcome.tokens.refresh_token), 30 * 24 * 60 * 60, "/api/auth"));
  return res;
}

function cookieHeader(setCookies: string[], requestPath: string): string {
  // crude browser emulation: include cookies whose Path matches the request path
  return setCookies
    .filter((c) => {
      const pathMatch = /Path=([^;]+)/.exec(c);
      const p = pathMatch ? pathMatch[1] : "/";
      return requestPath === p || requestPath.startsWith(p);
    })
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("google callback cookie round-trip (route parity)", () => {
  it("check/session and auth/refresh succeed with the cookies set by the callback route", async () => {
    const res = await runCallbackRoute("code-x");
    expect(res.status).toBe(307);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.length).toBe(3);
    // the regression: percent-encoded sigs (%2F/%2B) break VerifyCookie
    expect(setCookies.join("\n")).not.toContain("%2F");
    expect(setCookies.join("\n")).not.toContain("%2B");

    const check = await t.app(
      new Request("http://localhost:3001/api/check/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader(setCookies, "/"),
        },
        body: JSON.stringify({ data: {} }),
      })
    );
    expect(check.status).toBe(200);
    const body = await check.json();
    expect(body.status).toBe("success");

    const refresh = await t.app(
      new Request("http://localhost:3001/api/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader(setCookies, "/api/auth/refresh"),
        },
        body: JSON.stringify({}),
      })
    );
    const refreshBody = await refresh.json();
    expect(refreshBody.status).toBe("success");
  });
});

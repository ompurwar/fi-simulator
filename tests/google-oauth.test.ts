import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signupUser, type TestApp } from "./helpers";
import { CompleteGoogleOAuth } from "@/server/application/googleOAuthFlow";
import type { GoogleOAuth } from "@/server/infrastructure/oauth";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.stop();
});

/** A Google OAuth stub returning a fixed profile for any code. */
function fakeGoogleOAuth(profile: {
  id: string;
  email: string;
  givenName?: string;
  familyName?: string;
}): GoogleOAuth {
  return {
    getAuthUrl: () => "https://accounts.google.com/oauth",
    getTokens: async () => ({ access_token: "fake-access-token" }),
    getProfile: async () => ({
      id: profile.id,
      name: {
        givenName: profile.givenName || "G",
        familyName: profile.familyName || "U",
      },
      displayName: `${profile.givenName || "G"} ${profile.familyName || "U"}`,
      emails: [{ value: profile.email }],
      photos: [],
    }),
  } as unknown as GoogleOAuth;
}

describe("Google OAuth callback flow", () => {
  it("creates the user on first visit and logs the same user in afterwards", async () => {
    const email = `google-${Date.now()}@test.com`;
    t.container.googleOAuth = fakeGoogleOAuth({ id: "google-id-123", email });

    const first = await CompleteGoogleOAuth(t.container, "code-1");
    expect(first.kind).toBe("signup");

    // second pass over the same email must log in, not create a duplicate
    const second = await CompleteGoogleOAuth(t.container, "code-2");
    expect(second.kind).toBe("login");
    if (second.kind !== "login") throw new Error("expected login");
    expect(second.session_id).toBeTruthy();
    expect(second.tokens.access_token).toContain("eyJ");
    expect(second.tokens.refresh_token).toContain("fp_rt_");
  });

  it("sets the profile id as the password so the google session round-trips", async () => {
    const email = `google-rt-${Date.now()}@test.com`;
    t.container.googleOAuth = fakeGoogleOAuth({ id: "google-id-rt-7", email });

    const created = await CompleteGoogleOAuth(t.container, "code-rt");
    expect(created.kind).toBe("signup");

    // the stored user must be a google user with matching credentials
    const [user] = await t.container.user_list.FindByEmail(email);
    expect(user.src).toBe("google");
    expect(user.IsValidPassword!("google-id-rt-7")).toBe(true);
  });

  it("refuses to hijack an existing password-based account", async () => {
    const email = `std-${Date.now()}@test.com`;
    await signupUser(t.app, { email });

    t.container.googleOAuth = fakeGoogleOAuth({ id: "google-id-456", email });
    const outcome = await CompleteGoogleOAuth(t.container, "code-3");
    expect(outcome.kind).toBe("email_taken");
  });
});

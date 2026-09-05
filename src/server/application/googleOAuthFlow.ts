import type { Container } from "../di/container";

/** Tokens issued at login/signup, used to set the fp_access/fp_refresh cookies. */
export interface GoogleOAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export type GoogleOAuthOutcome =
  | { kind: "login" | "signup"; session_id: string; tokens: GoogleOAuthTokens };

/**
 * Complete the Google OAuth callback: exchange the code, fetch the profile,
 * then log the existing user in — or create the account on first visit.
 * Google verified the email, so existing users (std or google) are signed in
 * directly with a fresh session; new users are created with src:'google' and
 * the profile id doubling as the password (docs/backend-reference.md §6).
 */
export async function CompleteGoogleOAuth(
  container: Container,
  code: string
): Promise<GoogleOAuthOutcome> {
  const { access_token } = await container.googleOAuth.getTokens(code);
  const profile = await container.googleOAuth.getProfile(access_token);
  const email = profile.emails[0]?.value;
  if (!email) throw new Error("Google profile did not include an email address");

  const existing = await container.user_list.FindByEmail(email);
  if (existing.length > 0) {
    const result = await container.app.CreateSessionForUser({
      user_id: existing[0]._id.toString(),
    });
    return { kind: "login", session_id: result.session_id, tokens: result.tokens };
  }

  const result = await container.app.Signup({
    email,
    password: profile.id,
    first_name: profile.name?.givenName,
    last_name: profile.name?.familyName,
    photos: (profile.photos || []).map((p) => p.value),
    src: "google",
  });
  return { kind: "signup", session_id: result.session_id, tokens: result.tokens };
}

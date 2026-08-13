import type { Env } from "../config/env";

export interface GoogleProfile {
  id: string;
  name: { givenName: string; familyName: string };
  displayName: string;
  emails: { value: string }[];
  photos: { value: string }[];
}

/**
 * Google OAuth2 helper using plain fetch (replaces passport-google-oauth2).
 * Authorization URL for the redirect, token exchange, and profile fetch.
 */
export function buildGoogleOAuth(env: Env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = env.PASSPORT_CALLBACK_URL;
  const scopes = "profile email";

  return {
    getAuthUrl(state: string): string {
      const params = new URLSearchParams({
        client_id: clientId || "",
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes,
        state,
        access_type: "online",
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    },

    async getTokens(code: string): Promise<{ access_token: string; id_token?: string }> {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId || "",
          client_secret: clientSecret || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
      return res.json();
    },

    async getProfile(accessToken: string): Promise<GoogleProfile> {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Google profile fetch failed: ${res.status}`);
      const data = await res.json();
      return {
        id: data.id,
        name: { givenName: data.given_name, familyName: data.family_name },
        displayName: data.name,
        emails: [{ value: data.email }],
        photos: data.picture ? [{ value: data.picture }] : [],
      };
    },
  };
}

export type GoogleOAuth = ReturnType<typeof buildGoogleOAuth>;

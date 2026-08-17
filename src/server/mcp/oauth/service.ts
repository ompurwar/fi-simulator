/** OAuth 2.1 MCP authorization-server service — register clients, issue/verify/revoke tokens. */

import { createHash, timingSafeEqual } from "crypto";
import type { OAuthStore } from "./repository";
import {
  OAUTH_ACCESS_TTL_MS,
  OAUTH_AUTH_REQUEST_TTL_MS,
  OAUTH_CODE_TTL_MS,
  OAUTH_REFRESH_TTL_MS,
  OAUTH_SCOPES,
  type OAuthAuthRequest,
  type OAuthClient,
  type OAuthTokens,
} from "./types";

export interface OAuthServiceDeps {
  store: OAuthStore;
  cookieSecret: string;
  GenerateHash: (pass: string, salt: string) => string;
  GenerateRandomString: (length: number) => string;
}

export interface OAuthService {
  registerClient(input: { client_name: string; redirect_uris: string[] }): Promise<{
    client_id: string;
    client_name: string;
    redirect_uris: string[];
    token_endpoint_auth_method: "none";
  }>;
  getClient(client_id: string): Promise<OAuthClient | null>;
  startAuthorization(input: {
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    state?: string;
  }): Promise<{ oauth_id: string }>;
  issueCode(input: { oauth_id: string; user_id: string }): Promise<{
    code: string;
    redirect_uri: string;
    state?: string;
  }>;
  exchangeCode(input: {
    client_id: string;
    code: string;
    code_verifier?: string;
    redirect_uri?: string;
  }): Promise<OAuthTokens>;
  exchangeRefresh(input: { client_id: string; refresh_token: string }): Promise<OAuthTokens>;
  verifyAccessToken(token: string): Promise<{ user_id: string }>;
  revoke(input: { client_id?: string; token: string }): Promise<void>;
}

function id(prefix: string, rand: (n: number) => string): string {
  return prefix + rand(32);
}

function hash(raw: string, GenerateHash: (p: string, s: string) => string, secret: string): string {
  return GenerateHash(raw, secret);
}

function pkceMatches(challenge: string, verifier: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  if (computed.length !== challenge.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}

export function makeOAuthService(deps: OAuthServiceDeps): OAuthService {
  const { store, cookieSecret, GenerateHash, GenerateRandomString } = deps;

  function newClientId() {
    return id("fp_oc_", GenerateRandomString);
  }
  function newOauthId() {
    return id("fp_oar_", GenerateRandomString);
  }
  function newCode() {
    return id("fp_ocd_", GenerateRandomString);
  }
  function newAccessToken() {
    return id("fp_oa_", GenerateRandomString);
  }
  function newRefreshToken() {
    return id("fp_or_", GenerateRandomString);
  }

  async function issueTokenPair(input: {
    client_id: string;
    user_id: string;
    keep_refresh_hash?: string;
  }): Promise<OAuthTokens> {
    const now = Date.now();
    const access_raw = newAccessToken();
    const refresh_raw = newRefreshToken();
    const access_rec = {
      _id: "",
      kind: "access" as const,
      token_hash: hash(access_raw, GenerateHash, cookieSecret),
      user_id: input.user_id,
      client_id: input.client_id,
      scopes: OAUTH_SCOPES,
      created_at: now,
      expires_at: now + OAUTH_ACCESS_TTL_MS,
    };
    const refresh_rec = {
      _id: "",
      kind: "refresh" as const,
      token_hash: input.keep_refresh_hash ?? hash(refresh_raw, GenerateHash, cookieSecret),
      user_id: input.user_id,
      client_id: input.client_id,
      scopes: OAUTH_SCOPES,
      created_at: now,
      expires_at: now + OAUTH_REFRESH_TTL_MS,
    };
    await store.AddToken(access_rec);
    await store.AddToken(refresh_rec);
    return {
      access_token: access_raw,
      refresh_token: input.keep_refresh_hash ? "" : refresh_raw,
      token_type: "Bearer",
      expires_in: OAUTH_ACCESS_TTL_MS / 1000,
      scope: OAUTH_SCOPES.join(" "),
    };
  }

  return {
    async registerClient({ client_name, redirect_uris }) {
      if (!client_name || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        throw new Error("client_name and at least one redirect_uri are required");
      }
      for (const uri of redirect_uris) {
        try {
          // allow absolute http(s), loopback, and custom schemes (claude-desktop:// etc.)
          if (/^https?:\/\//.test(uri) || /^claude-desktop:\/\//.test(uri) || /^http:\/\/127\.0\.0\.1/.test(uri)) {
            void new URL(uri);
            continue;
          }
          throw new Error("invalid");
        } catch {
          throw new Error(`invalid redirect_uri: ${uri}`);
        }
      }
      const client: OAuthClient = {
        _id: "",
        client_id: newClientId(),
        client_name,
        redirect_uris,
        token_endpoint_auth_method: "none",
        created_at: Date.now(),
      };
      const created = await store.AddClient(client);
      return {
        client_id: created.client_id,
        client_name: created.client_name,
        redirect_uris: created.redirect_uris,
        token_endpoint_auth_method: created.token_endpoint_auth_method,
      };
    },

    async getClient(client_id) {
      return store.FindClientByClientId(client_id);
    },

    async startAuthorization({ client_id, redirect_uri, code_challenge, code_challenge_method, state }) {
      const client = await store.FindClientByClientId(client_id);
      if (!client) throw new Error("invalid client_id");
      if (!client.redirect_uris.includes(redirect_uri)) throw new Error("redirect_uri not registered for client");
      if (!code_challenge) throw new Error("code_challenge is required");
      if (code_challenge_method && code_challenge_method !== "S256") throw new Error("only S256 PKCE is supported");
      const now = Date.now();
      const req: OAuthAuthRequest = {
        _id: "",
        oauth_id: newOauthId(),
        client_id,
        redirect_uri,
        code_challenge,
        state,
        created_at: now,
        expires_at: now + OAUTH_AUTH_REQUEST_TTL_MS,
      };
      await store.AddAuthRequest(req);
      return { oauth_id: req.oauth_id };
    },

    async issueCode({ oauth_id, user_id }) {
      const req = await store.FindAuthRequest(oauth_id);
      if (!req) throw new Error("authorization request not found or already used");
      await store.DeleteAuthRequest(oauth_id);
      if (Date.now() > req.expires_at) throw new Error("authorization request expired");
      const code_raw = newCode();
      const now = Date.now();
      await store.AddCode({
        _id: "",
        code_hash: hash(code_raw, GenerateHash, cookieSecret),
        user_id,
        client_id: req.client_id,
        redirect_uri: req.redirect_uri,
        code_challenge: req.code_challenge,
        created_at: now,
        expires_at: now + OAUTH_CODE_TTL_MS,
      });
      return { code: code_raw, redirect_uri: req.redirect_uri, state: req.state };
    },

    async exchangeCode({ client_id, code, code_verifier, redirect_uri }) {
      if (!code) throw new Error("code is required");
      const code_hash = hash(code, GenerateHash, cookieSecret);
      const found = await store.FindCodeByHash(code_hash);
      if (!found) throw new Error("invalid authorization code");
      if (Date.now() > found.expires_at) throw new Error("authorization code expired");
      if (found.client_id !== client_id) throw new Error("code was issued to another client");
      if (redirect_uri && found.redirect_uri !== redirect_uri) throw new Error("redirect_uri mismatch");
      if (!code_verifier || !pkceMatches(found.code_challenge, code_verifier)) {
        throw new Error("PKCE verification failed");
      }
      // Single-use: consumed only after a successful verification.
      await store.DeleteCode(code_hash);
      return issueTokenPair({ client_id: found.client_id, user_id: found.user_id });
    },

    async exchangeRefresh({ client_id, refresh_token }) {
      if (!refresh_token) throw new Error("refresh_token is required");
      const token_hash = hash(refresh_token, GenerateHash, cookieSecret);
      const found = await store.FindTokenByHash("refresh", token_hash);
      if (!found) throw new Error("invalid refresh_token");
      if (Date.now() > found.expires_at) throw new Error("refresh_token expired");
      if (found.client_id !== client_id) throw new Error("refresh_token was issued to another client");
      // Rotate: keep the same refresh hash (session-style) — the old access token
      // stays valid until expiry; the new pair is issued bound to the same user.
      await store.DeleteToken(token_hash);
      const tokens = await issueTokenPair({
        client_id: found.client_id,
        user_id: found.user_id,
        keep_refresh_hash: token_hash,
      });
      return tokens;
    },

    async verifyAccessToken(token) {
      if (!token) throw new Error("missing access token");
      const token_hash = hash(token, GenerateHash, cookieSecret);
      const found = await store.FindTokenByHash("access", token_hash);
      if (!found) throw new Error("invalid access token");
      if (Date.now() > found.expires_at) throw new Error("access token expired");
      return { user_id: found.user_id };
    },

    async revoke({ token }) {
      if (!token) return;
      const token_hash = hash(token, GenerateHash, cookieSecret);
      await store.DeleteToken(token_hash);
    },
  };
}

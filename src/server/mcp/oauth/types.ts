/** OAuth 2.1 MCP authorization-server types (IndMoney-style sign-in for external assistants). */

/** Dynamically registered MCP client (RFC 7591). */
export interface OAuthClient {
  _id: string;
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  created_at: number;
}

/** Pending authorization (started at /authorize, completed at login). */
export interface OAuthAuthRequest {
  _id: string;
  oauth_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state?: string;
  created_at: number;
  expires_at: number;
}

/** Single-use authorization code bound to user + client + challenge. */
export interface OAuthCode {
  _id: string;
  code_hash: string;
  user_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  created_at: number;
  expires_at: number;
}

/** Access or refresh token (opaque, stored hashed). */
export interface OAuthTokenRecord {
  _id: string;
  kind: "access" | "refresh";
  token_hash: string;
  user_id: string;
  client_id: string;
  scopes: string[];
  created_at: number;
  expires_at: number;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

export const OAUTH_SCOPES = ["fiplan"];
export const OAUTH_AUTH_REQUEST_TTL_MS = 10 * 60 * 1000; // 10 min
export const OAUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 min
export const OAUTH_ACCESS_TTL_MS = 60 * 60 * 1000; // 1 hour
export const OAUTH_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

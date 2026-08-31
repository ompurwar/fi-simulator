/** JWT access/refresh token records (Auth_Token_Store) — every issued token keeps a DB row for future invalidation. */

export interface AuthTokenRecord {
  _id?: string;
  /** "access" (JWT — looked up by jti) or "refresh" (opaque — looked up by token_hash) */
  kind: "access" | "refresh";
  /** unique id embedded in the JWT (access) or a random id for the refresh row */
  jti: string;
  /** hash of the raw refresh token (refresh rows only) */
  token_hash?: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  status: "active" | "revoked";
  revoked_at?: number;
}

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  /** access token lifetime in seconds */
  expires_in: number;
}

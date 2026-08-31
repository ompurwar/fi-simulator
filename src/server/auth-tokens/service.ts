/**
 * JWT access + refresh token service.
 *
 * - Access tokens are HS256 JWTs (claims: sub, jti, iat, exp, token_version) —
 *   verified by signature + expiry, then checked against their Auth_Token_Store
 *   row so a revoked token dies on the next request.
 * - Refresh tokens are opaque (fp_rt_…), stored hashed only; rotation issues a
 *   new pair and revokes the old refresh (single-use).
 * - Revoking all tokens for a user bumps the user's token_version, instantly
 *   invalidating every outstanding access JWT.
 */

import { jwtVerify, SignJWT } from "jose";
import { InvalidAuthTokenError } from "../domain/errors";
import type { AuthTokenRepository } from "../domain/ports";
import type { IssuedTokens } from "./types";

export interface AuthTokenServiceDeps {
  repo: AuthTokenRepository;
  jwtSecret: string;
  accessTtlMs: number;
  refreshTtlMs: number;
  GenerateHash: (pass: string, salt: string) => string;
  GenerateRandomString: (length: number) => string;
  /** current token_version for a user (default 1) */
  getUserVersion: (user_id: string) => Promise<number>;
}

export interface AuthTokenService {
  IssueTokenPair(input: { user_id: string }): Promise<IssuedTokens>;
  VerifyAccessToken(token: string): Promise<{ user_id: string; jti: string }>;
  RotateRefreshToken(refresh_token: string): Promise<IssuedTokens>;
  RevokeRefreshToken(refresh_token: string): Promise<void>;
  RevokeAccessToken(access_token: string): Promise<void>;
  RevokeAllForUser(user_id: string): Promise<void>;
}

export function makeAuthTokenService(deps: AuthTokenServiceDeps): AuthTokenService {
  const {
    repo,
    jwtSecret,
    accessTtlMs,
    refreshTtlMs,
    GenerateHash,
    GenerateRandomString,
    getUserVersion,
  } = deps;

  const secretKey = new TextEncoder().encode(jwtSecret);

  async function signAccess(user_id: string, jti: string, token_version: number): Promise<string> {
    return new SignJWT({ token_version })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user_id)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + Math.floor(accessTtlMs / 1000))
      .sign(secretKey);
  }

  async function verifyJwt(token: string): Promise<{ sub: string; jti: string; token_version: number }> {
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.jti !== "string")
      throw new InvalidAuthTokenError();
    return {
      sub: payload.sub,
      jti: payload.jti,
      token_version: typeof payload.token_version === "number" ? payload.token_version : 0,
    };
  }

  return {
    async IssueTokenPair({ user_id }) {
      const token_version = await getUserVersion(user_id);
      const now = Date.now();
      const access_jti = GenerateRandomString(24);
      const access_token = await signAccess(user_id, access_jti, token_version);

      const refresh_raw = `fp_rt_${GenerateRandomString(32)}`;
      const refresh_hash = GenerateHash(refresh_raw, jwtSecret);
      const refresh_jti = GenerateRandomString(24);

      await repo.Add({
        kind: "access",
        jti: access_jti,
        user_id,
        created_at: now,
        expires_at: now + accessTtlMs,
        status: "active",
      });
      await repo.Add({
        kind: "refresh",
        jti: refresh_jti,
        token_hash: refresh_hash,
        user_id,
        created_at: now,
        expires_at: now + refreshTtlMs,
        status: "active",
      });

      return {
        access_token,
        refresh_token: refresh_raw,
        token_type: "Bearer",
        expires_in: Math.floor(accessTtlMs / 1000),
      };
    },

    async VerifyAccessToken(token) {
      let claims: { sub: string; jti: string; token_version: number };
      try {
        claims = await verifyJwt(token);
      } catch {
        throw new InvalidAuthTokenError();
      }
      const record = await repo.FindActiveByJti(claims.jti);
      if (!record) throw new InvalidAuthTokenError();
      if (Date.now() > record.expires_at) throw new InvalidAuthTokenError();
      if (String(record.user_id) !== claims.sub) throw new InvalidAuthTokenError();
      const version = await getUserVersion(claims.sub);
      if (claims.token_version !== version) throw new InvalidAuthTokenError();
      return { user_id: claims.sub, jti: claims.jti };
    },

    async RotateRefreshToken(refresh_token) {
      if (!refresh_token || !refresh_token.startsWith("fp_rt_"))
        throw new InvalidAuthTokenError();
      const token_hash = GenerateHash(refresh_token, jwtSecret);
      const record = await repo.FindTokenByHash("refresh", token_hash);
      if (!record) throw new InvalidAuthTokenError();
      if (Date.now() > record.expires_at) throw new InvalidAuthTokenError();
      await repo.RevokeByHash(token_hash);
      return this.IssueTokenPair({ user_id: String(record.user_id) });
    },

    async RevokeRefreshToken(refresh_token) {
      if (!refresh_token || !refresh_token.startsWith("fp_rt_")) return;
      const token_hash = GenerateHash(refresh_token, jwtSecret);
      await repo.RevokeByHash(token_hash);
    },

    async RevokeAccessToken(access_token) {
      try {
        const claims = await verifyJwt(access_token);
        await repo.RevokeByJti(claims.jti);
      } catch {
        // expired/unsigned token — nothing left to revoke
      }
    },

    async RevokeAllForUser(user_id) {
      await repo.RevokeAllForUser(user_id);
    },
  };
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { createTestApp, signupUser, type TestApp } from "./helpers";

let t: TestApp;
let user_id: string;

beforeAll(async () => {
  t = await createTestApp();
  const signed = await signupUser(t.app);
  const session = await t.container.session_list.FindByActiveSessionId(signed.session_id);
  user_id = session!.user_id.toString();
});

afterAll(async () => {
  await t.stop();
});

const secret = new TextEncoder().encode("test-cookie-secret");

describe("auth token service (JWT access + refresh)", () => {
  it("issues a pair and verifies the access token", async () => {
    const pair = await t.container.auth_token_service.IssueTokenPair({ user_id });
    expect(pair.access_token.split(".")).toHaveLength(3);
    expect(pair.refresh_token.startsWith("fp_rt_")).toBe(true);
    expect(pair.expires_in).toBe(15 * 60);

    const claims = await t.container.auth_token_service.VerifyAccessToken(pair.access_token);
    expect(claims.user_id).toBe(user_id);
    expect(claims.jti).toBeTruthy();
  });

  it("rejects tampered and expired access tokens", async () => {
    const pair = await t.container.auth_token_service.IssueTokenPair({ user_id });
    const [header, payload, sig] = pair.access_token.split(".");
    const tampered = `${header}.${payload}.${sig.slice(0, -2)}xx`;
    await expect(t.container.auth_token_service.VerifyAccessToken(tampered)).rejects.toThrow();

    const expired = await new SignJWT({ token_version: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user_id)
      .setJti("expired-jti")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);
    await expect(t.container.auth_token_service.VerifyAccessToken(expired)).rejects.toThrow();
  });

  it("rejects an access token whose DB row was revoked", async () => {
    const pair = await t.container.auth_token_service.IssueTokenPair({ user_id });
    const claims = await t.container.auth_token_service.VerifyAccessToken(pair.access_token);
    await t.container.auth_token_repo.RevokeByJti(claims.jti);
    await expect(t.container.auth_token_service.VerifyAccessToken(pair.access_token)).rejects.toThrow();
  });

  it("rotates refresh tokens (single-use) and the new pair works", async () => {
    const pair = await t.container.auth_token_service.IssueTokenPair({ user_id });
    const rotated = await t.container.auth_token_service.RotateRefreshToken(pair.refresh_token);
    expect(rotated.access_token).not.toBe(pair.access_token);
    expect(rotated.refresh_token).not.toBe(pair.refresh_token);
    await expect(
      t.container.auth_token_service.VerifyAccessToken(rotated.access_token)
    ).resolves.toMatchObject({ user_id });
    // old refresh is dead after rotation
    await expect(
      t.container.auth_token_service.RotateRefreshToken(pair.refresh_token)
    ).rejects.toThrow();
  });

  it("rejects an expired refresh token", async () => {
    const pair = await t.container.auth_token_service.IssueTokenPair({ user_id });
    const token_hash = t.container.GenerateHash(pair.refresh_token, "test-cookie-secret");
    const record = await t.container.auth_token_repo.FindTokenByHash("refresh", token_hash);
    await t.container.auth_token_repo.Update({
      _id: String(record._id),
      expires_at: Date.now() - 1000,
    });
    await expect(
      t.container.auth_token_service.RotateRefreshToken(pair.refresh_token)
    ).rejects.toThrow();
  });

  it("revoking all sessions for the user kills outstanding access tokens (version bump)", async () => {
    const pair = await t.container.auth_token_service.IssueTokenPair({ user_id });
    await expect(t.container.auth_token_service.VerifyAccessToken(pair.access_token)).resolves.toBeTruthy();
    await t.container.app.RevokeAllUserSessions({ user_id });
    await expect(t.container.auth_token_service.VerifyAccessToken(pair.access_token)).rejects.toThrow();
    await expect(
      t.container.auth_token_service.RotateRefreshToken(pair.refresh_token)
    ).rejects.toThrow();
  });
});

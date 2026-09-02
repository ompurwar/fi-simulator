import { describe, expect, it } from "vitest";
import { IndMoneyOAuthClientProvider } from "@/server/networth/indmoney/oauthProvider";
import { createTestApp } from "./helpers";

/**
 * Behavior: IndMoney OAuth tokens are stored with a computed expires_at so the
 * MCP SDK can auto-refresh via the refresh token. Without it, tokens are
 * treated as never-expiring and syncs later die with "authorizationCode
 * required".
 */
describe("indmoney oauth token persistence", () => {
  it("saveTokens stores refresh_token and computes expires_at from expires_in", async () => {
    const t = await createTestApp();
    const repo = t.container.networth_repo;
    const user_id = "6a8012bc39fe50524d38a452";
    await repo.AddLink({ user_id, provider: "indmoney", connected_at: Date.now() });

    const provider = new IndMoneyOAuthClientProvider(repo, {
      user_id,
      redirect_url: "http://localhost:3000/api/networth/oauth/callback",
      state: "st",
    });
    await provider.saveTokens({
      access_token: "at-123",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "rt-456",
      scope: "networth.read market.read",
    } as any);

    const link = await repo.GetLink(user_id, "indmoney");
    const tokens: any = link?.tokens;
    expect(tokens.access_token).toBe("at-123");
    expect(tokens.refresh_token).toBe("rt-456");
    expect(typeof tokens.expires_at).toBe("number");
    const now_s = Math.floor(Date.now() / 1000);
    expect(tokens.expires_at).toBeGreaterThan(now_s + 3500);
    expect(tokens.expires_at).toBeLessThanOrEqual(now_s + 3600);
  });

  it("when expires_in is short (e.g. 60s) expires_at still lands in the near future", async () => {
    const t = await createTestApp();
    const repo = t.container.networth_repo;
    const user_id = "6a8012bc39fe50524d38a453";
    await repo.AddLink({ user_id, provider: "indmoney", connected_at: Date.now() });

    const provider = new IndMoneyOAuthClientProvider(repo, {
      user_id,
      redirect_url: "http://localhost:3000/api/networth/oauth/callback",
      state: "st2",
    });
    await provider.saveTokens({
      access_token: "at-x",
      token_type: "Bearer",
      expires_in: 60,
    } as any);

    const link = await repo.GetLink(user_id, "indmoney");
    const tokens: any = link?.tokens;
    const now_s = Math.floor(Date.now() / 1000);
    expect(tokens.expires_at).toBeGreaterThan(now_s + 30);
    expect(tokens.expires_at).toBeLessThanOrEqual(now_s + 60);
  });
});

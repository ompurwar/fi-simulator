import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, post, signupUser, type TestApp } from "./helpers";

const TOKEN_COLLECTION = "Api_Token_Store";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.stop();
});

describe("api tokens", () => {
  it("creates a token starting with fp_ and shows it once", async () => {
    const { session_id } = await signupUser(t.app);
    const res = await post(
      t.app,
      "/api/api_token/create",
      { data: { name: "claude-code" } },
      { "auth-token": session_id }
    );
    expect(res.json.status).toBe("success");
    expect(res.json.data.api_token).toMatch(/^fp_[a-f0-9]{32}$/);
    expect(res.json.data.token_id).toBeTruthy();
    // the raw token appears exactly once in the whole response
    const raw = res.json.data.api_token;
    const serialized = JSON.stringify(res.json);
    expect(serialized.split(raw).length - 1).toBe(1);
  });

  it("never stores the raw token (only an HMAC hash)", async () => {
    const { session_id } = await signupUser(t.app);
    const res = await post(
      t.app,
      "/api/api_token/create",
      { data: { name: "secret-token" } },
      { "auth-token": session_id }
    );
    const raw = res.json.data.api_token;
    const stored = await t.container.db
      .collection(TOKEN_COLLECTION)
      .findOne({ name: "secret-token" });
    expect(stored).toBeTruthy();
    expect(stored.token_hash).not.toBe(raw);
    expect(JSON.stringify(stored)).not.toContain(raw);
    expect(stored.status).toBe("active");
    expect(typeof stored.created_at).toBe("number");
    expect(stored.user_id.toString()).toBeTruthy();
  });

  it("lists tokens with name/status but no token_hash field", async () => {
    const { session_id } = await signupUser(t.app);
    await post(
      t.app,
      "/api/api_token/create",
      { data: { name: "alpha" } },
      { "auth-token": session_id }
    );
    await post(
      t.app,
      "/api/api_token/create",
      { data: { name: "beta" } },
      { "auth-token": session_id }
    );
    const res = await post(
      t.app,
      "/api/api_token/list",
      { data: {} },
      { "auth-token": session_id }
    );
    expect(res.json.status).toBe("success");
    expect(res.json.data.length).toBe(2);
    for (const token of res.json.data) {
      expect(token._id).toBeTruthy();
      expect(["alpha", "beta"]).toContain(token.name);
      expect(token.status).toBe("active");
      expect(token.token_hash).toBeUndefined();
    }
  });

  it("revokes a token: status becomes deleted and it leaves the list", async () => {
    const { session_id } = await signupUser(t.app);
    const created = await post(
      t.app,
      "/api/api_token/create",
      { data: { name: "revoke-me" } },
      { "auth-token": session_id }
    );
    const token_id = created.json.data.token_id;
    const res = await post(
      t.app,
      "/api/api_token/revoke",
      { data: { token_id } },
      { "auth-token": session_id }
    );
    expect(res.json.status).toBe("success");
    const stored = await t.container.db
      .collection(TOKEN_COLLECTION)
      .findOne({ _id: t.container.db.MakeId(token_id) });
    expect(stored.status).toBe("deleted");
    const list = await post(
      t.app,
      "/api/api_token/list",
      { data: {} },
      { "auth-token": session_id }
    );
    expect(list.json.data.length).toBe(0);
  });

  it("rejects revoking another user's token (cross-user isolation)", async () => {
    const alice = await signupUser(t.app);
    const bob = await signupUser(t.app);
    const created = await post(
      t.app,
      "/api/api_token/create",
      { data: { name: "alice-token" } },
      { "auth-token": alice.session_id }
    );
    const token_id = created.json.data.token_id;
    const res = await post(
      t.app,
      "/api/api_token/revoke",
      { data: { token_id } },
      { "auth-token": bob.session_id }
    );
    expect(res.json.status).toBe("error");
    const stored = await t.container.db
      .collection(TOKEN_COLLECTION)
      .findOne({ _id: t.container.db.MakeId(token_id) });
    expect(stored.status).toBe("active");
  });
});

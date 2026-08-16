import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, post, signupUser, type TestApp } from "./helpers";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.stop();
});

describe("chat sessions", () => {
  it("creates a session and lists it with message_count 0", async () => {
    const { session_id } = await signupUser(t.app);
    const created = await post(
      t.app,
      "/api/chat_session/create",
      { data: { title: "Runway" } },
      { "auth-token": session_id }
    );
    expect(created.json.status).toBe("success");
    const sid = created.json.data.session_id;
    expect(sid).toBeTruthy();

    const list = await post(
      t.app,
      "/api/chat_session/list",
      { data: {} },
      { "auth-token": session_id }
    );
    expect(list.json.status).toBe("success");
    expect(list.json.data.length).toBe(1);
    expect(list.json.data[0]).toMatchObject({
      _id: sid,
      title: "Runway",
      message_count: 0,
    });
    expect(list.json.data[0].messages).toBeUndefined();
  });

  it("defaults the title to 'New chat' when none is given", async () => {
    const { session_id } = await signupUser(t.app);
    const created = await post(
      t.app,
      "/api/chat_session/create",
      { data: {} },
      { "auth-token": session_id }
    );
    expect(created.json.status).toBe("success");
    const sid = created.json.data.session_id;

    const got = await post(
      t.app,
      "/api/chat_session/get",
      { data: { session_id: sid } },
      { "auth-token": session_id }
    );
    expect(got.json.status).toBe("success");
    expect(got.json.data.session.title).toBe("New chat");
    expect(got.json.data.messages).toEqual([]);
  });

  it("deletes a session so it leaves the list", async () => {
    const { session_id } = await signupUser(t.app);
    const created = await post(
      t.app,
      "/api/chat_session/create",
      { data: {} },
      { "auth-token": session_id }
    );
    const sid = created.json.data.session_id;

    const del = await post(
      t.app,
      "/api/chat_session/delete",
      { data: { session_id: sid } },
      { "auth-token": session_id }
    );
    expect(del.json.status).toBe("success");
    expect(del.json.data).toEqual({ deleted: true });

    const list = await post(
      t.app,
      "/api/chat_session/list",
      { data: {} },
      { "auth-token": session_id }
    );
    expect(list.json.data.length).toBe(0);
  });

  it("rejects cross-user get and delete (ownership enforced)", async () => {
    const alice = await signupUser(t.app);
    const bob = await signupUser(t.app);
    const created = await post(
      t.app,
      "/api/chat_session/create",
      { data: { title: "alice only" } },
      { "auth-token": alice.session_id }
    );
    const sid = created.json.data.session_id;

    const got = await post(
      t.app,
      "/api/chat_session/get",
      { data: { session_id: sid } },
      { "auth-token": bob.session_id }
    );
    expect(got.json.status).toBe("error");

    const del = await post(
      t.app,
      "/api/chat_session/delete",
      { data: { session_id: sid } },
      { "auth-token": bob.session_id }
    );
    expect(del.json.status).toBe("error");

    // alice can still see it — bob's delete never touched it
    const list = await post(
      t.app,
      "/api/chat_session/list",
      { data: {} },
      { "auth-token": alice.session_id }
    );
    expect(list.json.data.length).toBe(1);
    expect(list.json.data[0]._id).toBe(sid);
  });

  it("append sets the title from the first user message (truncated to 60)", async () => {
    const session = await t.container.app.Signup({
      email: `append-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      password: "secret123",
      first_name: "Append",
      last_name: "User",
    });
    const user_id = session.user_id;
    const auth_token = session.session_id;

    const created = await post(
      t.app,
      "/api/chat_session/create",
      { data: {} },
      { "auth-token": auth_token }
    );
    const sid = created.json.data.session_id;

    const long = "a".repeat(100);
    const appended = await t.container.app.AppendChatMessage({
      user_id,
      session_id: sid,
      role: "user",
      content: long,
    });
    expect(appended).toEqual({ success: true });
    await t.container.app.AppendChatMessage({
      user_id,
      session_id: sid,
      role: "assistant",
      content: "Hello there",
    });

    const got = await post(
      t.app,
      "/api/chat_session/get",
      { data: { session_id: sid } },
      { "auth-token": auth_token }
    );
    expect(got.json.status).toBe("success");
    expect(got.json.data.session.title).toBe("a".repeat(60));
    expect(got.json.data.messages.length).toBe(2);
    expect(got.json.data.messages[0]).toMatchObject({ role: "user", content: long });
    expect(got.json.data.messages[1]).toMatchObject({
      role: "assistant",
      content: "Hello there",
    });

    const list = await post(
      t.app,
      "/api/chat_session/list",
      { data: {} },
      { "auth-token": auth_token }
    );
    expect(list.json.data[0].message_count).toBe(2);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, post, sessionIdFromCookies, signupUser, type TestApp } from "./helpers";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.stop();
});

describe("auth", () => {
  it("signs up a user and issues a session cookie", async () => {
    const { user, session_id } = await signupUser(t.app);
    expect(user.email).toBeTruthy();
    expect(session_id).toMatch(/^[a-f0-9]{24}$/);
  });

  it("rejects duplicate email with code 601", async () => {
    const email = `dup-${Date.now()}@test.com`;
    await signupUser(t.app, { email });
    const res = await post(t.app, "/api/signup", {
      data: { email, password: "secret123", first_name: "A", last_name: "B" },
    });
    expect(res.json.status).toBe("error");
    expect(res.json.error.code).toBe(601);
  });

  it("logs in with valid credentials", async () => {
    const { email, password } = await signupUser(t.app);
    const res = await post(t.app, "/api/login", { data: { email, password } });
    expect(res.json.status).toBe("success");
    expect(sessionIdFromCookies(res.cookies)).toMatch(/^[a-f0-9]{24}$/);
  });

  it("rejects wrong password", async () => {
    const { email } = await signupUser(t.app);
    const res = await post(t.app, "/api/login", { data: { email, password: "wrongpass" } });
    expect(res.json.status).toBe("error");
    expect([401, 404]).toContain(res.json.error.code);
  });

  it("check/session works with a valid session", async () => {
    const { session_id } = await signupUser(t.app);
    const res = await post(t.app, "/api/check/session", { data: {} }, { "auth-token": session_id });
    expect(res.json.status).toBe("success");
  });

  it("rejects protected routes without a session (401)", async () => {
    const res = await post(t.app, "/api/get/plan", { data: {} });
    expect(res.json.status).toBe("error");
    expect(res.json.error.code).toBe(401);
  });

  it("changes password and issues a fresh session", async () => {
    const { email, password } = await signupUser(t.app);
    const login = await post(t.app, "/api/login", { data: { email, password } });
    const session_id = sessionIdFromCookies(login.cookies);
    const res = await post(
      t.app,
      "/api/password/update",
      { data: { current_password: password, new_password: "newpass123" } },
      { "auth-token": session_id }
    );
    expect(res.json.status).toBe("success");
    const new_session = sessionIdFromCookies(res.cookies);
    expect(new_session).toBeTruthy();
    // old password no longer works
    const oldLogin = await post(t.app, "/api/login", { data: { email, password } });
    expect(oldLogin.json.status).toBe("error");
    const newLogin = await post(t.app, "/api/login", { data: { email, password: "newpass123" } });
    expect(newLogin.json.status).toBe("success");
  });
});

describe("password reset", () => {
  it("creates a reset session for an existing user", async () => {
    const { email } = await signupUser(t.app);
    const res = await post(t.app, "/api/password_reset_session/create", { data: { email } });
    expect(res.json.status).toBe("success");
  });

  it("resets a forgotten password", async () => {
    const { email, password } = await signupUser(t.app);
    await post(t.app, "/api/password_reset_session/create", { data: { email } });
    // find the reset session secret directly from the repo
    const sessions = await t.container.password_reset_session_list.FindByUserId(
      (await post(t.app, "/api/login", { data: { email, password } })).json.data.user_id
    );
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const secret = sessions[0].secret;
    const res = await post(t.app, "/api/reset_forgotten_password", {
      data: { session_secret: secret, new_password: "resetpass123" },
    });
    expect(res.json.status).toBe("success");
    // old password fails, new one works
    const oldLogin = await post(t.app, "/api/login", { data: { email, password } });
    expect(oldLogin.json.status).toBe("error");
    const newLogin = await post(t.app, "/api/login", { data: { email, password: "resetpass123" } });
    expect(newLogin.json.status).toBe("success");
  });
});

describe("plans", () => {
  it("creates a plan with default accounts and cashflows", async () => {
    const { session_id } = await signupUser(t.app);
    const res = await post(
      t.app,
      "/api/plan/add",
      {
        data: {
          title: "My Plan",
          description: "desc",
          monthly_income: 50000,
          monthly_expense: 30000,
          runway: 6,
        },
      },
      { "auth-token": session_id }
    );
    expect(res.json.status).toBe("success");
    const plan = res.json.data;
    expect(plan.title).toBe("My Plan");
    expect(plan.account_list.length).toBe(3); // Emergency, Saving, Investment
    expect(plan.cashflow_list.length).toBe(2); // income + expense
    const emergency = plan.account_list.find((a: any) => a.category === "e");
    expect(emergency.init_balance).toBe(30000 * 6);
  });

  it("fetches the user's plans", async () => {
    const { session_id } = await signupUser(t.app);
    await post(
      t.app,
      "/api/plan/add",
      { data: { title: "P1", description: "", monthly_income: 1000, monthly_expense: 500, runway: 3 } },
      { "auth-token": session_id }
    );
    const res = await post(t.app, "/api/get/plan", { data: {} }, { "auth-token": session_id });
    expect(res.json.status).toBe("success");
    expect(res.json.data.length).toBeGreaterThanOrEqual(1);
  });

  it("updates a plan (whole-document)", async () => {
    const { session_id } = await signupUser(t.app);
    const created = await post(
      t.app,
      "/api/plan/add",
      { data: { title: "P", description: "", monthly_income: 1000, monthly_expense: 500, runway: 3 } },
      { "auth-token": session_id }
    );
    const plan = created.json.data;
    plan.title = "Renamed";
    const res = await post(t.app, "/api/plan/update", { data: plan }, { "auth-token": session_id });
    expect(res.json.status).toBe("success");
    const fetched = await post(t.app, "/api/get/plan", { data: {} }, { "auth-token": session_id });
    expect(fetched.json.data.find((p: any) => p._id === plan._id).title).toBe("Renamed");
  });

  it("forks a plan", async () => {
    const { session_id } = await signupUser(t.app);
    const created = await post(
      t.app,
      "/api/plan/add",
      { data: { title: "Src", description: "", monthly_income: 1000, monthly_expense: 500, runway: 3 } },
      { "auth-token": session_id }
    );
    const plan_id = created.json.data._id;
    const res = await post(
      t.app,
      "/api/plan/fork",
      { data: { plan_id, title: "Forked", description: "copy" } },
      { "auth-token": session_id }
    );
    expect(res.json.status).toBe("success");
    expect(res.json.data.parent_id).toBe(plan_id);
  });
});

describe("income/expense", () => {
  it("adds an income cashflow with end_month (fixed bug)", async () => {
    const { session_id } = await signupUser(t.app);
    const plan = (
      await post(
        t.app,
        "/api/plan/add",
        { data: { title: "P", description: "", monthly_income: 1000, monthly_expense: 500, runway: 3 } },
        { "auth-token": session_id }
      )
    ).json.data;
    const res = await post(
      t.app,
      "/api/income/add",
      {
        data: {
          plan_id: plan._id,
          category: "i",
          type: "p",
          frequency: "m",
          amount: 10000,
          desc: "Side income",
          start_month: 1,
          end_month: 600,
          active: true,
          primary: false,
        },
      },
      { "auth-token": session_id }
    );
    expect(res.json.status).toBe("success");
    expect(res.json.data.end_month).toBe(600); // the original dropped this field
  });
});

describe("share objects", () => {
  it("creates a share object from a plan and lists it as creator", async () => {
    const { session_id } = await signupUser(t.app);
    const plan = (
      await post(
        t.app,
        "/api/plan/add",
        { data: { title: "P", description: "", monthly_income: 1000, monthly_expense: 500, runway: 3 } },
        { "auth-token": session_id }
      )
    ).json.data;
    const create = await post(
      t.app,
      "/api/share_object/create",
      {
        data: {
          type: "template",
          category: "t-i",
          title: "Shared Plan",
          description: "share me",
          plan_ids: [plan._id],
          creator_name: "Test User",
          promotional_links: [],
        },
      },
      { "auth-token": session_id }
    );
    expect(create.json.status).toBe("success");
    const share = create.json.data.share_object || create.json.data;
    expect(share.title).toBe("Shared Plan");
    expect(share.plan_ids.length).toBe(1);

    const list = await post(
      t.app,
      "/api/get/share_object_details",
      { data: { filter_by: "creator_id" } },
      { "auth-token": session_id }
    );
    expect(list.json.status).toBe("success");
    expect(list.json.data.length).toBeGreaterThanOrEqual(1);
  });

  it("is public: anyone can fetch a share object by share_id without auth", async () => {
    const { session_id } = await signupUser(t.app);
    const plan = (
      await post(
        t.app,
        "/api/plan/add",
        { data: { title: "P", description: "", monthly_income: 1000, monthly_expense: 500, runway: 3 } },
        { "auth-token": session_id }
      )
    ).json.data;
    const create = await post(
      t.app,
      "/api/share_object/create",
      {
        data: {
          type: "template",
          category: "t-i",
          title: "Public Share",
          description: "",
          plan_ids: [plan._id],
          creator_name: "T",
          promotional_links: [],
        },
      },
      { "auth-token": session_id }
    );
    const share_id = create.json.data.share_object?._id || create.json.data._id;
    const res = await post(t.app, "/api/get/share_object", {
      data: { ids: [share_id], filter_by: "share_id" },
    });
    expect(res.json.status).toBe("success");
    expect(res.json.data[0].title).toBe("Public Share");
  });
});

describe("engine", () => {
  it("produces a plan snapshot for a signed-up user's plan", async () => {
    const { session_id } = await signupUser(t.app);
    const plan = (
      await post(
        t.app,
        "/api/plan/add",
        { data: { title: "P", description: "", monthly_income: 50000, monthly_expense: 20000, runway: 6 } },
        { "auth-token": session_id }
      )
    ).json.data;
    const res = await post(
      t.app,
      "/api/engine/plan_snapshot",
      { data: { plan, duration: 24 } },
      { "auth-token": session_id }
    );
    expect(res.json.status).toBe("success");
    const snap = res.json.data;
    expect(Array.isArray(snap.income_list)).toBe(true);
    expect(Array.isArray(snap.expense_list)).toBe(true);
    expect(Array.isArray(snap.account_list)).toBe(true);
    expect(Array.isArray(snap.emi_schedule)).toBe(true);
    expect(Array.isArray(snap.balance_and_transaction_by_month)).toBe(true);
    expect(snap.cashflow.income_statement).toBeTruthy();
    expect(snap.cashflow.expense_statement).toBeTruthy();
    expect(snap.account_balances_and_transactions.account_balances).toBeTruthy();
  });
});

describe("onboarding", () => {
  it("onboards a user and auto-creates 'My first plan.'", async () => {
    const { session_id } = await signupUser(t.app);
    const res = await post(
      t.app,
      "/api/user/onboard",
      {
        data: {
          ob_params: {
            currency: "INR",
            objective: 1,
            income: 60000,
            monthly_expense: 25000,
            runway: 6,
            spender_type: 2,
            emi_dependency: 1,
            beta_opt_in: 1,
          },
        },
      },
      { "auth-token": session_id }
    );
    expect(res.json.status).toBe("success");
    expect(res.json.data.plan.title).toBe("My first plan.");
    expect(res.json.data.plan.account_list.length).toBe(3);
    // credentials must NOT leak (fixed bug)
    expect(res.json.data.user.credentials).toBeUndefined();
  });
});

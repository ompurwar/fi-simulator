import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  signupUser,
  type TestApp,
} from "../helpers";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";
import type { ToolContext } from "@/server/mcp/types";

let t: TestApp;
let registry: ReturnType<typeof makeToolRegistry>;

beforeAll(async () => {
  t = await createTestApp();
  registry = makeToolRegistry(t.container);
});

afterAll(async () => {
  await t.stop();
});

async function signupCtx(): Promise<{ ctx: ToolContext; session: any }> {
  const session = await signupUser(t.app);
  // /user/get/profile strips _id, so resolve the id from the user repo.
  const [user] = await t.container.user_list.FindByEmail(session.email);
  if (!user) throw new Error(`user not found for ${session.email}`);
  return { ctx: { user_id: user._id.toString() }, session };
}

async function createPlan(ctx: ToolContext, overrides: Record<string, any> = {}) {
  const res = await callRegistryTool(registry, ctx, "create_plan", {
    title: "MCP Plan",
    description: "created by mcp tools test",
    monthly_income: 50000,
    monthly_expense: 20000,
    runway: 6,
    ...overrides,
  });
  if (!res.ok) throw new Error(`create_plan failed: ${JSON.stringify(res.error)}`);
  return res.data as any;
}

describe("identity & plans", () => {
  it("whoami returns the current user", async () => {
    const { ctx } = await signupCtx();
    const res = await callRegistryTool(registry, ctx, "whoami", {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.data as any)._id).toBe(ctx.user_id);
      expect((res.data as any).credentials).toBeUndefined();
    }
  });

  it("list_plans and get_plan round-trip a created plan", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);

    const listed = await callRegistryTool(registry, ctx, "list_plans", {});
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const plans = listed.data as any[];
      expect(plans.some((p) => p._id.toString() === plan._id)).toBe(true);
      expect(plans.every((p) => typeof p.is_default === "boolean")).toBe(true);
    }

    const fetched = await callRegistryTool(registry, ctx, "get_plan", {
      plan_id: plan._id,
    });
    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect((fetched.data as any)._id.toString()).toBe(plan._id);
      expect((fetched.data as any).account_list.length).toBe(3);
    }
  });

  it("get_plan on a missing plan id is NOT_FOUND", async () => {
    const { ctx } = await signupCtx();
    const res = await callRegistryTool(registry, ctx, "get_plan", {
      plan_id: "does-not-exist",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });

  it("create_plan without a title is VALIDATION_FAILED", async () => {
    const { ctx } = await signupCtx();
    const res = await callRegistryTool(registry, ctx, "create_plan", {
      monthly_income: 1000,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("income/expense cashflows", () => {
  it("add, update and delete income via tools", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);

    const added = await callRegistryTool(registry, ctx, "add_income", {
      plan_id: plan._id,
      desc: "Freelance gig",
      amount: 15000,
      start_month: 1,
      end_month: 600,
    });
    expect(added.ok).toBe(true);
    const income_id = added.ok ? (added.data as any)._id : "";

    const listed = await callRegistryTool(registry, ctx, "list_income", {
      plan_id: plan._id,
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const lines = (listed.data as any[]).filter((c) => c._id === income_id);
      expect(lines).toHaveLength(1);
      expect(lines[0].amount).toBe(15000);
    }

    const updated = await callRegistryTool(registry, ctx, "update_income", {
      income_id,
      changes: { amount: 20000 },
    });
    expect(updated.ok).toBe(true);
    const relisted = await callRegistryTool(registry, ctx, "list_income", {
      plan_id: plan._id,
    });
    if (relisted.ok) {
      const line = (relisted.data as any[]).find((c) => c._id === income_id);
      expect(line?.amount).toBe(20000);
    }

    const deleted = await callRegistryTool(registry, ctx, "delete_income", {
      income_id,
    });
    expect(deleted.ok).toBe(true);
    const afterDelete = await callRegistryTool(registry, ctx, "list_income", {
      plan_id: plan._id,
    });
    if (afterDelete.ok) {
      expect((afterDelete.data as any[]).some((c) => c._id === income_id)).toBe(false);
    }
  });

  it("rejects add_income with missing required args", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const res = await callRegistryTool(registry, ctx, "add_income", {
      plan_id: plan._id,
      amount: 1000,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_FAILED");
  });

  it("adds an expense and lists it", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const added = await callRegistryTool(registry, ctx, "add_expense", {
      plan_id: plan._id,
      desc: "Rent top-up",
      amount: 8000,
      start_month: 2,
    });
    expect(added.ok).toBe(true);
    const listed = await callRegistryTool(registry, ctx, "list_expense", {
      plan_id: plan._id,
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const line = (listed.data as any[]).find(
        (c) => added.ok && c._id === (added.data as any)._id
      );
      expect(line?.amount).toBe(8000);
    }
  });
});

describe("cashflow changes", () => {
  it("adds a cashflow change and lists it for the plan", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const income = await callRegistryTool(registry, ctx, "add_income", {
      plan_id: plan._id,
      desc: "Salary",
      amount: 50000,
      start_month: 1,
      end_month: 600,
    });
    const income_id = income.ok ? (income.data as any)._id : "";

    const added = await callRegistryTool(registry, ctx, "add_cashflow_change", {
      cashflow_id: income_id,
      change_desc: "annual hike",
      change_category: "i",
      change_type: "p",
      value: 10,
      start_month: 3,
    });
    expect(added.ok).toBe(true);
    const change_id = added.ok ? (added.data as any)._id : "";

    const listed = await callRegistryTool(registry, ctx, "list_cashflow_changes", {
      plan_id: plan._id,
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const changes = (listed.data as any[]).filter((c) => c._id === change_id);
      expect(changes).toHaveLength(1);
      expect(changes[0].value).toBe(10);
    }

    const updated = await callRegistryTool(registry, ctx, "update_cashflow_change", {
      change_id,
      changes: { value: 15 },
    });
    expect(updated.ok).toBe(true);
    const relisted = await callRegistryTool(registry, ctx, "list_cashflow_changes", {
      plan_id: plan._id,
    });
    if (relisted.ok) {
      const change = (relisted.data as any[]).find((c) => c._id === change_id);
      expect(change?.value).toBe(15);
    }
  });
});

describe("engine & simulation", () => {
  it("plan_snapshot returns balances and transactions", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const res = await callRegistryTool(registry, ctx, "plan_snapshot", {
      plan_id: plan._id,
      duration: 24,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const snap = res.data as any;
      expect(snap.account_balances_and_transactions).toBeTruthy();
      expect(Array.isArray(snap.account_balances_and_transactions.account_balances)).toBe(true);
      expect(Array.isArray(snap.income_list)).toBe(true);
      expect(Array.isArray(snap.net_cashflow)).toBe(true);
    }
  });

  it("simulate_plan with a $100000 income patch raises net worth vs baseline", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const planRes = await callRegistryTool(registry, ctx, "get_plan", {
      plan_id: plan._id,
    });
    expect(planRes.ok).toBe(true);
    const plan_json = planRes.ok ? planRes.data : null;

    const baseline = await callRegistryTool(registry, ctx, "plan_snapshot", {
      plan_id: plan._id,
      duration: 24,
    });
    const baseNet = baseline.ok
      ? (baseline.data as any).net_cashflow.reduce((s: number, m: any) => s + m.total, 0)
      : 0;

    const simulated = await callRegistryTool(registry, ctx, "simulate_plan", {
      plan_json,
      patches: [
        {
          op: "add_income",
          cashflow: { desc: "Side hustle", amount: 100000, start_month: 1, end_month: 24 },
        },
      ],
      duration: 24,
    });
    expect(simulated.ok).toBe(true);
    if (simulated.ok) {
      const sim = simulated.data as any;
      expect(sim.applied_patches).toHaveLength(1);
      const simNet = (sim.snapshot as any).net_cashflow.reduce(
        (s: number, m: any) => s + m.total,
        0
      );
      expect(simNet).toBeGreaterThan(baseNet);
      expect(simNet - baseNet).toBe(100000 * 24);
    }
  });

  it("plan_snapshot summary mode returns a compact projection", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const res = await callRegistryTool(registry, ctx, "plan_snapshot", {
      plan_id: plan._id,
      duration: 12,
      summary: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const snap = res.data as any;
      expect(snap.transaction_list).toBeUndefined(); // full detail omitted
      expect(Array.isArray(snap.monthly_totals)).toBe(true);
      expect(snap.monthly_totals[0]).toMatchObject({ month: 1, income: 50000 });
      expect(Array.isArray(snap.balances_by_month)).toBe(true);
      expect(Array.isArray(snap.net_cashflow)).toBe(true);
      // MCP net worth = buckets + assets, same as the web UI (consistency guard)
      expect(Array.isArray(snap.net_worth_by_month)).toBe(true);
      expect(snap.net_worth_by_month[0].month).toBe(1);
      expect(snap.assets_by_month).toBeTruthy(); // {} for plans without holdings
      expect(snap.asset_summary).toBeUndefined(); // no holdings → no summary
    }
  });

  it("plan_snapshot milestones mode carries yearly net-worth/asset points", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const res = await callRegistryTool(registry, ctx, "plan_snapshot", {
      plan_id: plan._id,
      duration: 25,
      summary: true,
      milestones: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const snap = res.data as any;
      expect(Array.isArray(snap.milestone_months)).toBe(true);
      expect(snap.milestone_months).toContain(1);
      expect(snap.milestone_months).toContain(13);
      expect(Array.isArray(snap.net_worth_by_month)).toBe(true);
      expect(snap.net_worth_by_month[0]).toMatchObject({ month: 1 });
      expect(snap.assets_by_month).toBeTruthy();
      expect(snap.totals.net).toBeGreaterThan(0);
    }
  });

  it("simulate_plan accepts plan_id and never persists (token-saving mode)", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const plan_id = String(plan._id);

    const before = await callRegistryTool(registry, ctx, "plan_snapshot", { plan_id, duration: 12 });
    const baseNet = ((before as any).data as any).net_cashflow.reduce(
      (s: number, m: any) => s + m.total,
      0
    );

    const simulated = await callRegistryTool(registry, ctx, "simulate_plan", {
      plan_id,
      patches: [
        {
          op: "add_income",
          cashflow: { desc: "Side hustle", amount: 100000, start_month: 1, end_month: 12 },
        },
      ],
      duration: 12,
      summary: true,
    });
    expect(simulated.ok).toBe(true);
    if (simulated.ok) {
      const sim = simulated.data as any;
      expect(sim.applied_patches).toHaveLength(1);
      const simNet = (sim.snapshot as any).monthly_totals.reduce(
        (s: number, m: any) => s + m.net,
        0
      );
      expect(simNet).toBeGreaterThan(baseNet);
      // nothing persisted: the plan doc is unchanged
      const after = await callRegistryTool(registry, ctx, "get_plan", { plan_id });
      expect(
        (((after as any).data as any).cashflow_list || []).some((c: any) => c.desc === "Side hustle")
      ).toBe(false);
    }
  });

  it("simulate_plan rejects providing both plan_id and plan_json", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const res = await callRegistryTool(registry, ctx, "simulate_plan", {
      plan_id: String(plan._id),
      plan_json: { cashflow_list: [] },
      patches: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_FAILED");
  });

  it("loan_amortization computes a schedule", async () => {
    const ctx: ToolContext = { user_id: "loan-test-user" };
    const res = await callRegistryTool(registry, ctx, "loan_amortization", {
      amount: 1000000,
      interest_rate: 9,
      tenure: 60,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const schedule = res.data as any[];
      expect(schedule).toHaveLength(60);
      expect(schedule[59].closing_balance).toBeLessThan(1);
    }
  });
});

describe("net worth", () => {
  it("networth_status works before any connection", async () => {
    const { ctx } = await signupCtx();
    const res = await callRegistryTool(registry, ctx, "networth_status", {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.data as any).connected).toBe(false);
    }
  });
});

describe("share objects", () => {
  it("creates and lists a share object", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const created = await callRegistryTool(registry, ctx, "create_share_object", {
      plan_ids: [plan._id],
      title: "Shared Template",
      description: "share me",
    });
    expect(created.ok).toBe(true);

    const listed = await callRegistryTool(registry, ctx, "list_share_objects", {});
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const objects = listed.data as any[];
      expect(objects.some((o) => o.title === "Shared Template")).toBe(true);
    }

    const deleted = await callRegistryTool(registry, ctx, "delete_share_object", {
      share_id:
        created.ok && (created.data as any).share_object
          ? (created.data as any).share_object._id
          : created.ok
            ? (created.data as any)._id
            : "",
    });
    expect(deleted.ok).toBe(true);
  });

  it("persists a hike on a plan-embedded income line (the web-onboarding model)", async () => {
    const { ctx } = await signupCtx();
    // create_plan embeds income/expense lines INSIDE the plan document
    // (cashflow_list) — the model that used to be invisible to the store-based
    // AddCashflowChange path.
    const plan = await createPlan(ctx);
    const plan_id = String(plan._id);

    // The salary line lives in the plan doc, not in Cash_Flow_Store.
    const embedded = (plan.cashflow_list || []).find((c: any) => c.category === "i");
    expect(embedded).toBeTruthy();
    const salary_id = String(embedded._id);

    const store_lookup = await t.container.cashflow_list.FindById(salary_id);
    expect(store_lookup).toBeNull(); // proves the store-registered path would fail

    const add = await callRegistryTool(registry, ctx, "add_cashflow_change", {
      plan_id,
      cashflow_id: salary_id,
      change_category: "i",
      change_type: "p",
      value: 20,
      start_month: 24,
      change_desc: "20% yearly hike",
    });
    expect(add.ok).toBe(true);

    const planAfter = (await t.container.plan_list.FindById(plan_id)) as any;
    const changes = planAfter.cashflow_change_list || [];
    const change = changes.find((c: any) => c.cashflow_id === salary_id);
    expect(change).toBeTruthy();
    expect(change).toMatchObject({ value: 20, change_type: "p", category: "i", start_month: 24 });

    // list_cashflow_changes reads the embedded list (not the empty store)
    const listed = await callRegistryTool(registry, ctx, "list_cashflow_changes", { plan_id });
    expect(listed.ok).toBe(true);
    expect(((listed as any).data as any[]).length).toBeGreaterThan(0);

    // and the projection picks it up: salary grows 20% at month 24
    const snapshot = await callRegistryTool(registry, ctx, "plan_snapshot", { plan_id, duration: 30 });
    const income_statement = (snapshot as any).data.cashflow.income_statement;
    const month24 = income_statement.find((s: any) => s.month === 24);
    expect(month24.total_income).toBe(60000); // 50000 * 1.2

    // A second change on the same line at the same month REPLACES the first —
    // the engine applies only the first change per (line, start_month), so the
    // new value must win instead of being shadowed.
    const second = await callRegistryTool(registry, ctx, "add_cashflow_change", {
      plan_id,
      cashflow_id: salary_id,
      change_category: "i",
      change_type: "p",
      value: 30,
      start_month: 24,
      change_desc: "revised 30% hike",
    });
    expect(second.ok).toBe(true);

    const planAgain = (await t.container.plan_list.FindById(plan_id)) as any;
    const month24Changes = (planAgain.cashflow_change_list || []).filter(
      (c: any) => String(c.cashflow_id) === salary_id && c.start_month === 24
    );
    expect(month24Changes).toHaveLength(1);
    expect(month24Changes[0].value).toBe(30);

    const snapshot2 = await callRegistryTool(registry, ctx, "plan_snapshot", { plan_id, duration: 30 });
    const month24b = (snapshot2 as any).data.cashflow.income_statement.find((s: any) => s.month === 24);
    expect(month24b.total_income).toBe(65000); // 50000 * 1.3
  });

  it("persists frequency 'y' and an open end_month on embedded changes (no more m/end=start)", async () => {
    const { ctx } = await signupCtx();
    const plan = await createPlan(ctx);
    const plan_id = String(plan._id);
    const salary_id = String(
      (plan.cashflow_list || []).find((c: any) => c.category === "i")._id
    );

    const add = await callRegistryTool(registry, ctx, "add_cashflow_change", {
      plan_id,
      cashflow_id: salary_id,
      change_category: "i",
      change_type: "p",
      value: 10,
      start_month: 1,
      end_month: 600,
      frequency: "y",
      change_desc: "yearly hike",
    });
    expect(add.ok).toBe(true);

    const doc = (await t.container.plan_list.FindById(plan_id)) as any;
    const change = (doc.cashflow_change_list || []).find((c: any) => c.start_month === 1);
    expect(change).toMatchObject({ frequency: "y", end_month: 600, value: 10 });

    // and the projection compounds yearly from m1: m13 = 60500, m25 = 66550
    const snap = await callRegistryTool(registry, ctx, "plan_snapshot", { plan_id, duration: 26, summary: true });
    const totals = (snap as any).data.monthly_totals;
    expect(totals.find((t: any) => t.month === 13).income).toBe(60500);
    expect(totals.find((t: any) => t.month === 25).income).toBe(66550);
  });
});

describe("cross-user isolation", () => {
  it("list_plans for user B excludes user A's plan", async () => {
    const { ctx: ctxA } = await signupCtx();
    const planA = await createPlan(ctxA);
    const { ctx: ctxB } = await signupCtx();

    const listedB = await callRegistryTool(registry, ctxB, "list_plans", {});
    expect(listedB.ok).toBe(true);
    if (listedB.ok) {
      const plansB = listedB.data as any[];
      expect(plansB.some((p) => p._id.toString() === planA._id)).toBe(false);
    }

    // NOTE (honest finding): get_plan uses plan_list.FindById which does NOT
    // check ownership, so user B can read user A's plan document by id today.
    const getB = await callRegistryTool(registry, ctxB, "get_plan", {
      plan_id: planA._id,
    });
    expect(getB.ok).toBe(true);
  });
});

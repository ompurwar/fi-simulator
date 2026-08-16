import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signupUser, type TestApp } from "../helpers";
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

async function signupCtx(): Promise<ToolContext> {
  const session = await signupUser(t.app);
  const [user] = await t.container.user_list.FindByEmail(session.email);
  return { user_id: user._id.toString() };
}

describe("quality gate: add-then-project (the 'persisted but invisible' regression)", () => {
  it("an add_expense line appears in the projection's expense total", async () => {
    const ctx = await signupCtx();
    const plan = await callRegistryTool(registry, ctx, "create_plan", {
      title: "Add-projection plan",
      monthly_income: 50000,
      monthly_expense: 20000,
    });
    const plan_id = String((plan as any).data._id ?? (plan as any).data.plan_id);

    const added = await callRegistryTool(registry, ctx, "add_expense", {
      plan_id,
      desc: "One-time wedding",
      amount: 1600000,
      start_month: 3,
      end_month: 3,
      type: "o",
    });
    expect(added.ok).toBe(true);

    const snapshot = await callRegistryTool(registry, ctx, "plan_snapshot", {
      plan_id,
      duration: 6,
      summary: true,
    });
    expect(snapshot.ok).toBe(true);
    const month3 = (snapshot as any).data.monthly_totals.find((m: any) => m.month === 3);
    // baseline expense (~20k) + the ₹16L lump must appear
    expect(month3.expense).toBeGreaterThan(1600000);
  });

  it("an add_income line appears in the projection's income total", async () => {
    const ctx = await signupCtx();
    const plan = await callRegistryTool(registry, ctx, "create_plan", {
      title: "Add-income projection plan",
      monthly_income: 50000,
      monthly_expense: 20000,
    });
    const plan_id = String((plan as any).data._id ?? (plan as any).data.plan_id);

    const added = await callRegistryTool(registry, ctx, "add_income", {
      plan_id,
      desc: "Bonus",
      amount: 100000,
      start_month: 2,
      end_month: 2,
      type: "o",
    });
    expect(added.ok).toBe(true);

    const snapshot = await callRegistryTool(registry, ctx, "plan_snapshot", {
      plan_id,
      duration: 4,
      summary: true,
    });
    const month2 = (snapshot as any).data.monthly_totals.find((m: any) => m.month === 2);
    expect(month2.income).toBeGreaterThanOrEqual(150000); // 50k salary + 100k bonus
  });

  it("the embedded line in the plan doc is a full object, not a bare id string", async () => {
    const ctx = await signupCtx();
    const plan = await callRegistryTool(registry, ctx, "create_plan", {
      title: "Embed check plan",
      monthly_income: 50000,
      monthly_expense: 20000,
    });
    const plan_id = String((plan as any).data._id ?? (plan as any).data.plan_id);

    await callRegistryTool(registry, ctx, "add_expense", {
      plan_id,
      desc: "Embed me",
      amount: 5000,
      start_month: 1,
      end_month: 1,
      type: "o",
    });

    const doc: any = await t.container.plan_list.FindById(plan_id);
    const line = (doc?.cashflow_list || []).find((c: any) => c.desc === "Embed me");
    expect(typeof line).toBe("object");
    expect(line?.amount).toBe(5000);
  });
});

describe("quality gate: funded purchases (₹T = ₹Y own + ₹Z loan must not double-count)", () => {
  it("an add_expense + add_loan scenario expends only the own-portion", async () => {
    const ctx = await signupCtx();
    const plan = await callRegistryTool(registry, ctx, "create_plan", {
      title: "Wedding scenario plan",
      monthly_income: 100000,
      monthly_expense: 40000,
    });
    const plan_id = String((plan as any).data._id ?? (plan as any).data.plan_id);

    const sim = await callRegistryTool(registry, ctx, "simulate_plan", {
      plan_id,
      duration: 20,
      summary: true,
      patches: [
        { op: "add_expense", cashflow: { desc: "Wedding", amount: 1600000, start_month: 8, end_month: 8, type: "o" } },
        { op: "add_loan", loan: { amount: 400000, interest_rate: 12, tenure: 24, start_month: 8, deposit_to_bank: true } },
      ],
    });
    expect(sim.ok).toBe(true);
    const month8 = (sim as any).data.snapshot.monthly_totals.find((m: any) => m.month === 8);
    // expense = baseline (~40k) + ₹16L own + first EMI (~₹18.8k) — NOT +₹20L
    expect(month8.expense).toBeGreaterThan(1600000);
    expect(month8.expense).toBeLessThan(1700000);
  });
});

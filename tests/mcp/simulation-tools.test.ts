import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signupUser, type TestApp } from "../helpers";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";
import type { ToolContext } from "@/server/mcp/types";
import { AY_RULE_SETS } from "@/server/tax/rules-data";

let t: TestApp;
let ctx: ToolContext;
let plan_id: string;

beforeAll(async () => {
  t = await createTestApp();
  // profile endpoint strips _id — resolve the real user id via the session
  const signed = await signupUser(t.app);
  const s = await t.container.session_list.FindByActiveSessionId(signed.session_id);
  ctx = { user_id: s!.user_id.toString(), role: "user" };

  for (const ruleSet of AY_RULE_SETS) {
    await t.container.tax_rule_repo.UpsertRuleSet({ ...ruleSet });
  }
  const created = await callRegistryTool(makeToolRegistry(t.container), ctx, "create_plan", {
    title: "Simulation tools plan",
    monthly_income: 300000,
    monthly_expense: 60000,
  });
  plan_id = (created as any).data.plan_id || (created as any).data._id;
  await callRegistryTool(makeToolRegistry(t.container), ctx, "add_asset", {
    plan_id,
    title: "Gold",
    asset_class: "gold",
    category: "i",
    principal: 200000,
    purchase_month: 1,
    growth_rate: 8.5,
    volatility: 14,
  });
});

afterAll(async () => {
  await t.stop();
});

describe("compare_scenarios", () => {
  it("returns baseline vs scenario net-worth points and totals, never persisting", async () => {
    const before = await t.container.plan_list.FindById(plan_id);
    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "compare_scenarios", {
      plan_id,
      scenario_patches: [{ op: "set_salary", amount: 250000 }],
      duration: 24,
    });
    expect(res.ok).toBe(true);
    const data = (res as any).data;
    expect(Array.isArray(data.net_worth)).toBe(true);
    expect(data.net_worth[0]).toMatchObject({ month: 1 });
    expect(typeof data.net_worth[0].baseline).toBe("number");
    expect(typeof data.net_worth[0].scenario).toBe("number");
    expect(data.totals.baseline.net_worth_at_end).toBeGreaterThan(0);
    // salary cut → scenario net worth lower at the end
    expect(data.totals.scenario.net_worth_at_end).toBeLessThan(data.totals.baseline.net_worth_at_end);
    // never persists
    const after = await t.container.plan_list.FindById(plan_id);
    expect((after as any).cashflow_list.find((c: any) => c.category === "i").amount).toBe(
      (before as any).cashflow_list.find((c: any) => c.category === "i").amount
    );
  });

  it("supports baseline_patches (compare today vs a variant)", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "compare_scenarios", {
      plan_id,
      baseline_patches: [{ op: "set_salary", amount: 300000 }],
      scenario_patches: [{ op: "set_salary", amount: 360000 }],
      duration: 12,
    });
    expect(res.ok).toBe(true);
    const data = (res as any).data;
    expect(data.totals.scenario.net_worth_at_end).toBeGreaterThan(data.totals.baseline.net_worth_at_end);
  });
});

describe("asset_projection", () => {
  it("projects an FD with quarterly compounding and TDS past the threshold", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "asset_projection", {
      principal: 1000000,
      growth_rate: 0,
      yield_rate: 30,
      asset_class: "fd",
      income_frequency: "q",
      income_mode: "reinvest",
      compounding: "quarterly",
      duration: 12,
      assessment_year: "2025-26",
    });
    expect(res.ok).toBe(true);
    const data = (res as any).data;
    expect(data.rows.length).toBe(12);
    expect(data.total_tds).toBeGreaterThan(20000);
    expect(data.closing_value).toBeGreaterThan(1000000);
    expect(data.rows[11].month).toBe(12);
  });

  it("projects an equity SIP with step-up", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "asset_projection", {
      principal: 100000,
      growth_rate: 12,
      asset_class: "equity",
      duration: 30,
      sip: { amount: 10000, frequency: "m", start_month: 6, step_pct: 10 },
      assessment_year: "2025-26",
    });
    expect(res.ok).toBe(true);
    const data = (res as any).data;
    const sipRows = data.rows.filter((r: any) => r.sip_added > 0);
    expect(sipRows.length).toBeGreaterThan(20);
    expect(sipRows[0].sip_added).toBeCloseTo(10000, 0);
    expect(sipRows[sipRows.length - 1].sip_added).toBeGreaterThan(10000); // step-up
    expect(data.closing_value).toBeGreaterThan(100000);
  });
});

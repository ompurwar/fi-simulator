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
  const signed = await signupUser(t.app);
  const session = await t.container.session_list.FindByActiveSessionId(signed.session_id);
  if (!session) throw new Error("no session for signed-up user");
  ctx = { user_id: session.user_id.toString(), role: "user" };
  for (const ruleSet of AY_RULE_SETS) {
    await t.container.tax_rule_repo.UpsertRuleSet({ ...ruleSet });
  }
  const created = await callRegistryTool(makeToolRegistry(t.container), ctx, "create_plan", {
    title: "Gaps test plan",
    monthly_income: 100000,
    monthly_expense: 60000,
  });
  plan_id = (created as any).data.plan_id || (created as any).data._id;
});

afterAll(async () => {
  await t.stop();
});

describe("plan gaps in snapshots", () => {
  it("summary exposes skipped_sips and unfunded_expenses with totals", async () => {
    // 50k/mo SIP vs 28k+8k monthly allocation → month 1 skipped (36k < 50k)
    await callRegistryTool(makeToolRegistry(t.container), ctx, "add_asset", {
      plan_id,
      title: "Big SIP",
      asset_class: "equity",
      category: "i",
      principal: 0,
      purchase_month: 1,
      growth_rate: 12,
      sip: { amount: 50000, frequency: "m", start_month: 1 },
    });

    const full = await callRegistryTool(makeToolRegistry(t.container), ctx, "plan_snapshot", {
      plan_id,
      duration: 12,
    });
    const skipped = (full as any).data.skipped_sips as any[];
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped[0]).toMatchObject({ month: 1, title: "Big SIP", amount: 50000 });

    const summary = await callRegistryTool(makeToolRegistry(t.container), ctx, "plan_snapshot", {
      plan_id,
      duration: 12,
      summary: true,
    });
    const gaps = (summary as any).data.gaps;
    expect(gaps).toBeTruthy();
    expect(gaps.skipped_sips).toHaveLength(skipped.length);
    expect(gaps.skipped_sips_total).toBe(50000 * skipped.length);
    expect(gaps.unfunded_expenses).toEqual([]);
    expect(gaps.unfunded_total).toBe(0);
  });

  it("unfunded expense months surface as gaps when the ladder runs dry", async () => {
    // one-time 3L expense in month 2 with no savings buffer → gap appears
    await callRegistryTool(makeToolRegistry(t.container), ctx, "add_expense", {
      plan_id,
      type: "o",
      frequency: null,
      amount: 300000,
      desc: "One-time big spend",
      start_month: 2,
      end_month: 2,
    });
    const summary = await callRegistryTool(makeToolRegistry(t.container), ctx, "plan_snapshot", {
      plan_id,
      duration: 12,
      summary: true,
    });
    const gaps = (summary as any).data.gaps;
    expect(gaps.unfunded_expenses.length).toBeGreaterThan(0);
    expect(gaps.unfunded_total).toBeGreaterThan(0);
    expect(gaps.unfunded_expenses[0]).toMatchObject({ month: 2 });
  });
});

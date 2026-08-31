import { describe, expect, it } from "vitest";
import { ComputePlanSnapshot } from "@/server/engine/planSnapshot";
import { AY_RULE_SETS } from "@/server/tax/rules-data";

const FY_2025_26 = AY_RULE_SETS.find((r) => r.assessment_year === "2025-26")!;
const PLAN_TS = new Date(2025, 3, 1).getTime();

function basePlan(overrides: Record<string, any> = {}): any {
  return {
    _id: "plan1",
    user_id: "u1",
    timestamp: PLAN_TS,
    cashflow_list: [
      { _id: "sal", category: "i", type: "p", frequency: "m", amount: 240000, start_month: 1, end_month: 600, active: true, primary: true, desc: "salary" },
      { _id: "exp", category: "e", type: "p", frequency: "m", amount: 100000, start_month: 1, end_month: 600, active: true, primary: true, desc: "expenses" },
    ],
    cashflow_change_list: [],
    account_list: [
      { _id: "acc-e", title: "Emergency", category: "e", type: "a", init_balance: 1000, roi: 3, default_investment_priority: 1 },
      { _id: "acc-s", title: "Saving", category: "s", type: "a", init_balance: 0, roi: 5, default_investment_priority: 2 },
      { _id: "acc-i", title: "Investment", category: "i", type: "a", init_balance: 0, roi: 12, default_investment_priority: 3 },
    ],
    loan_accounts: [],
    fund_distribution_percentage: [
      { _id: "fdp1", start_month: 1, end_month: 13, s: 10, e: 0, i: 90, active: true },
    ],
    asset_list: [
      {
        _id: "mf",
        title: "Mutual Funds",
        asset_class: "mf",
        category: "i",
        principal: 0,
        purchase_month: 1,
        growth_rate: 12,
        income_frequency: "y",
        income_mode: "reinvest",
        sip: { amount: 25000, frequency: "m", start_month: 1 },
      },
      {
        _id: "us",
        title: "US Stocks",
        asset_class: "equity_foreign",
        category: "i",
        principal: 0,
        purchase_month: 1,
        growth_rate: 14,
        income_frequency: "y",
        income_mode: "reinvest",
        sip: { amount: 58000, frequency: "m", start_month: 1 },
      },
    ],
    withdrawal_settings: {},
    ...overrides,
  };
}

describe("auto FDP fallback after explicit coverage ends", () => {
  it("funds scheduled SIPs in fallback months whenever net cashflow is positive (bug 6a94700df12f2deb870207d0)", () => {
    // A big one-time expense at month 16 wipes the buckets mid-fallback, so the
    // auto strategy keeps routing only 10% to 'i' (War Chest) for months on end
    // — the reported plan's variable-cashflow shape.
    const plan = basePlan({
      cashflow_list: [
        ...basePlan().cashflow_list,
        { _id: "oneoff", category: "e", type: "o", frequency: null, amount: 2500000, start_month: 16, end_month: 16, active: true, primary: false, desc: "big one-time" },
      ],
    });
    const snap = ComputePlanSnapshot(plan, 60, { tax_rules: FY_2025_26 });
    const skipped = snap.skipped_sips || [];
    const netOf = (m: number) =>
      snap.cashflow.income_statement[m - 1].total_income -
      snap.cashflow.expense_statement[m - 1].total_expense;
    // SIPs may only be skipped in months the plan genuinely cannot pay for them.
    const positiveNetSkips = skipped.filter((s: any) => netOf(s.month) > 0);
    expect(positiveNetSkips).toEqual([]);
    // the true shortfall month still skips (all buckets were drained by the one-off)
    expect(skipped.some((s: any) => s.month === 16)).toBe(true);
  });

  it("surfaces fdp_fallback_months once explicit FDP coverage ends", () => {
    const snap = ComputePlanSnapshot(basePlan(), 60, { tax_rules: FY_2025_26 });
    const months = snap.fdp_fallback_months || [];
    expect(months.length).toBeGreaterThan(0);
    expect(months[0].month).toBe(14);
    expect(months[0]).toMatchObject({ strategy: "War Chest", sip_aware: true });
  });

  it("emits no fdp_fallback_months for plans without explicit FDP (auto is the design default)", () => {
    const snap = ComputePlanSnapshot(
      basePlan({ fund_distribution_percentage: [] }),
      12,
      { tax_rules: FY_2025_26 }
    );
    expect(snap.fdp_fallback_months).toBeUndefined();
  });

  it("rounds the FDP percentage in 'of Net Cashflow' transaction descriptions", () => {
    const snap = ComputePlanSnapshot(basePlan(), 60, { tax_rules: FY_2025_26 });
    const descs = (snap.account_balances_and_transactions.transaction_list || [])
      .map((t: any) => t.tran_desc)
      .filter((d: string) => typeof d === "string" && d.endsWith("% of Net Cashflow"));
    expect(descs.length).toBeGreaterThan(0);
    for (const d of descs) {
      expect(d).toMatch(/^\d+(\.\d{1,2})?% of Net Cashflow$/);
    }
  });
});

import { describe, expect, it } from "vitest";
import { MakePlan } from "@/server/domain/entities";
import { ComputePlanSnapshot } from "@/server/engine/planSnapshot";
import {
  defaultWithdrawalOrder,
  resolveDebit,
  resolveWithdrawalOrder,
  sipWithdrawalLadder,
} from "@/server/engine/funding";
import { AY_RULE_SETS } from "@/server/tax/rules-data";

const FY_2025_26 = AY_RULE_SETS.find((r) => r.assessment_year === "2025-26")!;

const PLAN_TS = new Date(2025, 3, 1).getTime(); // 1 Apr 2025

function basePlan(overrides: Record<string, any> = {}): any {
  return {
    _id: "plan1",
    user_id: "u1",
    title: "Test Plan",
    description: "",
    timestamp: PLAN_TS,
    cashflow_list: [
      { _id: "sal", category: "i" as const, type: "p", frequency: "m", amount: 300000, start_month: 1, end_month: 600, active: true, primary: true, desc: "salary" },
      { _id: "exp", category: "e", type: "p", frequency: "m", amount: 500000, start_month: 1, end_month: 600, active: true, primary: true, desc: "expenses" },
    ],
    cashflow_change_list: [],
    account_list: [
      { _id: "acc-e", title: "Emergency", category: "e", type: "a", init_balance: 360000, roi: 3 },
      { _id: "acc-s", title: "Saving", category: "s", type: "a", init_balance: 100000, roi: 5 },
      { _id: "acc-i", title: "Investment", category: "i", type: "a", init_balance: 50000, roi: 12 },
    ],
    loan_accounts: [],
    fund_distribution_percentage: [],
    asset_list: [],
    ...overrides,
  };
}

describe("funding resolver", () => {
  const accounts = [
    { _id: "acc-e", title: "Emergency", category: "e" as const, type: "a" as const, roi: 3 },
    { _id: "acc-s", title: "Saving", category: "s" as const, type: "a" as const, roi: 5 },
    { _id: "acc-i", title: "Investment", category: "i" as const, type: "a" as const, roi: 12 },
  ];

  it("default order: savings → emergency → investment", () => {
    expect(defaultWithdrawalOrder(accounts).map((a) => a.category)).toEqual(["s", "e", "i"]);
  });

  it("custom order overrides; unknown ids skipped; missing accounts appended", () => {
    const ordered = resolveWithdrawalOrder(accounts, ["acc-i", "nope", "acc-s"]);
    expect(ordered.map((a) => a._id)).toEqual(["acc-i", "acc-s", "acc-e"]);
  });

  it("resolveDebit drains in order and reports the shortfall", () => {
    const balances: Record<string, number> = { "acc-s": 100, "acc-e": 50, "acc-i": 0 };
    const res = resolveDebit(200, resolveWithdrawalOrder(accounts), (id) => balances[id] || 0);
    expect(res.debits).toEqual([
      { account_id: "acc-s", amount: 100 },
      { account_id: "acc-e", amount: 50 },
    ]);
    expect(res.shortfall).toBe(50);

    const exact = resolveDebit(150, resolveWithdrawalOrder(accounts), (id) => balances[id] || 0);
    expect(exact.shortfall).toBe(0);
  });

  it("sip ladder puts the funding account first and excludes emergency when protected", () => {
    const ladder = sipWithdrawalLadder("acc-i", resolveWithdrawalOrder(accounts), { protectEmergency: true });
    expect(ladder.map((a) => a._id)).toEqual(["acc-i", "acc-s"]);
    const allow = sipWithdrawalLadder("acc-i", resolveWithdrawalOrder(accounts), { protectEmergency: false });
    expect(allow.map((a) => a._id)).toEqual(["acc-i", "acc-s", "acc-e"]);
    // the funding account itself may be the emergency bucket (explicit choice)
    const selfEmergency = sipWithdrawalLadder("acc-e", resolveWithdrawalOrder(accounts), { protectEmergency: true });
    expect(selfEmergency.map((a) => a._id)).toEqual(["acc-e", "acc-s", "acc-i"]);
  });
});

describe("MakePlan withdrawal validation", () => {
  it("accepts a valid withdrawal_order and rejects non-string entries", () => {
    const ok = MakePlan({ ...basePlan(), withdrawal_order: ["acc-i", "acc-s", "acc-e"] } as any);
    expect(ok.withdrawal_order).toEqual(["acc-i", "acc-s", "acc-e"]);
    expect(() => MakePlan({ ...basePlan(), withdrawal_order: ["acc-i", 7] } as any)).toThrow(/withdrawal_order/);
    expect(() => MakePlan({ ...basePlan(), withdrawal_order: "acc-i" } as any)).toThrow();
    expect(() =>
      MakePlan({ ...basePlan(), withdrawal_settings: { protect_emergency_for_sip: "yes" } } as any)
    ).toThrow(/withdrawal_settings/);
  });
});

describe("expense drawdown respects the withdrawal order", () => {
  it("default: savings first, then emergency (legacy behaviour)", () => {
    const snap = ComputePlanSnapshot(basePlan(), 2, { tax_rules: FY_2025_26 });
    const drs = snap.account_balances_and_transactions.transaction_list.filter(
      (t: any) => t.tran_desc === "To fund expenses" && t.month === 1 && t.amount > 0
    );
    expect(drs).toEqual([
      expect.objectContaining({ account_id: "acc-s", amount: 100000 }),
      expect.objectContaining({ account_id: "acc-e", amount: 100000 }),
    ]);
    expect(snap.unfunded_expenses).toBeUndefined();
  });

  it("custom order drains investment first", () => {
    const snap = ComputePlanSnapshot(basePlan({ withdrawal_order: ["acc-i", "acc-e", "acc-s"] }), 2, { tax_rules: FY_2025_26 });
    const drs = snap.account_balances_and_transactions.transaction_list.filter(
      (t: any) => t.tran_desc === "To fund expenses" && t.month === 1 && t.amount > 0
    );
    expect(drs).toEqual([
      expect.objectContaining({ account_id: "acc-i", amount: 50000 }),
      expect.objectContaining({ account_id: "acc-e", amount: 150000 }),
    ]);
  });

  it("expenses are NEVER skipped — unfunded shortfalls surface as planning gaps", () => {
    // income 300k vs expense 820k → month 1: 510k covered from the ladder
    // (s 100k + e 360k + i 50k), 10k uncovered; month 2: accounts dry → 520k.
    const plan = basePlan({
      cashflow_list: [
        { _id: "sal", category: "i" as const, type: "p", frequency: "m", amount: 300000, start_month: 1, end_month: 600, active: true, primary: true, desc: "salary" },
        { _id: "exp", category: "e", type: "p", frequency: "m", amount: 820000, start_month: 1, end_month: 600, active: true, primary: true, desc: "expenses" },
      ],
    });
    const snap = ComputePlanSnapshot(plan, 2, { tax_rules: FY_2025_26 });
    // the obligation stays in the statement — nothing is dropped or skipped
    expect(snap.cashflow.expense_statement[0].total_expense).toBe(820000);
    expect(snap.cashflow.expense_statement[1].total_expense).toBe(820000);
    // the ladder still drains everything it can (510k in month 1, 0 in month 2)
    const month1_dr_total = snap.account_balances_and_transactions.transaction_list
      .filter((t: any) => t.tran_desc === "To fund expenses" && t.month === 1)
      .reduce((s: number, t: any) => s + (t.amount || 0), 0);
    expect(month1_dr_total).toBe(510000);
    // and the gap is reported
    expect(snap.unfunded_expenses).toEqual([
      { month: 1, amount: 10000 },
      { month: 2, amount: 520000 },
    ]);
  });
});

describe("SIP funding through the withdrawal ladder", () => {
  const EQUITY_SIP = {
    _id: "a-eq",
    title: "Equity SIP",
    asset_class: "equity",
    category: "i" as const,
    principal: 100000,
    purchase_month: 1,
    growth_rate: 12,
    sip: { amount: 80000, frequency: "m" as const, start_month: 1 },
  };

  const SIP_ACCOUNTS = [
    { _id: "acc-e", title: "Emergency", category: "e", type: "a", init_balance: 360000, roi: 3 },
    { _id: "acc-s", title: "Saving", category: "s", type: "a", init_balance: 0, roi: 5 },
    { _id: "acc-i", title: "Investment", category: "i", type: "a", init_balance: 0, roi: 12 },
  ];

  const FIXED_FDP = [{ _id: "f1", start_month: 1, end_month: 600, s: 20, e: 10, i: 70 }];

  it("funds the SIP from its funding account first, then the ladder", () => {
    // net income = 1L → fixed 70/20/10 → 70k to investment, 20k to savings
    const plan = basePlan({
      account_list: SIP_ACCOUNTS,
      fund_distribution_percentage: FIXED_FDP,
      cashflow_list: [
        { _id: "sal", category: "i" as const, type: "p", frequency: "m", amount: 100000, start_month: 1, end_month: 600, active: true, primary: true, desc: "salary" },
      ],
      asset_list: [EQUITY_SIP],
    });
    const snap = ComputePlanSnapshot(plan, 4, { tax_rules: FY_2025_26 });
    const sip_txns = snap.account_balances_and_transactions.transaction_list.filter(
      (t: any) => t.tran_desc.startsWith("SIP -") && t.month === 1
    );
    // 80k instalment: 70k from the investment bucket, 10k top-up from savings
    expect(sip_txns).toEqual([
      expect.objectContaining({ account_id: "acc-i", amount: 70000 }),
      expect.objectContaining({ account_id: "acc-s", amount: 10000 }),
    ]);
    expect(sip_txns[0].month).toBe(1);
    expect(snap.skipped_sips).toBeUndefined();
    const month1 = snap.asset_month_map![1][0];
    expect(month1.sip_added).toBe(80000);
  });

  it("max-out ladder → skips the instalment entirely, no negative balances", () => {
    // 100k SIP vs 70k+20k availability in month 1 → skipped (emergency stays protected)
    const plan = basePlan({
      account_list: SIP_ACCOUNTS,
      fund_distribution_percentage: FIXED_FDP,
      cashflow_list: [
        { _id: "sal", category: "i" as const, type: "p", frequency: "m", amount: 100000, start_month: 1, end_month: 600, active: true, primary: true, desc: "salary" },
      ],
      asset_list: [{ ...EQUITY_SIP, sip: { amount: 100000, frequency: "m" as const, start_month: 1 } }],
    });
    const snap = ComputePlanSnapshot(plan, 4, { tax_rules: FY_2025_26 });
    expect(snap.skipped_sips).toHaveLength(1);
    expect(snap.skipped_sips![0]).toMatchObject({ month: 1, asset_id: "a-eq", amount: 100000 });
    // the miss is visible in the month's breakdown as a ₹0 marker line
    const skip_marker = snap.account_balances_and_transactions.transaction_list.filter(
      (t: any) => t.tran_desc === "SIP skipped - Equity SIP" && t.month === 1
    );
    expect(skip_marker).toHaveLength(1);
    expect(skip_marker[0].amount).toBe(0);
    const month1 = snap.asset_month_map![1][0];
    expect(month1.sip_added).toBe(0);
    expect(month1.sip_skipped).toBe(true);
    // month 2 has enough accumulated (140k ≥ 100k) → funded, no skip
    const month2 = snap.asset_month_map![2][0];
    expect(month2.sip_added).toBe(100000);
    expect(month2.sip_skipped).toBeUndefined();
    // no partial debit in month 1 — the funding account never goes negative
    const bal = snap.account_balances_and_transactions.account_balances.filter(
      (b: any) => b.account_id === "acc-i" && b.month === 1
    );
    expect(bal[0].balance).toBe(70000);
    // the skipped month is not invested in the asset value
    expect(snap.asset_month_map![1][0].value).toBeCloseTo(101000, 0); // principal + 12%/12 growth
  });

  it("emergency stays protected for SIP top-ups unless explicitly allowed", () => {
    const plan = basePlan({
      account_list: SIP_ACCOUNTS,
      fund_distribution_percentage: FIXED_FDP,
      cashflow_list: [
        { _id: "sal", category: "i" as const, type: "p", frequency: "m", amount: 100000, start_month: 1, end_month: 600, active: true, primary: true, desc: "salary" },
      ],
      asset_list: [{ ...EQUITY_SIP, sip: { amount: 100000, frequency: "m" as const, start_month: 1 } }],
      withdrawal_settings: { protect_emergency_for_sip: false },
    });
    const snap = ComputePlanSnapshot(plan, 2, { tax_rules: FY_2025_26 });
    // emergency now joins: 70k + 20k + 10k = 100k → fully funded, no skip
    expect(snap.skipped_sips).toBeUndefined();
    const sip_txns = snap.account_balances_and_transactions.transaction_list.filter(
      (t: any) => t.tran_desc.startsWith("SIP -") && t.month === 1
    );
    expect(sip_txns).toEqual([
      expect.objectContaining({ account_id: "acc-i", amount: 70000 }),
      expect.objectContaining({ account_id: "acc-s", amount: 20000 }),
      expect.objectContaining({ account_id: "acc-e", amount: 10000 }),
    ]);
  });

  it("settles same-month asset CREDITS before the SIP debit", () => {
    // Big payout FD (1M @ 30% quarterly) → ₹75,000 gross − 10% TDS = ₹67,500
    // credit into the investment bucket at month 4. The bucketing credit alone
    // would leave 2,80,000 < 3,45,000 (skip); with the FD interest settled
    // FIRST the balance reaches 3,47,500 ≥ 3,45,000 → the SIP is funded.
    const plan = basePlan({
      account_list: SIP_ACCOUNTS,
      fund_distribution_percentage: FIXED_FDP,
      cashflow_list: [
        { _id: "sal", category: "i" as const, type: "p", frequency: "m", amount: 100000, start_month: 1, end_month: 600, active: true, primary: true, desc: "salary" },
      ],
      asset_list: [
        { _id: "a-fd", title: "Big FD", asset_class: "fd", category: "i", principal: 1000000, purchase_month: 1, growth_rate: 0, yield_rate: 30, income_frequency: "q", income_mode: "credit" },
        { ...EQUITY_SIP, sip: { amount: 345000, frequency: "m" as const, start_month: 4 } },
      ],
    });
    const snap = ComputePlanSnapshot(plan, 4, { tax_rules: FY_2025_26 });
    expect(snap.skipped_sips).toBeUndefined();
    const month4 = snap.account_balances_and_transactions.transaction_list.filter(
      (t: any) => t.month === 4
    );
    const credit_idx = month4.findIndex((t: any) => t.tran_desc === "FD Interest - Big FD" && t.tran_type === "cr");
    const debit_idx = month4.findIndex((t: any) => t.tran_desc === "SIP - Equity SIP" && t.tran_type === "dr");
    expect(credit_idx).toBeGreaterThanOrEqual(0);
    expect(debit_idx).toBeGreaterThan(credit_idx);
    expect(month4[debit_idx].account_id).toBe("acc-i");
    expect(month4[debit_idx].amount).toBe(345000);
    const sip_row = snap.asset_month_map![4].find((r: any) => r.asset_id === "a-eq");
    expect(sip_row.sip_added).toBe(345000);
  });

  it("expense funding sees the SIP-adjusted pools (no negative balances)", () => {
    // 180k/mo SIP vs a fixed 70/20/10 split of 200k income → the SIP draws
    // 140k from investment + 40k from savings EVERY month. After 2 months the
    // TRUE savings pool is 180k − 80k (two 40k SIP top-ups) = 100k — but the
    // raw bucket shows 180k. A 350k one-time expense in month 3 (−150k
    // shortfall) must take 100k from savings + 50k from emergency; the raw
    // (asset-blind) pool would have taken all 150k from savings and finished
    // at −50k once the SIP debits settled.
    const plan = basePlan({
      account_list: [
        { _id: "acc-e", title: "Emergency", category: "e", type: "a", init_balance: 200000, roi: 3 },
        { _id: "acc-s", title: "Saving", category: "s", type: "a", init_balance: 100000, roi: 5 },
        { _id: "acc-i", title: "Investment", category: "i", type: "a", init_balance: 0, roi: 12 },
      ],
      fund_distribution_percentage: [{ _id: "f1", start_month: 1, end_month: 600, s: 20, e: 10, i: 70 }],
      cashflow_list: [
        { _id: "sal", category: "i" as const, type: "p", frequency: "m", amount: 200000, start_month: 1, end_month: 600, active: true, primary: true, desc: "salary" },
        { _id: "big", category: "e", type: "o", frequency: null, amount: 350000, start_month: 3, end_month: 3, active: true, primary: false, desc: "big expense" },
      ],
      asset_list: [
        { _id: "a-eq", title: "Equity SIP", asset_class: "equity", category: "i" as const, principal: 0, purchase_month: 1, growth_rate: 12, sip: { amount: 180000, frequency: "m" as const, start_month: 1 } },
      ],
    });
    const snap = ComputePlanSnapshot(plan, 4, { tax_rules: FY_2025_26 });
    const drs = snap.account_balances_and_transactions.transaction_list.filter(
      (t: any) => t.tran_desc === "To fund expenses" && t.month === 3 && t.amount > 0
    );
    expect(drs).toEqual([
      expect.objectContaining({ account_id: "acc-s", amount: 100000 }),
      expect.objectContaining({ account_id: "acc-e", amount: 50000 }),
    ]);
    expect(snap.unfunded_expenses).toBeUndefined();
    const m3 = (id: string) =>
      snap.account_balances_and_transactions.account_balances.find(
        (b: any) => b.month === 3 && b.account_id === id
      )!.balance;
    expect(m3("acc-s")).toBe(0);
    expect(m3("acc-e")).toBe(190000);
    expect(m3("acc-i")).toBe(0);
  });
});

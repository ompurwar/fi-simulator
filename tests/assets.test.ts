import { describe, expect, it } from "vitest";
import { MakeAsset } from "@/server/domain/entities";
import {
  ComputeAssetSchedule,
  ComputeAssetScenarios,
  ComputeIncomeTaxExpenseSchedule,
  ProjectAssetMonths,
  type AssetLike,
} from "@/server/engine/assets";
import { BuildAssetsFromNetWorth } from "@/server/networth/importAssets";
import { ComputePlanSnapshot } from "@/server/engine/planSnapshot";
import { AY_RULE_SETS, ASSET_PRESETS } from "@/server/tax/rules-data";

const FY_2025_26 = AY_RULE_SETS.find((r) => r.assessment_year === "2025-26")!;
const PLAN_TS = new Date(2025, 3, 1).getTime(); // 1 Apr 2025

function basePlan(overrides: Record<string, any> = {}): any {
  return {
    _id: "plan1",
    user_id: "u1",
    timestamp: PLAN_TS,
    cashflow_list: [
      { _id: "sal", category: "i" as const, type: "p", frequency: "m", amount: 150000, start_month: 1, end_month: 600, active: true, primary: true, desc: "salary" },
      { _id: "exp", category: "e", type: "p", frequency: "m", amount: 60000, start_month: 1, end_month: 600, active: true, primary: true, desc: "expenses" },
    ],
    cashflow_change_list: [],
    account_list: [
      { _id: "acc-e", title: "Emergency", category: "e", type: "a", init_balance: 360000, roi: 3 },
      { _id: "acc-s", title: "Saving", category: "s", type: "a", init_balance: 0, roi: 5 },
      { _id: "acc-i", title: "Investment", category: "i" as const, type: "a", init_balance: 0, roi: 12 },
    ],
    loan_accounts: [],
    fund_distribution_percentage: [],
    asset_list: [],
    ...overrides,
  };
}

const FD = {
  _id: "a-fd",
  title: "HDFC FD",
  asset_class: "fd",
  category: "i" as const,
  principal: 100000,
  purchase_month: 1,
  growth_rate: 0,
  yield_rate: 6.75,
  income_frequency: "q",
  income_mode: "reinvest",
  compounding: "quarterly",
  maturity_month: 12,
} as const;

describe("MakeAsset", () => {
  it("accepts a valid asset and rejects bad classes/months", () => {
    const asset = MakeAsset({ ...FD, funding_account_id: "acc-i" });
    expect(asset._id).toBe("a-fd");
    expect(asset.asset_class).toBe("fd");
    expect(() => MakeAsset({ ...FD, asset_class: "bitcoin" })).toThrow();
    expect(() => MakeAsset({ ...FD, maturity_month: 0 })).toThrow();
    expect(() => MakeAsset({ ...FD, rent: { monthly_rent: 1000, expense_ratio: 150 } })).toThrow();
    expect(() => MakeAsset({ ...FD, sip: { amount: 5000, frequency: "x", start_month: 2 } })).toThrow();
  });
});

describe("ProjectAssetMonths", () => {
  it("FD: quarterly compounding + maturity credit at month 12, no TDS below threshold", () => {
    const rows = ProjectAssetMonths(FD, 1, 12, FY_2025_26, PLAN_TS);
    expect(rows).toHaveLength(12);
    // quarterly interest = value * 6.75% * 0.25, credited after each full quarter (m4/m7/m10)
    expect(rows[3].income_gross).toBeCloseTo(1687.5, 1);
    expect(rows[6].income_gross).toBeCloseTo(1715.98, 1);
    expect(rows[11].event).toBe("matured");
    expect(rows[11].closing_value).toBeCloseTo(105148.4, 0);
    expect(rows[11].tds).toBe(0); // FY interest ~5.1k < â‚¹40k
  });

  it("FD TDS: 10% once the FY interest crosses â‚¹40k", () => {
    const big_fd = { ...FD, principal: 1000000, yield_rate: 30, maturity_month: 12 };
    const rows = ProjectAssetMonths(big_fd, 1, 12, FY_2025_26, PLAN_TS);
    // first quarter (m4) interest = 1M * 30% * 0.25 = 75,000 > 40k threshold â†’ TDS 10%
    expect(rows[3].income_gross).toBe(75000);
    expect(rows[3].tds).toBe(7500);
    expect(rows[3].income_net).toBe(67500);
  });

  it("PPF: yearly compounding, no TDS, still projecting at 15 years", () => {
    const ppf: AssetLike = { _id: "a-ppf", title: "PPF", asset_class: "ppf", category: "i" as const, principal: 50000, purchase_month: 1, growth_rate: 0, yield_rate: 7.1, income_frequency: "y", income_mode: "reinvest", compounding: "yearly" };
    const rows = ProjectAssetMonths(ppf, 1, 180, FY_2025_26, PLAN_TS);
    expect(rows[12].income_gross).toBeCloseTo(3550, 1); // 50k Ã— 7.1%
    expect(rows[12].tds).toBe(0);
    expect(rows[179].closing_value).toBeGreaterThan(50000);
  });

  it("gold: geometric monthly growth compounds to ~8.5%/yr", () => {
    const gold: AssetLike = { _id: "a-gold", title: "Gold", asset_class: "gold", category: "i" as const, principal: 200000, purchase_month: 1, growth_rate: 8.5 };
    const rows = ProjectAssetMonths(gold, 1, 12, FY_2025_26, PLAN_TS);
    expect(rows[0].growth_gain).toBeCloseTo(1416.67, 0);
    expect(rows[11].closing_value).toBeCloseTo(200000 * Math.pow(1 + 0.085 / 12, 12), 0);
  });

  it("real estate: rent with 5% yearly step-up and 20% expense ratio", () => {
    const re: AssetLike = { _id: "a-re", title: "Flat", asset_class: "real_estate", category: "i" as const, principal: 5000000, purchase_month: 1, growth_rate: 8, rent: { monthly_rent: 20000, step_pct: 5, expense_ratio: 20 } };
    const rows = ProjectAssetMonths(re, 1, 24, FY_2025_26, PLAN_TS);
    expect(rows[0].rent_gross).toBe(20000);
    expect(rows[0].income_net).toBe(16000); // 80% after expenses
    expect(rows[12].rent_gross).toBeCloseTo(21000, 0); // 5% step-up at year 2
    expect(rows[12].income_net).toBeCloseTo(16800, 0);
  });

  it("SIP with yearly 10% step-up", () => {
    const equity: AssetLike = {
      _id: "a-eq", title: "Equity", asset_class: "equity", category: "i" as const, principal: 100000, purchase_month: 1, growth_rate: 12,
      sip: { amount: 10000, frequency: "m", start_month: 6, step_pct: 10 },
    };
    const rows = ProjectAssetMonths(equity, 1, 30, FY_2025_26, PLAN_TS);
    expect(rows[5].sip_added).toBe(10000);
    expect(rows[17].sip_added).toBeCloseTo(11000, 0); // +10% after 12 months
    expect(rows[29].sip_added).toBeCloseTo(12100, 0);
  });
});

describe("ComputeAssetSchedule", () => {
  it("emits SIP/income/TDS/maturity transactions against the funding bucket and builds summaries", () => {
    const plan = basePlan({
      asset_list: [
        { ...FD, income_mode: "credit" }, // payout FD: interest + principal flow to the account
        {
          _id: "a-eq", title: "Nifty Index", asset_class: "equity", category: "i" as const, principal: 500000,
          purchase_month: 1, growth_rate: 12,
        },
      ],
    });
    const result = ComputeAssetSchedule(plan, 12, FY_2025_26);
    const descs = result.txns.map((t) => t.tran_desc);
    // FD interest credits into the investment bucket (income_mode credit)
    expect(descs).toContain("FD Interest - HDFC FD");
    expect(descs).toContain("Maturity - HDFC FD");
    // payout FD keeps its principal value; equity grows
    expect(result.asset_summary.by_class.fd.value).toBe(100000);
    expect(result.asset_summary.by_class.equity.value).toBeGreaterThan(500000);
    expect(result.asset_summary.total_value).toBeGreaterThan(600000);
    // all txns land on the investment bucket account
    for (const t of result.txns) expect(t.account_id).toBe("acc-i");
  });

  it("derived bucket_growth: value-weighted blended growth per bucket", () => {
    const plan = basePlan({
      asset_list: [
        { ...FD, _id: "fd1", principal: 100000, maturity_month: undefined }, // yield-only ~6.75%
        { _id: "g1", title: "Gold", asset_class: "gold", category: "i" as const, principal: 200000, purchase_month: 1, growth_rate: 8.5 },
      ],
    });
    const result = ComputeAssetSchedule(plan, 12, FY_2025_26);
    const growth = result.bucket_growth.i.growth_rate;
    // weighted: (value_fd*6.75 + value_gold*8.5) / (value_fd + value_gold) â€” between 6.75 and 8.5
    expect(growth).toBeGreaterThan(6.75);
    expect(growth).toBeLessThan(8.5);
    expect(result.bucket_growth.e.value).toBe(0);
  });

  it("realizes LTCG on a market-class asset sale and emits the tax txn", () => {
    const plan = basePlan({
      asset_list: [
        {
          _id: "g1", title: "Gold", asset_class: "gold", category: "i" as const, principal: 200000,
          purchase_month: 1, growth_rate: 8.5, sale_month: 37, // > 24 months â†’ LTCG
        },
      ],
    });
    const result = ComputeAssetSchedule(plan, 40, FY_2025_26);
    const sale = result.txns.find((t) => t.tran_desc === "Sale - Gold");
    expect(sale).toBeTruthy();
    expect(sale!.month).toBe(37);
    const ltcg = result.txns.find((t) => t.tran_desc.startsWith("LTCG tax"));
    expect(ltcg).toBeTruthy();
    expect(ltcg!.amount).toBeGreaterThan(0);
    // tax is booked as a debit from the investment bucket
    expect(ltcg!.tran_type).toBe("dr");
    // realized gain recorded against the sale's assessment year (m37 = Apr 2028)
    expect(result.tax_summary["2028-29"].ltcg_realized).toBeGreaterThan(0);
  });
});

describe("ComputeIncomeTaxExpenseSchedule", () => {
  it("emits monthly Income Tax expenses from the annual slab tax (new regime)", () => {
    const plan = basePlan({ tax_settings: { income_tax_enabled: true, regime: "new", age_group: "below60" } });
    const income_statement = [
      ...Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total_income: 150000 })),
    ];
    const rows = ComputeIncomeTaxExpenseSchedule(plan, 12, FY_2025_26, plan.tax_settings, income_statement, {});
    // 18L salary â†’ taxable 17.25L â†’ â‚¹150,800/yr â†’ â‚¹12,566.67/mo
    expect(rows).toHaveLength(12);
    expect(rows[0].desc).toContain("Income Tax");
    expect(rows[0].amount).toBeCloseTo(150800 / 12, 0);
    expect(rows[0].category).toBe("e");
  });

  it("returns nothing when income tax is disabled", () => {
    const plan = basePlan();
    const rows = ComputeIncomeTaxExpenseSchedule(plan, 12, FY_2025_26, plan.tax_settings, [], {});
    expect(rows).toHaveLength(0);
  });
});

describe("ComputeAssetScenarios", () => {
  it("projects conservative/expected/aggressive bands from volatility", () => {
    const plan = basePlan({
      asset_list: [
        { _id: "g1", title: "Gold", asset_class: "gold", category: "i", principal: 200000, purchase_month: 1, growth_rate: 8.5, volatility: 14 },
      ],
    });
    const s = ComputeAssetScenarios(plan, 120, FY_2025_26);
    // 10 years of gold at 8.5% (expected) vs 8.5−14 = −5.5% (conservative) vs 22.5% (aggressive)
    expect(s.expected.total_value).toBeGreaterThan(s.conservative.total_value);
    expect(s.aggressive.total_value).toBeGreaterThan(s.expected.total_value);
    expect(s.month_map.expected[120]).toBe(Math.round(s.expected.total_value));
  });

  it("assets without volatility keep a single path", () => {
    const plan = basePlan({
      asset_list: [{ ...FD, maturity_month: undefined }],
    });
    const s = ComputeAssetScenarios(plan, 12, FY_2025_26);
    expect(s.conservative.total_value).toBeCloseTo(s.expected.total_value, 0);
    expect(s.aggressive.total_value).toBeCloseTo(s.expected.total_value, 0);
  });
});

describe("BuildAssetsFromNetWorth", () => {
  it("maps net-worth classes to plan assets with preset defaults", () => {
    const assets = BuildAssetsFromNetWorth(
      [
        { asset_class: "Indian Stocks", value: 948900 } as any,
        { asset_class: "Fixed Deposits", value: 300000 } as any,
        { asset_class: "Gold", value: 185000 } as any,
        { asset_class: "Loan", value: -650000 } as any, // skipped (liability)
      ],
      ASSET_PRESETS
    );
    const byClass = Object.fromEntries(assets.map((a) => [a.asset_class, a]));
    expect(byClass.equity).toBeTruthy();
    expect(byClass.equity.principal).toBe(948900);
    expect(byClass.fd.principal).toBe(300000);
    expect(byClass.gold.principal).toBe(185000);
    expect(byClass.gold.growth_rate).toBe(ASSET_PRESETS.asset_classes.gold.growth_rate);
    // liabilities are never mapped
    expect(assets.some((a) => a.asset_class === "vda" || a.asset_class === "real_estate")).toBe(false);
  });
});

describe("ComputePlanSnapshot integration", () => {
  it("byte-compat: plans without assets/tax emit NO asset fields", () => {
    const plain = basePlan();
    const snapshot = ComputePlanSnapshot(plain, 12);
    expect(snapshot.asset_month_map).toBeUndefined();
    expect(snapshot.asset_summary).toBeUndefined();
    expect(snapshot.tax_summary).toBeUndefined();
    expect(snapshot.bucket_growth).toBeUndefined();
    expect(snapshot.tax_expense_cashflow).toBeUndefined();
  });

  it("asset income/maturity credits flow into account balances", () => {
    const plan = basePlan({
      asset_list: [
        { ...FD, income_mode: "credit", maturity_month: 12 },
      ],
    });
    const snapshot = ComputePlanSnapshot(plan, 12, { tax_rules: FY_2025_26 });
    const txns = snapshot.account_balances_and_transactions.transaction_list;
    expect(txns.some((t: any) => t.tran_desc === "FD Interest - HDFC FD")).toBe(true);
    expect(txns.some((t: any) => t.tran_desc === "Maturity - HDFC FD")).toBe(true);
    // investment bucket balance includes the maturity credit at month 12
    const inv = snapshot.account_balances_and_transactions.account_balances.filter(
      (b: any) => b.account_id === "acc-i" && b.month === 12
    );
    expect(inv[0].balance).toBeGreaterThan(105000);
    // credit-mode FD holds its principal value (interest already paid out)
    expect(snapshot.asset_summary!.total_value).toBe(100000);
  });

  it("income tax expense rows reduce net cashflow when enabled", () => {
    const base = basePlan();
    const plan = basePlan({
      cashflow_list: base.cashflow_list.map((c: any) =>
        c.category === "i" ? { ...c, amount: 300000 } : c
      ),
      tax_settings: { income_tax_enabled: true, regime: "new", age_group: "below60" },
    });
    const with_tax = ComputePlanSnapshot(plan, 12, { tax_rules: FY_2025_26 });
    const plain = basePlan(); // no tax_settings
    const without = ComputePlanSnapshot(plain, 12, { tax_rules: FY_2025_26 });
    // full FY (Apr 2025 start): 12 × 3L = 36L income → taxable 35.25L → slab 6,37,500
    // + 4% cess = ₹6,63,000/yr → ₹55,250/mo
    const tax_expense =
      (with_tax.cashflow.expense_statement[0] as any).total_expense -
      (without.cashflow.expense_statement[0] as any).total_expense;
    expect(tax_expense).toBeCloseTo(663000 / 12, 0);
    expect(with_tax.tax_expense_cashflow!.length).toBe(12);
  });
});

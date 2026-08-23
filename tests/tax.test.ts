import { describe, expect, it } from "vitest";
import { AY_RULE_SETS, ASSET_PRESETS } from "@/server/tax/rules-data";
import {
  ComputeCapitalGains,
  ComputeIncomeTax,
  ComputeSalaryNegotiation,
  MonthToAssessmentYear,
} from "@/server/tax/engine";

const FY_2025_26 = AY_RULE_SETS.find((r) => r.assessment_year === "2025-26")!;

describe("ComputeIncomeTax — ClearTax worked examples (FY 2025-26)", () => {
  it("new regime: ₹15L salary → ₹97,500 total tax (slabs 93,750 + 4% cess)", () => {
    const r = ComputeIncomeTax({ rules: FY_2025_26, regime: "new", gross_salary: 1500000 });
    expect(r.taxable_income).toBe(1425000);
    expect(r.tax_before_rebate).toBe(93750);
    expect(r.rebate_87a).toBe(0);
    expect(r.cess).toBe(3750);
    expect(r.total_tax).toBe(97500);
  });

  it("new regime: ₹12L taxable income is fully tax-free (87A rebate ₹60k)", () => {
    const r = ComputeIncomeTax({ rules: FY_2025_26, regime: "new", gross_salary: 1275000 });
    expect(r.taxable_income).toBe(1200000);
    expect(r.tax_before_rebate).toBe(60000);
    expect(r.rebate_87a).toBe(60000);
    expect(r.total_tax).toBe(0);
  });

  it("new regime: marginal relief on ₹12.1L taxable → ₹10,000 tax + ₹400 cess", () => {
    // 12.85L salary - 75k std = 12.1L taxable (ClearTax illustration)
    const r = ComputeIncomeTax({ rules: FY_2025_26, regime: "new", gross_salary: 1285000 });
    expect(r.taxable_income).toBe(1210000);
    expect(r.tax_before_rebate).toBe(61500);
    expect(r.rebate_87a).toBe(51500);
    expect(r.total_tax).toBe(10400); // 10,000 + 4% cess
  });

  it("old regime: ₹25L salary with HRA 4L + 80C 1.5L + 80D 25k → ₹3,90,000", () => {
    const r = ComputeIncomeTax({
      rules: FY_2025_26,
      regime: "old",
      gross_salary: 2500000,
      salary_structure: { basic_annual: 1250000, hra_annual: 400000, rent_annual: 600000, metro: true },
      deductions: { c80: 150000, d80: 25000 },
    });
    expect(r.hra_exemption).toBe(400000);
    expect(r.deductions_allowed).toBe(175000);
    expect(r.taxable_income).toBe(1875000);
    expect(r.total_tax).toBe(390000);
  });

  it("new regime: same ₹25L salary ignores 80C/80D/HRA → ₹3,19,800", () => {
    const r = ComputeIncomeTax({
      rules: FY_2025_26,
      regime: "new",
      gross_salary: 2500000,
      salary_structure: { basic_annual: 1250000, hra_annual: 400000, rent_annual: 600000, metro: true },
      deductions: { c80: 150000, d80: 25000 },
    });
    expect(r.hra_exemption).toBe(0);
    expect(r.deductions_allowed).toBe(0);
    expect(r.taxable_income).toBe(2425000);
    expect(r.total_tax).toBe(319800);
  });

  it("old regime: ₹5L income is fully rebated (87A ₹12,500)", () => {
    const r = ComputeIncomeTax({ rules: FY_2025_26, regime: "old", gross_salary: 500000 });
    expect(r.taxable_income).toBe(450000);
    expect(r.rebate_87a).toBe(10000);
    expect(r.total_tax).toBe(0);
  });

  it("senior citizen slabs (old regime): ₹6L salary, age 65", () => {
    const r = ComputeIncomeTax({ rules: FY_2025_26, regime: "old", age_group: "senior", gross_salary: 600000 });
    // 3L exempt, 3-5L @5% = 10k, 5-5.5L @20% = 10k → 20k before rebate; 5.5L > 5L → no rebate
    expect(r.tax_before_rebate).toBe(20000);
    expect(r.total_tax).toBe(20800);
  });

  it("surcharge: ₹60L income new regime → 10% surcharge + 4% cess", () => {
    const r = ComputeIncomeTax({ rules: FY_2025_26, regime: "new", gross_salary: 6000000 });
    expect(r.surcharge_rate).toBe(10);
    expect(r.total_tax).toBeGreaterThan(0);
  });

  it("special-rate LTCG does not receive the 87A rebate", () => {
    const r = ComputeIncomeTax({
      rules: FY_2025_26,
      regime: "new",
      gross_salary: 1275000, // taxable 12L → slab tax 60k → full rebate
      capital_gains: { ltcg_112a: 100000 }, // 12,500 special tax, no rebate
    });
    expect(r.rebate_87a).toBe(60000);
    expect(r.tax_on_special_income).toBe(12500);
    expect(r.total_tax).toBe(13000); // 12,500 + 4% cess
  });
});

describe("ComputeCapitalGains (FY 2025-26)", () => {
  const profiles = FY_2025_26.capital_gains.profiles;

  it("Indian listed equity LTCG: ₹2L gain → ₹1.25L exempt, 12.5% on the rest", () => {
    const r = ComputeCapitalGains({
      rules: FY_2025_26,
      profile: profiles.equity_listed_in,
      purchase_value: 500000,
      sale_proceeds: 700000,
      holding_months: 14,
    });
    expect(r.is_long_term).toBe(true);
    expect(r.exemption_used).toBe(125000);
    expect(r.taxable_gain).toBe(75000);
    expect(r.tax).toBe(9375);
  });

  it("Indian listed equity STCG: 20% flat, no exemption", () => {
    const r = ComputeCapitalGains({
      rules: FY_2025_26,
      profile: profiles.equity_listed_in,
      purchase_value: 500000,
      sale_proceeds: 600000,
      holding_months: 8,
    });
    expect(r.is_long_term).toBe(false);
    expect(r.tax).toBe(20000);
  });

  it("foreign listed shares: 24-mo LTCG at 12.5% with NO 112A exemption", () => {
    const r = ComputeCapitalGains({
      rules: FY_2025_26,
      profile: profiles.equity_foreign,
      purchase_value: 500000,
      sale_proceeds: 700000,
      holding_months: 30,
    });
    expect(r.is_long_term).toBe(true);
    expect(r.exemption_used).toBe(0);
    expect(r.taxable_gain).toBe(200000);
    expect(r.tax).toBe(25000);
  });

  it("foreign listed shares held ≤24 months: STCG taxed at slab", () => {
    const r = ComputeCapitalGains({
      rules: FY_2025_26,
      profile: profiles.equity_foreign,
      purchase_value: 500000,
      sale_proceeds: 600000,
      holding_months: 18,
    });
    expect(r.is_long_term).toBe(false);
    expect(r.treat_as_slab).toBe(true);
  });

  it("real estate bought 2005 (CII 117), sold 2025 (CII 376): indexation wins", () => {
    const r = ComputeCapitalGains({
      rules: FY_2025_26,
      profile: profiles.real_estate,
      purchase_value: 2000000,
      sale_proceeds: 6500000,
      holding_months: 240,
      purchase_fy: "2005-06",
      sale_fy: "2025-26",
      purchase_date: "2005-06-15",
    });
    expect(r.is_long_term).toBe(true);
    expect(r.indexation_used).toBe(true);
    // indexed cost = 20L * 376/117 ≈ 64,27,350 → gain ≈ 72,650 × 20%
    expect(r.indexed_gain).toBeCloseTo(72650, 0);
    expect(r.tax).toBeCloseTo(14530, 0);
  });

  it("real estate bought after the indexation cutoff: only the flat 12.5% path", () => {
    const r = ComputeCapitalGains({
      rules: FY_2025_26,
      profile: profiles.real_estate,
      purchase_value: 2000000,
      sale_proceeds: 2500000,
      holding_months: 40,
      purchase_fy: "2025-26",
      sale_fy: "2026-27",
      purchase_date: "2025-01-10", // after 2024-07-23
    });
    expect(r.indexation_used).toBe(false);
    expect(r.tax).toBeCloseTo(62500, 0); // 5L × 12.5%
  });

  it("crypto/VDA: flat 30%", () => {
    const r = ComputeCapitalGains({
      rules: FY_2025_26,
      profile: profiles.vda,
      purchase_value: 100000,
      sale_proceeds: 200000,
      holding_months: 6,
    });
    expect(r.tax).toBe(30000);
  });
});

describe("ComputeSalaryNegotiation (FY 2025-26, new regime)", () => {
  it("current ₹15L → offers 16L/18L with marginal tax rates on the hike", () => {
    const r = ComputeSalaryNegotiation({
      rules: FY_2025_26,
      regime: "new",
      current_gross: 1500000,
      scenarios: [
        { label: "10%", new_gross: 1650000 },
        { label: "20%", new_gross: 1800000 },
      ],
    });
    expect(r.current.take_home).toBe(1402500); // 15L − 97,500
    const ten = r.scenarios[0];
    expect(ten.take_home).toBeGreaterThan(r.current.take_home);
    expect(ten.marginal_tax_rate_on_hike).toBeGreaterThan(15);
    expect(ten.marginal_tax_rate_on_hike).toBeLessThan(21);
    const twenty = r.scenarios[1];
    expect(twenty.take_home_delta).toBeGreaterThan(ten.take_home_delta);
  });

  it("old-regime negotiation honors 80C deductions", () => {
    const r = ComputeSalaryNegotiation({
      rules: FY_2025_26,
      regime: "old",
      current_gross: 1200000,
      scenarios: [{ label: "offer", new_gross: 1500000 }],
      deductions: { c80: 150000 },
    });
    expect(r.scenarios[0].marginal_tax_rate_on_hike).toBeGreaterThan(0);
  });
});

describe("MonthToAssessmentYear", () => {
  const april2025 = new Date(2025, 3, 1).getTime(); // 1 Apr 2025
  it("maps Apr 2025 → Mar 2026 to FY 2025-26", () => {
    expect(MonthToAssessmentYear(april2025, 1)).toBe("2025-26");
    expect(MonthToAssessmentYear(april2025, 12)).toBe("2025-26");
  });
  it("rolls over at April", () => {
    expect(MonthToAssessmentYear(april2025, 13)).toBe("2026-27");
  });
  it("handles mid-year plan starts", () => {
    const dec2025 = new Date(2025, 11, 1).getTime();
    expect(MonthToAssessmentYear(dec2025, 1)).toBe("2025-26");
    expect(MonthToAssessmentYear(dec2025, 5)).toBe("2026-27"); // April 2026
  });
});

describe("bundled data integrity", () => {
  it("covers AY 2023-24 through 2026-27 and presets are present", () => {
    expect(AY_RULE_SETS.map((r) => r.assessment_year)).toEqual([
      "2023-24",
      "2024-25",
      "2025-26",
      "2026-27",
    ]);
    expect(Object.keys(ASSET_PRESETS.asset_classes).length).toBeGreaterThanOrEqual(10);
  });
});

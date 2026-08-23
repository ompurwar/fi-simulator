/** Pure tax computations — deterministic, no I/O. Rules are passed in (DB-backed at runtime). */

import type { CapitalGainsProfile, TaxRuleSet } from "./schema";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Map a plan-relative month to the Indian financial year label ("2025-26"), Apr–Mar. */
export function MonthToAssessmentYear(plan_timestamp: number, month: number): string {
  const start = new Date(plan_timestamp);
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; // April = month index 3
  return `${fyStart}-${String(fyStart + 1).slice(2)}`;
}

export interface IncomeTaxInput {
  rules: TaxRuleSet;
  regime: "new" | "old";
  age_group?: "below60" | "senior" | "super_senior";
  /** gross annual salary (employment) income — attracts std deduction */
  gross_salary?: number;
  /** for HRA exemption (old regime only) */
  salary_structure?: { basic_annual: number; hra_annual: number; rent_annual: number; metro: boolean };
  /** capped per-rule deductions: { c80, d80, d80_senior_parents, tta, ttb, b24, nps_1b } */
  deductions?: Record<string, number>;
  /** income taxed at slab beyond salary (interest over exemptions, rent, coupons...) */
  other_income?: number;
  /** pre-computed special-rate capital gains (taxed at special rates, no rebate) */
  capital_gains?: {
    stcg_111a?: number;
    ltcg_112a?: number;
    ltcg_other?: number;
    vda?: number;
  };
}

export interface IncomeTaxResult {
  regime: "new" | "old";
  assessment_year: string;
  gross_income: number;
  hra_exemption: number;
  deductions_allowed: number;
  salary_after_std_and_hra: number;
  other_income: number;
  taxable_income: number;
  slab_breakup: { from: number; to: number | null; rate: number; amount: number; tax: number }[];
  tax_before_rebate: number;
  rebate_87a: number;
  tax_on_special_income: number;
  tax_before_surcharge: number;
  surcharge_rate: number;
  surcharge: number;
  cess: number;
  total_tax: number;
  effective_rate: number;
}

export function ComputeIncomeTax(input: IncomeTaxInput): IncomeTaxResult {
  const { rules, regime, age_group = "below60", gross_salary = 0, other_income = 0 } = input;
  const regime_rules = rules.income_tax.regimes[regime];

  let slabs = regime_rules.slabs;
  if (regime === "old" && age_group !== "below60" && rules.income_tax.senior?.old) {
    slabs =
      age_group === "super_senior" && rules.income_tax.senior.super_old
        ? rules.income_tax.senior.super_old.slabs
        : rules.income_tax.senior.old.slabs;
  }

  // ---- HRA exemption (old regime only; min of received / rent−10% basic / 50|40% basic) ----
  let hra_exemption = 0;
  const hra_rules = rules.deductions.hra;
  const structure = input.salary_structure;
  if (regime === "old" && structure && hra_rules) {
    const pct = structure.metro ? hra_rules.metro_pct : hra_rules.non_metro_pct;
    const rent_less_10pct = Math.max(0, structure.rent_annual - 0.1 * structure.basic_annual);
    const pct_basic = (pct / 100) * structure.basic_annual;
    hra_exemption = Math.max(0, Math.min(structure.hra_annual, rent_less_10pct, pct_basic));
  }

  // ---- Deductions (only those the regime allows) ----
  const d = input.deductions || {};
  let deductions_allowed = 0;
  if (regime_rules.allowed_deductions.includes("80C") && rules.deductions["80C"]) deductions_allowed += Math.min(d.c80 || 0, rules.deductions["80C"].max);
  if (regime_rules.allowed_deductions.includes("80D") && rules.deductions["80D"]) {
    const cap = rules.deductions["80D"];
    deductions_allowed += Math.min(d.d80 || 0, cap.self) + Math.min(d.d80_senior_parents || 0, cap.senior_parents);
  }
  if (regime_rules.allowed_deductions.includes("80TTA") && rules.deductions["80TTA"]) deductions_allowed += Math.min(d.tta || 0, rules.deductions["80TTA"].max);
  if (regime_rules.allowed_deductions.includes("80TTB") && rules.deductions["80TTB"]) deductions_allowed += Math.min(d.ttb || 0, rules.deductions["80TTB"].max);
  if (regime_rules.allowed_deductions.includes("24b") && rules.deductions["24b"]) deductions_allowed += Math.min(d.b24 || 0, rules.deductions["24b"].max);
  if (regime_rules.allowed_deductions.includes("80CCD1B") && rules.deductions["80CCD1B"]) deductions_allowed += Math.min(d.nps_1b || 0, rules.deductions["80CCD1B"].max);

  const std_deduction = gross_salary > 0 ? Math.min(regime_rules.std_deduction, gross_salary) : 0;
  const salary_after_std_and_hra = Math.max(0, gross_salary - std_deduction - hra_exemption - deductions_allowed);
  const taxable_income = salary_after_std_and_hra + Math.max(0, other_income);

  // ---- Slab tax ----
  const slab_breakup: IncomeTaxResult["slab_breakup"] = [];
  let tax_before_rebate = 0;
  for (const slab of slabs) {
    const from = slab.from;
    const to = slab.to ?? Number.POSITIVE_INFINITY;
    const amount = Math.max(0, Math.min(taxable_income, to) - from);
    const tax = amount * (slab.rate / 100);
    slab_breakup.push({ from, to: slab.to, rate: slab.rate, amount, tax });
    tax_before_rebate += tax;
  }

  // ---- 87A rebate + marginal relief ----
  let rebate_87a = 0;
  const r87a = regime_rules.rebate_87a;
  if (taxable_income <= r87a.income_limit) {
    rebate_87a = Math.min(tax_before_rebate, r87a.max_rebate);
  } else if (r87a.marginal_relief) {
    // tax capped at the income exceeding the tax-free limit
    rebate_87a = Math.max(0, tax_before_rebate - Math.max(0, taxable_income - r87a.income_limit));
  }
  const slab_tax_after_rebate = Math.max(0, tax_before_rebate - rebate_87a);

  // ---- Special-rate capital gains (taxed separately; no rebate) ----
  const sp = rules.income_tax.special_rates;
  const cg = input.capital_gains || {};
  let tax_on_special_income = 0;
  const special_income_list: [string, number, number][] = [
    ["stcg_111a", cg.stcg_111a || 0, sp.stcg_111a],
    ["ltcg_112a", cg.ltcg_112a || 0, sp.ltcg_112_112a],
    ["ltcg_other", cg.ltcg_other || 0, sp.unlisted_ltcg],
    ["vda", cg.vda || 0, sp.vda],
  ];
  for (const [, amount, rate] of special_income_list) tax_on_special_income += amount * (rate / 100);

  const total_income = taxable_income + special_income_list.reduce((s, [, a]) => s + a, 0);
  const tax_before_surcharge = slab_tax_after_rebate + tax_on_special_income;

  // ---- Surcharge (cap on LTCG) + cess ----
  let surcharge_rate = 0;
  for (const t of regime_rules.surcharge) {
    if (total_income > t.from) surcharge_rate = t.rate;
  }
  const has_ltcg = (cg.ltcg_112a || 0) > 0 || (cg.ltcg_other || 0) > 0;
  if (has_ltcg) surcharge_rate = Math.min(surcharge_rate, rules.income_tax.surcharge_cap_on_ltcg);
  const surcharge = tax_before_surcharge * (surcharge_rate / 100);
  const cess = (tax_before_surcharge + surcharge) * (rules.income_tax.cess / 100);
  const total_tax = round2(tax_before_surcharge + surcharge + cess);

  return {
    regime,
    assessment_year: rules.assessment_year,
    gross_income: round2(gross_salary + other_income + special_income_list.reduce((s, [, a]) => s + a, 0)),
    hra_exemption: round2(hra_exemption),
    deductions_allowed: round2(deductions_allowed),
    salary_after_std_and_hra: round2(salary_after_std_and_hra),
    other_income: round2(other_income),
    taxable_income: round2(taxable_income),
    slab_breakup,
    tax_before_rebate: round2(tax_before_rebate),
    rebate_87a: round2(rebate_87a),
    tax_on_special_income: round2(tax_on_special_income),
    tax_before_surcharge: round2(tax_before_surcharge),
    surcharge_rate,
    surcharge: round2(surcharge),
    cess: round2(cess),
    total_tax,
    effective_rate: round2((total_tax / Math.max(1, total_income)) * 100),
  };
}

export interface CapitalGainsInput {
  rules: TaxRuleSet;
  profile: CapitalGainsProfile;
  purchase_value: number;
  sale_proceeds: number;
  holding_months: number;
  /** financial years for CII (e.g. "2005-06", "2025-26") */
  purchase_fy?: string;
  sale_fy?: string;
  /** ISO date of purchase — gates the indexation alternative for property */
  purchase_date?: string;
}

export interface CapitalGainsResult {
  holding_months: number;
  is_long_term: boolean;
  gain: number;
  taxable_gain: number;
  tax: number;
  rate_used: number | "slab";
  exemption_used: number;
  indexation_used: boolean;
  indexed_gain?: number;
  treat_as_slab: boolean;
}

export function ComputeCapitalGains(input: CapitalGainsInput): CapitalGainsResult {
  const { rules, profile, purchase_value, sale_proceeds, holding_months } = input;
  const is_long_term = profile.holding_months === 0 || holding_months > profile.holding_months;
  const gain = Math.max(0, sale_proceeds - purchase_value);

  // Flat-rate classes (VDA): taxed at the flat STCG rate regardless of holding period.
  if (profile.ltcg === 0 && typeof profile.stcg === "object") {
    return {
      holding_months, is_long_term, gain, taxable_gain: gain, tax: round2(gain * (profile.stcg.flat / 100)),
      rate_used: profile.stcg.flat, exemption_used: 0, indexation_used: false, treat_as_slab: false,
    };
  }

  // Short-term
  if (!is_long_term) {
    if (typeof profile.stcg === "string") {
      return {
        holding_months, is_long_term, gain, taxable_gain: gain, tax: 0, rate_used: "slab",
        exemption_used: 0, indexation_used: false, treat_as_slab: true,
      };
    }
    return {
      holding_months, is_long_term, gain, taxable_gain: gain, tax: round2(gain * (profile.stcg.flat / 100)),
      rate_used: profile.stcg.flat, exemption_used: 0, indexation_used: false, treat_as_slab: false,
    };
  }

  // Long-term, slab-taxed (debt MF post Apr-23)
  if (profile.ltcg === "slab") {
    return {
      holding_months, is_long_term, gain, taxable_gain: gain, tax: 0, rate_used: "slab",
      exemption_used: 0, indexation_used: false, treat_as_slab: true,
    };
  }

  // 112A exemption (Indian listed equity / equity MF)
  const exemption_used = Math.min(profile.exemption_112a, gain);

  // Indexation alternative (property bought ≤ cutoff)
  let indexation_used = false;
  let indexed_gain: number | undefined;
  let base_gain = gain;
  let rate = profile.ltcg;
  if (profile.ltcg_alt?.indexation && input.purchase_fy && input.sale_fy) {
    const purchase_ci = rules.cii[input.purchase_fy];
    const sale_ci = rules.cii[input.sale_fy];
    const cutoff_ok =
      !profile.ltcg_alt.cutoff ||
      (!!input.purchase_date && input.purchase_date <= profile.ltcg_alt.cutoff);
    if (purchase_ci && sale_ci && cutoff_ok) {
      const indexed_cost = (purchase_value * sale_ci) / purchase_ci;
      indexed_gain = Math.max(0, sale_proceeds - indexed_cost);
      const flat_tax = (gain - exemption_used) * (rate / 100);
      const indexed_tax = indexed_gain * (profile.ltcg_alt.rate / 100);
      if (indexed_tax < flat_tax) {
        indexation_used = true;
        base_gain = indexed_gain;
        rate = profile.ltcg_alt.rate;
      }
    }
  }

  const taxable_gain = indexation_used ? indexed_gain! : Math.max(0, base_gain - exemption_used);
  return {
    holding_months, is_long_term, gain, taxable_gain: round2(taxable_gain), tax: round2(taxable_gain * (rate / 100)),
    rate_used: rate, exemption_used: indexation_used ? 0 : round2(exemption_used),
    indexation_used, indexed_gain: indexed_gain === undefined ? undefined : round2(indexed_gain), treat_as_slab: false,
  };
}

export interface NegotiationScenario {
  label: string;
  new_gross: number;
}

export interface SalaryNegotiationInput {
  rules: TaxRuleSet;
  regime: "new" | "old";
  age_group?: "below60" | "senior" | "super_senior";
  current_gross: number;
  scenarios: NegotiationScenario[];
  deductions?: Record<string, number>;
  other_income?: number;
  salary_structure?: { basic_annual: number; hra_annual: number; rent_annual: number; metro: boolean };
}

export interface SalaryNegotiationResult {
  assessment_year: string;
  regime: "new" | "old";
  current: { gross: number; take_home: number; tax: number; effective_rate: number };
  scenarios: {
    label: string;
    gross: number;
    take_home: number;
    tax: number;
    effective_rate: number;
    take_home_delta: number;
    marginal_tax_rate_on_hike: number;
    after_tax_hike_pct: number;
  }[];
}

export function ComputeSalaryNegotiation(input: SalaryNegotiationInput): SalaryNegotiationResult {
  const { rules, regime, age_group, current_gross, scenarios, deductions, other_income, salary_structure } = input;
  const base = { rules, regime, age_group, deductions, other_income };

  const compute = (gross: number) =>
    ComputeIncomeTax({ ...base, gross_salary: gross, salary_structure: salary_structure ? scaleStructure(salary_structure, gross / current_gross) : undefined });

  const current_tax = compute(current_gross);
  const current = {
    gross: current_gross,
    take_home: current_gross - current_tax.total_tax,
    tax: current_tax.total_tax,
    effective_rate: current_tax.effective_rate,
  };

  const out = scenarios.map((s) => {
    const tax = compute(s.new_gross);
    const take_home = s.new_gross - tax.total_tax;
    const hike_amount = s.new_gross - current_gross;
    const tax_delta = tax.total_tax - current_tax.total_tax;
    const marginal_tax_rate_on_hike = hike_amount > 0 ? round2((tax_delta / hike_amount) * 100) : 0;
    const after_tax_hike_pct = hike_amount > 0 ? round2(((take_home - current.take_home) / current.take_home) * 100) : 0;
    return {
      label: s.label,
      gross: s.new_gross,
      take_home: round2(take_home),
      tax: tax.total_tax,
      effective_rate: tax.effective_rate,
      take_home_delta: round2(take_home - current.take_home),
      marginal_tax_rate_on_hike,
      after_tax_hike_pct,
    };
  });

  return { assessment_year: rules.assessment_year, regime, current, scenarios: out };
}

function scaleStructure(
  structure: { basic_annual: number; hra_annual: number; rent_annual: number; metro: boolean },
  factor: number
) {
  return {
    basic_annual: round2(structure.basic_annual * factor),
    hra_annual: round2(structure.hra_annual * factor),
    rent_annual: round2(structure.rent_annual * factor),
    metro: structure.metro,
  };
}

/** Bundled tax rule sets (India) + asset-class presets.
 *  These are the SEED source and the code fallback for Tax_Rule_Store — the DB
 *  is the source of truth at runtime; edits via seed script / upsert_tax_rules.
 *  Sources: ClearTax FY 2025-26 & FY 2026-27 pages (fetched 2026-08), Income-tax Act. */

import type { AssetPresets, CapitalGainsProfile, TaxRuleSet } from "./schema";

const CII: Record<string, number> = {
  "2001-02": 100, "2002-03": 105, "2003-04": 109, "2004-05": 113, "2005-06": 117,
  "2006-07": 122, "2007-08": 129, "2008-09": 137, "2009-10": 148, "2010-11": 167,
  "2011-12": 184, "2012-13": 200, "2013-14": 220, "2014-15": 240, "2015-16": 254,
  "2016-17": 264, "2017-18": 272, "2018-19": 280, "2019-20": 289, "2020-21": 301,
  "2021-22": 317, "2022-23": 331, "2023-24": 348, "2024-25": 363, "2025-26": 376,
};

const S = (from: number, to: number | null, rate: number) => ({ from, to, rate });

/** Old regime slabs shared across all supported years (2.5L / 5L / 10L). */
const OLD_SLABS = [S(0, 250000, 0), S(250000, 500000, 5), S(500000, 1000000, 20), S(1000000, null, 30)];

/** FY 2024-25 onwards capital-gains profile set (post Budget-2024 rules). */
const CG_PROFILES_2025: Record<string, CapitalGainsProfile> = {
  equity_listed_in: { holding_months: 12, ltcg: 12.5, stcg: { flat: 20 }, exemption_112a: 125000, indexation: false },
  equity_foreign: { holding_months: 24, ltcg: 12.5, stcg: "slab" as const, exemption_112a: 0, indexation: false },
  equity_unlisted: { holding_months: 24, ltcg: 12.5, stcg: "slab" as const, exemption_112a: 0, indexation: false },
  debt_mf: { holding_months: 0, ltcg: "slab" as const, stcg: "slab" as const, exemption_112a: 0, indexation: false },
  gold: { holding_months: 24, ltcg: 12.5, stcg: "slab" as const, exemption_112a: 0, indexation: false },
  real_estate: {
    holding_months: 24, ltcg: 12.5, stcg: "slab" as const, exemption_112a: 0, indexation: false,
    ltcg_alt: { rate: 20, indexation: true, cutoff: "2024-07-23" },
  },
  vda: { holding_months: 0, ltcg: 0, stcg: { flat: 30 }, exemption_112a: 0, indexation: false },
};

const DEDUCTIONS = {
  "80C": { max: 150000 },
  "80D": { self: 25000, senior_parents: 50000 },
  "80TTA": { max: 10000 },
  "80TTB": { max: 50000 },
  "24b": { max: 200000 },
  "80CCD1B": { max: 50000 },
  hra: { metro_pct: 50, non_metro_pct: 40 },
};

const TDS = { fd: { threshold: 40000, senior_threshold: 50000, rate: 10 } };

/** FY 2025-26 and FY 2026-27 (identical per Budget 2026; new Act applies from Apr 2026). */
const AY_2025_26: TaxRuleSet = {
  _id: "AY-2025-26",
  assessment_year: "2025-26",
  financial_year: "2025-26",
  effective_from: "2025-04-01",
  effective_to: "2026-03-31",
  income_tax: {
    regimes: {
      new: {
        slabs: [S(0, 400000, 0), S(400000, 800000, 5), S(800000, 1200000, 10), S(1200000, 1600000, 15), S(1600000, 2000000, 20), S(2000000, 2400000, 25), S(2400000, null, 30)],
        std_deduction: 75000,
        rebate_87a: { income_limit: 1200000, max_rebate: 60000, marginal_relief: true },
        surcharge: [{ from: 5000000, rate: 10 }, { from: 10000000, rate: 15 }, { from: 20000000, rate: 25 }, { from: 50000000, rate: 25 }],
        allowed_deductions: ["80CCD2", "24b_letout"],
      },
      old: {
        slabs: OLD_SLABS,
        std_deduction: 50000,
        rebate_87a: { income_limit: 500000, max_rebate: 12500, marginal_relief: false },
        surcharge: [{ from: 5000000, rate: 10 }, { from: 10000000, rate: 15 }, { from: 20000000, rate: 25 }, { from: 50000000, rate: 37 }],
        allowed_deductions: ["80C", "80D", "80TTA", "80TTB", "24b", "80CCD1B", "hra"],
      },
    },
    senior: {
      old: { slabs: [S(0, 300000, 0), S(300000, 500000, 5), S(500000, 1000000, 20), S(1000000, null, 30)] },
      super_old: { slabs: [S(0, 500000, 0), S(500000, 1000000, 20), S(1000000, null, 30)] },
    },
    special_rates: { stcg_111a: 20, ltcg_112_112a: 12.5, unlisted_ltcg: 12.5, vda: 30 },
    surcharge_cap_on_ltcg: 15,
    cess: 4,
  },
  capital_gains: { profiles: CG_PROFILES_2025 },
  deductions: DEDUCTIONS,
  tds: TDS,
  cii: CII,
  version: 1,
};

/** FY 2026-27 — Budget 2026 changed nothing for individuals; identical rule set. */
const AY_2026_27: TaxRuleSet = {
  ...AY_2025_26,
  _id: "AY-2026-27",
  assessment_year: "2026-27",
  financial_year: "2026-27",
  effective_from: "2026-04-01",
  effective_to: "2027-03-31",
};

/** FY 2024-25 (AY 2025-26) — Budget-2024 changes applied from 23-Jul-2024. */
const AY_2024_25: TaxRuleSet = {
  _id: "AY-2024-25",
  assessment_year: "2024-25",
  financial_year: "2024-25",
  effective_from: "2024-04-01",
  effective_to: "2025-03-31",
  income_tax: {
    regimes: {
      new: {
        slabs: [S(0, 300000, 0), S(300000, 700000, 5), S(700000, 1000000, 10), S(1000000, 1200000, 15), S(1200000, 1500000, 20), S(1500000, null, 30)],
        std_deduction: 75000,
        rebate_87a: { income_limit: 700000, max_rebate: 25000, marginal_relief: true },
        surcharge: [{ from: 5000000, rate: 10 }, { from: 10000000, rate: 15 }, { from: 20000000, rate: 25 }, { from: 50000000, rate: 25 }],
        allowed_deductions: ["80CCD2", "24b_letout"],
      },
      old: {
        slabs: OLD_SLABS,
        std_deduction: 50000,
        rebate_87a: { income_limit: 500000, max_rebate: 12500, marginal_relief: false },
        surcharge: [{ from: 5000000, rate: 10 }, { from: 10000000, rate: 15 }, { from: 20000000, rate: 25 }, { from: 50000000, rate: 37 }],
        allowed_deductions: ["80C", "80D", "80TTA", "80TTB", "24b", "80CCD1B", "hra"],
      },
    },
    senior: {
      old: { slabs: [S(0, 300000, 0), S(300000, 500000, 5), S(500000, 1000000, 20), S(1000000, null, 30)] },
      super_old: { slabs: [S(0, 500000, 0), S(500000, 1000000, 20), S(1000000, null, 30)] },
    },
    special_rates: { stcg_111a: 20, ltcg_112_112a: 12.5, unlisted_ltcg: 12.5, vda: 30 },
    surcharge_cap_on_ltcg: 15,
    cess: 4,
  },
  capital_gains: { profiles: CG_PROFILES_2025 },
  deductions: DEDUCTIONS,
  tds: TDS,
  cii: CII,
  version: 1,
};

/** FY 2023-24 (AY 2024-25) — pre-Budget-2024 rates (STCG 15%, LTCG 10%, indexation standard). */
const AY_2023_24: TaxRuleSet = {
  _id: "AY-2023-24",
  assessment_year: "2023-24",
  financial_year: "2023-24",
  effective_from: "2023-04-01",
  effective_to: "2024-03-31",
  income_tax: {
    regimes: {
      new: {
        slabs: [S(0, 300000, 0), S(300000, 600000, 5), S(600000, 900000, 10), S(900000, 1200000, 15), S(1200000, 1500000, 20), S(1500000, null, 30)],
        std_deduction: 50000,
        rebate_87a: { income_limit: 700000, max_rebate: 25000, marginal_relief: false },
        surcharge: [{ from: 5000000, rate: 10 }, { from: 10000000, rate: 15 }, { from: 20000000, rate: 25 }, { from: 50000000, rate: 37 }],
        allowed_deductions: ["80CCD2", "24b_letout"],
      },
      old: {
        slabs: OLD_SLABS,
        std_deduction: 50000,
        rebate_87a: { income_limit: 500000, max_rebate: 12500, marginal_relief: false },
        surcharge: [{ from: 5000000, rate: 10 }, { from: 10000000, rate: 15 }, { from: 20000000, rate: 25 }, { from: 50000000, rate: 37 }],
        allowed_deductions: ["80C", "80D", "80TTA", "80TTB", "24b", "80CCD1B", "hra"],
      },
    },
    senior: {
      old: { slabs: [S(0, 300000, 0), S(300000, 500000, 5), S(500000, 1000000, 20), S(1000000, null, 30)] },
      super_old: { slabs: [S(0, 500000, 0), S(500000, 1000000, 20), S(1000000, null, 30)] },
    },
    special_rates: { stcg_111a: 15, ltcg_112_112a: 10, unlisted_ltcg: 20, vda: 30 },
    surcharge_cap_on_ltcg: 15,
    cess: 4,
  },
  capital_gains: {
    profiles: {
      equity_listed_in: { holding_months: 12, ltcg: 10, stcg: { flat: 15 }, exemption_112a: 100000, indexation: false },
      equity_foreign: { holding_months: 24, ltcg: 20, stcg: "slab" as const, exemption_112a: 0, indexation: true },
      equity_unlisted: { holding_months: 24, ltcg: 20, stcg: "slab" as const, exemption_112a: 0, indexation: true },
      debt_mf: { holding_months: 0, ltcg: "slab" as const, stcg: "slab" as const, exemption_112a: 0, indexation: false },
      gold: { holding_months: 24, ltcg: 20, stcg: "slab" as const, exemption_112a: 0, indexation: true },
      real_estate: { holding_months: 24, ltcg: 20, stcg: "slab" as const, exemption_112a: 0, indexation: true },
      vda: { holding_months: 0, ltcg: 0, stcg: { flat: 30 }, exemption_112a: 0, indexation: false },
    },
  },
  deductions: DEDUCTIONS,
  tds: TDS,
  cii: CII,
  version: 1,
};

export const AY_RULE_SETS: TaxRuleSet[] = [AY_2023_24, AY_2024_25, AY_2025_26, AY_2026_27];

/** Investment-assumption presets (latest opinion; not legal rules). */
export const ASSET_PRESETS: AssetPresets = {
  _id: "PRESETS",
  asset_classes: {
    fd: { growth_rate: 0, yield_rate: 6.75, volatility: 0, compounding: "quarterly", maturity_years: 3, tax_profile_key: "fd_interest", jurisdiction: "in" },
    savings: { growth_rate: 0, yield_rate: 3.5, volatility: 0, compounding: "monthly", tax_profile_key: "savings_interest", jurisdiction: "in" },
    bond: { growth_rate: 1, yield_rate: 7.5, volatility: 4, compounding: "yearly", maturity_years: 5, tax_profile_key: "bond", jurisdiction: "in" },
    gold: { growth_rate: 8.5, yield_rate: 2.5, volatility: 14, compounding: "none", tax_profile_key: "gold", jurisdiction: "in" },
    ppf: { growth_rate: 0, yield_rate: 7.1, volatility: 0, compounding: "yearly", maturity_years: 15, tax_profile_key: "ppf", jurisdiction: "in" },
    equity: { growth_rate: 12, yield_rate: 1.5, volatility: 18, compounding: "none", tax_profile_key: "equity_listed_in", jurisdiction: "in" },
    equity_foreign: { growth_rate: 12, yield_rate: 1.5, volatility: 20, compounding: "none", tax_profile_key: "equity_foreign", jurisdiction: "foreign" },
    mf: { growth_rate: 12, yield_rate: 0, volatility: 16, compounding: "none", tax_profile_key: "equity_listed_in", jurisdiction: "in" },
    real_estate: { growth_rate: 8, yield_rate: 2.75, volatility: 6, compounding: "none", tax_profile_key: "real_estate", jurisdiction: "in" },
    vda: { growth_rate: 20, yield_rate: 0, volatility: 40, compounding: "none", tax_profile_key: "vda", jurisdiction: "in" },
  },
};

/** Tax rule-set schemas + types — the contract for Tax_Rule_Store documents. */

import { z } from "zod";

export const SlabSchema = z.object({
  from: z.number().min(0),
  to: z.number().nullable(),
  rate: z.number().min(0).max(100),
});
export type TaxSlab = z.infer<typeof SlabSchema>;

const RegimeSchema = z
  .object({
    slabs: z.array(SlabSchema),
    std_deduction: z.number().min(0),
    rebate_87a: z.object({
      income_limit: z.number().min(0),
      max_rebate: z.number().min(0),
      marginal_relief: z.boolean(),
    }),
    surcharge: z.array(
      z.object({ from: z.number().min(0), rate: z.number().min(0).max(100) })
    ),
    allowed_deductions: z.array(z.string()),
  })
  .passthrough();
export type TaxRegime = z.infer<typeof RegimeSchema>;

const CapitalGainsProfileSchema = z
  .object({
    /** months held to qualify as long-term (0 = always short-term, e.g. debt MF post Apr-23) */
    holding_months: z.number().min(0),
    /** LTCG rate % or "slab" (debt funds, foreign-adjacent) */
    ltcg: z.union([z.number().min(0), z.literal("slab")]),
    ltcg_alt: z
      .object({
        rate: z.number().min(0),
        indexation: z.boolean(),
        /** purchases on/before this date (ISO yyyy-mm-dd) unlock the alternative */
        cutoff: z.string().optional(),
      })
      .optional(),
    /** STCG rate: { flat } % or "slab" */
    stcg: z.union([z.literal("slab"), z.object({ flat: z.number().min(0) })]),
    /** ₹ exemption for listed Indian equity / equity MF (section 112A) */
    exemption_112a: z.number().min(0).default(0),
    indexation: z.boolean().default(false),
  })
  .passthrough();
export type CapitalGainsProfile = z.infer<typeof CapitalGainsProfileSchema>;

const DeductionsSchema = z
  .object({
    "80C": z.object({ max: z.number().min(0) }).optional(),
    "80D": z.object({ self: z.number().min(0), senior_parents: z.number().min(0) }).optional(),
    "80TTA": z.object({ max: z.number().min(0) }).optional(),
    "80TTB": z.object({ max: z.number().min(0) }).optional(),
    "24b": z.object({ max: z.number().min(0) }).optional(),
    "80CCD1B": z.object({ max: z.number().min(0) }).optional(),
    hra: z.object({ metro_pct: z.number().min(0), non_metro_pct: z.number().min(0) }).optional(),
  })
  .passthrough();
export type TaxDeductions = z.infer<typeof DeductionsSchema>;

export const TaxRuleSetSchema = z
  .object({
    _id: z.string().optional(),
    assessment_year: z.string(), // "2025-26"
    financial_year: z.string().optional(), // Apr–Mar label, default = assessment_year
    effective_from: z.string().optional(),
    effective_to: z.string().optional(),
    income_tax: z.object({
      regimes: z.object({ new: RegimeSchema, old: RegimeSchema }),
      senior: z
        .object({
          old: z.object({ slabs: z.array(SlabSchema) }),
          super_old: z.object({ slabs: z.array(SlabSchema) }).optional(),
        })
        .optional(),
      special_rates: z.object({
        stcg_111a: z.number().min(0),
        ltcg_112_112a: z.number().min(0),
        unlisted_ltcg: z.number().min(0),
        vda: z.number().min(0),
      }),
      surcharge_cap_on_ltcg: z.number().min(0),
      cess: z.number().min(0),
    }),
    capital_gains: z.object({
      profiles: z.record(z.string(), CapitalGainsProfileSchema),
    }),
    deductions: DeductionsSchema,
    tds: z.object({ fd: z.object({ threshold: z.number().min(0), senior_threshold: z.number().min(0), rate: z.number().min(0) }) }),
    cii: z.record(z.string(), z.number()), // financial year -> Cost Inflation Index
    version: z.number().int().min(1).optional(),
    updated_at: z.number().optional(),
  })
  .passthrough();
export type TaxRuleSet = z.infer<typeof TaxRuleSetSchema>;

export const AssetPresetsSchema = z
  .object({
    _id: z.literal("PRESETS").optional(),
    updated_at: z.number().optional(),
    /** per-asset-class investment assumption defaults (latest opinion, not legal rules) */
    asset_classes: z.record(
      z.string(),
      z
        .object({
          growth_rate: z.number().min(0),
          yield_rate: z.number().min(0).optional(),
          volatility: z.number().min(0).optional(),
          compounding: z.enum(["none", "simple", "monthly", "quarterly", "yearly"]).optional(),
          maturity_years: z.number().min(0).optional(),
          /** reference into capital_gains.profiles of the rule sets */
          tax_profile_key: z.string().optional(),
          jurisdiction: z.enum(["in", "foreign"]).optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();
export type AssetPresets = z.infer<typeof AssetPresetsSchema>;

export function validateTaxRuleSet(input: unknown): TaxRuleSet {
  return TaxRuleSetSchema.parse(input) as TaxRuleSet;
}

export function validateAssetPresets(input: unknown): AssetPresets {
  return AssetPresetsSchema.parse(input) as AssetPresets;
}

/** MCP tools for the versioned tax system — rule reads for all users, writes admin-only. */

import { z } from "zod";
import type { Container } from "../../di/container";
import { ComputeIncomeTax, ComputeSalaryNegotiation } from "../../tax/engine";
import { MonthToAssessmentYear } from "../../tax/engine";
import type { AssetPresets, TaxRuleSet } from "../../tax/schema";
import { fail, ok, requireFields } from "./envelope";
import type { ToolDefinition } from "../types";

/** Deep-merge plain objects (arrays/values replaced); used for partial rule-set patches. */
function deepMerge(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...base };
  for (const key of Object.keys(patch || {})) {
    const pv = patch[key];
    const bv = out[key];
    if (
      pv &&
      typeof pv === "object" &&
      !Array.isArray(pv) &&
      bv &&
      typeof bv === "object" &&
      !Array.isArray(bv)
    ) {
      out[key] = deepMerge(bv, pv);
    } else if (pv !== undefined) {
      out[key] = pv;
    }
  }
  return out;
}

export function makeTaxTools(container: Container): ToolDefinition[] {
  const { tax_service } = container;

  return [
    {
      name: "list_tax_rules",
      title: "List available tax rule sets",
      description:
        "Returns the assessment years with stored tax rule sets (from Tax_Rule_Store) plus any bundled fallbacks. Each rule set carries income-tax slabs (new/old regime), capital-gains profiles, deductions, TDS and CII tables for that financial year.",
      inputSchema: {},
      async handler() {
        return ok(await tax_service.listYears());
      },
    },
    {
      name: "get_tax_rules",
      title: "Get a tax rule set for an assessment year",
      description:
        "Returns the full versioned rule set for the given assessment year (e.g. '2025-26'). Defaults to the financial year of today. Unknown/future years fall back to the latest available rule set — check the returned assessment_year to know which rules were applied. Use with tax_calculation / salary_negotiation so numbers match reality.",
      inputSchema: { assessment_year: z.string().optional() },
      async handler(_ctx, args) {
        const ay = args.assessment_year || MonthToAssessmentYear(Date.now(), 1);
        const rules = await tax_service.getRules(ay);
        return ok({ requested_assessment_year: ay, rules });
      },
    },
    {
      name: "upsert_tax_rules",
      title: "Create or update a tax rule set (admin)",
      description:
        "ADMIN ONLY. Upserts the versioned rule set for an assessment year into Tax_Rule_Store. Pass assessment_year plus the rule set fields: income_tax (regimes new/old with slabs, std_deduction, rebate_87a, surcharge, allowed_deductions), capital_gains (profiles keyed by asset class), deductions, tds, cii (Cost Inflation Index per financial year) and optionally effective_from/effective_to. Omitted fields fall back to the current stored (or bundled) rule set for that year. Future finance-act changes land here — new AY = new doc, never edit the past.",
      requiresRole: "admin",
      inputSchema: {
        assessment_year: z.string(),
        rules: z.record(z.string(), z.any()).optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["assessment_year"]);
        if (missing) return missing;
        try {
          const existing = await tax_service.getRules(args.assessment_year);
          const merged = deepMerge({ ...existing, assessment_year: args.assessment_year }, args.rules || {});
          const { success } = await tax_service.upsertRules(merged as TaxRuleSet);
          return success
            ? ok({ success: true, assessment_year: args.assessment_year })
            : fail("INTERNAL", "failed to persist tax rule set");
        } catch (e: any) {
          return fail("VALIDATION_FAILED", String(e?.message || e));
        }
      },
    },
    {
      name: "update_presets",
      title: "Update asset-class assumption presets (admin)",
      description:
        "ADMIN ONLY. Upserts the asset-class presets document (Tax_Rule_Store 'PRESETS'): default growth_rate, yield_rate, volatility, compounding and tax_profile_key per asset class. These are current investment assumptions (not legal rules) — FD rates, PPF rate, gold outlook etc. Pass the full or partial asset_classes map; omitted classes keep their current values.",
      requiresRole: "admin",
      inputSchema: { asset_classes: z.record(z.string(), z.record(z.string(), z.any())).optional() },
      async handler(_ctx, args) {
        try {
          const existing = await tax_service.getPresets();
          const merged = deepMerge(existing as any, { asset_classes: args.asset_classes || {} });
          const { success } = await tax_service.updatePresets(merged as AssetPresets);
          return success ? ok({ success: true }) : fail("INTERNAL", "failed to persist presets");
        } catch (e: any) {
          return fail("VALIDATION_FAILED", String(e?.message || e));
        }
      },
    },
    {
      name: "tax_calculation",
      title: "Compute income tax against stored rules",
      description:
        "Pure computation of income tax using the versioned rule set for the assessment year (default: current FY). Pass regime ('new' default or 'old'), gross_salary (annual), optional salary_structure {basic_annual, hra_annual, rent_annual, metro} for the HRA exemption (old regime), deductions {c80, d80, d80_senior_parents, tta, ttb, b24, nps_1b}, age_group (below60/senior/super_senior) and other_income (slab-taxed non-salary income). capital_gains: {stcg_111a, ltcg_112a, ltcg_other, vda} are gains taxed at special rates. Returns slab breakup, 87A rebate + marginal relief, surcharge, cess, total tax and effective rate.",
      inputSchema: {
        assessment_year: z.string().optional(),
        regime: z.enum(["new", "old"]).optional(),
        age_group: z.enum(["below60", "senior", "super_senior"]).optional(),
        gross_salary: z.number().min(0).optional(),
        salary_structure: z
          .object({
            basic_annual: z.number().min(0),
            hra_annual: z.number().min(0),
            rent_annual: z.number().min(0),
            metro: z.boolean(),
          })
          .optional(),
        deductions: z.record(z.string(), z.number().min(0)).optional(),
        other_income: z.number().min(0).optional(),
        capital_gains: z
          .object({
            stcg_111a: z.number().min(0).optional(),
            ltcg_112a: z.number().min(0).optional(),
            ltcg_other: z.number().min(0).optional(),
            vda: z.number().min(0).optional(),
          })
          .optional(),
      },
      async handler(_ctx, args) {
        const ay = args.assessment_year || MonthToAssessmentYear(Date.now(), 1);
        const rules = await tax_service.getRules(ay);
        try {
          const result = ComputeIncomeTax({
            rules,
            regime: args.regime ?? "new",
            age_group: args.age_group ?? "below60",
            gross_salary: args.gross_salary ?? 0,
            salary_structure: args.salary_structure,
            deductions: args.deductions,
            other_income: args.other_income ?? 0,
            capital_gains: args.capital_gains,
          });
          return ok(result);
        } catch (e: any) {
          return fail("VALIDATION_FAILED", String(e?.message || e));
        }
      },
    },
    {
      name: "salary_negotiation",
      title: "Compare salary offers after tax (take-home + marginal rate)",
      description:
        "Pure computation for salary negotiations: given the current gross annual salary and offer scenarios [{label, new_gross}], returns per-scenario take-home (gross − tax), tax, take-home delta, the MARGINAL tax rate on the hike (the key negotiation number — what % of the raise you actually keep) and the after-tax hike %. Uses the stored rule set for the assessment year and regime. Optional salary_structure scales HRA across scenarios; deductions apply.",
      inputSchema: {
        assessment_year: z.string().optional(),
        regime: z.enum(["new", "old"]).optional(),
        age_group: z.enum(["below60", "senior", "super_senior"]).optional(),
        current_gross: z.number().min(0),
        scenarios: z.array(z.object({ label: z.string(), new_gross: z.number().min(0) })).min(1),
        salary_structure: z
          .object({
            basic_annual: z.number().min(0),
            hra_annual: z.number().min(0),
            rent_annual: z.number().min(0),
            metro: z.boolean(),
          })
          .optional(),
        deductions: z.record(z.string(), z.number().min(0)).optional(),
        other_income: z.number().min(0).optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["current_gross", "scenarios"]);
        if (missing) return missing;
        const ay = args.assessment_year || MonthToAssessmentYear(Date.now(), 1);
        const rules = await tax_service.getRules(ay);
        try {
          const result = ComputeSalaryNegotiation({
            rules,
            regime: args.regime ?? "new",
            age_group: args.age_group ?? "below60",
            current_gross: args.current_gross,
            scenarios: args.scenarios,
            salary_structure: args.salary_structure,
            deductions: args.deductions,
            other_income: args.other_income ?? 0,
          });
          return ok(result);
        } catch (e: any) {
          return fail("VALIDATION_FAILED", String(e?.message || e));
        }
      },
    },
  ];
}

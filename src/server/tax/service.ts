/** Tax-rule service — DB-backed with bundled fallbacks + in-memory cache. */

import type { TaxRuleRepository } from "../domain/ports";
import { AY_RULE_SETS, ASSET_PRESETS } from "./rules-data";
import { validateAssetPresets, validateTaxRuleSet, type AssetPresets, type TaxRuleSet } from "./schema";
import { MonthToAssessmentYear } from "./engine";

export interface TaxRuleService {
  /** Rule set for an assessment year; falls back to the latest bundled set when unseeded. */
  getRules(assessment_year: string): Promise<TaxRuleSet>;
  /** Rule set matching a plan timestamp's financial year. */
  rulesForTimestamp(timestamp: number): Promise<TaxRuleSet>;
  listYears(): Promise<{ assessment_year: string; financial_year?: string; source: "db" | "bundled" }[]>;
  getPresets(): Promise<AssetPresets>;
  upsertRules(ruleSet: TaxRuleSet): Promise<{ success: boolean }>;
  updatePresets(presets: AssetPresets): Promise<{ success: boolean }>;
}

export function makeTaxRuleService(repo: TaxRuleRepository): TaxRuleService {
  const cache = new Map<string, TaxRuleSet>();
  let presetsCache: AssetPresets | null = null;

  function latestBundled(): TaxRuleSet {
    return AY_RULE_SETS[AY_RULE_SETS.length - 1];
  }

  return {
    async getRules(assessment_year) {
      const cached = cache.get(assessment_year);
      if (cached) return cached;
      const fromDb = await repo.FindByAssessmentYear(assessment_year);
      if (fromDb) {
        const parsed = validateTaxRuleSet(fromDb);
        cache.set(assessment_year, parsed);
        return parsed;
      }
      const bundled = AY_RULE_SETS.find((r) => r.assessment_year === assessment_year) ?? latestBundled();
      cache.set(assessment_year, bundled);
      return bundled;
    },

    async rulesForTimestamp(timestamp) {
      return this.getRules(MonthToAssessmentYear(timestamp, 1));
    },

    async listYears() {
      const dbDocs = await repo.ListRuleSets();
      const fromDb = dbDocs.map((d) => ({
        assessment_year: d.assessment_year as string,
        financial_year: d.financial_year as string | undefined,
        source: "db" as const,
      }));
      const dbYears = new Set(fromDb.map((y) => y.assessment_year));
      const bundledExtra = AY_RULE_SETS.filter((r) => !dbYears.has(r.assessment_year)).map((r) => ({
        assessment_year: r.assessment_year,
        financial_year: r.financial_year,
        source: "bundled" as const,
      }));
      return [...fromDb, ...bundledExtra];
    },

    async getPresets() {
      if (presetsCache) return presetsCache;
      const fromDb = await repo.GetPresets();
      const presets = fromDb ? validateAssetPresets(fromDb) : ASSET_PRESETS;
      presetsCache = presets;
      return presets;
    },

    async upsertRules(ruleSet) {
      const parsed = validateTaxRuleSet(ruleSet);
      const { success } = await repo.UpsertRuleSet({ ...parsed });
      if (success) cache.set(parsed.assessment_year, parsed);
      return { success };
    },

    async updatePresets(presets) {
      const parsed = validateAssetPresets(presets);
      const { success } = await repo.UpsertPresets({ ...parsed });
      if (success) presetsCache = parsed;
      return { success };
    },
  };
}

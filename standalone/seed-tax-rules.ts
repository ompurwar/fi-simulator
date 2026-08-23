/**
 * seed:tax-rules — idempotent seed of the versioned tax rule sets + asset-class
 * presets into Tax_Rule_Store. Re-run any time rule sets change (new assessment
 * year, finance-act updates); existing docs are upserted (replaced), never
 * duplicated. Needs DB_URL / DB_NAME in env — same as mcp:stdio.
 */
import { buildContainer } from "../src/server/di/container";
import { AY_RULE_SETS, ASSET_PRESETS } from "../src/server/tax";

async function main() {
  const container = await buildContainer();
  const { tax_rule_repo } = container;

  for (const ruleSet of AY_RULE_SETS) {
    const { success } = await tax_rule_repo.UpsertRuleSet({ ...ruleSet });
    console.log(
      `${success ? "seeded" : "FAILED"}: ${ruleSet._id} (${ruleSet.assessment_year}, ${ruleSet.effective_from} → ${ruleSet.effective_to})`
    );
  }

  const { success: presetsOk } = await tax_rule_repo.UpsertPresets({ ...ASSET_PRESETS });
  console.log(`${presetsOk ? "seeded" : "FAILED"}: PRESETS (${Object.keys(ASSET_PRESETS.asset_classes).length} asset classes)`);

  const dbYears = await tax_rule_repo.ListRuleSets();
  console.log(`\nTax_Rule_Store now has ${dbYears.length} rule set(s).`);
}

main().catch((err) => {
  console.error("[seed-tax-rules] failed:", err);
  process.exit(1);
});

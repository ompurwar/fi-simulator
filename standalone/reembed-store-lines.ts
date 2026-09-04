/**
 * One-off consolidation: merge active store lines + changes into every plan
 * document (plan = single source of truth). Run once after deploy:
 *
 *   npx tsx standalone/reembed-store-lines.ts
 *
 * Rules (see cashflowMerge.ts): store wins on same _id (it gets every update
 * first); ids missing from the plan are appended; ids the store has marked
 * 'deleted' are dropped from the plan. Idempotent — re-running is a no-op.
 */
import { buildContainer } from "../src/server/di/container";
import { MergeStoreIntoPlan, PlanChangedAfterMerge } from "../src/server/application/cashflowMerge";
import { loadEnv } from "../src/server/config/env";

function loadDotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = require("fs").readFileSync(require("path").resolve(file), "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("'") && !value.endsWith("'")) || (value.startsWith('"') && !value.endsWith('"'))) {
      const quote = value[0];
      while (i + 1 < lines.length && !value.endsWith(quote)) value += "\n" + lines[++i].trim();
    }
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))
      value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

async function main() {
  // Container reads .env.local via the shell env — load it so it matches prod-ish
  // config (GCP KMS included; dev fallback otherwise).
  const fileEnv = loadDotEnv(".env.local");
  const env = loadEnv({ ...process.env, ...fileEnv, NODE_ENV: "development" });
  const container = await buildContainer(env as any);
  const db = container.db;
  const codecAllow = ["_id"]; // only used to read raw docs below

  const plans = await db.collection("Plan_Store").find({ status: "active" }).toArray();
  console.log(`plans: ${plans.length}`);

  let updated_plans = 0;
  let updated_changes = 0;

  for (const raw_plan of plans) {
    const plan = await container.plan_list.FindById(String(raw_plan._id));
    if (!plan) continue;

    const plan_id = String(raw_plan._id);
    // active store rows for this plan (lines by plan_id; changes by cashflow_id)
    const storeLines = await db
      .collection("Cash_Flow_Store")
      .find({ plan_id: raw_plan._id, status: "active" })
      .toArray();
    const cashflowIds = Array.from(
      new Set([
        ...(plan.cashflow_list || []).map((c: any) => String(c._id)),
        ...storeLines.map((s: any) => String(s._id)),
      ])
    );
    const storeChanges = await db
      .collection("Cash_Flow_Change_Store")
      .find({ cashflow_id: { $in: cashflowIds.map((id) => container.db.MakeId(id)) }, status: "active" })
      .toArray();
    const merged = MergeStoreIntoPlan(plan, storeLines, storeChanges);
    if (PlanChangedAfterMerge(plan, merged)) {
      await container.plan_list.Update({ ...merged, _id: plan_id });
      updated_plans++;
      if (JSON.stringify(merged.cashflow_change_list) !== JSON.stringify(plan.cashflow_change_list || []))
        updated_changes++;
      console.log(`re-embedded: ${plan_id}`);
    }
  }

  console.log(`\nDone. plans updated: ${updated_plans} (with change updates: ${updated_changes})`);
  await (container as any)?.db?.client?.close?.();
  process.exit(0);
}

main().catch((e) => {
  console.error("RE-EMBED FAILED:", e?.message || e);
  process.exit(1);
});

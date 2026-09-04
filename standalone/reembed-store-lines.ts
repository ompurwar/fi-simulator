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

  // Plans may already carry invalid/legacy rows — validate later at merge, not
  // here: read raw + decrypt directly instead of going through MakePlan.
  const { makeDocCrypto } = await import("../src/server/infrastructure/docCrypto");
  const { makeGcpKms } = await import("../src/server/infrastructure/kms");
  const codec = makeDocCrypto({
    kms: makeGcpKms(env),
    localKey: Buffer.alloc(32),
  });
  const PLAN_ALLOW = ["_id", "user_id", "status"];

  const plans = await db.collection("Plan_Store").find({ status: "active" }).toArray();
  console.log(`plans: ${plans.length}`);

  let updated_plans = 0;
  let updated_changes = 0;
  let skipped_invalid = 0;

  for (const raw_plan of plans) {
    let plan: any;
    let plan_id = String(raw_plan._id);
    try {
      plan = await codec.decryptDoc(raw_plan as any, PLAN_ALLOW);
    } catch (e: any) {
      console.error(`plan ${plan_id}: decrypt failed — ${e.message}`);
      continue;
    }
    plan = { ...plan, _id: raw_plan._id };

    // active store rows for this plan — MUST decrypt (they're envelope-encrypted
    // too); merging raw docs would embed nested __enc rows into the plan.
    const rawStoreLines = await db
      .collection("Cash_Flow_Store")
      .find({ plan_id: raw_plan._id, status: "active" })
      .toArray();
    const storeLines: any[] = [];
    for (const rawLine of rawStoreLines) {
      try {
        storeLines.push(
          await codec.decryptDoc(rawLine as any, [
            "_id",
            "user_id",
            "plan_id",
            "status",
            "category",
          ])
        );
      } catch (e: any) {
        console.error(`  store line ${String(rawLine._id)} decrypt failed — skipped`);
      }
    }
    const cashflowIds = Array.from(
      new Set([
        ...(plan.cashflow_list || []).map((c: any) => String(c._id)),
        ...storeLines.map((s: any) => String(s._id)),
      ])
    );
    const rawStoreChanges = await db
      .collection("Cash_Flow_Change_Store")
      .find({
        cashflow_id: { $in: cashflowIds.map((id) => container.db.MakeId(id)) },
        status: "active",
      })
      .toArray();
    const storeChanges: any[] = [];
    for (const rawChange of rawStoreChanges) {
      try {
        storeChanges.push(
          await codec.decryptDoc(rawChange as any, [
            "_id",
            "user_id",
            "cashflow_id",
            "status",
            "category",
            "category_id",
            "cashflow_change_id",
          ])
        );
      } catch (e: any) {
        console.error(`  change ${String(rawChange._id)} decrypt failed — skipped`);
      }
    }
    const before_lists = JSON.stringify({
      l: plan.cashflow_list || [],
      c: plan.cashflow_change_list || [],
    });
    const merged = MergeStoreIntoPlan(plan, storeLines, storeChanges);
    // the merge validator may have dropped invalid rows from the plan itself —
    // detect those as change-of-broken-data too
    const invalid_embedded = (plan.cashflow_list || []).length -
      (merged.cashflow_list || []).length +
      (plan.cashflow_change_list || []).length -
      (merged.cashflow_change_list || []).length;
    if (PlanChangedAfterMerge(plan, merged) || invalid_embedded > 0) {
      skipped_invalid += invalid_embedded > 0 ? invalid_embedded : 0;
      await container.plan_list.Update({ ...merged, _id: plan_id });
      updated_plans++;
      if (
        JSON.stringify(merged.cashflow_change_list) !==
        JSON.stringify(plan.cashflow_change_list || [])
      )
        updated_changes++;
      console.log(`re-embedded: ${plan_id}${invalid_embedded > 0 ? ` (dropped ${invalid_embedded} invalid rows)` : ""}`);
    }
  }

  console.log(
    `\nDone. plans updated: ${updated_plans} (with change updates: ${updated_changes}, invalid rows dropped: ${skipped_invalid})`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("RE-EMBED FAILED:", e?.message || e);
  process.exit(1);
});

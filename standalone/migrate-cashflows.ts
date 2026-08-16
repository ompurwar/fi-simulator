/**
 * One-off migration: backfill the dual-model cashflow stores from plan-embedded
 * lines, so store-based use cases (GetIncome / GetExpense / AddCashflowChange /
 * UpdateIncome, …) can see every line — not just the ones registered via the
 * classic add endpoints.
 *
 * For every plan of the target user:
 *   1. Cash_Flow_Store:       inserts one doc per embedded cashflow line (only
 *                             when no doc with the same _id exists).
 *   2. Cash_Flow_Change_Store: same for embedded cashflow changes.
 *   3. Plan_Store:            enriches the embedded docs with user_id/plan_id
 *                             (they were missing, which broke store lookups).
 *
 * Idempotent: run it as many times as you like.
 *
 * Usage:  node --env-file=.env.local node_modules/.bin/tsx standalone/migrate-cashflows.ts <email>
 */
import { buildContainer } from "../src/server/di/container";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: migrate-cashflows.ts <email>");
    process.exit(1);
  }

  const container = await buildContainer();
  const db = container.db;
  const [user] = await container.user_list.FindByEmail(email);
  if (!user) {
    console.error(`user not found: ${email}`);
    process.exit(1);
  }
  const user_id = user._id.toString();
  console.log(`migrating cashflow stores for ${email} (${user_id})`);

  const plans = await container.plan_list.FindByUserId(user_id);
  console.log(`plans: ${plans.length}`);

  let cf_inserted = 0;
  let change_inserted = 0;
  let plans_enriched = 0;

  for (const plan of plans) {
    const plan_id = plan._id.toString();
    const planKey = db.MakeId(plan_id);

    // 1 + 2: backfill stores
    const cashflows = plan.cashflow_list || [];
    for (const cf of cashflows) {
      const key = db.MakeId(cf._id);
      const exists = await db.collection("Cash_Flow_Store").findOne({ _id: key });
      if (exists) continue;
      await db.collection("Cash_Flow_Store").insertOne({
        _id: key,
        user_id: db.MakeId(user_id),
        plan_id: planKey,
        category: cf.category,
        type: cf.type,
        frequency: cf.frequency,
        amount: cf.amount,
        desc: cf.desc,
        start_month: cf.start_month,
        end_month: cf.end_month,
        active: cf.active ?? true,
        primary: cf.primary ?? false,
        status: "active",
        timestamp: Date.now(),
      });
      cf_inserted++;
    }

    const changes = plan.cashflow_change_list || [];
    for (const change of changes) {
      const key = db.MakeId(change._id);
      const exists = await db.collection("Cash_Flow_Change_Store").findOne({ _id: key });
      if (exists) continue;
      await db.collection("Cash_Flow_Change_Store").insertOne({
        _id: key,
        user_id: db.MakeId(user_id),
        cashflow_id: db.MakeId(change.cashflow_id),
        category: change.category,
        change_type: change.change_type,
        value: change.value,
        start_month: change.start_month,
        end_month: change.end_month,
        frequency: change.frequency,
        title: change.title,
        desc: change.desc,
        active: change.active ?? true,
        status: "active",
        timestamp: Date.now(),
      });
      change_inserted++;
    }

    // 3: enrich embedded docs with user_id/plan_id
    const needsEnrich =
      cashflows.some((c: any) => !c.user_id || !c.plan_id) ||
      changes.some((c: any) => !c.user_id);
    if (needsEnrich) {
      await db.collection("Plan_Store").updateOne(
        { _id: planKey },
        {
          $set: {
            cashflow_list: cashflows.map((c: any) => ({
              ...c,
              user_id: c.user_id || db.MakeId(user_id),
              plan_id: c.plan_id || planKey,
            })),
            cashflow_change_list: changes.map((c: any) => ({
              ...c,
              user_id: c.user_id || db.MakeId(user_id),
            })),
          },
        }
      );
      plans_enriched++;
    }
  }

  console.log(`done: ${cf_inserted} cashflows, ${change_inserted} changes inserted, ${plans_enriched} plans enriched`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("migration failed:", err);
    process.exit(1);
  });

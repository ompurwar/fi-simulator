import { buildContainer } from "../src/server/di/container";

async function main() {
  const email = process.argv[2] || "ompurwar96@gmail.com";
  const c = await buildContainer();
  const [u] = await c.user_list.FindByEmail(email);
  if (!u) {
    console.error(`user not found: ${email}`);
    process.exit(1);
  }
  const user_id = u._id.toString();
  const plans = await c.plan_list.FindByUserId(user_id);
  for (const p of plans) {
    const inc = await c.app.GetIncome({ plan_id: p._id.toString(), user_id });
    const exp = await c.app.GetExpense({ plan_id: p._id.toString(), user_id });
    const planDoc = await c.plan_list.FindById(p._id.toString());
    console.log(
      `${p.title}: store income=${inc.length} expense=${exp.length} | plan-doc lines=${(planDoc?.cashflow_list || []).length}`
    );
  }
  process.exit(0);
}

main();

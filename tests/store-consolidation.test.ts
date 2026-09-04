import { beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signupUser } from "./helpers";
import { MergeStoreIntoPlan, PlanChangedAfterMerge } from "@/server/application/cashflowMerge";

/**
 * Store consolidation (Option B): the plan document is the single source of
 * truth for the engine. Verify:
 *  - engine projections heal store-only drift (read-path union)
 *  - store-updated lines embed into the plan doc (update upsert)
 *  - cashflow changes embed into plan.cashflow_change_list on add/update/delete
 *  - delete guards consult embedded + store changes
 */
describe("plan single source of truth — store consolidation", () => {
  let app: any;
  let container: any;
  let ctx: { user_id: string; role: string };
  let plan_id: string;

  beforeAll(async () => {
    const t = await createTestApp();
    container = t.container;
    app = t.container.app; // application layer (use cases)
    const signed = await signupUser(t.app);
    const session = await container.session_list.FindByActiveSessionId(signed.session_id);
    ctx = { user_id: session!.user_id.toString(), role: "user" };
    const res: any = await (await import("@/server/mcp/registry")).callRegistryTool(
      (await import("@/server/mcp/registry")).makeToolRegistry(container),
      ctx,
      "create_plan",
      { title: "Consolidation plan", monthly_income: 200000, monthly_expense: 60000 }
    );
    plan_id = String(res?.data?.plan_id ?? res?.data?._id);
    expect(plan_id).toBeTruthy();
  });

  it("engine projection heals a store-only line (legacy drift) via read-path union", async () => {
    // simulate legacy drift: line exists ONLY in Cash_Flow_Store
    const { created } = await container.cashflow_list.Add({
      user_id: container.db.MakeId(ctx.user_id),
      plan_id: container.db.MakeId(plan_id),
      category: "e",
      type: "o",
      frequency: null,
      amount: 1010320,
      desc: "Sonebhadra DP + stamp duty + registration + charges",
      start_month: 1,
      end_month: 1,
      active: true,
      primary: false,
    });
    const line_id = String(created._id);

    const plan: any = await container.plan_list.FindById(plan_id);
    expect(plan.cashflow_list.some((c: any) => String(c._id) === line_id)).toBe(false);

    const snapshot = await app.PlanSnapshot({ plan: await container.plan_list.FindById(plan_id), duration: 2 });
    const m1 = snapshot.cashflow.expense_statement[0];
    expect(m1.expense_breakdown.some((b: any) => b.cashflow_title === "Sonebhadra DP + stamp duty + registration + charges")).toBe(true);
    expect(m1.total_expense).toBeGreaterThan(1010320);
  });

  it("updating a store line embeds/upserts it into the plan document", async () => {
    const storeLines: any[] = await app.GetExpense({ plan_id, user_id: ctx.user_id });
    const line = storeLines.find((c: any) => c.desc.startsWith("Sonebhadra"));

    await app.UpdateExpense({
      _id: line._id,
      plan_id,
      user_id: ctx.user_id,
      type: "o",
      frequency: null,
      amount: 999999,
      desc: "Sonebhadra revised",
      start_month: 1,
      end_month: 1,
    });

    const after: any = await container.plan_list.FindById(plan_id);
    const embedded = after.cashflow_list.find((c: any) => String(c._id) === String(line._id));
    expect(embedded.amount).toBe(999999);
    expect(embedded.desc).toBe("Sonebhadra revised");
  });

  it("cashflow changes land in plan.cashflow_change_list on add/update/delete", async () => {
    const plan: any = await container.plan_list.FindById(plan_id);
    const expense = plan.cashflow_list.find((c: any) => c.category === "e" && c.type === "p");

    const changed = await app.AddCashflowChange({
      user_id: ctx.user_id,
      plan_id,
      category: "e",
      change_type: "f",
      value: 5000,
      cashflow_id: expense._id,
      title: "Life style upgrade",
      desc: "extra spend",
      start_month: 4,
      end_month: 20,
      frequency: "m",
      active: true,
    });
    const change_id = String(changed._id);

    let doc: any = await container.plan_list.FindById(plan_id);
    let embedded_change = doc.cashflow_change_list.find((c: any) => String(c._id) === change_id);
    expect(embedded_change).toBeTruthy();

    await app.UpdateCashflowChange({
      _id: change_id,
      user_id: ctx.user_id,
      category: "e",
      change_type: "f",
      value: 7500,
    });
    doc = await container.plan_list.FindById(plan_id);
    embedded_change = doc.cashflow_change_list.find((c: any) => String(c._id) === change_id);
    expect(embedded_change.value).toBe(7500);

    // delete guard: cannot delete the line while a change exists (either store or embedded)
    await expect(app.DeleteExpense({ id: expense._id })).rejects.toThrow(/cashflow-changes exists/);

    await app.DeleteCashflowChange({ id: change_id });
    doc = await container.plan_list.FindById(plan_id);
    expect(doc.cashflow_change_list.some((c: any) => String(c._id) === change_id)).toBe(false);
    expect(await app.DeleteExpense({ id: expense._id })).toBe(true);
  });
});

describe("cashflowMerge — merge rules", () => {
  const line = (over: any) => ({
    _id: "x",
    category: "e",
    type: "p",
    frequency: "m",
    amount: 100,
    desc: "Monthly expense",
    start_month: 1,
    end_month: 600,
    active: true,
    primary: false,
    ...over,
  });
  const change = (over: any) => ({
    _id: "c1",
    category: "e",
    change_type: "f",
    value: 10,
    title: "Hike",
    desc: "lifestyle",
    start_month: 2,
    end_month: 12,
    frequency: "m",
    active: true,
    ...over,
  });

  it("store wins for shared ids, missing ids appended, deleted ids dropped", () => {
    const plan = {
      cashflow_list: [
        line({ _id: "a", amount: 100, desc: "Expense one" }),
        line({ _id: "b", amount: 200, desc: "Expense two" }),
        line({ _id: "gone", amount: 300, desc: "Expense three" }),
      ],
      cashflow_change_list: [change({ _id: "c1", value: 10 })],
    };
    const merged = MergeStoreIntoPlan(plan, [
      line({ _id: "a", amount: 150, desc: "Expense one" }), // same id → store wins
      line({ _id: "newline", amount: 400, desc: "New store line" }), // missing → appended
      line({ _id: "gone", amount: 300, desc: "Expense three", status: "deleted" }), // deleted → dropped
    ], [
      change({ _id: "c2", value: 20, title: "Bonus", desc: "bonus inc" }), // missing → appended
    ]);

    const ids = merged.cashflow_list.map((c: any) => String(c._id));
    expect(ids).not.toContain("gone");
    expect(merged.cashflow_list.find((c: any) => c._id === "a").amount).toBe(150);
    expect(merged.cashflow_list.find((c: any) => c._id === "newline").amount).toBe(400);
    expect(merged.cashflow_change_list.map((c: any) => String(c._id))).toContain("c2");
    expect(PlanChangedAfterMerge(plan, merged)).toBe(true);
  });

  it("invalid legacy store rows are dropped from the merged plan", () => {
    const plan = {
      cashflow_list: [line({ _id: "a", amount: 100, desc: "Expense one" })],
      cashflow_change_list: [],
    };
    const merged = MergeStoreIntoPlan(plan, [
      { _id: "bad", amount: 999 }, // missing type/category/desc → invalid
    ], []);
    expect(merged.cashflow_list.map((c: any) => String(c._id))).toEqual(["a"]);
    // no-op: nothing valid to merge
    expect(PlanChangedAfterMerge(plan, merged)).toBe(false);
  });

  it("no-op merge reports unchanged", () => {
    const plan = { cashflow_list: [line({ _id: "a", amount: 100, desc: "Expense one" })], cashflow_change_list: [] };
    const merged = MergeStoreIntoPlan(plan, [line({ _id: "a", amount: 100, desc: "Expense one" })], []);
    expect(PlanChangedAfterMerge(plan, merged)).toBe(false);
  });
});

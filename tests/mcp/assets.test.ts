import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signupUser, type TestApp } from "../helpers";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";
import type { ToolContext } from "@/server/mcp/types";
import { AY_RULE_SETS } from "@/server/tax/rules-data";

let t: TestApp;
let ctx: ToolContext;
let plan_id: string;

beforeAll(async () => {
  t = await createTestApp();
  const signed = await signupUser(t.app);
  // the /user/get/profile endpoint strips _id by design — resolve it via the session
  const session = await t.container.session_list.FindByActiveSessionId(signed.session_id);
  if (!session) throw new Error("no session for signed-up user");
  const user_id = session.user_id.toString();
  ctx = { user_id, role: "user" };
  for (const ruleSet of AY_RULE_SETS) {
    await t.container.tax_rule_repo.UpsertRuleSet({ ...ruleSet });
  }
  const created = await callRegistryTool(makeToolRegistry(t.container), ctx, "create_plan", {
    title: "Asset test plan",
    monthly_income: 300000, // 3.6L/mo → income tax is nonzero in every partial FY
    monthly_expense: 60000,
  });
  plan_id = (created as any).data.plan_id || (created as any).data._id;
});

afterAll(async () => {
  await t.stop();
});

const FD_ASSET = {
  title: "HDFC FD",
  asset_class: "fd",
  category: "i",
  principal: 100000,
  purchase_month: 1,
  growth_rate: 0,
  yield_rate: 6.75,
  income_frequency: "q",
  income_mode: "reinvest",
  maturity_month: 12,
};

describe("asset tools", () => {
  it("adds an asset, lists it, and persists it in the plan doc", async () => {
    const add = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_asset", {
      plan_id,
      ...FD_ASSET,
    });
    expect(add.ok).toBe(true);

    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_assets", { plan_id });
    expect(list.ok).toBe(true);
    const asset = (list as any).data.find((a: any) => a.title === "HDFC FD");
    expect(asset).toBeTruthy();
    expect(asset).toMatchObject({ asset_class: "fd", principal: 100000, maturity_month: 12, active: true });

    const plan = await t.container.plan_list.FindById(plan_id);
    expect(plan?.asset_list?.length).toBe(1);
  });

  it("updates an asset and persists the change", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_assets", { plan_id });
    const fd = (list as any).data.find((a: any) => a.title === "HDFC FD");

    const update = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_asset", {
      plan_id,
      asset_id: fd._id,
      yield_rate: 7.25,
      maturity_month: 24,
    });
    expect(update.ok).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_assets", { plan_id });
    const updated = (after as any).data.find((a: any) => a._id === fd._id);
    expect(updated.yield_rate).toBe(7.25);
    expect(updated.maturity_month).toBe(24);
  });

  it("rejects invalid assets and unknown ids with envelopes", async () => {
    const bad = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_asset", {
      plan_id,
      title: "Bad",
      asset_class: "bitcoin",
      category: "i",
      principal: 100,
      purchase_month: 1,
      growth_rate: 5,
    });
    expect(bad.ok).toBe(false);
    expect((bad as any).error.message).toContain("asset_class");

    const missing = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_asset", {
      plan_id,
      asset_id: "does-not-exist",
      yield_rate: 5,
    });
    expect(missing.ok).toBe(false);
    expect((missing as any).error.message).toContain("asset not found");
  });

  it("deletes an asset", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_assets", { plan_id });
    const fd = (list as any).data.find((a: any) => a.title === "HDFC FD");

    const del = await callRegistryTool(makeToolRegistry(t.container), ctx, "delete_asset", {
      plan_id,
      asset_id: fd._id,
    });
    expect(del.ok).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_assets", { plan_id });
    expect((after as any).data.length).toBe(0);
  });
});

describe("update_tax_settings + snapshot integration", () => {
  it("persists tax settings and plan_snapshot emits the auto Income Tax expense", async () => {
    const set = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_tax_settings", {
      plan_id,
      regime: "new",
      income_tax_enabled: true,
      age_group: "below60",
    });
    expect(set.ok).toBe(true);

    const snapshot = await callRegistryTool(makeToolRegistry(t.container), ctx, "plan_snapshot", {
      plan_id,
      duration: 12,
    });
    const snap = (snapshot as any).data;
    // plan starts at the current date → one FY holds 8 months, the other 4.
    // The 8-month FY sees 8 × 3L = 24L income → taxable 23.25L → slab tax 2,81,250
    // + 4% cess = ₹2,92,500/yr → ₹36,562.5/mo. The 4-month FY sees 12L → fully rebated → no rows.
    expect(snap.tax_expense_cashflow).toHaveLength(8);
    expect(snap.tax_expense_cashflow[0].amount).toBeCloseTo(292500 / 8, 0);
    expect(snap.cashflow.expense_statement[0].total_expense).toBeGreaterThan(90000);

    // disable again so later tests are unaffected
    await callRegistryTool(makeToolRegistry(t.container), ctx, "update_tax_settings", {
      plan_id,
      income_tax_enabled: false,
    });
  });
});

describe("import_networth_assets", () => {
  it("seeds plan assets from a seeded net-worth snapshot, skipping existing classes", async () => {
    // fake a connected IndMoney link + snapshot
    const addLink = await t.container.networth_repo.AddLink({
      user_id: ctx.user_id,
      provider: "indmoney",
      connected_at: Date.now(),
      last_sync_at: Date.now(),
    });
    const addSnap = await t.container.networth_repo.AddSnapshot({
      user_id: ctx.user_id,
      provider: "indmoney",
      as_of: new Date().toISOString(),
      snapshot: {
        total_net_worth: 1200000,
        total_assets: 1200000,
        total_liabilities: 0,
        invested: 1000000,
        unrealized_pnl: 200000,
        as_of: new Date().toISOString(),
        allocation: [
          { asset_class: "Indian Stocks", value: 600000, invested: 500000, pnl: 100000, pnl_pct: 20 },
          { asset_class: "Fixed Deposits", value: 300000, invested: 290000, pnl: 10000, pnl_pct: 3.45 },
          { asset_class: "Gold", value: 200000, invested: 180000, pnl: 20000, pnl_pct: 11.1 },
          { asset_class: "Loan", value: -650000, invested: -650000, pnl: 0, pnl_pct: 0 },
        ],
      },
    });
    expect(addLink.success).toBe(true);
    expect(addSnap.success).toBe(true);

    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "import_networth_assets", { plan_id });
    if (!res.ok) throw new Error("IMPORT FAILED: " + JSON.stringify(res));
    expect(res.ok).toBe(true);
    const { added, skipped } = (res as any).data;
    expect(added.map((a: any) => a.asset_class).sort()).toEqual(["equity", "fd", "gold"]);
    expect(skipped).toEqual([]);

    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_assets", { plan_id });
    const assets = (list as any).data;
    const equity = assets.find((a: any) => a.asset_class === "equity");
    expect(equity).toBeTruthy();
    expect(equity.principal).toBe(600000);
    expect(equity.jurisdiction).toBe("in");

    // second import skips everything (classes already present)
    const again = await callRegistryTool(makeToolRegistry(t.container), ctx, "import_networth_assets", { plan_id });
    expect((again as any).data.added).toEqual([]);
    expect((again as any).data.skipped.sort()).toEqual(["equity", "fd", "gold"]);
  });
});

describe("asset simulate patches", () => {
  it("add_asset patches (nested + flat) project into the snapshot with bucket_growth", async () => {
    const sim = await callRegistryTool(makeToolRegistry(t.container), ctx, "simulate_plan", {
      plan_id,
      duration: 12,
      patches: [
        {
          op: "add_asset",
          asset: {
            title: "Gold", asset_class: "gold", category: "i", principal: 200000,
            purchase_month: 1, growth_rate: 8.5,
          },
        },
        { op: "add_asset", title: "FD", asset_class: "fd", category: "i", principal: 100000, purchase_month: 1, growth_rate: 0, yield_rate: 6.75, income_frequency: "q", income_mode: "reinvest", maturity_month: 12 },
      ],
    });
    expect(sim.ok).toBe(true);
    const snap = (sim as any).data.snapshot;
    expect(snap.asset_summary.total_value).toBeGreaterThan(300000);
    expect(snap.asset_summary.by_class.gold).toBeTruthy();
    expect(snap.asset_summary.by_class.fd).toBeTruthy();
    // derived e/s/i blended growth is populated for the i bucket
    expect(snap.bucket_growth.i.value).toBeGreaterThan(300000);
    expect(snap.bucket_growth.i.growth_rate).toBeGreaterThan(0);
  });

  it("sell_asset patch realizes an LTCG tax transaction", async () => {
    const add = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_asset", {
      plan_id,
      title: "Gold",
      asset_class: "gold",
      category: "i",
      principal: 200000,
      purchase_month: 1,
      growth_rate: 8.5,
    });
    expect(add.ok).toBe(true);
    const asset = ((await callRegistryTool(makeToolRegistry(t.container), ctx, "list_assets", { plan_id })) as any).data.find((a: any) => a.title === "Gold");

    const sim = await callRegistryTool(makeToolRegistry(t.container), ctx, "simulate_plan", {
      plan_id,
      duration: 40,
      patches: [{ op: "sell_asset", asset_id: asset._id, month: 37 }],
    });
    expect(sim.ok).toBe(true);
    const txns = (sim as any).data.snapshot.account_balances_and_transactions.transaction_list;
    expect(txns.some((tx: any) => tx.tran_desc === "Sale - Gold")).toBe(true);
    expect(txns.some((tx: any) => tx.tran_desc.startsWith("LTCG tax - Gold"))).toBe(true);

    // cleanup
    await callRegistryTool(makeToolRegistry(t.container), ctx, "delete_asset", { plan_id, asset_id: asset._id });
  });

  it("set_salary patch updates the salary line; auto income tax follows the slabs", async () => {
    const sim = await callRegistryTool(makeToolRegistry(t.container), ctx, "simulate_plan", {
      plan_id,
      duration: 12,
      patches: [
        { op: "update_tax_settings", income_tax_enabled: true, regime: "new" },
        { op: "set_salary", amount: 250000 },
      ],
    });
    expect(sim.ok).toBe(true);
    const snap = (sim as any).data.snapshot;
    const month1 = snap.cashflow.income_statement[0];
    expect(month1.total_income).toBe(250000);
    // 8-month FY: 8 × 2.5L = 20L → taxable 19.25L → slab tax 1,85,000 + 4% cess
    // = ₹1,92,400/yr → ₹24,050/mo tax expense
    expect(snap.cashflow.expense_statement[0].total_expense).toBeGreaterThan(80000);
    expect(snap.tax_expense_cashflow.length).toBe(8);
    expect(snap.tax_expense_cashflow[0].amount).toBeCloseTo(192400 / 8, 0);
  });

  it("update_asset patch merges changes into the persisted asset", async () => {
    const add = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_asset", {
      plan_id,
      title: "Nifty",
      asset_class: "equity",
      category: "i",
      principal: 500000,
      purchase_month: 1,
      growth_rate: 12,
    });
    const asset = ((await callRegistryTool(makeToolRegistry(t.container), ctx, "list_assets", { plan_id })) as any).data.find((a: any) => a.title === "Nifty");

    const sim = await callRegistryTool(makeToolRegistry(t.container), ctx, "simulate_plan", {
      plan_id,
      duration: 12,
      patches: [{ op: "update_asset", asset_id: asset._id, growth_rate: 8 }],
    });
    expect(sim.ok).toBe(true);

    // cleanup
    await callRegistryTool(makeToolRegistry(t.container), ctx, "delete_asset", { plan_id, asset_id: asset._id });
    expect(add.ok).toBe(true);
  });
});

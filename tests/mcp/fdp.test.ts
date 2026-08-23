import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signupUser, type TestApp } from "../helpers";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";
import type { ToolContext } from "@/server/mcp/types";

let t: TestApp;
let ctx: ToolContext;
let plan_id: string;

beforeAll(async () => {
  t = await createTestApp();
  const { user } = await signupUser(t.app);
  ctx = { user_id: user._id };
  const created = await callRegistryTool(makeToolRegistry(t.container), ctx, "create_plan", {
    title: "FDP test plan",
    monthly_income: 200000,
    monthly_expense: 60000,
  });
  plan_id = (created as any).data.plan_id || (created as any).data._id;
});

afterAll(async () => {
  await t.stop();
});

describe("fdp tools", () => {
  it("adds an allocation strategy and shows it in list_fdp (and in the persisted plan)", async () => {
    const add = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_fdp", {
      plan_id,
      start_month: 6,
      end_month: 24,
      s: 20,
      e: 30,
      i: 50,
    });
    expect(add.ok).toBe(true);

    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_fdp", {
      plan_id,
    });
    expect(list.ok).toBe(true);
    const fdps = (list as any).data;
    const fdp = fdps.find((f: any) => f.start_month === 6);
    expect(fdp).toBeTruthy();
    expect(fdp).toMatchObject({ start_month: 6, end_month: 24, s: 20, e: 30, i: 50, active: true });
    expect(typeof fdp._id).toBe("string");

    const plan = await t.container.plan_list.FindById(plan_id);
    expect(plan?.fund_distribution_percentage?.length).toBe(1);
  });

  it("updates a strategy's percentages and range, and persists it", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_fdp", {
      plan_id,
    });
    const fdp = (list as any).data.find((f: any) => f.start_month === 6);

    const update = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_fdp", {
      plan_id,
      fdp_id: fdp._id,
      s: 40,
      e: 20,
      i: 40,
      end_month: 30,
      active: false,
    });
    expect(update.ok).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_fdp", {
      plan_id,
    });
    const updated = (after as any).data.find((f: any) => f._id === fdp._id);
    expect(updated).toMatchObject({ s: 40, e: 20, i: 40, end_month: 30, active: false });
  });

  it("rejects partial percentage updates that break the 100 sum", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_fdp", {
      plan_id,
    });
    const fdp = (list as any).data.find((f: any) => f._id);

    const bad = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_fdp", {
      plan_id,
      fdp_id: fdp._id,
      s: 60, // 60 + 20 + 40 = 120
    });
    expect(bad.ok).toBe(false);
    expect((bad as any).error.message).toContain("should be 100");

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_fdp", {
      plan_id,
    });
    const unchanged = (after as any).data.find((f: any) => f._id === fdp._id);
    expect(unchanged.s).toBe(40);
  });

  it("rejects invalid additions (sum != 100) and unknown ids with envelopes", async () => {
    const bad = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_fdp", {
      plan_id,
      start_month: 1,
      end_month: 5,
      s: 10,
      e: 10,
      i: 10, // sums to 30
    });
    expect(bad.ok).toBe(false);
    expect((bad as any).error.message).toContain("should be 100");

    const missing = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_fdp", {
      plan_id,
      fdp_id: "does-not-exist",
      s: 20,
      e: 30,
      i: 50,
    });
    expect(missing.ok).toBe(false);
    expect((missing as any).error.message).toContain("fdp not found");
  });

  it("deletes a strategy; the engine then falls back to auto-computed defaults", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_fdp", {
      plan_id,
    });
    const fdp = (list as any).data[0];

    const del = await callRegistryTool(makeToolRegistry(t.container), ctx, "delete_fdp", {
      plan_id,
      fdp_id: fdp._id,
    });
    expect(del.ok).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_fdp", {
      plan_id,
    });
    expect((after as any).data.some((f: any) => f._id === fdp._id)).toBe(false);

    const delMissing = await callRegistryTool(makeToolRegistry(t.container), ctx, "delete_fdp", {
      plan_id,
      fdp_id: fdp._id,
    });
    expect(delMissing.ok).toBe(false);
    expect((delMissing as any).error.message).toContain("fdp not found");
  });

  it("reflects a custom strategy in plan_snapshot's FDP_month_map with strategy 'Custom'", async () => {
    await callRegistryTool(makeToolRegistry(t.container), ctx, "add_fdp", {
      plan_id,
      start_month: 6,
      end_month: 24,
      s: 20,
      e: 30,
      i: 50,
    });

    const snapshot = await callRegistryTool(makeToolRegistry(t.container), ctx, "plan_snapshot", {
      plan_id,
      duration: 30,
    });
    const map = (snapshot as any).data.account_balances_and_transactions.FDP_month_map;
    expect(map[6]).toMatchObject({ s: 20, e: 30, i: 50, strategy: "Custom" });
    expect(map[24]).toMatchObject({ s: 20, e: 30, i: 50, strategy: "Custom" });
    // Outside the range the engine auto-computes instead of applying "Custom".
    expect(map[30].strategy).not.toBe("Custom");
  });

  it("supports both strategy-style and legacy FD-style add_fdp patches in simulate_plan", async () => {
    const withPercentages = await callRegistryTool(makeToolRegistry(t.container), ctx, "simulate_plan", {
      plan_id,
      duration: 30,
      patches: [
        { op: "add_fdp", fdp: { start_month: 2, end_month: 12, s: 30, e: 20, i: 50 } },
      ],
    });
    expect(withPercentages.ok).toBe(true);
    const map1 = (withPercentages as any).data.snapshot.account_balances_and_transactions.FDP_month_map;
    expect(map1[2]).toMatchObject({ s: 30, e: 20, i: 50, strategy: "Custom" });

    const legacy = await callRegistryTool(makeToolRegistry(t.container), ctx, "simulate_plan", {
      plan_id,
      duration: 30,
      patches: [
        { op: "add_fdp", fdp: { amount: 100000, interest_rate: 7, tenure: 24 } },
      ],
    });
    expect(legacy.ok).toBe(true);
    const map2 = (legacy as any).data.snapshot.account_balances_and_transactions.FDP_month_map;
    expect(map2[5]).toMatchObject({ s: 0, e: 0, i: 100, strategy: "Custom" });

    const badSum = await callRegistryTool(makeToolRegistry(t.container), ctx, "simulate_plan", {
      plan_id,
      patches: [{ op: "add_fdp", fdp: { start_month: 1, end_month: 5, s: 10, e: 10, i: 10 } }],
    });
    expect(badSum.ok).toBe(false);
    expect((badSum as any).error.message).toContain("should be 100");
  });

  it("auto-computes a default strategy when the plan has no persisted fdp", async () => {
    const created = await callRegistryTool(makeToolRegistry(t.container), ctx, "create_plan", {
      title: "FDP empty plan",
      monthly_income: 150000,
      monthly_expense: 50000,
    });
    const empty_plan_id = (created as any).data.plan_id || (created as any).data._id;

    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_fdp", {
      plan_id: empty_plan_id,
    });
    expect((list as any).data.length).toBe(0);

    const snapshot = await callRegistryTool(makeToolRegistry(t.container), ctx, "plan_snapshot", {
      plan_id: empty_plan_id,
      duration: 12,
    });
    const map = (snapshot as any).data.account_balances_and_transactions.FDP_month_map;
    expect(map[1].strategy).toBeTruthy();
    expect(map[1].strategy).not.toBe("Custom");
  });
});

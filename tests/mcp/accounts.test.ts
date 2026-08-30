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
    title: "Account test plan",
    monthly_income: 200000,
    monthly_expense: 60000,
  });
  plan_id = (created as any).data.plan_id || (created as any).data._id;
});

afterAll(async () => {
  await t.stop();
});

describe("account tools", () => {
  it("lists the seeded accounts (savings/emergency/investment)", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    expect(list.ok).toBe(true);
    const accounts = (list as any).data;
    expect(accounts.length).toBeGreaterThanOrEqual(3);
    const cats = accounts.map((a: any) => a.category);
    expect(cats).toContain("s");
    expect(cats).toContain("e");
    expect(cats).toContain("i");
  });

  it("updates an account's roi (annual interest %) and persists it", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const investment = (list as any).data.find((a: any) => a.category === "i");
    expect(investment).toBeTruthy();

    const update = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_account", {
      plan_id,
      account_id: investment._id,
      roi: 8,
    });
    expect(update.ok).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const updated = (after as any).data.find((a: any) => a._id === investment._id);
    expect(updated.roi).toBe(8);
  });

  it("persists a starting balance change via update_account (init_balance)", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const investment = (list as any).data.find((a: any) => a.category === "i");

    const update = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_account", {
      plan_id,
      account_id: investment._id,
      init_balance: 3688000,
      title: "Investment (real net worth)",
    });
    expect(update.ok).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const updated = (after as any).data.find((a: any) => a._id === investment._id);
    expect(updated.init_balance).toBe(3688000);
    expect(updated.title).toBe("Investment (real net worth)");
  });

  it("persists init_balance = 0 (regression: falsy values must not be dropped)", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const investment = (list as any).data.find((a: any) => a.category === "i");

    const initBalanceTxnOf = (snap: any) => {
      const month1 = (snap as any).data.balance_and_transaction_by_month.find(
        (m: any) => m.month === 1
      );
      const entry = (month1?.data || []).find((d: any) => (d.balance || []).some((b: any) => b.category === "i"));
      return (entry?.txn || []).find((t: any) => t.tran_desc === "Initial Balance")?.amount;
    };
    const snapBefore = await callRegistryTool(makeToolRegistry(t.container), ctx, "plan_snapshot", {
      plan_id,
    });
    expect(initBalanceTxnOf(snapBefore)).toBe(3688000);

    const update = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_account", {
      plan_id,
      account_id: investment._id,
      init_balance: 0,
    });
    expect(update.ok).toBe(true);
    expect((update as any).data?.updated).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const updated = (after as any).data.find((a: any) => a._id === investment._id);
    expect(updated.init_balance).toBe(0);

    const snapAfter = await callRegistryTool(makeToolRegistry(t.container), ctx, "plan_snapshot", {
      plan_id,
    });
    expect(initBalanceTxnOf(snapAfter)).toBe(0);
  });

  it("patches only the target account — sibling accounts keep their fields untouched", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const savings = (list as any).data.find((a: any) => a.category === "s");
    const investment = (list as any).data.find((a: any) => a.category === "i");
    const emergencyBefore = (list as any).data.find((a: any) => a.category === "e");

    const update = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_account", {
      plan_id,
      account_id: savings._id,
      init_balance: 222000,
    });
    expect(update.ok).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const updatedSavings = (after as any).data.find((a: any) => a._id === savings._id);
    const investmentAfter = (after as any).data.find((a: any) => a._id === investment._id);
    const emergencyAfter = (after as any).data.find((a: any) => a._id === emergencyBefore._id);
    expect(updatedSavings.init_balance).toBe(222000);
    expect(investmentAfter.init_balance).toBe(investment.init_balance);
    expect(emergencyAfter.init_balance).toBe(emergencyBefore.init_balance);
  });

  it("adds a new account and shows it in list_accounts", async () => {
    const add = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_account", {
      plan_id,
      title: "Gold fund",
      init_balance: 500000,
      category: "i",
      type: "a",
      roi: 6,
    });
    expect(add.ok).toBe(true);

    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const gold = (list as any).data.find((a: any) => a.title === "Gold fund");
    expect(gold).toBeTruthy();
    expect(gold.roi).toBe(6);
  });

  it("rejects invalid account updates (validation via MakeAccount)", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const investment = (list as any).data.find((a: any) => a.category === "i");

    const bad = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_account", {
      plan_id,
      account_id: investment._id,
      title: "ab", // too short — web-app validation
    });
    expect(bad.ok).toBe(false);
    expect((bad as any).error.code).toBe("VALIDATION_FAILED");
  });

  it("deletes an account", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    const gold = (list as any).data.find((a: any) => a.title === "Gold fund");
    expect(gold).toBeTruthy();

    const del = await callRegistryTool(makeToolRegistry(t.container), ctx, "delete_account", {
      plan_id,
      account_id: gold._id,
    });
    expect(del.ok).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_accounts", {
      plan_id,
    });
    expect((after as any).data.find((a: any) => a._id === gold._id)).toBeUndefined();
  });
});

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
    title: "Loan test plan",
    monthly_income: 200000,
    monthly_expense: 60000,
  });
  plan_id = (created as any).data.plan_id || (created as any).data._id;
});

afterAll(async () => {
  await t.stop();
});

describe("loan tools", () => {
  it("adds a loan and shows it in list_loans", async () => {
    const add = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_loan", {
      plan_id,
      title: "Home loan",
      principal_amount: 6500000,
      interest_rate: 8,
      start_month: 24,
      end_month: 360,
      deposit_to_bank: true,
    });
    expect(add.ok).toBe(true);

    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_loans", {
      plan_id,
    });
    expect(list.ok).toBe(true);
    const loans = (list as any).data;
    const loan = loans.find((l: any) => l.title === "Home loan");
    expect(loan).toBeTruthy();
    expect(loan.principal_amount).toBe(6500000);
    expect(loan.deposit_to_bank).toBe(true);
  });

  it("updates a loan (deposit_to_bank off) and persists it", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_loans", {
      plan_id,
    });
    const loan = (list as any).data.find((l: any) => l.title === "Home loan");

    const update = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_loan", {
      plan_id,
      loan_id: loan._id,
      deposit_to_bank: false,
      interest_rate: 9,
    });
    expect(update.ok).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_loans", {
      plan_id,
    });
    const updated = (after as any).data.find((l: any) => l.title === "Home loan");
    expect(updated.deposit_to_bank).toBe(false);
    expect(updated.interest_rate).toBe(9);
  });

  it("deletes a loan", async () => {
    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_loans", {
      plan_id,
    });
    const loan = (list as any).data.find((l: any) => l.title === "Home loan");

    const del = await callRegistryTool(makeToolRegistry(t.container), ctx, "delete_loan", {
      plan_id,
      loan_id: loan._id,
    });
    expect(del.ok).toBe(true);

    const after = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_loans", {
      plan_id,
    });
    expect((after as any).data.some((l: any) => l.title === "Home loan")).toBe(false);
  });

  it("rejects invalid loans and unknown ids with envelopes", async () => {
    const bad = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_loan", {
      plan_id,
      principal_amount: 500000,
      interest_rate: 8,
      start_month: 30,
      end_month: 10, // end before start
    });
    expect(bad.ok).toBe(false);
    expect((bad as any).error.message).toContain("end month");

    const missing = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_loan", {
      plan_id,
      loan_id: "does-not-exist",
      deposit_to_bank: false,
    });
    expect(missing.ok).toBe(false);
    expect((missing as any).error.message).toContain("loan not found");
  });
});

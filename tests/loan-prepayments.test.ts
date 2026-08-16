import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signupUser, type TestApp } from "./helpers";
import { makeToolRegistry, callRegistryTool } from "@/server/mcp/registry";
import type { ToolContext } from "@/server/mcp/types";
import {
  ComputeLoanEMI,
  ComputeLoanAmortizationSchedule,
  ComputeLoanAmortizationScheduleWithPrepayments,
  ComputePrepaymentAmounts,
  ComputeRefinanceAnalysis,
  MakeLoanObject,
} from "@/server/engine/loan";

describe("ComputePrepaymentAmounts", () => {
  it("expands a one-time lump to a single month", () => {
    expect(ComputePrepaymentAmounts([{ start_month: 6, amount: 100000, frequency: null }])).toEqual({ 6: 100000 });
  });

  it("expands a monthly schedule without step-up", () => {
    const map = ComputePrepaymentAmounts([{ start_month: 3, amount: 5000, frequency: "m" }], 1, 6);
    expect(map[3]).toBe(5000);
    expect(map[4]).toBe(5000);
    expect(map[6]).toBe(5000);
    expect(map[2]).toBeUndefined();
  });

  it("compounds step-up every period", () => {
    const map = ComputePrepaymentAmounts([{ start_month: 12, amount: 10000, frequency: "y", step_pct: 10 }], 1, 48);
    expect(map[12]).toBe(10000);
    expect(map[24]).toBeCloseTo(11000);
    expect(map[36]).toBeCloseTo(12100);
    expect(map[48]).toBeCloseTo(13310);
    expect(map[11]).toBeUndefined();
  });

  it("quarterly frequency pays every 3 months", () => {
    const map = ComputePrepaymentAmounts([{ start_month: 1, amount: 20000, frequency: "q" }], 1, 10);
    expect(map[1]).toBe(20000);
    expect(map[4]).toBe(20000);
    expect(map[7]).toBe(20000);
    expect(map[10]).toBe(20000);
    expect(map[2]).toBeUndefined();
  });

  it("monthly payments with a yearly step-up (step_frequency y)", () => {
    const map = ComputePrepaymentAmounts([{ start_month: 1, amount: 25000, frequency: "m", step_pct: 10, step_frequency: "y" }], 1, 26);
    expect(map[1]).toBe(25000);
    expect(map[2]).toBe(25000);
    expect(map[13]).toBeCloseTo(27500);
    expect(map[14]).toBeCloseTo(27500);
    expect(map[25]).toBeCloseTo(30250);
  });

  it("combines multiple schedules on the same month", () => {
    const map = ComputePrepaymentAmounts([
      { start_month: 5, amount: 5000, frequency: null },
      { start_month: 5, amount: 7000, frequency: null },
    ]);
    expect(map[5]).toBe(12000);
  });
});

describe("ComputeLoanAmortizationScheduleWithPrepayments", () => {
  it("matches the plain schedule when there are no prepayments", () => {
    const plain = ComputeLoanAmortizationSchedule(1000000, 9, 60);
    const with_prepay = ComputeLoanAmortizationScheduleWithPrepayments(1000000, 9, 60, []);
    expect(with_prepay.payoff_month).toBe(60);
    expect(with_prepay.schedule.length).toBe(60);
    expect(with_prepay.schedule[59].total_interest_paid).toBeCloseTo(plain[59].total_interest_paid, 2);
    expect(with_prepay.interest_saved).toBe(0);
  });

  it("shortens the loan when prepayments exceed the EMI", () => {
    const result = ComputeLoanAmortizationScheduleWithPrepayments(1000000, 9, 60, [
      { start_month: 24, amount: 200000, frequency: null },
    ]);
    expect(result.payoff_month).toBeLessThan(60);
    expect(result.schedule.length).toBe(result.payoff_month);
    expect(result.schedule[result.payoff_month - 1].closing_balance).toBeLessThanOrEqual(0.005);
    expect(result.interest_saved).toBeGreaterThan(0);
    expect(result.total_prepaid).toBeCloseTo(200000, 2);
  });

  it("never lets the balance go negative", () => {
    const result = ComputeLoanAmortizationScheduleWithPrepayments(100000, 12, 24, [
      { start_month: 5, amount: 500000, frequency: null },
    ]);
    const balances = result.schedule.map((row: any) => row.closing_balance);
    expect(Math.min(...balances)).toBeGreaterThanOrEqual(-0.005);
    expect(result.total_prepaid).toBeLessThanOrEqual(100000);
  });

  it("monthly recurring prepayments shorten far more than one-time", () => {
    const one_time = ComputeLoanAmortizationScheduleWithPrepayments(5000000, 8, 240, [
      { start_month: 60, amount: 25000, frequency: "m" },
    ]);
    expect(one_time.payoff_month).toBeLessThan(240);
    expect(one_time.schedule.some((row: any) => row.prepayment === 25000)).toBe(true);
  });
});

describe("ComputeRefinanceAnalysis", () => {
  const base = { amount: 5000000, interest_rate: 9, tenure: 240, refinance_month: 120, new_rate: 7, new_tenure: 120 };

  it("computes the outstanding balance at the refinance month", () => {
    const plain = ComputeLoanAmortizationSchedule(base.amount, base.interest_rate, base.tenure);
    const analysis = ComputeRefinanceAnalysis(base);
    expect(analysis.refinance_month).toBe(120);
    expect(analysis.outstanding_balance).toBeCloseTo(plain[118].closing_balance, 2);
  });

  it("saves interest when the new rate is lower", () => {
    const analysis = ComputeRefinanceAnalysis(base);
    expect(analysis.new_emi).toBeLessThan(analysis.old_emi);
    expect(analysis.interest_saved).toBeGreaterThan(0);
  });

  it("reports a loss and no breakeven when the new rate is higher", () => {
    const analysis = ComputeRefinanceAnalysis({ ...base, new_rate: 15, new_tenure: 240 });
    expect(analysis.interest_saved).toBeLessThan(0);
    expect(analysis.breakeven_months).toBeNull();
  });

  it("accounts for a foreclosure charge", () => {
    const analysis = ComputeRefinanceAnalysis({ ...base, foreclosure_charge: 50000 });
    expect(analysis.net_savings).toBe(analysis.interest_saved - 50000);
    expect(analysis.breakeven_months).toBeGreaterThan(0);
  });
});

describe("MakeLoanObject prepayments", () => {
  it("carries prepayments on the built loan", () => {
    const built = MakeLoanObject({
      title: "Car loan",
      principal_amount: 500000,
      interest_rate: 10,
      start_month: 6,
      end_month: 66,
      type: 2,
      prepayments: [{ start_month: 24, amount: 50000, frequency: "y", step_pct: 5 }],
    });
    expect(built.success).toBe(true);
    expect(built.result?.prepayments).toEqual([
      { start_month: 24, amount: 50000, frequency: "y", step_pct: 5 },
    ]);
  });
});

describe("loan manager MCP integration", () => {
  let t: TestApp;
  let ctx: ToolContext;
  let plan_id: string;
  let home_loan_id: string;

  beforeAll(async () => {
    t = await createTestApp();
    const { user } = await signupUser(t.app);
    ctx = { user_id: user._id };
    const registry = makeToolRegistry(t.container);
    const created = await callRegistryTool(registry, ctx, "create_plan", {
      title: "Prepayment plan",
      monthly_income: 300000,
      monthly_expense: 100000,
    });
    plan_id = (created as any).data.plan_id || (created as any).data._id;
  });

  afterAll(async () => {
    await t.stop();
  });

  it("loan_amortization returns the plain array without prepayments", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "loan_amortization", {
      amount: 1000000,
      interest_rate: 9,
      tenure: 60,
    });
    expect(res.ok).toBe(true);
    expect(Array.isArray((res as any).data)).toBe(true);
  });

  it("loan_amortization with prepayments returns schedule + payoff + interest saved", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "loan_amortization", {
      amount: 6500000,
      interest_rate: 8,
      tenure: 240,
      prepayments: [{ start_month: 40, amount: 25000, frequency: "m", step_pct: 10 }],
    });
    expect(res.ok).toBe(true);
    const data = (res as any).data;
    expect(Array.isArray(data)).toBe(false);
    expect(data.payoff_month).toBeLessThan(240);
    expect(data.interest_saved).toBeGreaterThan(0);
    expect(data.schedule.some((row: any) => row.prepayment > 0)).toBe(true);
  });

  it("loan_refinance returns the what-if analysis", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "loan_refinance", {
      amount: 6500000,
      interest_rate: 8.5,
      tenure: 240,
      refinance_month: 60,
      new_rate: 7,
      new_tenure: 180,
      foreclosure_charge: 65000,
    });
    expect(res.ok).toBe(true);
    expect((res as any).data.outstanding_balance).toBeGreaterThan(0);
    expect((res as any).data.new_emi).toBeGreaterThan(0);
    expect(typeof (res as any).data.breakeven_months).toBe("number");
  });

  it("add_loan persists prepayments", async () => {
    const add = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_loan", {
      plan_id,
      title: "Home loan",
      principal_amount: 6500000,
      interest_rate: 8,
      start_month: 34,
      end_month: 274,
      deposit_to_bank: true,
      prepayments: [{ start_month: 40, amount: 25000, frequency: "y", step_pct: 10 }],
    });
    expect(add.ok).toBe(true);

    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_loans", { plan_id });
    const loan = (list as any).data.find((l: any) => l.title === "Home loan");
    expect(loan.prepayments).toEqual([{ start_month: 40, amount: 25000, frequency: "y", step_pct: 10 }]);
    home_loan_id = loan._id;
  });

  it("update_loan can replace prepayments", async () => {
    const update = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_loan", {
      plan_id,
      loan_id: home_loan_id,
      prepayments: [{ start_month: 48, amount: 30000, frequency: "q", step_pct: 5 }],
    });
    expect(update.ok).toBe(true);

    const list = await callRegistryTool(makeToolRegistry(t.container), ctx, "list_loans", { plan_id });
    const loan = (list as any).data.find((l: any) => l._id === home_loan_id);
    expect(loan.prepayments).toEqual([{ start_month: 48, amount: 30000, frequency: "q", step_pct: 5 }]);

    const cleared = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_loan", {
      plan_id,
      loan_id: home_loan_id,
      prepayments: [],
    });
    expect(cleared.ok).toBe(true);
  });

  it("update_loan rejects malformed prepayments", async () => {
    const update = await callRegistryTool(makeToolRegistry(t.container), ctx, "update_loan", {
      plan_id,
      loan_id: home_loan_id,
      prepayments: [{ start_month: 1, amount: -500 }],
    });
    expect(update.ok).toBe(false);
  });

  it("snapshot reflects prepayments as Prepayment expense rows and shortens the EMI schedule", async () => {
    const add = await callRegistryTool(makeToolRegistry(t.container), ctx, "add_loan", {
      plan_id,
      title: "Prepay Car",
      principal_amount: 800000,
      interest_rate: 10,
      start_month: 12,
      end_month: 72,
      deposit_to_bank: false,
      prepayments: [{ start_month: 24, amount: 100000, frequency: null }],
    });
    expect(add.ok).toBe(true);

    const snap = await callRegistryTool(makeToolRegistry(t.container), ctx, "plan_snapshot", { plan_id, duration: 72 });
    const data = (snap as any).data;
    expect(Array.isArray(data.emi_expense_cashflow)).toBe(true);

    const prepay_rows = data.emi_expense_cashflow.filter(
      (c: any) => c.desc && c.desc.startsWith("Prepayment #") && c.desc.includes("Prepay Car")
    );
    expect(prepay_rows.length).toBe(1);
    expect(prepay_rows[0].amount).toBe(100000);
    expect(prepay_rows[0].start_month).toBe(24);

    const loan = data.loan_account_list.find((l: any) => l.title === "Prepay Car");
    const loan_emis = data.emi_schedule.filter((e: any) => e.loan_id === loan._id);
    expect(loan_emis.length).toBeLessThan(61);
    expect(loan_emis[loan_emis.length - 1].closing_balance).toBeLessThanOrEqual(0.005);

    const expense_statement = data.cashflow.expense_statement;
    const month_24 = expense_statement.find((m: any) => m.month === 24);
    expect(month_24).toBeTruthy();
    const prepay_in_statement = month_24.expense_breakdown.filter((e: any) => e.cashflow_title && e.cashflow_title.startsWith("Prepayment #"));
    expect(prepay_in_statement.length).toBeGreaterThanOrEqual(1);
  });

  it("simulate_plan add_loan patch accepts prepayments", async () => {
    const res = await callRegistryTool(makeToolRegistry(t.container), ctx, "simulate_plan", {
      plan_id,
      duration: 60,
      patches: [
        {
          op: "add_loan",
          loan: {
            amount: 2000000,
            interest_rate: 9,
            tenure: 120,
            start_month: 20,
            deposit_to_bank: false,
            prepayments: [{ start_month: 36, amount: 50000, frequency: "y", step_pct: 10 }],
          },
        },
      ],
    });
    expect(res.ok).toBe(true);
    expect((res as any).data.applied_patches).toHaveLength(1);
    expect(Array.isArray((res as any).data.snapshot.emi_expense_cashflow)).toBe(true);
  });
});
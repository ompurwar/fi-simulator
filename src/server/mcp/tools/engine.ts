/** MCP tools for the plan engine and what-if simulation (doc §8.4). */

import { z } from "zod";
import type { Container } from "../../di/container";
import {
  ComputeLoanAmortizationSchedule,
  ComputeLoanAmortizationScheduleWithPrepayments,
  ComputeRefinanceAnalysis,
} from "../../engine/loan";
import { InvalidOperationError } from "../../domain/errors";
import { ApplyScenarioToPlan } from "../simulate";
import { callUseCase, fail, ok, requireFields, isRecord } from "./envelope";
import type { ToolDefinition } from "../types";

/** Compact projection for token economy — enough to answer runway / net-worth /
 *  milestone questions without shipping the full statements + transactions. */
function toSummary(snapshot: any, milestones = false) {
  const stmt = snapshot.cashflow || { income_statement: [], expense_statement: [] };
  const monthly_totals = stmt.income_statement.map((inc: any, i: number) => ({
    month: inc.month,
    income: inc.total_income,
    expense: stmt.expense_statement[i]?.total_expense,
    net: (inc.total_income ?? 0) - (stmt.expense_statement[i]?.total_expense ?? 0),
  }));
  const balances = (snapshot.account_balances_and_transactions?.account_balances || []).map(
    (b: any) => ({ month: b.month, category: b.category, balance: b.balance })
  );

  if (milestones) {
    // yearly points (m1, 13, 25…) + overall totals — tiny payload for long durations
    const yearly = monthly_totals.filter((t: any) => (t.month - 1) % 12 === 0);
    const balances_yearly = balances.filter((b: any) => (b.month - 1) % 12 === 0);
    return {
      milestone_months: yearly.map((t: any) => t.month),
      income: yearly.map((t: any) => t.income),
      expense: yearly.map((t: any) => t.expense),
      net: yearly.map((t: any) => t.net),
      balances_by_month: balances_yearly,
      totals: {
        income: monthly_totals.reduce((s: number, t: any) => s + (t.income || 0), 0),
        expense: monthly_totals.reduce((s: number, t: any) => s + (t.expense || 0), 0),
        net: monthly_totals.reduce((s: number, t: any) => s + (t.net || 0), 0),
      },
    };
  }

  return {
    monthly_totals,
    net_cashflow: snapshot.net_cashflow || [],
    balances_by_month: balances,
    loan_account_list: snapshot.loan_account_list || [],
    fund_distribution_percentage_list: snapshot.fund_distribution_percentage_list || [],
  };
}

export function makeEngineTools(container: Container): ToolDefinition[] {
  const { app, plan_list } = container;

  return [
    {
      name: "plan_snapshot",
      title: "Compute a plan's financial snapshot",
      description:
        "Read-only projection of a plan: monthly income/expense statements, net cashflow, account balances and transactions, EMI schedules, and fund-distribution balances. Pass summary=true for a compact view (monthly totals + balances only) — prefer it unless you need the full statements. Use it to see where a plan stands today.",
      inputSchema: {
        plan_id: z.string(),
        duration: z.number().optional(),
        summary: z.boolean().optional(),
        milestones: z.boolean().optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await plan_list.FindById(args.plan_id);
          if (!plan) throw new InvalidOperationError(`plan not found: ${args.plan_id}`);
          const snapshot = await app.PlanSnapshot({ plan, duration: args.duration });
          return args.summary ? toSummary(snapshot, args.milestones === true) : snapshot;
        });
      },
    },
    {
      name: "simulate_plan",
      title: "Run a what-if scenario on a plan",
      description:
        "Applies an ordered list of scenario patches to a DEEP COPY of the plan (never persisted) and returns the resulting snapshot plus applied_patches. Pass plan_id to load the plan server-side (preferred — never paste plan_json); plan_json is accepted for portability. Pass summary=true for the compact view; add milestones=true for long durations to get yearly points + totals instead of every month. Patches support add_income, add_expense, add_cashflow_change, add_loan, update_loan (loan_id plus any of title, principal_amount, interest_rate, start_month, end_month, deposit_to_bank, type, ref_id, prepayments), add_fdp and set_account_balance — nested ({\"op\":\"add_cashflow_change\",\"change\":{...}}) and flat ({cashflow_id,value,start_month,...}) forms are both accepted; the op is inferred from the fields.",
      inputSchema: {
        plan_id: z.string().optional(),
        plan_json: z.record(z.string(), z.any()).optional(),
        patches: z.array(z.record(z.string(), z.any())).optional(),
        duration: z.number().optional(),
        summary: z.boolean().optional(),
        milestones: z.boolean().optional(),
      },
      async handler(_ctx, args) {
        const patches = Array.isArray(args.patches) ? args.patches : [];
        const has_id = typeof args.plan_id === "string" && args.plan_id.length > 0;
        const has_json = isRecord(args.plan_json);
        if (!has_id && !has_json)
          return fail("VALIDATION_FAILED", "provide exactly one of plan_id or plan_json");
        if (has_id && has_json)
          return fail("VALIDATION_FAILED", "provide exactly one of plan_id or plan_json");
        return callUseCase(async () => {
          const plan = has_id
            ? await plan_list.FindById(args.plan_id)
            : args.plan_json;
          if (!plan) throw new InvalidOperationError(`plan not found: ${args.plan_id}`);
          const patched = ApplyScenarioToPlan(plan, patches);
          const snapshot = await app.PlanSnapshot({ plan: patched, duration: args.duration });
          return { snapshot: args.summary ? toSummary(snapshot, args.milestones === true) : snapshot, applied_patches: patches };
        });
      },
    },
    {
      name: "loan_amortization",
      title: "Compute a loan amortization schedule",
      description:
        "Pure calculation of EMI and a month-by-month amortization schedule for a loan of amount at annual interest_rate over tenure months. Returns opening/closing balance, interest, principal and running totals per month. Pass optional prepayments to model extra principal payments beyond the EMI (each {start_month, amount, frequency: 'm'|'q'|'y'|null, step_pct?} — null frequency = one-time lump, step_pct = % the amount grows by each recurrence): the EMI stays constant, the loan shortens, and the result becomes { schedule, payoff_month, total_interest_paid, total_prepaid, interest_saved } instead of a plain array. NOTE: here start_month is loan-relative (1 = the loan's first EMI month); on a persisted loan the same fields are plan-absolute months.",
      inputSchema: {
        amount: z.number(),
        interest_rate: z.number(),
        tenure: z.number(),
        prepayments: z
          .array(
            z.object({
              start_month: z.number().int().min(1),
              amount: z.number().positive(),
              frequency: z.enum(["m", "q", "y"]).nullable().optional(),
              step_pct: z.number().min(0).optional(),
              step_frequency: z.enum(["m", "q", "y"]).nullable().optional(),
              desc: z.string().optional(),
            })
          )
          .optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["amount", "interest_rate", "tenure"]);
        if (missing) return missing;
        const { amount, interest_rate, tenure, prepayments } = args;
        if (
          typeof amount !== "number" ||
          !isFinite(amount) ||
          typeof interest_rate !== "number" ||
          !isFinite(interest_rate) ||
          typeof tenure !== "number" ||
          !isFinite(tenure) ||
          tenure < 1
        )
          return fail(
            "VALIDATION_FAILED",
            "amount, interest_rate and tenure must be finite numbers (tenure >= 1)"
          );
        if (prepayments && prepayments.length > 0) {
          const result = ComputeLoanAmortizationScheduleWithPrepayments(amount, interest_rate, tenure, prepayments);
          return ok(result);
        }
        return ok(ComputeLoanAmortizationSchedule(amount, interest_rate, tenure));
      },
    },
    {
      name: "loan_refinance",
      title: "Analyze refinancing a loan at a new rate",
      description:
        "Pure what-if: closes the loan at refinance_month (outstanding balance settled) and restarts it at new_rate over new_tenure months. Returns outstanding balance, old vs new EMI, remaining interest vs new total interest, interest_saved, net_savings (after optional foreclosure_charge) and breakeven_months (null when the new EMI is not lower). Read-only — to persist, update the old loan's end_month and add the new loan.",
      inputSchema: {
        amount: z.number().positive(),
        interest_rate: z.number().min(0),
        tenure: z.number().int().min(1),
        refinance_month: z.number().int().min(1),
        new_rate: z.number().min(0),
        new_tenure: z.number().int().min(1),
        foreclosure_charge: z.number().min(0).optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, [
          "amount",
          "interest_rate",
          "tenure",
          "refinance_month",
          "new_rate",
          "new_tenure",
        ]);
        if (missing) return missing;
        return ok(
          ComputeRefinanceAnalysis({
            amount: args.amount,
            interest_rate: args.interest_rate,
            tenure: args.tenure,
            refinance_month: args.refinance_month,
            new_rate: args.new_rate,
            new_tenure: args.new_tenure,
            foreclosure_charge: args.foreclosure_charge ?? 0,
          })
        );
      },
    },
  ];
}

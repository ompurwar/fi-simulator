/** MCP tools for the plan engine and what-if simulation (doc §8.4). */

import { z } from "zod";
import type { Container } from "../../di/container";
import { ComputeLoanAmortizationSchedule } from "../../engine/loan";
import { InvalidOperationError } from "../../domain/errors";
import { ApplyScenarioToPlan } from "../simulate";
import { callUseCase, fail, ok, requireFields, isRecord } from "./envelope";
import type { ToolDefinition } from "../types";

/** Compact projection for token economy — enough to answer runway / net-worth /
 *  milestone questions without shipping the full statements + transactions. */
function toSummary(snapshot: any) {
  const stmt = snapshot.cashflow || { income_statement: [], expense_statement: [] };
  const monthly_totals = stmt.income_statement.map((inc: any, i: number) => ({
    month: inc.month,
    income: inc.total_income,
    expense: stmt.expense_statement[i]?.total_expense,
    net: (inc.total_income ?? 0) - (stmt.expense_statement[i]?.total_expense ?? 0),
  }));
  return {
    monthly_totals,
    net_cashflow: snapshot.net_cashflow || [],
    balances_by_month: (snapshot.account_balances_and_transactions?.account_balances || []).map(
      (b: any) => ({ month: b.month, category: b.category, balance: b.balance })
    ),
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
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await plan_list.FindById(args.plan_id);
          if (!plan) throw new InvalidOperationError(`plan not found: ${args.plan_id}`);
          const snapshot = await app.PlanSnapshot({ plan, duration: args.duration });
          return args.summary ? toSummary(snapshot) : snapshot;
        });
      },
    },
    {
      name: "simulate_plan",
      title: "Run a what-if scenario on a plan",
      description:
        "Applies an ordered list of scenario patches to a DEEP COPY of the plan (never persisted) and returns the resulting snapshot plus applied_patches. Pass plan_id to load the plan server-side (preferred — never paste plan_json); plan_json is accepted for portability. Pass summary=true for the compact view. Patches support add_income, add_expense, add_cashflow_change, add_loan, add_fdp and set_account_balance.",
      inputSchema: {
        plan_id: z.string().optional(),
        plan_json: z.record(z.string(), z.any()).optional(),
        patches: z.array(z.record(z.string(), z.any())).optional(),
        duration: z.number().optional(),
        summary: z.boolean().optional(),
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
          return { snapshot: args.summary ? toSummary(snapshot) : snapshot, applied_patches: patches };
        });
      },
    },
    {
      name: "loan_amortization",
      title: "Compute a loan amortization schedule",
      description:
        "Pure calculation of EMI and a month-by-month amortization schedule for a loan of amount at annual interest_rate over tenure months. Returns opening/closing balance, interest, principal and running totals per month.",
      inputSchema: {
        amount: z.number(),
        interest_rate: z.number(),
        tenure: z.number(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["amount", "interest_rate", "tenure"]);
        if (missing) return missing;
        const { amount, interest_rate, tenure } = args;
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
        return ok(ComputeLoanAmortizationSchedule(amount, interest_rate, tenure));
      },
    },
  ];
}

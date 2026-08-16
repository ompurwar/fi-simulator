/** MCP tools for the plan engine and what-if simulation (doc §8.4). */

import { z } from "zod";
import type { Container } from "../../di/container";
import { ComputeLoanAmortizationSchedule } from "../../engine/loan";
import { InvalidOperationError } from "../../domain/errors";
import { ApplyScenarioToPlan } from "../simulate";
import { callUseCase, fail, ok, requireFields, isRecord } from "./envelope";
import type { ToolDefinition } from "../types";

export function makeEngineTools(container: Container): ToolDefinition[] {
  const { app, plan_list } = container;

  return [
    {
      name: "plan_snapshot",
      title: "Compute a plan's financial snapshot",
      description:
        "Read-only projection of a plan: monthly income/expense statements, net cashflow, account balances and transactions, EMI schedules, and fund-distribution balances. Use it to see where a plan stands today.",
      inputSchema: {
        plan_id: z.string(),
        duration: z.number().optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await plan_list.FindById(args.plan_id);
          if (!plan) throw new InvalidOperationError(`plan not found: ${args.plan_id}`);
          return app.PlanSnapshot({ plan, duration: args.duration });
        });
      },
    },
    {
      name: "simulate_plan",
      title: "Run a what-if scenario on a plan",
      description:
        "Applies an ordered list of scenario patches to a deep copy of plan_json (never persisted) and returns the resulting snapshot plus applied_patches. Patches support add_income, add_expense, add_cashflow_change, add_loan, add_fdp and set_account_balance. Pass the plan from get_plan as plan_json.",
      inputSchema: {
        plan_json: z.record(z.string(), z.any()),
        patches: z.array(z.record(z.string(), z.any())).optional(),
        duration: z.number().optional(),
      },
      async handler(_ctx, args) {
        if (!isRecord(args.plan_json))
          return fail("VALIDATION_FAILED", "plan_json must be an object");
        const patches = Array.isArray(args.patches) ? args.patches : [];
        return callUseCase(async () => {
          const patched = ApplyScenarioToPlan(args.plan_json, patches);
          const snapshot = await app.PlanSnapshot({ plan: patched, duration: args.duration });
          return { snapshot, applied_patches: patches };
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

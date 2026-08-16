/** MCP tools for loan accounts (doc §8.7). */

import { z } from "zod";
import type { Container } from "../../di/container";
import { InvalidOperationError } from "../../domain/errors";
import { MakeLoanObject } from "../../engine/loan";
import { callUseCase, fail, ok, requireFields, planToPlain } from "./envelope";
import type { ToolDefinition } from "../types";

const LOAN_EDITABLE = [
  "title",
  "principal_amount",
  "interest_rate",
  "start_month",
  "end_month",
  "deposit_to_bank",
  "type",
  "ref_id",
] as const;

export function makeLoanTools(container: Container): ToolDefinition[] {
  const { app, plan_list } = container;

  async function getPlan(plan_id: string): Promise<any> {
    const plan: any = await plan_list.FindById(plan_id);
    if (!plan) throw new InvalidOperationError(`plan not found: ${plan_id}`);
    return plan;
  }

  return [
    {
      name: "list_loans",
      title: "List a plan's loans",
      description:
        "Returns the loan accounts of the plan with plan_id: title, principal_amount, interest_rate, start/end month and deposit_to_bank. Empty array when the plan has no loans.",
      inputSchema: { plan_id: z.string() },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        const plan = await getPlan(args.plan_id);
        return ok((plan.loan_accounts || []).map((l: any) => ({ ...l })));
      },
    },
    {
      name: "add_loan",
      title: "Add a loan to a plan",
      description:
        "Persists a new loan on the plan: principal_amount, interest_rate (annual %), start_month, end_month (= start_month + tenure months) and optional title, type (1 home, 2 car, 3 personal, 4 credit card, 5 other) and deposit_to_bank. deposit_to_bank true credits the principal into the bank account at start_month (disbursement); set it false when the money is already accounted for. Persists immediately.",
      inputSchema: {
        plan_id: z.string(),
        title: z.string().optional(),
        principal_amount: z.number().positive(),
        interest_rate: z.number().min(0),
        start_month: z.number().int().min(1),
        end_month: z.number().int().min(1),
        type: z.number().int().min(1).max(5).optional(),
        deposit_to_bank: z.boolean().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, [
          "plan_id",
          "principal_amount",
          "interest_rate",
          "start_month",
          "end_month",
        ]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const built = MakeLoanObject({
            principal_amount: args.principal_amount,
            title: args.title ?? "Loan",
            start_month: args.start_month,
            end_month: args.end_month,
            interest_rate: args.interest_rate,
            type: args.type ?? 5,
            ref_id: null,
            deposit_to_bank: args.deposit_to_bank ?? false,
          });
          if (!built.success || !built.result) {
            throw new InvalidOperationError(built.message || "invalid loan parameters");
          }
          const loan = built.result;
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            loan_accounts: [...(plan.loan_accounts || []), loan],
          });
        });
      },
    },
    {
      name: "update_loan",
      title: "Update a plan's loan",
      description:
        "Patches the loan with loan_id on the plan. changes may include title, principal_amount, interest_rate, start_month, end_month, deposit_to_bank, type or ref_id; omitted fields keep their current values. Persists immediately.",
      inputSchema: {
        plan_id: z.string(),
        loan_id: z.string(),
        title: z.string().optional(),
        principal_amount: z.number().positive().optional(),
        interest_rate: z.number().min(0).optional(),
        start_month: z.number().int().min(1).optional(),
        end_month: z.number().int().min(1).optional(),
        deposit_to_bank: z.boolean().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id", "loan_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const loans = (plan.loan_accounts || []).map((l: any) => ({ ...l }));
          const target = loans.find((l: any) => String(l._id) === String(args.loan_id));
          if (!target) throw new InvalidOperationError(`loan not found: ${args.loan_id}`);
          for (const key of LOAN_EDITABLE) {
            const value = (args as any)[key];
            if (value !== undefined) target[key] = value;
          }
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            loan_accounts: loans,
          });
        });
      },
    },
    {
      name: "delete_loan",
      title: "Delete a plan's loan",
      description:
        "Removes the loan with loan_id from the plan, including its EMI expense and any disbursement credit. Persists immediately.",
      inputSchema: { plan_id: z.string(), loan_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id", "loan_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const loans = (plan.loan_accounts || []).filter(
            (l: any) => String(l._id) !== String(args.loan_id)
          );
          if (loans.length === (plan.loan_accounts || []).length) {
            throw new InvalidOperationError(`loan not found: ${args.loan_id}`);
          }
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            loan_accounts: loans,
          });
        });
      },
    },
  ];
}

/** MCP tools for income and expense cashflows (doc §8.2). */

import { z } from "zod";
import type { Container } from "../../di/container";
import { InvalidOperationError } from "../../domain/errors";
import { callUseCase, fail, requireFields, isRecord } from "./envelope";
import type { ToolDefinition } from "../types";

/** Normalize type/frequency/end_month so the result always satisfies MakeCashFlow. */
function normalizeCashflowArgs(args: Record<string, any>) {
  const type = args.type ?? "p";
  const start_month = args.start_month;
  const isOnetime = type === "o";
  return {
    type,
    frequency: isOnetime ? null : args.frequency ?? "m",
    start_month,
    end_month: isOnetime ? start_month : args.end_month ?? start_month,
    amount: args.amount,
    desc: args.desc,
  };
}

const CASHFLOW_CHANGE_KEYS = [
  "desc",
  "amount",
  "start_month",
  "end_month",
  "frequency",
  "type",
] as const;

function buildCashflowTools(container: Container, category: "i" | "e") {
  const { app, cashflow_list } = container;
  const listName = category === "i" ? "list_income" : "list_expense";
  const addName = category === "i" ? "add_income" : "add_expense";
  const updateName = category === "i" ? "update_income" : "update_expense";
  const deleteName = category === "i" ? "delete_income" : "delete_expense";
  const title = category === "i" ? "Income" : "Expense";

  const useCase = {
    list: category === "i" ? app.GetIncome : app.GetExpense,
    add: category === "i" ? app.AddIncome : app.AddExpense,
    update: category === "i" ? app.UpdateIncome : app.UpdateExpense,
    delete: category === "i" ? app.DeleteIncome : app.DeleteExpense,
  };

  return [
    {
      name: listName,
      title: `List ${title.toLowerCase()} lines`,
      description: `Returns the ${title.toLowerCase()} cashflows of the plan with plan_id for the current user. Each line includes amount, frequency, start/end month and category.`,
      inputSchema: { plan_id: z.string() },
      async handler(ctx: any, args: Record<string, any>) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(() =>
          useCase.list({ plan_id: args.plan_id, user_id: ctx.user_id })
        );
      },
    },
    {
      name: addName,
      title: `Add an ${title.toLowerCase()} line`,
      description: `Persists a new ${title.toLowerCase()} cashflow to the plan. desc and amount are required; frequency defaults to monthly ("m") and end_month defaults to start_month, so a recurring line persists from start_month onwards unless you pass an explicit end_month.`,
      inputSchema: {
        plan_id: z.string(),
        desc: z.string(),
        amount: z.number(),
        start_month: z.number(),
        end_month: z.number().optional(),
        frequency: z.string().optional(),
        type: z.string().optional(),
      },
      async handler(ctx: any, args: Record<string, any>) {
        const missing = requireFields(args, ["plan_id", "desc", "amount", "start_month"]);
        if (missing) return missing;
        const normalized = normalizeCashflowArgs(args);
        return callUseCase(() =>
          useCase.add({
            user_id: ctx.user_id,
            plan_id: args.plan_id,
            ...normalized,
            active: true,
            primary: false,
          })
        );
      },
    },
    {
      name: updateName,
      title: `Update an ${title.toLowerCase()} line`,
      description: `Patches the ${title.toLowerCase()} cashflow with income_id/expense_id. changes may include desc, amount, start_month, end_month, frequency or type; omitted fields keep their current values.`,
      inputSchema: {
        income_id: z.string().optional(),
        expense_id: z.string().optional(),
        changes: z.record(z.string(), z.any()),
      },
      async handler(ctx: any, args: Record<string, any>) {
        const id = args.income_id ?? args.expense_id;
        const missing = requireFields({ id, changes: args.changes }, ["id", "changes"]);
        if (missing) return missing;
        if (!isRecord(args.changes))
          return fail("VALIDATION_FAILED", "changes must be an object");
        return callUseCase(async () => {
          const existing: any = await cashflow_list.FindById(id);
          if (!existing) throw new InvalidOperationError(`cashflow not found: ${id}`);
          const merged: Record<string, any> = { ...existing };
          for (const key of CASHFLOW_CHANGE_KEYS) {
            if (args.changes[key] !== undefined) merged[key] = args.changes[key];
          }
          const normalized = normalizeCashflowArgs(merged);
          return useCase.update({
            _id: id,
            plan_id: merged.plan_id,
            user_id: ctx.user_id,
            type: normalized.type,
            frequency: normalized.frequency,
            amount: normalized.amount,
            desc: normalized.desc,
            start_month: normalized.start_month,
            end_month: normalized.end_month,
            // UpdateIncome/UpdateExpense validate active/primary via MakeCashFlow
            // even though the repo call ignores them.
            active: merged.active ?? true,
            primary: merged.primary ?? false,
          });
        });
      },
    },
    {
      name: deleteName,
      title: `Delete an ${title.toLowerCase()} line`,
      description: `Deletes the ${title.toLowerCase()} cashflow with income_id/expense_id. Fails if cashflow changes are still attached to the line — remove those first.`,
      inputSchema: {
        income_id: z.string().optional(),
        expense_id: z.string().optional(),
      },
      async handler(_ctx: any, args: Record<string, any>) {
        const id = args.income_id ?? args.expense_id;
        const missing = requireFields({ id }, ["id"]);
        if (missing) return missing;
        return callUseCase(() => useCase.delete({ id }));
      },
    },
  ] as ToolDefinition[];
}

export function makeCashflowTools(container: Container): ToolDefinition[] {
  return [
    ...buildCashflowTools(container, "i"),
    ...buildCashflowTools(container, "e"),
  ];
}

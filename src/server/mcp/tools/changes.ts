/** MCP tools for cashflow changes — hikes, bonuses, inflation (doc §8.3). */

import { z } from "zod";
import type { Container } from "../../di/container";
import { InvalidOperationError } from "../../domain/errors";
import { callUseCase, fail, requireFields, isRecord } from "./envelope";
import type { ToolDefinition } from "../types";

const CHANGE_FIELDS = [
  "change_category",
  "change_type",
  "value",
  "start_month",
  "end_month",
  "change_desc",
] as const;

function toUseCaseChange(args: Record<string, any>, merged: Record<string, any>) {
  return {
    category: merged.change_category ?? merged.category ?? args.change_category,
    change_type: merged.change_type ?? args.change_type ?? "f",
    value: merged.value ?? args.value,
    start_month: merged.start_month ?? args.start_month,
    end_month: merged.end_month ?? merged.start_month ?? args.start_month,
    frequency: merged.frequency ?? "m",
    title: merged.title ?? merged.change_desc ?? args.change_desc ?? "cashflow change",
    desc: merged.desc ?? merged.change_desc ?? args.change_desc ?? "",
    active: true,
  };
}

export function makeChangeTools(container: Container): ToolDefinition[] {
  const { app, plan_list, cashflow_list, cashflow_change_list } = container;

  return [
    {
      name: "list_cashflow_changes",
      title: "List cashflow changes of a plan",
      description:
        "Returns all cashflow changes (hikes, bonuses, inflation adjustments) attached to the cashflows of the plan with plan_id. The repository has no plan-scoped query, so changes are collected per cashflow.",
      inputSchema: { plan_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan: any = await plan_list.FindById(args.plan_id);
          if (!plan) throw new InvalidOperationError(`plan not found: ${args.plan_id}`);
          const [income_list, expense_list] = await Promise.all([
            app.GetIncome({ plan_id: args.plan_id, user_id: ctx.user_id }),
            app.GetExpense({ plan_id: args.plan_id, user_id: ctx.user_id }),
          ]);
          const changes: any[] = [];
          for (const cashflow of [...income_list, ...expense_list]) {
            const list = await app.GetCashflowChanges({ cashflow_id: cashflow._id });
            changes.push(...list);
          }
          return changes;
        });
      },
    },
    {
      name: "add_cashflow_change",
      title: "Add a cashflow change",
      description:
        "Persists a change (e.g. a 10% hike) to an existing cashflow. cashflow_id, change_category (i|e), value and start_month are required. change_type defaults to flat (f); percentage (p) caps value at 100.",
      inputSchema: {
        cashflow_id: z.string(),
        change_desc: z.string().optional(),
        value: z.number(),
        start_month: z.number(),
        change_category: z.string(),
        change_type: z.string().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, [
          "cashflow_id",
          "value",
          "start_month",
          "change_category",
        ]);
        if (missing) return missing;
        return callUseCase(() =>
          app.AddCashflowChange({
            user_id: ctx.user_id,
            cashflow_id: args.cashflow_id,
            ...toUseCaseChange(args, {}),
          })
        );
      },
    },
    {
      name: "update_cashflow_change",
      title: "Update a cashflow change",
      description:
        "Patches the cashflow change with change_id. changes may include change_category, change_type, value, start_month, end_month or change_desc; omitted fields keep their current values.",
      inputSchema: {
        change_id: z.string(),
        changes: z.record(z.string(), z.any()),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["change_id", "changes"]);
        if (missing) return missing;
        if (!isRecord(args.changes))
          return fail("VALIDATION_FAILED", "changes must be an object");
        return callUseCase(async () => {
          const existing: any = await cashflow_change_list.FindById(args.change_id);
          if (!existing)
            throw new InvalidOperationError(`cashflow change not found: ${args.change_id}`);
          const merged: Record<string, any> = { ...existing };
          for (const key of CHANGE_FIELDS) {
            if (args.changes[key] !== undefined) merged[key] = args.changes[key];
          }
          return app.UpdateCashflowChange({
            _id: args.change_id,
            user_id: ctx.user_id,
            ...toUseCaseChange(args, merged),
          });
        });
      },
    },
    {
      name: "delete_cashflow_change",
      title: "Delete a cashflow change",
      description:
        "Soft-deletes the cashflow change with change_id so it no longer affects the plan's projected cashflows.",
      inputSchema: { change_id: z.string() },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["change_id"]);
        if (missing) return missing;
        return callUseCase(() => app.DeleteCashflowChange({ id: args.change_id }));
      },
    },
  ];
}

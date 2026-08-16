/** MCP tools for cashflow changes — hikes, bonuses, inflation (doc §8.3). */

import { z } from "zod";
import type { Container } from "../../di/container";
import { InvalidOperationError } from "../../domain/errors";
import { MakeCashFlowChange } from "../../domain/entities";
import { callUseCase, fail, requireFields, isRecord, ok } from "./envelope";
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
    // args win over merged (fresh adds) — previously args.end_month/frequency
    // were silently dropped, storing "m / end=start" for every change.
    end_month:
      args.end_month ?? merged.end_month ?? merged.start_month ?? args.start_month,
    frequency: args.frequency ?? merged.frequency ?? "m",
    title: merged.title ?? merged.change_desc ?? args.change_desc ?? "cashflow change",
    desc: merged.desc ?? merged.change_desc ?? args.change_desc ?? "",
    active: true,
  };
}

export function makeChangeTools(container: Container): ToolDefinition[] {
  const { app, plan_list, cashflow_list, cashflow_change_list } = container;

  async function getPlan(plan_id: string): Promise<any> {
    const plan: any = await plan_list.FindById(plan_id);
    if (!plan) throw new InvalidOperationError(`plan not found: ${plan_id}`);
    return plan;
  }

  /** Find a cashflow line inside the plan document by id. */
  function findLine(plan: any, cashflow_id: string) {
    return (plan.cashflow_list || []).find((c: any) => String(c._id) === String(cashflow_id));
  }

  return [
    {
      name: "list_cashflow_changes",
      title: "List cashflow changes of a plan",
      description:
        "Returns the cashflow changes (hikes, bonuses, inflation adjustments) attached to the plan with plan_id. Reads the plan document's cashflow_change_list first (the source the engine uses); falls back to the per-cashflow store query for lines registered outside the plan doc.",
      inputSchema: { plan_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        const plan = await getPlan(args.plan_id);
        const embedded = plan.cashflow_change_list || [];
        if (embedded.length > 0) return ok(embedded);
        return callUseCase(async () => {
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
        "Persists a change (e.g. a 10% hike) to a cashflow line of the plan. cashflow_id, change_category (i|e), value and start_month are required. Pass plan_id to attach the change to a line embedded in the plan document (the web-onboarding model); without it, store-registered lines are used. REPLACES any existing change on the same line at the same start_month (the engine applies only the first) — a new hike at month 24 overrides the old one. change_type defaults to flat (f); percentage (p) caps value at 100.",
      inputSchema: {
        plan_id: z.string().optional(),
        cashflow_id: z.string(),
        change_desc: z.string().optional(),
        value: z.number(),
        start_month: z.number(),
        change_category: z.string(),
        change_type: z.string().optional(),
        end_month: z.number().optional(),
        frequency: z.string().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, [
          "cashflow_id",
          "value",
          "start_month",
          "change_category",
        ]);
        if (missing) return missing;
        if (args.plan_id) {
          const plan = await getPlan(args.plan_id);
          if (findLine(plan, args.cashflow_id)) {
            // Plan-document path: works for lines embedded in the plan (the model
            // the web onboarding uses) — the engine reads cashflow_change_list.
            // The engine applies only the FIRST change per (line, start_month);
            // replace same-month changes so a new hike wins instead of being
            // silently shadowed by an older one.
            return callUseCase(async () => {
              const change = MakeCashFlowChange({
                user_id: ctx.user_id,
                cashflow_id: args.cashflow_id,
                ...toUseCaseChange(args, {}),
              });
              const sameMonth = (plan.cashflow_change_list || []).filter(
                (x: any) =>
                  String(x.cashflow_id) === String(args.cashflow_id) &&
                  x.start_month === args.start_month &&
                  x.category === (args.change_category ?? change.category)
              );
              const remaining = (plan.cashflow_change_list || []).filter(
                (x: any) => !sameMonth.includes(x)
              );
              return app.UpdatePlan({
                _id: args.plan_id,
                user_id: ctx.user_id,
                ...plan,
                cashflow_change_list: [...remaining, change],
              });
            });
          }
        }
        // Store path fallback for store-registered lines.
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
        "Patches the cashflow change with change_id. Pass plan_id to target changes embedded in the plan document; otherwise the store is used. changes may include change_category, change_type, value, start_month, end_month or change_desc; omitted fields keep their current values.",
      inputSchema: {
        plan_id: z.string().optional(),
        change_id: z.string(),
        changes: z.record(z.string(), z.any()),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["change_id", "changes"]);
        if (missing) return missing;
        if (!isRecord(args.changes))
          return fail("VALIDATION_FAILED", "changes must be an object");

        if (args.plan_id) {
          const plan = await getPlan(args.plan_id);
          const target = (plan.cashflow_change_list || []).find(
            (c: any) => String(c._id) === String(args.change_id)
          );
          if (target) {
            return callUseCase(async () => {
              const merged: Record<string, any> = { ...target };
              for (const key of CHANGE_FIELDS) {
                if (args.changes[key] !== undefined) merged[key] = args.changes[key];
              }
              const updated = MakeCashFlowChange({
                ...merged,
                ...toUseCaseChange(args, merged),
                user_id: ctx.user_id,
              });
              return app.UpdatePlan({
                _id: args.plan_id,
                user_id: ctx.user_id,
                ...plan,
                cashflow_change_list: (plan.cashflow_change_list || []).map((c: any) =>
                  String(c._id) === String(args.change_id) ? updated : c
                ),
              });
            });
          }
        }

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
        "Removes the cashflow change with change_id so it no longer affects the plan's projected cashflows. Pass plan_id to remove a change embedded in the plan document; otherwise the store record is soft-deleted.",
      inputSchema: { plan_id: z.string().optional(), change_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["change_id"]);
        if (missing) return missing;
        if (args.plan_id) {
          const plan = await getPlan(args.plan_id);
          if ((plan.cashflow_change_list || []).some((c: any) => String(c._id) === String(args.change_id))) {
            return callUseCase(() =>
              app.UpdatePlan({
                _id: args.plan_id,
                user_id: ctx.user_id,
                ...plan,
                cashflow_change_list: (plan.cashflow_change_list || []).filter(
                  (c: any) => String(c._id) !== String(args.change_id)
                ),
              })
            );
          }
        }
        return callUseCase(() => app.DeleteCashflowChange({ id: args.change_id }));
      },
    },
  ];
}

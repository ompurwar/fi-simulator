/** MCP tools for fund distribution percentage (FDP) — the web app's FDPEditor/Money Manager equivalent. */

import { z } from "zod";
import type { Container } from "../../di/container";
import { InvalidOperationError } from "../../domain/errors";
import { MakeFundDistributionPercentage } from "../../domain/entities";
import { callUseCase, ok, requireFields } from "./envelope";
import type { ToolDefinition } from "../types";

const FDP_EDITABLE = ["start_month", "end_month", "s", "e", "i", "active"] as const;

export function makeFdpTools(container: Container): ToolDefinition[] {
  const { app, plan_list } = container;

  async function getPlan(plan_id: string): Promise<any> {
    const plan: any = await plan_list.FindById(plan_id);
    if (!plan) throw new InvalidOperationError(`plan not found: ${plan_id}`);
    return plan;
  }

  function sanitize(fdp: any) {
    const out: Record<string, any> = {
      _id: fdp._id,
      start_month: fdp.start_month,
      end_month: fdp.end_month,
      s: fdp.s,
      e: fdp.e,
      i: fdp.i,
    };
    if (fdp.active !== undefined) out.active = fdp.active;
    if (fdp.strategy !== undefined) out.strategy = fdp.strategy;
    return out;
  }

  /** MakeFundDistributionPercentage passes optional fields (active) through as-is;
   *  Mongo stores undefined as null, so drop them before saving. */
  function stripUndefined(fdp: any): any {
    for (const key of Object.keys(fdp)) {
      if (fdp[key] === undefined) delete fdp[key];
    }
    return fdp;
  }

  return [
    {
      name: "list_fdp",
      title: "List a plan's allocation strategies",
      description:
        "Returns the plan's persisted fund-distribution strategies: _id, start_month, end_month, s (savings %), e (emergency %), i (investment %) and active. Each strategy governs how surplus income is split across savings/emergency/investment for the months in its range (s + e + i = 100). Empty array when the plan has no persisted strategy — the engine then auto-computes default strategies (e.g. 'Balanced Growth', 'War Chest'), visible month-by-month in plan_snapshot's account_balances_and_transactions.FDP_month_map.",
      inputSchema: { plan_id: z.string() },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        const plan = await getPlan(args.plan_id);
        return ok((plan.fund_distribution_percentage || []).map(sanitize));
      },
    },
    {
      name: "add_fdp",
      title: "Add an allocation strategy to a plan",
      description:
        "Persists a new fund-distribution strategy on the plan: start_month and end_month bound the months it applies to, and s + e + i (savings/emergency/investment percentages) must sum to exactly 100. active is optional (default true). Overlapping ranges are allowed but only the FIRST strategy covering a month wins in the engine. Persists immediately.",
      inputSchema: {
        plan_id: z.string(),
        start_month: z.number().int().min(1),
        end_month: z.number().int().min(1),
        s: z.number(),
        e: z.number(),
        i: z.number(),
        active: z.boolean().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, [
          "plan_id",
          "start_month",
          "end_month",
          "s",
          "e",
          "i",
        ]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const fdp = MakeFundDistributionPercentage({
            start_month: args.start_month,
            end_month: args.end_month,
            s: args.s,
            e: args.e,
            i: args.i,
            active: args.active ?? true,
          });
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            fund_distribution_percentage: [
              ...(plan.fund_distribution_percentage || []),
              stripUndefined(fdp),
            ],
          });
        });
      },
    },
    {
      name: "update_fdp",
      title: "Update a plan's allocation strategy",
      description:
        "Patches the strategy with fdp_id on the plan. changes may include start_month, end_month, s, e, i or active; omitted fields keep their current values. After merging, s + e + i must still sum to exactly 100 — patch percentages as a consistent triple. Persists immediately.",
      inputSchema: {
        plan_id: z.string(),
        fdp_id: z.string(),
        start_month: z.number().int().min(1).optional(),
        end_month: z.number().int().min(1).optional(),
        s: z.number().optional(),
        e: z.number().optional(),
        i: z.number().optional(),
        active: z.boolean().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id", "fdp_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const fdps = (plan.fund_distribution_percentage || []).map((f: any) => ({ ...f }));
          const target = fdps.find((f: any) => String(f._id) === String(args.fdp_id));
          if (!target) throw new InvalidOperationError(`fdp not found: ${args.fdp_id}`);
          for (const key of FDP_EDITABLE) {
            const value = (args as any)[key];
            if (value !== undefined) target[key] = value;
          }
          // Re-validate the merged strategy exactly like the web app does.
          const validated = MakeFundDistributionPercentage(target);
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            fund_distribution_percentage: fdps.map((f: any) =>
              String(f._id) === String(args.fdp_id) ? stripUndefined(validated) : f
            ),
          });
        });
      },
    },
    {
      name: "delete_fdp",
      title: "Delete a plan's allocation strategy",
      description:
        "Removes the strategy with fdp_id from the plan. Months the range covered fall back to the engine's auto-computed default strategy. Persists immediately.",
      inputSchema: { plan_id: z.string(), fdp_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id", "fdp_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const fdps = (plan.fund_distribution_percentage || []).filter(
            (f: any) => String(f._id) !== String(args.fdp_id)
          );
          if (fdps.length === (plan.fund_distribution_percentage || []).length) {
            throw new InvalidOperationError(`fdp not found: ${args.fdp_id}`);
          }
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            fund_distribution_percentage: fdps,
          });
        });
      },
    },
  ];
}

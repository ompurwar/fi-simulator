/** MCP tools for plan accounts — the web app's AccountEditor equivalent. */

import { z } from "zod";
import type { Container } from "../../di/container";
import { InvalidOperationError } from "../../domain/errors";
import { MakeAccount } from "../../domain/entities";
import { callUseCase, ok, requireFields } from "./envelope";
import type { ToolDefinition } from "../types";

const ACCOUNT_EDITABLE = [
  "title",
  "init_balance",
  "category",
  "type",
  "default_investment_priority",
  "parent_id",
  "roi",
] as const;

export function makeAccountTools(container: Container): ToolDefinition[] {
  const { app, plan_list } = container;

  async function getPlan(plan_id: string): Promise<any> {
    const plan: any = await plan_list.FindById(plan_id);
    if (!plan) throw new InvalidOperationError(`plan not found: ${plan_id}`);
    return plan;
  }

  function sanitize(account: any) {
    return {
      _id: account._id,
      title: account.title,
      init_balance: account.init_balance,
      category: account.category,
      type: account.type,
      default_investment_priority: account.default_investment_priority,
      parent_id: account.parent_id,
      roi: account.roi,
    };
  }

  /** MakeAccount returns optional fields as undefined keys; Mongo stores them as null,
   *  and MakePlan's read-back validation then rejects null. Drop them before saving. */
  function stripUndefined(account: any): any {
    for (const key of Object.keys(account)) {
      if (account[key] === undefined) delete account[key];
    }
    return account;
  }

  return [
    {
      name: "list_accounts",
      title: "List a plan's accounts",
      description:
        "Returns the accounts of the plan with plan_id: title, category (s savings, e emergency, i investment), type (a asset, l liability), init_balance (starting balance), roi (annual interest % credited yearly) and default_investment_priority.",
      inputSchema: { plan_id: z.string() },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        const plan = await getPlan(args.plan_id);
        return ok((plan.account_list || []).map(sanitize));
      },
    },
    {
      name: "add_account",
      title: "Add an account to a plan",
      description:
        "Persists a new account on the plan: title, init_balance (starting balance), category (s savings, e emergency, i investment), type (a asset, l liability) and optional roi (annual interest % credited yearly to the balance, e.g. 7 for 7%). Persists immediately.",
      inputSchema: {
        plan_id: z.string(),
        title: z.string().min(3).max(100),
        init_balance: z.number(),
        category: z.enum(["s", "e", "i"]),
        type: z.enum(["a", "l"]),
        roi: z.number().min(0).optional(),
        default_investment_priority: z.number().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, [
          "plan_id",
          "title",
          "init_balance",
          "category",
          "type",
        ]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const account = MakeAccount({
            title: args.title,
            init_balance: args.init_balance,
            category: args.category,
            type: args.type,
            roi: args.roi,
            default_investment_priority: args.default_investment_priority,
          });
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            account_list: [...(plan.account_list || []), stripUndefined(account)],
          });
        });
      },
    },
    {
      name: "update_account",
      title: "Update a plan's account",
      description:
        "Patches the account with account_id on the plan. changes may include title, init_balance (starting balance — the engine projects from this), category (s/e/i), type (a/l), roi (annual interest % credited yearly, e.g. 7 for 7%; 0 disables interest) or default_investment_priority; omitted fields keep their current values. Persists immediately — use instead of simulate_plan's temporary set_account_balance when the balance change should stick.",
      inputSchema: {
        plan_id: z.string(),
        account_id: z.string(),
        title: z.string().min(3).max(100).optional(),
        init_balance: z.number().optional(),
        category: z.enum(["s", "e", "i"]).optional(),
        type: z.enum(["a", "l"]).optional(),
        roi: z.number().min(0).optional(),
        default_investment_priority: z.number().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id", "account_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const accounts = (plan.account_list || []).map((a: any) => ({ ...a }));
          const target = accounts.find((a: any) => String(a._id) === String(args.account_id));
          if (!target) throw new InvalidOperationError(`account not found: ${args.account_id}`);
          for (const key of ACCOUNT_EDITABLE) {
            const value = (args as any)[key];
            if (value !== undefined) target[key] = value;
          }
          // Re-validate the merged account exactly like the web app does.
          const validated = MakeAccount(target);
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            account_list: accounts.map((a: any) =>
              String(a._id) === String(args.account_id) ? stripUndefined(validated) : a
            ),
          });
        });
      },
    },
    {
      name: "delete_account",
      title: "Delete a plan's account",
      description:
        "Removes the account with account_id from the plan (its balance history is projected from the remaining accounts). Persists immediately.",
      inputSchema: { plan_id: z.string(), account_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id", "account_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const accounts = (plan.account_list || []).filter(
            (a: any) => String(a._id) !== String(args.account_id)
          );
          if (accounts.length === (plan.account_list || []).length) {
            throw new InvalidOperationError(`account not found: ${args.account_id}`);
          }
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            account_list: accounts,
          });
        });
      },
    },
  ];
}

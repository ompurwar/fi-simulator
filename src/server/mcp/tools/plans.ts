/** MCP tools for identity and plan lifecycle (doc §8.1). */

import { z } from "zod";
import type { Container } from "../../di/container";
import { InvalidOperationError } from "../../domain/errors";
import { callUseCase, fail, ok, requireFields, planToPlain, userToPlain } from "./envelope";
import type { ToolDefinition } from "../types";

export function makePlanTools(container: Container): ToolDefinition[] {
  const { app, plan_list, user_list } = container;

  return [
    {
      name: "whoami",
      title: "Identify the current user",
      description:
        "Returns the authenticated user's profile (id, name, email). Use it to verify which user the session belongs to before operating on plans.",
      inputSchema: {},
      async handler(ctx) {
        return callUseCase(async () =>
          userToPlain(await app.GetUser({ user_id: ctx.user_id }))
        );
      },
    },
    {
      name: "list_plans",
      title: "List the user's plans",
      description:
        "Returns all plans owned by the current user as compact metadata: _id, title, description, is_default and line/loan/account counts. Use get_plan for full detail — do not fetch the full document just to pick a plan.",
      inputSchema: {},
      async handler(ctx) {
        const plans = await plan_list.FindByUserId(ctx.user_id);
        const user = await user_list.FindById(ctx.user_id);
        return ok(
          plans.map((plan: any) => ({
            _id: plan._id?.toString(),
            title: plan.title,
            description: plan.description,
            is_default: plan._id?.toString() === user?.default_plan_id?.toString(),
            income_count: (plan.cashflow_list || []).filter((c: any) => c.category === "i").length,
            expense_count: (plan.cashflow_list || []).filter((c: any) => c.category === "e").length,
            loan_count: (plan.loan_accounts || []).length,
            account_count: (plan.account_list || []).length,
            change_count: (plan.cashflow_change_list || []).length,
          }))
        );
      },
    },
    {
      name: "get_plan",
      title: "Fetch a full plan document",
      description:
        "Returns the complete plan document for plan_id: accounts, cashflows, cashflow changes, loans and fund distribution. The result is safe to pass to simulate_plan as plan_json.",
      inputSchema: { plan_id: z.string() },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        const plan = await plan_list.FindById(args.plan_id);
        if (!plan) return fail("NOT_FOUND", `plan not found: ${args.plan_id}`);
        return ok(planToPlain(plan));
      },
    },
    {
      name: "create_plan",
      title: "Create a new plan",
      description:
        "Creates a plan for the current user with the onboarding defaults: monthly_income and monthly_expense become periodic monthly cashflows and runway seeds the emergency account. title is required; description is optional.",
      inputSchema: {
        title: z.string(),
        description: z.string().optional(),
        monthly_income: z.number().optional(),
        monthly_expense: z.number().optional(),
        runway: z.number().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["title"]);
        if (missing) return missing;
        return callUseCase(() =>
          app.AddPlan({
            user_id: ctx.user_id,
            title: args.title,
            description: args.description,
            monthly_income: args.monthly_income,
            monthly_expense: args.monthly_expense,
            runway: args.runway,
          })
        );
      },
    },
    {
      name: "update_plan",
      title: "Update a plan's fields",
      description:
        "Patches a plan owned by the current user. Pass plan_id plus any of title, description, monthly_income, monthly_expense, runway. Persists changes immediately.",
      inputSchema: {
        plan_id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        monthly_income: z.number().optional(),
        monthly_expense: z.number().optional(),
        runway: z.number().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan: any = await plan_list.FindById(args.plan_id);
          if (!plan) throw new InvalidOperationError(`plan not found: ${args.plan_id}`);
          const changes = {
            title: args.title,
            description: args.description,
            monthly_income: args.monthly_income,
            monthly_expense: args.monthly_expense,
            runway: args.runway,
          };
          const merged = { ...plan };
          for (const [key, value] of Object.entries(changes)) {
            if (value !== undefined) merged[key] = value;
          }
          return app.UpdatePlan({ _id: args.plan_id, user_id: ctx.user_id, ...merged });
        });
      },
    },
    {
      name: "delete_plan",
      title: "Delete a plan",
      description:
        "Soft-deletes the plan with plan_id (status becomes deleted; the document is not physically removed). Returns ok on success.",
      inputSchema: { plan_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(() => app.DeletePlan({ id: args.plan_id }));
      },
    },
    {
      name: "fork_plan",
      title: "Fork a plan",
      description:
        "Copies the plan with plan_id into a new plan owned by the current user (used to branch a scenario). Optionally overrides the title and description.",
      inputSchema: {
        plan_id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(() =>
          app.ForkPlan({
            user_id: ctx.user_id,
            plan_id: args.plan_id,
            title: args.title,
            description: args.description,
          })
        );
      },
    },
    {
      name: "set_default_plan",
      title: "Set the user's default plan",
      description:
        "Marks the plan with plan_id as the current user's default plan (used by the app UI as the initial plan). Rejects plan_ids the user does not own.",
      inputSchema: { plan_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(() =>
          app.SetDefaultPlan({ user_id: ctx.user_id, plan_id: args.plan_id })
        );
      },
    },
  ];
}

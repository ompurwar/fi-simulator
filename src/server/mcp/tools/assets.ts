/** MCP tools for asset classes — the web app's AssetEditor equivalent. */

import { z } from "zod";
import type { Container } from "../../di/container";
import { InvalidOperationError, InvalidPropertyError } from "../../domain/errors";
import { MakeAsset } from "../../domain/entities";
import { BuildAssetsFromNetWorth } from "../../networth";
import { callUseCase, ok, requireFields } from "./envelope";
import type { ToolDefinition } from "../types";

const ASSET_CLASSES = ["fd", "bond", "savings", "gold", "ppf", "equity", "equity_foreign", "mf", "real_estate", "vda"] as const;

const ASSET_EDITABLE = [
  "title",
  "asset_class",
  "category",
  "principal",
  "purchase_month",
  "growth_rate",
  "volatility",
  "yield_rate",
  "income_frequency",
  "income_mode",
  "compounding",
  "maturity_month",
  "sip",
  "funding_account_id",
  "rent",
  "loan_id",
  "jurisdiction",
  "listed",
  "purchase_date",
  "sale_month",
  "active",
] as const;

export function makeAssetTools(container: Container): ToolDefinition[] {
  const { app, plan_list, networth_service, tax_service } = container;

  async function getPlan(plan_id: string): Promise<any> {
    const plan: any = await plan_list.FindById(plan_id);
    if (!plan) throw new InvalidOperationError(`plan not found: ${plan_id}`);
    return plan;
  }

  function sanitize(asset: any) {
    return { ...asset };
  }

  /** MakeAsset passes optional fields through as-is; Mongo stores undefined as null, so drop them. */
  function stripUndefined(obj: any): any {
    for (const key of Object.keys(obj)) {
      if (obj[key] === undefined) delete obj[key];
    }
    return obj;
  }

  return [
    {
      name: "list_assets",
      title: "List a plan's asset classes",
      description:
        "Returns the plan's assets (asset_list): title, asset_class (fd, bond, savings, gold, ppf, equity, equity_foreign, mf, real_estate, vda), category bucket (e/s/i), principal, purchase_month, growth_rate, yield_rate, compounding, maturity_month, sip, rent, jurisdiction and tax-relevant fields. Empty array when the plan has no assets. The engine projects each asset monthly and blends its growth into the e/s/i bucket_growth shown in plan_snapshot.",
      inputSchema: { plan_id: z.string() },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        const plan = await getPlan(args.plan_id);
        return ok((plan.asset_list || []).map(sanitize));
      },
    },
    {
      name: "add_asset",
      title: "Add an asset class to a plan",
      description:
        "Persists a new asset: title, asset_class (fd, bond, savings, gold, ppf, equity, equity_foreign, mf, real_estate, vda), category bucket (e emergency / s savings / i investment), principal (current invested value), purchase_month (plan month) and growth_rate (expected annual appreciation %). Optional: yield_rate + income_frequency (m/q/h/y) + income_mode (credit to the bucket account or reinvest), compounding (monthly/quarterly/yearly), maturity_month (FD/bond tenor end — principal + accrued income credit back), sip {amount, frequency, start_month, end_month?, step_pct?}, rent {monthly_rent, step_pct?, expense_ratio?} for cashflow-generating real estate, funding_account_id, jurisdiction (in/foreign), listed, purchase_date (ISO — gates indexation for property) and loan_id. Prepayments of tax: FD interest past ₹40k/yr attracts TDS 10%; gold/equity/mf/real_estate sales realize LTCG/STCG per the stored tax rules. Persists immediately.",
      inputSchema: {
        plan_id: z.string(),
        title: z.string().min(1).max(100),
        asset_class: z.enum(ASSET_CLASSES),
        category: z.enum(["s", "e", "i"]),
        principal: z.number().min(0),
        purchase_month: z.number().int().min(1),
        growth_rate: z.number().min(0),
        volatility: z.number().min(0).optional(),
        yield_rate: z.number().min(0).optional(),
        income_frequency: z.enum(["m", "q", "h", "y"]).optional(),
        income_mode: z.enum(["credit", "reinvest"]).optional(),
        compounding: z.enum(["none", "simple", "monthly", "quarterly", "yearly"]).optional(),
        maturity_month: z.number().int().min(1).optional(),
        sip: z
          .object({
            amount: z.number().positive(),
            frequency: z.enum(["m", "q", "y"]),
            start_month: z.number().int().min(1),
            end_month: z.number().int().min(1).optional(),
            step_pct: z.number().min(0).optional(),
          })
          .optional(),
        funding_account_id: z.string().optional(),
        rent: z
          .object({
            monthly_rent: z.number().positive(),
            step_pct: z.number().min(0).optional(),
            expense_ratio: z.number().min(0).max(100).optional(),
          })
          .optional(),
        loan_id: z.string().optional(),
        jurisdiction: z.enum(["in", "foreign"]).optional(),
        listed: z.boolean().optional(),
        purchase_date: z.string().optional(),
        active: z.boolean().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id", "title", "asset_class", "category", "principal", "purchase_month", "growth_rate"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const asset = MakeAsset({
            title: args.title,
            asset_class: args.asset_class,
            category: args.category,
            principal: args.principal,
            purchase_month: args.purchase_month,
            growth_rate: args.growth_rate,
            volatility: args.volatility,
            yield_rate: args.yield_rate,
            income_frequency: args.income_frequency,
            income_mode: args.income_mode,
            compounding: args.compounding,
            maturity_month: args.maturity_month,
            sip: args.sip,
            funding_account_id: args.funding_account_id,
            rent: args.rent,
            loan_id: args.loan_id,
            jurisdiction: args.jurisdiction,
            listed: args.listed,
            purchase_date: args.purchase_date,
            active: args.active ?? true,
          });
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            asset_list: [...(plan.asset_list || []), stripUndefined(asset)],
          });
        });
      },
    },
    {
      name: "update_asset",
      title: "Update a plan's asset",
      description:
        "Patches the asset with asset_id on the plan. changes may include title, asset_class, category, principal, purchase_month, growth_rate, volatility, yield_rate, income_frequency, income_mode, compounding, maturity_month, sip, rent, funding_account_id, jurisdiction, purchase_date or sale_month (the month the asset is sold — proceeds credit back and LTCG/STCG is realized per the stored tax rules); omitted fields keep their current values. Pass active: false to freeze an asset out of projections. Persists immediately.",
      inputSchema: {
        plan_id: z.string(),
        asset_id: z.string(),
        title: z.string().min(1).max(100).optional(),
        asset_class: z.enum(ASSET_CLASSES).optional(),
        category: z.enum(["s", "e", "i"]).optional(),
        principal: z.number().min(0).optional(),
        purchase_month: z.number().int().min(1).optional(),
        growth_rate: z.number().min(0).optional(),
        volatility: z.number().min(0).optional(),
        yield_rate: z.number().min(0).optional(),
        income_frequency: z.enum(["m", "q", "h", "y"]).optional(),
        income_mode: z.enum(["credit", "reinvest"]).optional(),
        compounding: z.enum(["none", "simple", "monthly", "quarterly", "yearly"]).optional(),
        maturity_month: z.number().int().min(1).optional(),
        sip: z.record(z.string(), z.any()).optional(),
        funding_account_id: z.string().optional(),
        rent: z.record(z.string(), z.any()).optional(),
        loan_id: z.string().optional(),
        jurisdiction: z.enum(["in", "foreign"]).optional(),
        listed: z.boolean().optional(),
        purchase_date: z.string().optional(),
        sale_month: z.number().int().min(1).optional(),
        active: z.boolean().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id", "asset_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const assets = (plan.asset_list || []).map((a: any) => ({ ...a }));
          const target = assets.find((a: any) => String(a._id) === String(args.asset_id));
          if (!target) throw new InvalidOperationError(`asset not found: ${args.asset_id}`);
          for (const key of ASSET_EDITABLE) {
            const value = (args as any)[key];
            if (value !== undefined) target[key] = value;
          }
          // Re-validate the merged asset exactly like the web app does.
          const validated = MakeAsset(target);
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            asset_list: assets.map((a: any) =>
              String(a._id) === String(args.asset_id) ? stripUndefined(validated) : a
            ),
          });
        });
      },
    },
    {
      name: "delete_asset",
      title: "Delete a plan's asset",
      description:
        "Removes the asset with asset_id from the plan. Persists immediately.",
      inputSchema: { plan_id: z.string(), asset_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id", "asset_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const assets = (plan.asset_list || []).filter(
            (a: any) => String(a._id) !== String(args.asset_id)
          );
          if (assets.length === (plan.asset_list || []).length) {
            throw new InvalidOperationError(`asset not found: ${args.asset_id}`);
          }
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            asset_list: assets,
          });
        });
      },
    },
    {
      name: "update_tax_settings",
      title: "Update a plan's tax settings",
      description:
        "Persists the plan's tax settings used by the engine's automatic Income Tax expense: regime ('new' default or 'old'), income_tax_enabled (auto-deduct monthly slab tax from net cashflow — salary hikes then flow through slabs automatically), age_group (below60/senior/super_senior), deductions {c80, d80, d80_senior_parents, tta, ttb, b24, nps_1b}, salary_structure {basic_annual, hra_annual, rent_annual, metro} for the HRA exemption (old regime only) and backfill_first_fy (default true — when the plan starts mid-financial-year, tax the first FY on the FULL year at month-1 salary; set false to tax only the plan's visible months). Omitted fields keep their current values; pass income_tax_enabled: false to stop auto tax.",
      inputSchema: {
        plan_id: z.string(),
        regime: z.enum(["new", "old"]).optional(),
        income_tax_enabled: z.boolean().optional(),
        age_group: z.enum(["below60", "senior", "super_senior"]).optional(),
        backfill_first_fy: z.boolean().optional(),
        deductions: z.record(z.string(), z.number().min(0)).optional(),
        salary_structure: z
          .object({
            basic_annual: z.number().min(0),
            hra_annual: z.number().min(0),
            rent_annual: z.number().min(0),
            metro: z.boolean(),
          })
          .optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const current = plan.tax_settings || {};
          const merged = {
            regime: args.regime ?? current.regime ?? "new",
            income_tax_enabled: args.income_tax_enabled ?? current.income_tax_enabled ?? false,
            age_group: args.age_group ?? current.age_group ?? "below60",
            ...(args.backfill_first_fy !== undefined
              ? { backfill_first_fy: args.backfill_first_fy }
              : current.backfill_first_fy !== undefined
                ? { backfill_first_fy: current.backfill_first_fy }
                : {}),
            ...(args.deductions !== undefined
              ? { deductions: { ...(current.deductions || {}), ...args.deductions } }
              : current.deductions !== undefined
                ? { deductions: current.deductions }
                : {}),
            ...(args.salary_structure !== undefined ? { salary_structure: args.salary_structure } : current.salary_structure !== undefined ? { salary_structure: current.salary_structure } : {}),
          };
          return app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            tax_settings: merged,
          });
        });
      },
    },
    {
      name: "import_networth_assets",
      title: "Import net-worth holdings as plan assets",
      description:
        "Creates plan assets from the user's latest net-worth snapshot (IndMoney sync): Indian Stocks → equity, Mutual Funds → mf, Fixed Deposits → fd, Gold → gold, Savings & Liquid → savings, US Stocks → equity_foreign, EPF/NPS → ppf (liabilities like loans/credit cards are skipped). Values aggregate per asset class and the growth/yield/volatility defaults come from the PRESETS document. Classes already present in the plan are left untouched. Returns the classes added with their values. Persists immediately.",
      inputSchema: { plan_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await getPlan(args.plan_id);
          const status = await container.networth_service.GetStatus({ user_id: ctx.user_id });
          const snapshot = status?.snapshot;
          if (!snapshot || !Array.isArray(snapshot.allocation)) {
            throw new InvalidOperationError("no net-worth snapshot — connect and sync a provider first (networth_connect_url / networth_sync)");
          }
          const presets = await container.tax_service.getPresets();
          const mapped = BuildAssetsFromNetWorth(snapshot.allocation, presets);

          const existing_classes = new Set((plan.asset_list || []).map((a: any) => a.asset_class));
          const added: any[] = [];
          const skipped: string[] = [];
          const asset_list = [...(plan.asset_list || [])];
          for (const asset of mapped) {
            if (existing_classes.has(asset.asset_class)) {
              skipped.push(asset.asset_class);
              continue;
            }
            asset_list.push(asset);
            existing_classes.add(asset.asset_class);
            added.push({ asset_class: asset.asset_class, principal: asset.principal });
          }
          if (added.length === 0) {
            return { added: [], skipped, message: "no new asset classes to import" };
          }
          await app.UpdatePlan({
            _id: args.plan_id,
            user_id: ctx.user_id,
            ...plan,
            asset_list,
          });
          return { added, skipped };
        });
      },
    },
  ];
}

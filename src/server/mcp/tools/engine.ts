/** MCP tools for the plan engine and what-if simulation (doc §8.4). */

import { z } from "zod";
import type { Container } from "../../di/container";
import {
  ComputeLoanAmortizationSchedule,
  ComputeLoanAmortizationScheduleWithPrepayments,
  ComputeRefinanceAnalysis,
} from "../../engine/loan";
import { ProjectAssetMonths } from "../../engine/assets";
import { MonthToAssessmentYear } from "../../tax/engine";
import { InvalidOperationError } from "../../domain/errors";
import { ApplyScenarioToPlan } from "../simulate";
import { callUseCase, fail, ok, requireFields, isRecord } from "./envelope";
import type { ToolDefinition } from "../types";

/** Compact projection for token economy — enough to answer runway / net-worth /
 *  milestone questions without shipping the full statements + transactions.
 *  Net worth(t) = buckets(t) + assets(t) — the SAME formula the web UI uses,
 *  so agent numbers always match the app. */
function toSummary(snapshot: any, milestones = false) {
  const stmt = snapshot.cashflow || { income_statement: [], expense_statement: [] };
  const monthly_totals = stmt.income_statement.map((inc: any, i: number) => ({
    month: inc.month,
    income: inc.total_income,
    expense: stmt.expense_statement[i]?.total_expense,
    net: (inc.total_income ?? 0) - (stmt.expense_statement[i]?.total_expense ?? 0),
  }));
  const balances = (snapshot.account_balances_and_transactions?.account_balances || []).map(
    (b: any) => ({ month: b.month, category: b.category, balance: b.balance })
  );
  // asset holdings per month (same data as the web UI's asset_month_map)
  const assets_by_month: Record<number, number> = {};
  const asset_map: any = snapshot.asset_month_map || {};
  for (const month of Object.keys(asset_map)) {
    assets_by_month[Number(month)] = ((asset_map[month] as any[]) || []).reduce(
      (s: number, r: any) => s + (r.value || 0),
      0
    );
  }
  // buckets + assets per month — net worth the way the app displays it
  const net_worth_by_month = monthly_totals.map((t: any) => {
    const bucket_total = balances
      .filter((b: any) => b.month === t.month)
      .reduce((s: number, b: any) => s + (b.balance || 0), 0);
    return { month: t.month, net_worth: bucket_total + (assets_by_month[t.month] || 0) };
  });

  if (milestones) {
    // yearly points (m1, 13, 25…) + overall totals — tiny payload for long durations
    const yearly = monthly_totals.filter((t: any) => (t.month - 1) % 12 === 0);
    const balances_yearly = balances.filter((b: any) => (b.month - 1) % 12 === 0);
    const net_worth_yearly = net_worth_by_month.filter((n: any) => (n.month - 1) % 12 === 0);
    return {
      milestone_months: yearly.map((t: any) => t.month),
      income: yearly.map((t: any) => t.income),
      expense: yearly.map((t: any) => t.expense),
      net: yearly.map((t: any) => t.net),
      balances_by_month: balances_yearly,
      assets_by_month: Object.fromEntries(
        Object.entries(assets_by_month).filter(([m]) => (Number(m) - 1) % 12 === 0)
      ),
      net_worth_by_month: net_worth_yearly,
      totals: {
        income: monthly_totals.reduce((s: number, t: any) => s + (t.income || 0), 0),
        expense: monthly_totals.reduce((s: number, t: any) => s + (t.expense || 0), 0),
        net: monthly_totals.reduce((s: number, t: any) => s + (t.net || 0), 0),
      },
    };
  }

  return {
    monthly_totals,
    net_cashflow: snapshot.net_cashflow || [],
    balances_by_month: balances,
    assets_by_month,
    net_worth_by_month,
    loan_account_list: snapshot.loan_account_list || [],
    fund_distribution_percentage_list: snapshot.fund_distribution_percentage_list || [],
  };
}

export function makeEngineTools(container: Container): ToolDefinition[] {
  const { app, plan_list, tax_service } = container;

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
        milestones: z.boolean().optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["plan_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan = await plan_list.FindById(args.plan_id);
          if (!plan) throw new InvalidOperationError(`plan not found: ${args.plan_id}`);
          const snapshot = await app.PlanSnapshot({ plan, duration: args.duration });
          return args.summary ? toSummary(snapshot, args.milestones === true) : snapshot;
        });
      },
    },
    {
      name: "simulate_plan",
      title: "Run a what-if scenario on a plan",
      description:
        "Applies an ordered list of scenario patches to a DEEP COPY of the plan (never persisted) and returns the resulting snapshot plus applied_patches. Pass plan_id to load the plan server-side (preferred — never paste plan_json); plan_json is accepted for portability. Pass summary=true for the compact view; add milestones=true for long durations to get yearly points + totals instead of every month. Patches support add_income, add_expense, add_cashflow_change, add_loan, update_loan (loan_id plus any of title, principal_amount, interest_rate, start_month, end_month, deposit_to_bank, type, ref_id, prepayments), add_fdp (fdp: { start_month, end_month, s, e, i } with s + e + i = 100 — or the legacy { amount, interest_rate, tenure } fixed-deposit shape) and set_account_balance — nested ({\"op\":\"add_cashflow_change\",\"change\":{...}}) and flat ({cashflow_id,value,start_month,...}) forms are both accepted; the op is inferred from the fields.",
      inputSchema: {
        plan_id: z.string().optional(),
        plan_json: z.record(z.string(), z.any()).optional(),
        patches: z.array(z.record(z.string(), z.any())).optional(),
        duration: z.number().optional(),
        summary: z.boolean().optional(),
        milestones: z.boolean().optional(),
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
          return { snapshot: args.summary ? toSummary(snapshot, args.milestones === true) : snapshot, applied_patches: patches };
        });
      },
    },
    {
      name: "loan_amortization",
      title: "Compute a loan amortization schedule",
      description:
        "Pure calculation of EMI and a month-by-month amortization schedule for a loan of amount at annual interest_rate over tenure months. Returns opening/closing balance, interest, principal and running totals per month. Pass optional prepayments to model extra principal payments beyond the EMI (each {start_month, amount, frequency: 'm'|'q'|'y'|null, step_pct?} — null frequency = one-time lump, step_pct = % the amount grows by each recurrence): the EMI stays constant, the loan shortens, and the result becomes { schedule, payoff_month, total_interest_paid, total_prepaid, interest_saved } instead of a plain array. NOTE: here start_month is loan-relative (1 = the loan's first EMI month); on a persisted loan the same fields are plan-absolute months.",
      inputSchema: {
        amount: z.number(),
        interest_rate: z.number(),
        tenure: z.number(),
        prepayments: z
          .array(
            z.object({
              start_month: z.number().int().min(1),
              amount: z.number().positive(),
              frequency: z.enum(["m", "q", "y"]).nullable().optional(),
              step_pct: z.number().min(0).optional(),
              step_frequency: z.enum(["m", "q", "y"]).nullable().optional(),
              desc: z.string().optional(),
            })
          )
          .optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["amount", "interest_rate", "tenure"]);
        if (missing) return missing;
        const { amount, interest_rate, tenure, prepayments } = args;
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
        if (prepayments && prepayments.length > 0) {
          const result = ComputeLoanAmortizationScheduleWithPrepayments(amount, interest_rate, tenure, prepayments);
          return ok(result);
        }
        return ok(ComputeLoanAmortizationSchedule(amount, interest_rate, tenure));
      },
    },
    {
      name: "loan_refinance",
      title: "Analyze refinancing a loan at a new rate",
      description:
        "Pure what-if: closes the loan at refinance_month (outstanding balance settled) and restarts it at new_rate over new_tenure months. Returns outstanding balance, old vs new EMI, remaining interest vs new total interest, interest_saved, net_savings (after optional foreclosure_charge) and breakeven_months (null when the new EMI is not lower). Read-only — to persist, update the old loan's end_month and add the new loan.",
      inputSchema: {
        amount: z.number().positive(),
        interest_rate: z.number().min(0),
        tenure: z.number().int().min(1),
        refinance_month: z.number().int().min(1),
        new_rate: z.number().min(0),
        new_tenure: z.number().int().min(1),
        foreclosure_charge: z.number().min(0).optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, [
          "amount",
          "interest_rate",
          "tenure",
          "refinance_month",
          "new_rate",
          "new_tenure",
        ]);
        if (missing) return missing;
        return ok(
          ComputeRefinanceAnalysis({
            amount: args.amount,
            interest_rate: args.interest_rate,
            tenure: args.tenure,
            refinance_month: args.refinance_month,
            new_rate: args.new_rate,
            new_tenure: args.new_tenure,
            foreclosure_charge: args.foreclosure_charge ?? 0,
          })
        );
      },
    },
    {
      name: "compare_scenarios",
      title: "Compare two what-if scenarios head-to-head",
      description:
        "Projects the plan twice — baseline (current plan, or plan + optional baseline_patches) and scenario (plan + scenario_patches) — using the exact same engine as simulate_plan, and returns a month-by-month net-worth comparison plus yearly totals. net_worth is buckets + asset holdings, matching the app's Net Worth card. Never persists. Great for 'what if I switch to old regime?' or 'what if I sell gold at month 24?' vs today.",
      inputSchema: {
        plan_id: z.string(),
        baseline_patches: z.array(z.record(z.string(), z.any())).optional(),
        scenario_patches: z.array(z.record(z.string(), z.any())).min(1),
        duration: z.number().int().min(1).optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["plan_id", "scenario_patches"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const plan: any = await plan_list.FindById(args.plan_id);
          if (!plan) throw new InvalidOperationError(`plan not found: ${args.plan_id}`);
          const duration = args.duration ?? 120;
          const baseline_plan = ApplyScenarioToPlan(plan, args.baseline_patches || []);
          const scenario_plan = ApplyScenarioToPlan(plan, args.scenario_patches);
          const [baseline_snap, scenario_snap] = await Promise.all([
            app.PlanSnapshot({ plan: baseline_plan, duration }),
            app.PlanSnapshot({ plan: scenario_plan, duration }),
          ]);

          const nw = (snap: any, month: number) => {
            const buckets = (snap.account_balances_and_transactions?.account_balances || [])
              .filter((b: any) => b.month === month)
              .reduce((s: number, b: any) => s + (b.balance || 0), 0);
            const assets = (snap.asset_month_map?.[month] || []).reduce((s: number, a: any) => s + (a.value || 0), 0);
            return { month, net_worth: Math.round((buckets + assets) * 100) / 100 };
          };
          const tax_total = (snap: any) =>
            (snap.tax_expense_cashflow || []).reduce((s: number, r: any) => s + (r.amount || 0), 0);

          const month_points: number[] = [1];
          for (let m = 13; m <= duration; m += 12) month_points.push(m);

          return {
            baseline_patches: args.baseline_patches || [],
            scenario_patches: args.scenario_patches,
            net_worth: month_points.map((m) => {
              const b = nw(baseline_snap, m);
              const s = nw(scenario_snap, m);
              return { month: m, baseline: b.net_worth, scenario: s.net_worth, delta: Math.round((s.net_worth - b.net_worth) * 100) / 100 };
            }),
            totals: {
              baseline: { net_worth_at_end: nw(baseline_snap, duration).net_worth, tax_total: Math.round(tax_total(baseline_snap) * 100) / 100 },
              scenario: { net_worth_at_end: nw(scenario_snap, duration).net_worth, tax_total: Math.round(tax_total(scenario_snap) * 100) / 100 },
            },
          };
        });
      },
    },
    {
      name: "asset_projection",
      title: "Project a single asset month-by-month",
      description:
        "Pure calculator for one asset (no plan needed): monthly value, invested, growth, income and TDS over duration months. Pass asset parameters (principal, growth_rate, yield_rate, income_frequency, income_mode, maturity_month, sale_month, sip) — class presets are NOT applied automatically, so pass explicit rates. TDS on FD interest follows the stored rules for the assessment_year. Returns rows plus closing value and totals.",
      inputSchema: {
        title: z.string().optional(),
        asset_class: z.enum(["fd", "bond", "savings", "gold", "ppf", "equity", "equity_foreign", "mf", "real_estate", "vda"]).optional(),
        category: z.enum(["s", "e", "i"]).optional(),
        principal: z.number().min(0),
        purchase_month: z.number().int().min(1).optional(),
        growth_rate: z.number().min(0),
        yield_rate: z.number().min(0).optional(),
        income_frequency: z.enum(["m", "q", "h", "y"]).optional(),
        income_mode: z.enum(["credit", "reinvest"]).optional(),
        compounding: z.enum(["none", "simple", "monthly", "quarterly", "yearly"]).optional(),
        maturity_month: z.number().int().min(1).optional(),
        sale_month: z.number().int().min(1).optional(),
        rent: z.object({ monthly_rent: z.number().positive(), step_pct: z.number().min(0).optional(), expense_ratio: z.number().min(0).max(100).optional() }).optional(),
        sip: z.object({ amount: z.number().positive(), frequency: z.enum(["m", "q", "y"]), start_month: z.number().int().min(1), end_month: z.number().int().min(1).optional(), step_pct: z.number().min(0).optional() }).optional(),
        duration: z.number().int().min(1).optional(),
        assessment_year: z.string().optional(),
      },
      async handler(_ctx, args) {
        const missing = requireFields(args, ["principal", "growth_rate"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const rules = await tax_service.getRules(args.assessment_year || (await tax_service.rulesForTimestamp(Date.now())).assessment_year);
          const duration = args.duration ?? 120;
          const rows = ProjectAssetMonths(
            {
              _id: "calc",
              title: args.title || "Asset",
              asset_class: args.asset_class || "fd",
              category: args.category || "i",
              principal: args.principal,
              purchase_month: args.purchase_month || 1,
              growth_rate: args.growth_rate,
              yield_rate: args.yield_rate,
              income_frequency: args.income_frequency,
              income_mode: args.income_mode,
              compounding: args.compounding,
              maturity_month: args.maturity_month,
              sale_month: args.sale_month,
              rent: args.rent,
              sip: args.sip,
              active: true,
            } as any,
            1,
            duration,
            rules,
            Date.now(),
            "below60"
          );
          return {
            rows: rows.map((r) => ({ ...r })),
            closing_value: rows.length ? rows[rows.length - 1].closing_value : args.principal,
            total_income_gross: Math.round(rows.reduce((s, r) => s + r.income_gross, 0) * 100) / 100,
            total_tds: Math.round(rows.reduce((s, r) => s + r.tds, 0) * 100) / 100,
          };
        });
      },
    },
  ];
}

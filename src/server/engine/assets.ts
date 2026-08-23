/** Asset-class projection engine — pure functions, no I/O. */

import { ComputeCapitalGains, ComputeIncomeTax, MonthToAssessmentYear } from "../tax/engine";
import type { TaxRuleSet } from "../tax/schema";

export interface AssetSipLike {
  amount: number;
  frequency: "m" | "q" | "y";
  start_month: number;
  end_month?: number;
  step_pct?: number;
}

export interface AssetRentLike {
  monthly_rent: number;
  step_pct?: number;
  expense_ratio?: number;
}

export interface AssetLike {
  _id: string;
  title: string;
  asset_class: string;
  category: "s" | "e" | "i";
  principal: number;
  purchase_month: number;
  growth_rate: number;
  volatility?: number;
  yield_rate?: number;
  income_frequency?: "m" | "q" | "h" | "y";
  income_mode?: "credit" | "reinvest";
  compounding?: string;
  maturity_month?: number;
  sip?: AssetSipLike;
  funding_account_id?: string;
  rent?: AssetRentLike;
  loan_id?: string;
  jurisdiction?: "in" | "foreign";
  listed?: boolean;
  purchase_date?: string;
  sale_month?: number;
  active?: boolean;
}

export interface AssetMonthRow {
  month: number;
  opening_value: number;
  growth_gain: number;
  income_gross: number;
  income_net: number;
  tds: number;
  sip_added: number;
  invested: number;
  closing_value: number;
  rent_gross?: number;
  event?: "none" | "matured";
}

export interface AssetTxn {
  month: number;
  account_id: string;
  tran_type: "cr" | "dr";
  amount: number;
  tran_desc: string;
}

export interface AssetScheduleResult {
  txns: AssetTxn[];
  asset_month_map: Record<number, any[]>;
  asset_summary: {
    by_class: Record<string, { count: number; value: number; invested: number }>;
    total_value: number;
    total_invested: number;
    total_unrealized: number;
  };
  /** per assessment year: taxable income streams + realized capital gains + TDS */
  tax_summary: Record<string, { interest_income: number; rent_income: number; dividends: number; ltcg_realized: number; stcg_realized: number; tds_paid: number }>;
  /** value-weighted blended growth per bucket (the derived e/s/i growth %) */
  bucket_growth: Record<"e" | "s" | "i", { value: number; growth_rate: number }>;
}

const PERIOD_MONTHS: Record<string, number> = { m: 1, q: 3, h: 6, y: 12 };
const round2 = (n: number) => Math.round(n * 100) / 100;

const CLASS_LABELS: Record<string, string> = {
  fd: "FD Interest",
  savings: "Savings Interest",
  bond: "Bond Coupon",
  gold: "SGB Coupon",
  ppf: "PPF Interest",
  equity: "Dividend",
  equity_foreign: "Dividend",
  mf: "Dividend",
  real_estate: "Rent",
};

const CG_PROFILE_BY_CLASS: Record<string, string> = {
  equity: "equity_listed_in",
  equity_foreign: "equity_foreign",
  mf: "equity_listed_in",
  gold: "gold",
  real_estate: "real_estate",
  vda: "vda",
};

/** Classes whose value is growth-driven (unrealized gains + capital gains on sale). */
function isMarketClass(asset_class: string): boolean {
  return ["gold", "equity", "equity_foreign", "mf", "real_estate", "vda"].includes(asset_class);
}

/** Interest-bearing classes with reinvested compounding. */
function isInterestClass(asset_class: string): boolean {
  return ["fd", "savings", "bond", "ppf"].includes(asset_class);
}

export function GetPeriodMonths(frequency?: string | null): number {
  return frequency && PERIOD_MONTHS[frequency] ? PERIOD_MONTHS[frequency] : 1;
}

/**
 * Project one asset month-by-month: geometric growth (market classes), yield
 * income per frequency with compounding or payout, TDS on FD interest past the
 * threshold, SIP top-ups with yearly step-up, maturity (credit back the value)
 * and optional sale (realizes capital gains).
 */
export function ProjectAssetMonths(
  asset: AssetLike,
  from_month: number,
  to_month: number,
  rules?: TaxRuleSet,
  plan_timestamp?: number,
  age_group: "below60" | "senior" | "super_senior" = "below60"
): AssetMonthRow[] {
  const rows: AssetMonthRow[] = [];
  const start = Math.max(1, asset.purchase_month || 1);
  const end = Math.min(
    to_month,
    asset.sale_month && asset.sale_month > 0 ? asset.sale_month - 1 : to_month
  );
  if (start > end) return rows;

  let value = asset.principal || 0;
  let invested = asset.principal || 0;
  const income_period = GetPeriodMonths(asset.income_frequency);
  const sip_period = GetPeriodMonths(asset.sip?.frequency);
  const tds_rule = rules?.tds?.fd;
  const tds_threshold = age_group === "senior" || age_group === "super_senior"
    ? tds_rule?.senior_threshold
    : tds_rule?.threshold;

  let fy_interest = 0;
  let current_fy = plan_timestamp ? MonthToAssessmentYear(plan_timestamp, start) : "";
  let fy_years_elapsed = 0;

  for (let m = start; m <= end; m++) {
    const fy = plan_timestamp ? MonthToAssessmentYear(plan_timestamp, m) : "";
    if (fy !== current_fy) {
      current_fy = fy;
      fy_interest = 0;
    }

    // SIP contribution (with yearly step-up compounding)
    let sip_added = 0;
    if (asset.sip && m >= (asset.sip.start_month || 1) && (!asset.sip.end_month || m <= asset.sip.end_month)) {
      if ((m - (asset.sip.start_month || 1)) % sip_period === 0) {
        const step = asset.sip.step_pct || 0;
        const step_units = Math.floor((m - (asset.sip.start_month || 1)) / 12);
        sip_added = asset.sip.amount * Math.pow(1 + step / 100, step_units);
        value += sip_added;
        invested += sip_added;
      }
    }

    const opening_value = value;
    // Growth: geometric monthly for market classes (and any explicit growth_rate)
    const growth_gain = opening_value > 0 ? opening_value * ((asset.growth_rate || 0) / 100) / 12 : 0;
    value += growth_gain;

    // Income — first credit lands one full period after purchase, then every period
    let income_gross = 0;
    let rent_gross: number | undefined;
    if (asset.rent) {
      const years = Math.floor((m - start) / 12);
      rent_gross = asset.rent.monthly_rent * Math.pow(1 + (asset.rent.step_pct || 0) / 100, years);
      const net_ratio = 1 - (asset.rent.expense_ratio || 0) / 100;
      income_gross = rent_gross * net_ratio;
    } else if ((asset.yield_rate || 0) > 0 && m > start && (m - start) % income_period === 0) {
      const fraction = income_period / 12;
      income_gross = opening_value * ((asset.yield_rate || 0) / 100) * fraction;
    }

    let tds = 0;
    if (income_gross > 0) {
      fy_interest += income_gross;
      const is_fd = asset.asset_class === "fd";
      if (is_fd && tds_rule && tds_threshold && fy_interest > tds_threshold) {
        tds = income_gross * (tds_rule.rate / 100);
      }
    }

    const income_net = Math.max(0, income_gross - tds);
    if (asset.income_mode !== "credit" || asset.rent) {
      // reinvest (compounding): interest stays inside the asset value
      value += income_net;
    }

    rows.push({
      month: m,
      opening_value: round2(opening_value),
      growth_gain: round2(growth_gain),
      income_gross: round2(income_gross),
      income_net: round2(income_net),
      tds: round2(tds),
      sip_added: round2(sip_added),
      invested: round2(invested),
      closing_value: round2(value),
      ...(rent_gross !== undefined ? { rent_gross: round2(rent_gross) } : {}),
      event: "none",
    });

    // Maturity: credit the value back and stop projecting
    if (asset.maturity_month && m === asset.maturity_month) {
      rows[rows.length - 1].event = "matured";
      fy_years_elapsed++;
      break;
    }
  }
  return rows;
}

function findFundingAccount(plan: any, asset: AssetLike): string | null {
  if (asset.funding_account_id) {
    return (plan.account_list || []).some((a: any) => String(a._id) === String(asset.funding_account_id))
      ? asset.funding_account_id
      : null;
  }
  const bucket = (plan.account_list || []).find(
    (a: any) => a.category === asset.category && a.type === "a"
  );
  return bucket ? String(bucket._id) : null;
}

export function ComputeAssetSchedule(
  plan: any,
  duration: number,
  rules?: TaxRuleSet
): AssetScheduleResult {
  const assets: AssetLike[] = (plan.asset_list || []).filter((a: any) => a.active !== false);
  const txns: AssetTxn[] = [];
  const asset_month_map: Record<number, any[]> = {};
  const by_class: Record<string, { count: number; value: number; invested: number }> = {};
  const tax_summary: AssetScheduleResult["tax_summary"] = {};
  const bucket_values: Record<"e" | "s" | "i", { value: number; growth: number }> = {
    e: { value: 0, growth: 0 },
    s: { value: 0, growth: 0 },
    i: { value: 0, growth: 0 },
  };

  for (const asset of assets) {
    const rows = ProjectAssetMonths(asset, 1, duration, rules, plan.timestamp);
    const funding_account_id = findFundingAccount(plan, asset);
    let last_value = asset.principal || 0;
    const start = Math.max(1, asset.purchase_month || 1);

    /** Realize a capital gain at maturity/sale: emits the tax txn + feeds tax_summary. */
    const recordCapGain = (sale_value: number, sale_month: number) => {
      if (!isMarketClass(asset.asset_class) || !rules || !plan.timestamp) return;
      const fy = MonthToAssessmentYear(plan.timestamp, sale_month);
      if (!tax_summary[fy]) tax_summary[fy] = { interest_income: 0, rent_income: 0, dividends: 0, ltcg_realized: 0, stcg_realized: 0, tds_paid: 0 };
      const profile_key = CG_PROFILE_BY_CLASS[asset.asset_class];
      const profile = rules.capital_gains.profiles[profile_key];
      if (!profile) return;
      const holding_months = Math.max(1, sale_month - start + 1);
      const invested = asset.principal || 0;
      const gain = Math.max(0, sale_value - invested);
      if (gain <= 0) return;
      const result = ComputeCapitalGains({
        rules,
        profile,
        purchase_value: invested,
        sale_proceeds: sale_value,
        holding_months,
        purchase_fy: plan.timestamp ? MonthToAssessmentYear(plan.timestamp, start) : undefined,
        sale_fy: fy,
        purchase_date: asset.purchase_date,
      });
      if (result.is_long_term) tax_summary[fy].ltcg_realized += gain;
      else if (result.treat_as_slab) tax_summary[fy].stcg_realized += gain;
      else tax_summary[fy].stcg_realized += gain;
      if (result.tax > 0 && funding_account_id) {
        txns.push({
          month: sale_month,
          account_id: funding_account_id,
          tran_type: "dr",
          amount: round2(result.tax),
          tran_desc: `${result.is_long_term ? "LTCG" : "STCG"} tax - ${asset.title}`,
        });
      }
    };

    for (const row of rows) {
      last_value = row.closing_value;
      const month = row.month;

      if (!asset_month_map[month]) asset_month_map[month] = [];
      asset_month_map[month].push({
        asset_id: asset._id,
        title: asset.title,
        asset_class: asset.asset_class,
        category: asset.category,
        value: row.closing_value,
        invested: row.invested,
        income_gross: row.income_gross,
        tds: row.tds,
        event: row.event,
      });

      // Cash-flow transactions against the funding bucket account
      if (funding_account_id) {
        if (row.sip_added > 0) {
          txns.push({ month, account_id: funding_account_id, tran_type: "dr", amount: row.sip_added, tran_desc: `SIP - ${asset.title}` });
        }
        if (row.income_net > 0 && (asset.income_mode === "credit" || asset.rent)) {
          const label = asset.rent ? "Rent" : (CLASS_LABELS[asset.asset_class] || "Income");
          txns.push({ month, account_id: funding_account_id, tran_type: "cr", amount: row.income_net, tran_desc: `${label} - ${asset.title}` });
        }
        if (row.tds > 0) {
          txns.push({ month, account_id: funding_account_id, tran_type: "dr", amount: row.tds, tran_desc: `TDS on ${asset.title}` });
        }
        if (row.event === "matured") {
          txns.push({ month, account_id: funding_account_id, tran_type: "cr", amount: row.closing_value, tran_desc: `Maturity - ${asset.title}` });
          recordCapGain(row.closing_value, month);
        }
      }

      // per-assessment-year income streams for tax_summary
      const fy = plan.timestamp ? MonthToAssessmentYear(plan.timestamp, month) : "current";
      if (!tax_summary[fy]) tax_summary[fy] = { interest_income: 0, rent_income: 0, dividends: 0, ltcg_realized: 0, stcg_realized: 0, tds_paid: 0 };
      const bucket = tax_summary[fy];
      if (row.income_gross > 0) {
        if (asset.rent) bucket.rent_income += row.rent_gross || row.income_gross;
        else if (["equity", "equity_foreign", "mf"].includes(asset.asset_class)) bucket.dividends += row.income_gross;
        else bucket.interest_income += row.income_gross;
      }
      bucket.tds_paid += row.tds;
    }

    // Optional sale: credit the proceeds + realize capital gains at the sale month
    if (asset.sale_month && asset.sale_month >= start && asset.sale_month <= duration && funding_account_id) {
      txns.push({ month: asset.sale_month, account_id: funding_account_id, tran_type: "cr", amount: round2(last_value), tran_desc: `Sale - ${asset.title}` });
      recordCapGain(last_value, asset.sale_month);
    }

    // aggregate by class
    const entry = by_class[asset.asset_class] || { count: 0, value: 0, invested: 0 };
    entry.count += 1;
    entry.value += last_value;
    entry.invested += rows.length ? rows[rows.length - 1].invested : asset.principal || 0;
    by_class[asset.asset_class] = entry;

    // bucket growth (value-weighted total return)
    const bucket = bucket_values[asset.category] || bucket_values.i;
    bucket.value += last_value;
    bucket.growth += last_value * ((asset.growth_rate || 0) + (asset.yield_rate || 0));
  }

  const bucket_growth: AssetScheduleResult["bucket_growth"] = {
    e: { value: round2(bucket_values.e.value), growth_rate: bucket_values.e.value > 0 ? round2(bucket_values.e.growth / bucket_values.e.value) : 0 },
    s: { value: round2(bucket_values.s.value), growth_rate: bucket_values.s.value > 0 ? round2(bucket_values.s.growth / bucket_values.s.value) : 0 },
    i: { value: round2(bucket_values.i.value), growth_rate: bucket_values.i.value > 0 ? round2(bucket_values.i.growth / bucket_values.i.value) : 0 },
  };

  const total_value = round2(Object.values(by_class).reduce((s, c) => s + c.value, 0));
  const total_invested = round2(Object.values(by_class).reduce((s, c) => s + c.invested, 0));

  for (const fy of Object.keys(tax_summary)) {
    const t = tax_summary[fy];
    t.interest_income = round2(t.interest_income);
    t.rent_income = round2(t.rent_income);
    t.dividends = round2(t.dividends);
    t.tds_paid = round2(t.tds_paid);
    t.ltcg_realized = round2(t.ltcg_realized);
    t.stcg_realized = round2(t.stcg_realized);
  }

  return {
    txns,
    asset_month_map,
    asset_summary: { by_class, total_value, total_invested, total_unrealized: round2(total_value - total_invested) },
    tax_summary,
    bucket_growth,
  };
}

/**
 * Scenario bands — deterministic ±1σ paths. Re-runs the schedule with each
 * market-linked asset's growth_rate shifted by its volatility (conservative =
 * rate − vol, aggressive = rate + vol). Returns the final total value per
 * scenario (plus the month-by-month total for chart bands).
 */
export function ComputeAssetScenarios(
  plan: any,
  duration: number,
  rules?: TaxRuleSet
): {
  expected: { total_value: number; by_class: Record<string, number> };
  conservative: { total_value: number; by_class: Record<string, number> };
  aggressive: { total_value: number; by_class: Record<string, number> };
  month_map: { conservative: Record<number, number>; expected: Record<number, number>; aggressive: Record<number, number> };
} {
  const assets = (plan.asset_list || []).filter((a: any) => a.active !== false);

  function run(shift: number) {
    const shifted = assets.map((a: any) => {
      const vol = typeof a.volatility === "number" && a.volatility > 0 ? a.volatility : 0;
      if (vol === 0) return a;
      return { ...a, growth_rate: Math.max(0, (a.growth_rate || 0) + shift * vol) };
    });
    const result = ComputeAssetSchedule({ ...plan, asset_list: shifted }, duration, rules);
    const by_class: Record<string, number> = {};
    for (const [k, c] of Object.entries(result.asset_summary.by_class as Record<string, { value: number }>)) {
      by_class[k] = Math.round(c.value);
    }
    const month_totals: Record<number, number> = {};
    for (const [month, rows] of Object.entries(result.asset_month_map)) {
      month_totals[Number(month)] = Math.round(rows.reduce((s: number, r: any) => s + (r.value || 0), 0));
    }
    return { total_value: result.asset_summary.total_value, by_class, month_totals };
  }

  const expected = run(0);
  const conservative = run(-1);
  const aggressive = run(1);

  return {
    expected: { total_value: expected.total_value, by_class: expected.by_class },
    conservative: { total_value: conservative.total_value, by_class: conservative.by_class },
    aggressive: { total_value: aggressive.total_value, by_class: aggressive.by_class },
    month_map: {
      conservative: conservative.month_totals,
      expected: expected.month_totals,
      aggressive: aggressive.month_totals,
    },
  };
}

/**
 * Auto "Income Tax" expense schedule: monthly equal installments of the annual
 * slab tax (new/old regime against the stored rule set) computed from the
 * plan's salary income plus asset income streams. Mirrors the EMI expense seam.
 */
export function ComputeIncomeTaxExpenseSchedule(
  plan: any,
  duration: number,
  rules: TaxRuleSet,
  tax_settings: any,
  income_statement: any[],
  asset_tax_summary: Record<string, { interest_income: number; rent_income: number; dividends: number; tds_paid: number; ltcg_realized: number; stcg_realized: number }>
): any[] {
  if (!tax_settings?.income_tax_enabled || !plan.timestamp) return [];
  const regime = tax_settings.regime === "old" ? "old" : "new";
  const age_group = tax_settings.age_group || "below60";

  const fy_totals: Record<string, number> = {};
  const fy_asset_income: Record<string, number> = {};
  for (const stmt of income_statement) {
    const fy = MonthToAssessmentYear(plan.timestamp, stmt.month);
    fy_totals[fy] = (fy_totals[fy] || 0) + (stmt.total_income || 0);
  }
  for (const fy of Object.keys(asset_tax_summary)) {
    const t = asset_tax_summary[fy];
    fy_asset_income[fy] = t.interest_income + t.rent_income + t.dividends;
  }

  const rows: any[] = [];
  const months_per_fy: Record<string, number> = {};
  for (let m = 1; m <= duration; m++) {
    const fy = MonthToAssessmentYear(plan.timestamp, m);
    months_per_fy[fy] = (months_per_fy[fy] || 0) + 1;
  }

  for (const fy of Object.keys(fy_totals)) {
    const annual_salary = fy_totals[fy];
    const annual_asset_income = fy_asset_income[fy] || 0;
    if (annual_salary <= 0) continue;
    const result = ComputeIncomeTax({
      rules,
      regime,
      age_group,
      gross_salary: annual_salary,
      salary_structure: tax_settings.salary_structure,
      deductions: tax_settings.deductions,
      other_income: annual_asset_income,
    });
    const monthly = result.total_tax / Math.max(1, months_per_fy[fy] || 12);
    if (monthly <= 0) continue;
    for (let m = 1; m <= duration; m++) {
      if (MonthToAssessmentYear(plan.timestamp, m) === fy) {
        rows.push({
          _id: `tax-${fy}-${m}`,
          type: "o",
          frequency: null,
          amount: round2(monthly),
          desc: `Income Tax (${fy})`,
          start_month: m,
          end_month: m,
          category: "e",
          active: true,
          primary: false,
          readonly: true,
        });
      }
    }
  }
  return rows;
}

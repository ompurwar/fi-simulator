/** Asset-class projection engine — pure functions, no I/O. */

import { ComputeCapitalGains, ComputeIncomeTax, MonthToAssessmentYear } from "../tax/engine";
import type { TaxRuleSet } from "../tax/schema";
import { resolveDebit, sipWithdrawalLadder, type OrderableAccount } from "./funding";

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
  /** the month's SIP instalment could not be funded → skipped entirely */
  sip_skipped?: boolean;
}

export interface AssetTxn {
  month: number;
  account_id: string;
  tran_type: "cr" | "dr";
  amount: number;
  tran_desc: string;
}

export interface AssetTaxSummaryYear {
  interest_income: number;
  rent_income: number;
  dividends: number;
  /** capital gains realized at a FLAT rate — taxed immediately at the sale event */
  ltcg_realized: number;
  stcg_realized: number;
  /** gains taxed at slab — added into the annual Income Tax computation */
  slab_taxable_gains: number;
  /** 112A ₹1.25L exemption consumed across equity sales this year */
  ltcg_112a_exemption_used: number;
  /** TDS deducted at source (FD interest) — credited against the annual tax */
  tds_paid: number;
  /** portion of tds_paid actually offset against the income-tax expense */
  tds_credit_used?: number;
}

export function emptyTaxSummaryYear(): AssetTaxSummaryYear {
  return {
    interest_income: 0,
    rent_income: 0,
    dividends: 0,
    ltcg_realized: 0,
    stcg_realized: 0,
    slab_taxable_gains: 0,
    ltcg_112a_exemption_used: 0,
    tds_paid: 0,
  };
}

export interface AssetScheduleResult {
  txns: AssetTxn[];
  asset_month_map: Record<number, any[]>;
  asset_summary: {
    by_class: Record<string, { count: number; value: number; invested: number }>;
    total_value: number;
    total_invested: number;
    total_unrealized: number;
    skipped_sip_months: number;
  };
  /** per assessment year: taxable income streams + realized capital gains + TDS */
  tax_summary: Record<string, AssetTaxSummaryYear>;
  /** value-weighted blended growth per bucket (the derived e/s/i growth %) */
  bucket_growth: Record<"e" | "s" | "i", { value: number; growth_rate: number }>;
  /** SIP instalments that could not be funded (month, asset, requested amount) */
  skipped_sips: { month: number; asset_id: string; title: string; amount: number }[];
}

/**
 * When provided, SIP instalments must be serviceable: the funding account is
 * drawn first, then the rest of the withdrawal ladder, and the instalment is
 * SKIPPED (never partially funded, never overdrawing) if the ladder cannot
 * cover it. Without a context the schedule assumes full funding (legacy
 * behaviour — used by the ±1σ scenario bands).
 */
export interface AssetScheduleOptions {
  ctx?: {
    getBalance: (month: number, account_id: string) => number;
    applyTxn: (txn: AssetTxn) => void;
    orderedAccounts: OrderableAccount[];
    protectEmergency: boolean;
  };
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

interface AssetState {
  asset: AssetLike;
  funding_account_id: string | null;
  start: number;
  end: number;
  value: number;
  invested: number;
  current_fy: string;
  fy_interest: number;
  income_period: number;
  sip_period: number;
  rows: AssetMonthRow[];
  matured: boolean;
}

interface RowComputation {
  row: AssetMonthRow;
  next_value: number;
  next_invested: number;
  next_fy_interest: number;
}

/**
 * Month math for one asset against its state. `sip_amount` is the amount the
 * ladder agreed to fund THIS month (0 → skipped); exactly like the legacy
 * monthly projection, the contribution joins the same-month growth/income.
 */
function ComputeMonthRow(
  st: AssetState,
  month: number,
  sip_amount: number,
  plan_timestamp?: number,
  rules?: TaxRuleSet
): RowComputation {
  const asset = st.asset;
  let value = st.value + sip_amount;
  const opening_value = value;
  const growth_gain =
    opening_value > 0 ? (opening_value * ((asset.growth_rate || 0) / 100)) / 12 : 0;
  value += growth_gain;

  let income_gross = 0;
  let rent_gross: number | undefined;
  if (asset.rent) {
    const years = Math.floor((month - st.start) / 12);
    rent_gross =
      asset.rent.monthly_rent * Math.pow(1 + (asset.rent.step_pct || 0) / 100, years);
    const net_ratio = 1 - (asset.rent.expense_ratio || 0) / 100;
    income_gross = rent_gross * net_ratio;
  } else if (
    (asset.yield_rate || 0) > 0 &&
    month > st.start &&
    (month - st.start) % st.income_period === 0
  ) {
    const fraction = st.income_period / 12;
    income_gross = opening_value * ((asset.yield_rate || 0) / 100) * fraction;
  }

  const fy = plan_timestamp ? MonthToAssessmentYear(plan_timestamp, month) : "";
  let fy_interest = st.current_fy === fy ? st.fy_interest : 0;
  let tds = 0;
  if (income_gross > 0) {
    fy_interest += income_gross;
    const is_fd = asset.asset_class === "fd";
    const tds_rule = rules?.tds?.fd;
    const tds_threshold = tds_rule?.threshold;
    if (is_fd && tds_rule && tds_threshold && fy_interest > tds_threshold) {
      tds = income_gross * (tds_rule.rate / 100);
    }
  }

  const income_net = Math.max(0, income_gross - tds);
  if (asset.income_mode !== "credit" || asset.rent) {
    value += income_net;
  }

  const invested = st.invested + sip_amount;
  const matured = !!asset.maturity_month && month === asset.maturity_month;

  const row: AssetMonthRow = {
    month,
    opening_value: round2(opening_value),
    growth_gain: round2(growth_gain),
    income_gross: round2(income_gross),
    income_net: round2(income_net),
    tds: round2(tds),
    sip_added: round2(sip_amount),
    invested: round2(invested),
    closing_value: round2(value),
    ...(rent_gross !== undefined ? { rent_gross: round2(rent_gross) } : {}),
    event: matured ? "matured" : "none",
  };

  return {
    row,
    next_value: value,
    next_invested: invested,
    next_fy_interest: fy_interest,
  };
}

function IsSipDue(st: AssetState, month: number): boolean {
  const sip = st.asset.sip;
  if (!sip) return false;
  const start = sip.start_month || 1;
  if (month < start) return false;
  if (sip.end_month && month > sip.end_month) return false;
  return (month - start) % st.sip_period === 0;
}

function RequestedSipAmount(st: AssetState, month: number): number {
  const sip = st.asset.sip!;
  const start = sip.start_month || 1;
  const step = sip.step_pct || 0;
  const step_units = Math.floor((month - start) / 12);
  return sip.amount * Math.pow(1 + step / 100, step_units);
}

export function ComputeAssetSchedule(
  plan: any,
  duration: number,
  rules?: TaxRuleSet,
  options?: AssetScheduleOptions
): AssetScheduleResult {
  const ctx = options?.ctx;
  const assets: AssetLike[] = (plan.asset_list || []).filter((a: any) => a.active !== false);
  const txns: AssetTxn[] = [];
  const asset_month_map: Record<number, any[]> = {};
  const by_class: Record<string, { count: number; value: number; invested: number }> = {};
  const tax_summary: AssetScheduleResult["tax_summary"] = {};
  const exemption_remaining_per_fy: Record<string, number> = {};
  const bucket_values: Record<"e" | "s" | "i", { value: number; growth: number }> = {
    e: { value: 0, growth: 0 },
    s: { value: 0, growth: 0 },
    i: { value: 0, growth: 0 },
  };
  const skipped_sips: AssetScheduleResult["skipped_sips"] = [];

  const states: AssetState[] = assets.map((asset) => {
    const start = Math.max(1, asset.purchase_month || 1);
    const end = Math.min(
      duration,
      asset.sale_month && asset.sale_month > 0 ? asset.sale_month - 1 : duration
    );
    return {
      asset,
      funding_account_id: findFundingAccount(plan, asset),
      start,
      end,
      value: asset.principal || 0,
      invested: asset.principal || 0,
      current_fy: plan.timestamp ? MonthToAssessmentYear(plan.timestamp, start) : "",
      fy_interest: 0,
      income_period: GetPeriodMonths(asset.income_frequency),
      sip_period: GetPeriodMonths(asset.sip?.frequency),
      rows: [],
      matured: false,
    };
  });

  function recordCapGain(asset: AssetLike, sale_value: number, sale_month: number): void {
    const start = Math.max(1, asset.purchase_month || 1);
    const funding_account_id = findFundingAccount(plan, asset);
    if (!isMarketClass(asset.asset_class) || !rules || !plan.timestamp) return;
    const fy = MonthToAssessmentYear(plan.timestamp, sale_month);
    if (!tax_summary[fy]) tax_summary[fy] = emptyTaxSummaryYear();
    const profile_key = CG_PROFILE_BY_CLASS[asset.asset_class];
    const profile = rules.capital_gains.profiles[profile_key];
    if (!profile) return;
    const holding_months = Math.max(1, sale_month - start + 1);
    const invested = asset.principal || 0;
    const gain = Math.max(0, sale_value - invested);
    if (gain <= 0) return;
    let remaining_exemption: number | undefined;
    if (profile.exemption_112a > 0) {
      remaining_exemption = exemption_remaining_per_fy[fy] ?? profile.exemption_112a;
    }
    const result = ComputeCapitalGains({
      rules,
      profile,
      purchase_value: invested,
      sale_proceeds: sale_value,
      holding_months,
      purchase_fy: plan.timestamp ? MonthToAssessmentYear(plan.timestamp, start) : undefined,
      sale_fy: fy,
      purchase_date: asset.purchase_date,
      remaining_exemption,
    });
    if (remaining_exemption !== undefined) {
      exemption_remaining_per_fy[fy] = Math.max(0, remaining_exemption - result.exemption_used);
      tax_summary[fy].ltcg_112a_exemption_used += result.exemption_used;
    }
    if (result.treat_as_slab) {
      tax_summary[fy].slab_taxable_gains += gain;
      return;
    }
    if (result.is_long_term) tax_summary[fy].ltcg_realized += gain;
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
  }

  const ladderIndex = (st: AssetState): number => {
    if (!ctx || !st.funding_account_id) return 9999;
    const idx = ctx.orderedAccounts.findIndex(
      (a) => String(a._id) === String(st.funding_account_id)
    );
    return idx === -1 ? 9999 : idx;
  };

  const emitSaleAtMonth = (month: number, emit: (txn: AssetTxn) => void, sales: { st: AssetState; txn: AssetTxn }[]) => {
    for (const st of states) {
      const asset = st.asset;
      if (
        asset.sale_month && asset.sale_month === month &&
        asset.sale_month >= st.start && asset.sale_month <= duration && st.funding_account_id
      ) {
        const txn: AssetTxn = {
          month,
          account_id: st.funding_account_id,
          tran_type: "cr",
          amount: round2(st.value),
          tran_desc: `Sale - ${asset.title}`,
        };
        emit(txn);
        sales.push({ st, txn });
      }
    }
  };

  for (let month = 1; month <= duration; month++) {
    const active = states.filter(
      (st) => !st.matured && month >= st.start && month <= st.end
    );
    const month_txns: AssetTxn[] = [];
    const emit = (txn: AssetTxn) => {
      month_txns.push(txn);
      txns.push(txn);
      ctx?.applyTxn(txn);
    };

    if (active.length === 0) {
      const sales: { st: AssetState; txn: AssetTxn }[] = [];
      emitSaleAtMonth(month, emit, sales);
      for (const s of sales) recordCapGain(s.st.asset, s.txn.amount, month);
      continue;
    }

    // Phase 1 — provisional rows (sip included) so month income/TDS is known.
    const candidates = new Map<string, RowComputation>();
    for (const st of active) {
      const sip = IsSipDue(st, month) ? RequestedSipAmount(st, month) : 0;
      candidates.set(
        String(st.asset._id),
        ComputeMonthRow(st, month, sip, plan.timestamp, rules)
      );
    }

    // Phase 1b — SETTLE ALL CREDITS FIRST: income, maturity and sale proceeds
    // land in the accounts before any debit is processed, so same-month credits
    // can fund a same-month SIP.
    const credit_refs = new Map<string, { kind: "income" | "maturity" | "sale"; txn: AssetTxn }[]>();
    for (const st of active) {
      const row = candidates.get(String(st.asset._id))!.row;
      const funding_account_id = st.funding_account_id;
      if (!funding_account_id) continue;
      if (row.income_net > 0 && (st.asset.income_mode === "credit" || st.asset.rent)) {
        const label = st.asset.rent ? "Rent" : CLASS_LABELS[st.asset.asset_class] || "Income";
        const txn = { month, account_id: funding_account_id, tran_type: "cr" as const, amount: row.income_net, tran_desc: `${label} - ${st.asset.title}` };
        emit(txn);
        const refs = credit_refs.get(String(st.asset._id)) || [];
        refs.push({ kind: "income", txn });
        credit_refs.set(String(st.asset._id), refs);
      }
      if (row.event === "matured") {
        const txn = { month, account_id: funding_account_id, tran_type: "cr" as const, amount: row.closing_value, tran_desc: `Maturity - ${st.asset.title}` };
        emit(txn);
        const refs = credit_refs.get(String(st.asset._id)) || [];
        refs.push({ kind: "maturity", txn });
        credit_refs.set(String(st.asset._id), refs);
      }
    }
    const sales: { st: AssetState; txn: AssetTxn }[] = [];
    emitSaleAtMonth(month, emit, sales);
    for (const s of sales) {
      const refs = credit_refs.get(String(s.st.asset._id)) || [];
      refs.push({ kind: "sale", txn: s.txn });
      credit_refs.set(String(s.st.asset._id), refs);
    }

    // Phase 1c — resolve SIP funding against the ladder (all-or-nothing).
    // Debits are applied immediately, but only after every credit above.
    const sip_assets = active
      .filter((st) => IsSipDue(st, month))
      .sort((a, b) => ladderIndex(a) - ladderIndex(b) || String(a.asset._id).localeCompare(String(b.asset._id)));
    if (ctx) {
      for (const st of sip_assets) {
        const requested = RequestedSipAmount(st, month);
        const ladder = sipWithdrawalLadder(st.funding_account_id, ctx.orderedAccounts, {
          protectEmergency: ctx.protectEmergency,
        });
        const resolution = resolveDebit(requested, ladder, (id) => ctx.getBalance(month, id));
        if (resolution.shortfall > 0) {
          // skipped entirely — no partial funding, no negative balances
          const recomputed = ComputeMonthRow(st, month, 0, plan.timestamp, rules);
          recomputed.row.sip_skipped = true;
          candidates.set(String(st.asset._id), recomputed);
          skipped_sips.push({
            month,
            asset_id: st.asset._id,
            title: st.asset.title,
            amount: round2(requested),
          });
          // visible marker so the month's breakdown explains the miss (₹0 —
          // no money moved; it shows in the account's transaction list)
          emit({
            month,
            account_id: st.funding_account_id || ctx.orderedAccounts[0]?._id || "",
            tran_type: "dr",
            amount: 0,
            tran_desc: `SIP skipped - ${st.asset.title}`,
          });
          // the settled credit amounts assumed the same-month sip back the
          // instalment — re-settle them at the no-sip amounts (internal ledger
          // adjustment; the emitted txns keep their honest final amounts)
          const refs = credit_refs.get(String(st.asset._id)) || [];
          for (const ref of refs) {
            const final_amount =
              ref.kind === "income"
                ? recomputed.row.income_net
                : ref.kind === "maturity"
                  ? recomputed.row.closing_value
                  : ref.txn.amount;
            const delta = round2(final_amount) - ref.txn.amount;
            if (delta !== 0) {
              ctx.applyTxn({
                month,
                account_id: ref.txn.account_id,
                tran_type: delta > 0 ? "cr" : "dr",
                amount: round2(Math.abs(delta)),
                tran_desc: "SIP credit adjustment",
              });
              ref.txn.amount = round2(final_amount);
            }
          }
          continue;
        }
        for (const d of resolution.debits) {
          emit({
            month,
            account_id: d.account_id,
            tran_type: "dr",
            amount: round2(d.amount),
            tran_desc: `SIP - ${st.asset.title}`,
          });
        }
      }
    }

    // Phase 2 — commit rows, emit the remaining per-asset debits, handle maturity.
    for (const st of active) {
      const cand = candidates.get(String(st.asset._id));
      if (!cand) continue;
      const row = cand.row;
      const asset = st.asset;
      st.value = cand.next_value;
      st.invested = cand.next_invested;
      st.fy_interest = cand.next_fy_interest;
      st.current_fy = plan.timestamp ? MonthToAssessmentYear(plan.timestamp, month) : st.current_fy;
      st.rows.push(row);

      if (!asset_month_map[month]) asset_month_map[month] = [];
      asset_month_map[month].push({
        asset_id: asset._id,
        title: asset.title,
        asset_class: asset.asset_class,
        category: asset.category,
        value: row.closing_value,
        invested: row.invested,
        income_gross: row.income_gross,
        sip_added: row.sip_added,
        tds: row.tds,
        event: row.event,
        ...(row.sip_skipped ? { sip_skipped: true } : {}),
      });

      const funding_account_id = st.funding_account_id;
      if (funding_account_id) {
        // without a funding context the legacy full-funding txn is emitted here
        if (row.sip_added > 0 && !ctx) {
          emit({
            month,
            account_id: funding_account_id,
            tran_type: "dr",
            amount: row.sip_added,
            tran_desc: `SIP - ${asset.title}`,
          });
        }
        if (row.tds > 0) {
          emit({
            month,
            account_id: funding_account_id,
            tran_type: "dr",
            amount: row.tds,
            tran_desc: `TDS on ${asset.title}`,
          });
        }
        if (row.event === "matured") {
          recordCapGain(asset, row.closing_value, month);
          st.matured = true;
        }
      }

      const fy = plan.timestamp ? MonthToAssessmentYear(plan.timestamp, month) : "current";
      if (!tax_summary[fy]) tax_summary[fy] = emptyTaxSummaryYear();
      const bucket = tax_summary[fy];
      if (row.income_gross > 0) {
        if (asset.rent) bucket.rent_income += row.rent_gross || row.income_gross;
        else if (["equity", "equity_foreign", "mf"].includes(asset.asset_class)) bucket.dividends += row.income_gross;
        else bucket.interest_income += row.income_gross;
      }
      bucket.tds_paid += row.tds;
    }

    // sales' capital gains are realized on the final (post-correction) amounts
    for (const s of sales) recordCapGain(s.st.asset, s.txn.amount, month);
  }

  for (const st of states) {
    const asset = st.asset;
    const last_value = st.rows.length ? round2(st.value) : asset.principal || 0;
    const entry = by_class[asset.asset_class] || { count: 0, value: 0, invested: 0 };
    entry.count += 1;
    entry.value += last_value;
    entry.invested += st.rows.length ? st.rows[st.rows.length - 1].invested : asset.principal || 0;
    by_class[asset.asset_class] = entry;

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
    t.slab_taxable_gains = round2(t.slab_taxable_gains);
    t.ltcg_112a_exemption_used = round2(t.ltcg_112a_exemption_used);
  }

  return {
    txns,
    asset_month_map,
    asset_summary: {
      by_class,
      total_value,
      total_invested,
      total_unrealized: round2(total_value - total_invested),
      skipped_sip_months: skipped_sips.length,
    },
    tax_summary,
    bucket_growth,
    skipped_sips,
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
  asset_tax_summary: Record<string, AssetTaxSummaryYear>
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
    // slab-taxed gains (foreign-equity STCG, debt-MF gains) join interest/rent/dividends
    fy_asset_income[fy] = t.interest_income + t.rent_income + t.dividends + (t.slab_taxable_gains || 0);
  }

  const rows: any[] = [];
  const months_per_fy: Record<string, number> = {};
  for (let m = 1; m <= duration; m++) {
    const fy = MonthToAssessmentYear(plan.timestamp, m);
    months_per_fy[fy] = (months_per_fy[fy] || 0) + 1;
  }

  // First-FY backfill: when the plan starts mid-financial-year the user was
  // almost certainly employed before the plan began, so the first FY's tax is
  // computed on the FULL year (missing months backfilled at the month-1 salary)
  // and charged at the true monthly TDS (total ÷ 12). Disable via
  // tax_settings.backfill_first_fy = false.
  // NOTE (known limitation): the TRAILING partial FY at the plan's end is NOT
  // backfilled — tax there is computed on the plan's visible months only. If a
  // user keeps earning after the plan horizon, the final months' tax appears
  // lower than real-world TDS (the plan assumes income ends with the plan).
  const backfill_enabled = tax_settings.backfill_first_fy !== false;
  const first_fy = income_statement.length
    ? MonthToAssessmentYear(plan.timestamp, income_statement[0].month)
    : null;
  const first_month_income = income_statement[0]?.total_income || 0;

  for (const fy of Object.keys(fy_totals)) {
    let annual_salary = fy_totals[fy];
    const months_in_fy = months_per_fy[fy] || 12;
    let divisor = months_in_fy;
    if (fy === first_fy && backfill_enabled && months_in_fy < 12 && first_month_income > 0) {
      annual_salary += (12 - months_in_fy) * first_month_income;
      divisor = 12;
    }
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
    // TDS already deducted at source (FD interest) offsets the annual liability.
    const tds_credit_used = Math.min(asset_tax_summary[fy]?.tds_paid || 0, result.total_tax);
    const net_tax = Math.max(0, result.total_tax - tds_credit_used);
    if (asset_tax_summary[fy]) asset_tax_summary[fy].tds_credit_used = round2(tds_credit_used);
    const monthly = net_tax / Math.max(1, divisor);
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

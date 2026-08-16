/** Loan engine (ported from loan.js). */

import { GetRandomString } from "./utils";

export interface LoanAccountLike {
  _id: string;
  title: string;
  principal_amount: number;
  start_month: number;
  end_month: number;
  interest_rate: number;
  ref_id?: string | null;
  type?: number;
  deposit_to_bank?: boolean;
  prepayments?: PrepaymentPlanLike[];
}

export interface PrepaymentPlanLike {
  _id?: string;
  /** month (plan-relative) of the first prepayment */
  start_month: number;
  /** amount paid beyond the EMI at each occurrence */
  amount: number;
  /** m = every month, q = every quarter, y = every year, null = one-time lump */
  frequency?: "m" | "q" | "y" | null;
  /** % the amount grows by at every recurrence (compounded) */
  step_pct?: number | null;
  /** how often the step-up applies; defaults to `frequency` when omitted
   *  (e.g. frequency "m" with step_frequency "y" = monthly payments that rise 10% yearly) */
  step_frequency?: "m" | "q" | "y" | null;
  desc?: string;
}

const PREPAYMENT_FREQ_PERIODS: Record<string, number> = { m: 1, q: 3, y: 12 };

/** Expand prepayment schedules into a map month -> total prepayment due (step-up compounding). */
export function ComputePrepaymentAmounts(
  prepayments: PrepaymentPlanLike[] = [],
  from_month = 1,
  to_month = Number.POSITIVE_INFINITY
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of prepayments || []) {
    if (!p || typeof p.amount !== "number" || !Number.isFinite(p.amount) || p.amount <= 0) continue;
    if (typeof p.start_month !== "number" || !Number.isFinite(p.start_month)) continue;
    const step = typeof p.step_pct === "number" && Number.isFinite(p.step_pct) ? p.step_pct : 0;
    const step_period = p.step_frequency
      ? PREPAYMENT_FREQ_PERIODS[p.step_frequency]
      : p.frequency
        ? PREPAYMENT_FREQ_PERIODS[p.frequency]
        : 0;
    const period = p.frequency ? PREPAYMENT_FREQ_PERIODS[p.frequency] : 0;
    const months = period > 0 ? to_month : p.start_month;
    for (let m = p.start_month; m <= months; m += Math.max(1, period)) {
      if (m < from_month) continue;
      const k = step_period > 0 ? Math.floor((m - p.start_month) / step_period) : 0;
      out[m] = (out[m] || 0) + p.amount * Math.pow(1 + step / 100, k);
    }
  }
  return out;
}

/**
 * Amortization with prepayments — EMI stays constant (shorten mode): each
 * prepayment knocks down the principal after the EMI, so the loan closes early
 * when the balance reaches zero. Returns the schedule (rows carry `prepayment`)
 * plus payoff_month, totals and interest saved vs. the no-prepayment loan.
 */
export function ComputeLoanAmortizationScheduleWithPrepayments(
  loan_amount: number,
  interest_rate: number,
  tenure: number,
  prepayments: PrepaymentPlanLike[] = []
): {
  schedule: any[];
  payoff_month: number;
  total_interest_paid: number;
  total_prepaid: number;
  interest_saved: number;
} {
  const r = interest_rate / 12 / 100;
  const n = tenure;
  const emi = ComputeLoanEMI(loan_amount, interest_rate, tenure);
  const prepay_map = ComputePrepaymentAmounts(prepayments, 1, n);
  const schedule: any[] = [];
  let balance = loan_amount;
  let total_emi_paid = 0;
  let total_interest_paid = 0;
  let total_principal_paid = 0;
  let total_prepaid = 0;
  let payoff_month = n;

  for (let i = 0; i < n; i++) {
    const opening_balance = balance;
    const interest_amount = balance * r;
    const principal_amount = emi - interest_amount;
    total_emi_paid += emi;
    total_interest_paid += interest_amount;
    total_principal_paid += principal_amount;
    balance = balance - principal_amount;
    const prepayment = Math.min(prepay_map[i + 1] || 0, Math.max(0, balance));
    if (prepayment > 0) {
      balance -= prepayment;
      total_prepaid += prepayment;
    }
    schedule.push({
      seq: i,
      opening_balance,
      emi_paid: emi,
      interest_amount,
      principal_amount,
      prepayment,
      closing_balance: balance,
      total_emi_paid,
      total_interest_paid,
      total_principal_paid,
      total_prepaid,
    });
    if (balance <= 0.005) {
      payoff_month = i + 1;
      break;
    }
  }

  const original_interest = ComputeLoanAmortizationSchedule(loan_amount, interest_rate, tenure).reduce(
    (sum: number, row: any) => sum + row.interest_amount,
    0
  );

  return {
    schedule,
    payoff_month,
    total_interest_paid,
    total_prepaid,
    interest_saved: Math.max(0, original_interest - total_interest_paid),
  };
}

/**
 * Refinance analysis: what happens if the loan is closed at refinance_month
 * (outstanding settled) and restarted at a new rate/tenure. Pure what-if.
 */
export function ComputeRefinanceAnalysis({
  amount,
  interest_rate,
  tenure,
  refinance_month,
  new_rate,
  new_tenure,
  foreclosure_charge = 0,
}: {
  amount: number;
  interest_rate: number;
  tenure: number;
  refinance_month: number;
  new_rate: number;
  new_tenure: number;
  foreclosure_charge?: number;
}) {
  const old_schedule = ComputeLoanAmortizationSchedule(amount, interest_rate, tenure);
  const idx = Math.max(0, Math.min(Math.floor(refinance_month) - 1, old_schedule.length));
  const outstanding = idx === 0 ? amount : old_schedule[idx - 1].closing_balance;
  const old_emi = idx === 0 ? ComputeLoanEMI(amount, interest_rate, tenure) : old_schedule[idx - 1].emi_paid;
  const old_remaining_emis = old_schedule.length - idx;
  const old_remaining_interest = old_schedule.slice(idx).reduce((sum: number, row: any) => sum + row.interest_amount, 0);
  const new_emi = ComputeLoanEMI(outstanding, new_rate, new_tenure);
  const new_total_interest = new_emi * new_tenure - outstanding;
  const emi_diff = old_emi - new_emi;
  return {
    refinance_month: idx + 1,
    outstanding_balance: outstanding,
    old_emi,
    old_remaining_emis,
    old_remaining_interest,
    new_emi,
    new_tenure,
    new_total_interest,
    foreclosure_charge,
    interest_saved: old_remaining_interest - new_total_interest,
    net_savings: old_remaining_interest - new_total_interest - foreclosure_charge,
    breakeven_months: emi_diff > 0 ? Math.ceil(foreclosure_charge / emi_diff) : null,
  };
}

export function ComputeLoanEMI(loan_amount: number, interest_rate: number, tenure: number): number {
  const r = interest_rate / 12 / 100;
  const n = tenure;
  const emi = (loan_amount * r * (1 + r) ** n) / ((1 + r) ** n - 1);
  return emi;
}

export function ComputeLoanAmortizationSchedule(loan_amount: number, interest_rate: number, tenure: number): any[] {
  const r = interest_rate / 12 / 100;
  const n = tenure;
  const emi = ComputeLoanEMI(loan_amount, interest_rate, tenure);
  const amortization_schedule: any[] = [];
  let balance = loan_amount;
  let interest_amount = 0;
  let principal_amount = 0;
  let emi_paid = 0;
  let total_emi_paid = 0;
  let total_interest_paid = 0;
  let total_principal_paid = 0;
  let opening_balance = loan_amount;

  for (let i = 0; i < n; i++) {
    interest_amount = balance * r;
    principal_amount = emi - interest_amount;
    opening_balance = balance;
    balance = balance - principal_amount;
    emi_paid = emi;
    total_emi_paid += emi_paid;
    total_interest_paid += interest_amount;
    total_principal_paid += principal_amount;
    amortization_schedule.push({
      seq: i,
      opening_balance,
      emi_paid,
      interest_amount,
      principal_amount,
      closing_balance: balance,
      total_emi_paid,
      total_interest_paid,
      total_principal_paid,
    });
  }
  return amortization_schedule;
}

export function AmortizationScheduleByMonth(amortization_schedule: any[] = [], start_month: number, loan_account: LoanAccountLike): any[] {
  return amortization_schedule.map((_) => {
    _.month = _.seq + start_month;
    _.loan_id = loan_account._id;
    _.desc = `EMI No. ${_.seq + 1} - '${loan_account.title}'`;
    return _;
  });
}

export function MakeLoanScheduleByMonthToCashFlow({
  emi_paid,
  month,
  desc,
  ...other_info
}: any): any {
  return {
    _id: GetRandomString(6),
    type: "o",
    frequency: null,
    amount: emi_paid,
    desc,
    start_month: month,
    end_month: month,
    category: "e",
    active: true,
    primary: false,
    readonly: true,
    ...other_info,
  };
}

export function MakePrepaymentScheduleByMonthToCashFlow({
  month,
  prepayment,
  loan_id,
  title,
  prepayment_number,
}: {
  month: number;
  prepayment: number;
  loan_id: string;
  title: string;
  prepayment_number: number;
}): any {
  return {
    _id: GetRandomString(6),
    type: "o",
    frequency: null,
    amount: prepayment,
    desc: `Prepayment #${prepayment_number} - '${title}'`,
    start_month: month,
    end_month: month,
    category: "e",
    active: true,
    primary: false,
    readonly: true,
  };
}

export function MakeLoanObject({
  principal_amount,
  title,
  start_month,
  end_month,
  interest_rate,
  type,
  ref_id,
  _id = GetRandomString(6),
  deposit_to_bank = false,
  prepayments,
}: {
  principal_amount: number;
  title: string;
  start_month: number;
  end_month: number;
  interest_rate: number;
  type: number;
  ref_id?: string | null;
  _id?: string;
  deposit_to_bank?: boolean;
  prepayments?: PrepaymentPlanLike[];
}) {
  let message = "";
  let valid = true;
  let loan_obj: LoanAccountLike | null = null;

  if (!(end_month >= start_month)) {
    message = "end month should be >= start month  ";
    valid = false;
  }

  if (valid) {
    loan_obj = { title, principal_amount, start_month, end_month, _id, interest_rate, type, ref_id, deposit_to_bank, prepayments };
  }

  return { result: loan_obj, message, success: valid };
}

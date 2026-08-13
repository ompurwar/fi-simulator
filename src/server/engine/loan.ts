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
}) {
  let message = "";
  let valid = true;
  let loan_obj: LoanAccountLike | null = null;

  if (!(end_month >= start_month)) {
    message = "end month should be >= start month  ";
    valid = false;
  }

  if (valid) {
    loan_obj = { title, principal_amount, start_month, end_month, _id, interest_rate, type, ref_id, deposit_to_bank };
  }

  return { result: loan_obj, message, success: valid };
}

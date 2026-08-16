/** Plan snapshot assembler — port of usePlanEngine's computed outputs. */

import { DeepCopy } from "./utils";
import { GetMonthlyExpenseList, GetMonthlyIncomeList, type MonthlyStatement } from "./statements";
import {
  AggregateBalanceAndTransactionsByMonth,
  GenerateTransactionsAndAccountBalances,
  OpenAggregation,
  type AccountLike,
  type FDPLike,
  type LoanLike,
} from "./transactions";
import {
  AmortizationScheduleByMonth,
  ComputeLoanAmortizationSchedule,
  ComputeLoanAmortizationScheduleWithPrepayments,
  MakeLoanScheduleByMonthToCashFlow,
  MakePrepaymentScheduleByMonthToCashFlow,
} from "./loan";
import type { CashFlowLike, CashFlowChangeLike } from "./statements";

export interface PlanForSnapshot {
  cashflow_list?: CashFlowLike[];
  cashflow_change_list?: CashFlowChangeLike[];
  account_list?: AccountLike[];
  loan_accounts?: LoanLike[];
  fund_distribution_percentage?: FDPLike[];
  timestamp?: number;
}

export interface PlanSnapshot {
  income_list: CashFlowLike[];
  expense_list: CashFlowLike[];
  account_list: AccountLike[];
  loan_account_list: LoanLike[];
  emi_schedule: any[];
  emi_expense_cashflow: any[];
  cashflow: { income_statement: MonthlyStatement[]; expense_statement: MonthlyStatement[] };
  net_cashflow: { month: number; total: number }[];
  fund_distribution_percentage_list: FDPLike[];
  income_expense_and_net_cashflow: any[];
  account_balances_and_transactions: {
    transaction_list: any[];
    account_balances: any[];
    FDP_month_map: Record<number, FDPLike>;
  };
  aggregated_account_balances_and_transactions_by_month: any;
  balance_and_transaction_by_month: any[];
}

export function ComputePlanSnapshot(plan: PlanForSnapshot = {}, duration = 50): PlanSnapshot {
  const _plan = plan;
  const plan_duration = duration;

  function CashFlowToStatement(plan_obj: PlanForSnapshot, dur: number, emi_expense_cashflow: any[] = []) {
    let income_statement: MonthlyStatement[] = [];
    let expense_statement: MonthlyStatement[] = [];
    if (plan_obj) {
      let expense_list = (plan_obj.cashflow_list || []).filter((_: any) => _.category === "e");
      let income_list = (plan_obj.cashflow_list || []).filter((_: any) => _.category === "i");
      expense_list = [...expense_list, ...emi_expense_cashflow];
      let cashflow_change_list = plan_obj.cashflow_change_list || [];
      income_statement = GetMonthlyIncomeList(dur, income_list, cashflow_change_list);
      expense_statement = GetMonthlyExpenseList(dur, expense_list, cashflow_change_list);
    }
    return { income_statement: [...income_statement], expense_statement: [...expense_statement] };
  }

  const income_list = ((_plan.cashflow_list || []).filter((_) => _.category === "i") as CashFlowLike[]).map((income) => {
    const cashflow_changes = (_plan.cashflow_change_list || []).filter(
      (c) => c.cashflow_id === income._id && c.category === "i"
    );
    return { ...income, cashflow_changes };
  });

  const loan_account_list = DeepCopy(_plan.loan_accounts || []).sort((a: any, b: any) => a.start_month - b.start_month);

  const emi_schedule: any[] = [];
  const emi_expense_cashflow: any[] = [];
  loan_account_list.forEach((loan_obj: any) => {
    const tenure = loan_obj.end_month - loan_obj.start_month + 1;
    const prepayments = loan_obj.prepayments || [];
    if (prepayments.length > 0) {
      // Stored prepayment months are plan-absolute (consistent with the loan's
      // own start_month); the engine works in loan-relative months (1 = first EMI).
      const relative = prepayments
        .map((p: any) => ({ ...p, start_month: p.start_month - loan_obj.start_month + 1 }))
        .filter((p: any) => p.start_month >= 1);
      const { schedule } = ComputeLoanAmortizationScheduleWithPrepayments(
        loan_obj.principal_amount,
        loan_obj.interest_rate,
        tenure,
        relative
      );
      const by_month = AmortizationScheduleByMonth(schedule, loan_obj.start_month, loan_obj);
      emi_schedule.push(...by_month);
      let prepayment_number = 0;
      by_month.forEach((row: any) => {
        if (row.prepayment > 0) {
          prepayment_number += 1;
          emi_expense_cashflow.push(
            MakePrepaymentScheduleByMonthToCashFlow({
              month: row.month,
              prepayment: row.prepayment,
              loan_id: loan_obj._id,
              title: loan_obj.title,
              prepayment_number,
            })
          );
        }
      });
    } else {
      const schedule = ComputeLoanAmortizationSchedule(
        loan_obj.principal_amount,
        loan_obj.interest_rate,
        tenure
      );
      emi_schedule.push(...AmortizationScheduleByMonth(schedule, loan_obj.start_month, loan_obj));
    }
  });

  emi_expense_cashflow.push(...emi_schedule.map((emi_obj) => MakeLoanScheduleByMonthToCashFlow(emi_obj)));

  const expense_list = [
    ...((_plan.cashflow_list || []).filter((_) => _.category === "e") as CashFlowLike[]),
    ...emi_expense_cashflow,
  ].map((expense) => {
    const cashflow_changes = (_plan.cashflow_change_list || []).filter(
      (c) => c.cashflow_id === expense._id && c.category === "e"
    );
    return { ...expense, cashflow_changes };
  });

  const account_list = DeepCopy(_plan.account_list || []).sort((a: any, b: any) => (a.start_month || 0) - (b.start_month || 0));

  const cashflow = _plan ? CashFlowToStatement(_plan, plan_duration, emi_expense_cashflow) : { income_statement: [], expense_statement: [] };

  const net_cashflow = cashflow.income_statement.map((raw_income_obj, index) => {
    const expense_obj = cashflow.expense_statement[index];
    const net = raw_income_obj.total_income! - expense_obj.total_expense!;
    return { month: expense_obj.month, total: parseInt(String(net)) };
  });

  const fund_distribution_percentage_list = DeepCopy(_plan.fund_distribution_percentage || []).sort(
    (a: any, b: any) => a.start_month - b.start_month
  );

  const account_balances_and_transactions = GenerateTransactionsAndAccountBalances(
    cashflow.income_statement,
    cashflow.expense_statement,
    fund_distribution_percentage_list,
    account_list,
    loan_account_list
  );

  const aggregated_account_balances_and_transactions_by_month = AggregateBalanceAndTransactionsByMonth(
    account_balances_and_transactions.transaction_list,
    account_balances_and_transactions.account_balances,
    account_list
  );

  const balance_and_transaction_by_month = OpenAggregation(
    aggregated_account_balances_and_transactions_by_month.result
  );

  const income_expense_and_net_cashflow = cashflow.income_statement.map((income_obj, index) => {
    const obj: any = { month: income_obj.month };
    obj.net_cashflow = net_cashflow[index];
    obj.income = income_obj;
    obj.expense = cashflow.expense_statement[index];
    const balances_for_the_month = balance_and_transaction_by_month.filter((_) => _.month === obj.month);
    obj.balances = balances_for_the_month.length ? balances_for_the_month[balances_for_the_month.length - 1]?.data : 0;
    return obj;
  });

  return {
    income_list,
    expense_list,
    account_list,
    loan_account_list,
    emi_schedule,
    emi_expense_cashflow,
    cashflow,
    net_cashflow,
    fund_distribution_percentage_list,
    income_expense_and_net_cashflow,
    account_balances_and_transactions,
    aggregated_account_balances_and_transactions_by_month,
    balance_and_transaction_by_month,
  };
}

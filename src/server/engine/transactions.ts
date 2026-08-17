/** Transaction + account balance simulation (ported from transctions.js). */

import { GetHashmap, GetDate } from "./utils";
import type { MonthlyStatement } from "./statements";

export interface AccountLike {
  _id: string;
  title: string;
  init_balance: number;
  category: "s" | "e" | "i";
  type: "a" | "l";
  roi?: number;
  start_month?: number;
}

export interface LoanLike {
  _id: string;
  title: string;
  principal_amount: number;
  start_month: number;
  end_month: number;
  interest_rate: number;
  deposit_to_bank?: boolean;
}

export interface FDPLike {
  _id?: string;
  start_month?: number;
  end_month?: number;
  s: number;
  e: number;
  i: number;
  strategy?: string;
}

export interface Transaction {
  month: number;
  account_id: string;
  tran_type: "cr" | "dr";
  amount: number;
  tran_desc: string;
  acc_name?: string;
}

export interface AccountBalance {
  month: number;
  account_id: string;
  balance: number;
  category: string;
  FDP?: FDPLike;
  acc_name?: string;
}

export interface TxnResult {
  transaction_list: Transaction[];
  account_balances: AccountBalance[];
  FDP_month_map: Record<number, FDPLike>;
}

function InitiateTransaction(month: number, account_id: string, tran_type: "cr" | "dr", amount: number, tran_desc: string): Transaction {
  return { month, account_id, tran_type, amount, tran_desc };
}
function InitiateAccountBalance(month: number, account_id: string, balance: number, category: string): AccountBalance {
  return { month, account_id, balance, category };
}
function GetLoanStartingOnMonth(month: number, loan_accounts: LoanLike[] = []): LoanLike[] {
  // Disbursement happens the month BEFORE the first EMI (start_month): the money
  // arrives first, the first EMI falls due at start_month. Plans with no prior
  // month (start_month 1) fall back to disbursing at month 1.
  return loan_accounts.filter((_) => {
    if (_.deposit_to_bank !== true) return false;
    const disburse_month = _.start_month > 1 ? _.start_month - 1 : 1;
    return disburse_month === month;
  });
}
function GetAccountByCategory(category: string, account_list: AccountLike[] = []): AccountLike {
  return account_list.find((_) => _.category === category && _.type === "a")!;
}
function GetBalanceBy(month: number, account_id: string, balance_list: AccountBalance[] = []): AccountBalance | undefined {
  return balance_list.find((_) => _.month === month && _.account_id === account_id);
}
function IsROIApplicable(month_number: number, account: AccountLike): boolean {
  return month_number % 12 === 0 && !!account.roi;
}
function GetROI(_month: number, account: AccountLike): number {
  return account.roi || 12;
}
function GetRollingAvgBalance(month: number, account_id: string, balance_list: AccountBalance[] = [], months_to_average = 12): AccountBalance {
  const last_12_month_balances = balance_list.filter(
    (_) => _.month >= month - months_to_average + 1 && _.month <= month && _.account_id === account_id
  );
  const avg_balance: AccountBalance = {
    ...last_12_month_balances[0],
    balance: last_12_month_balances.reduce((acc, curr) => acc + (curr.balance || 0), 0),
  };
  avg_balance.balance = avg_balance.balance / last_12_month_balances.length;
  return avg_balance;
}
function DistributeFunds(amount: number, fund_distribution_percentage: FDPLike): { e: number; s: number; i: number } {
  return {
    e: amount * (fund_distribution_percentage.e / 100),
    s: amount * (fund_distribution_percentage.s / 100),
    i: amount * (fund_distribution_percentage.i / 100),
  };
}
function ComputeNetIncomeFOrMonth(_month: number, _income_statement: MonthlyStatement[] = [], _expense_statement: MonthlyStatement[] = []): number {
  return 0;
}
function GetDistributionPercentageForMonth(
  month: number,
  income_statement: MonthlyStatement[] = [],
  expense_statement: MonthlyStatement[] = [],
  account_balances: AccountBalance[] = [],
  fund_distribution_percentage_list: FDPLike[] = [],
  account_list: AccountLike[] = []
): FDPLike {
  let distribution = fund_distribution_percentage_list.find(
    (_) => (_.start_month ?? 0) <= month && month <= (_.end_month ?? 0)
  );
  if (distribution) distribution.strategy = "Custom";
  if (!distribution) distribution = ComputeDistributionPercentage(income_statement, expense_statement, account_balances, month, account_list);
  return distribution;
}
function ComputeDistributionPercentage(
  _income_statement: MonthlyStatement[] = [],
  expense_statement: MonthlyStatement[] = [],
  account_balances: AccountBalance[] = [],
  month: number,
  account_list: AccountLike[] = []
): FDPLike {
  const avg_expense = ComputeAvgExpense(expense_statement, month);
  const emergency_account = GetAccountByCategory("e", account_list);
  const saving_account = GetAccountByCategory("s", account_list);
  const ideal_runway = 6;
  const ideal_long_runway = 12;
  const ideal_saving_runway = 3;
  const month_for_balance = month === 1 ? 1 : month - 1;
  const emergency_balance = GetBalanceBy(month_for_balance, emergency_account?._id, account_balances);
  const saving_balance = GetBalanceBy(month_for_balance, saving_account?._id, account_balances);

  let strategy = "Balanced Growth";
  let e = 10;
  let s = 20;
  let i = 70;

  if (!emergency_balance || !saving_balance) {
    return { e, s, i, strategy };
  }

  if (emergency_balance.balance < avg_expense * ideal_runway) {
    strategy = "War Chest";
    e = 70;
    s = 20;
    i = 10;
  } else if (
    emergency_balance.balance > avg_expense * ideal_runway &&
    emergency_balance.balance < avg_expense * ideal_long_runway
  ) {
    if (saving_balance.balance < avg_expense * ideal_saving_runway) {
      strategy = "Savings";
      e = 20;
      s = 50;
      i = 30;
    } else {
      strategy = "Balanced Growth";
      e = 10;
      s = 20;
      i = 70;
    }
  } else {
    if (saving_balance.balance < avg_expense * ideal_saving_runway) {
      strategy = "Savings + Growth";
      e = 5;
      s = 25;
      i = 70;
    } else {
      strategy = "Hyper Growth";
      e = 5;
      s = 10;
      i = 85;
    }
  }

  return { e, s, i, strategy };
}
function GenerateCreditTxnForMonth(
  net_income: number,
  month: number,
  fund_distribution_percentage: FDPLike,
  account_list: AccountLike[] = []
): Transaction[] {
  const transaction_list: Transaction[] = [];
  const fund_breakup = DistributeFunds(net_income, fund_distribution_percentage);
  for (const category in fund_breakup) {
    if (Object.hasOwnProperty.call(fund_breakup, category)) {
      const amount = (fund_breakup as Record<string, number>)[category];
      const percentage = fund_distribution_percentage[category as "e" | "s" | "i"];
      const account = GetAccountByCategory(category, account_list);
      if (account) {
        transaction_list.push(
          InitiateTransaction(month, account._id, "cr", amount, `${percentage}% of Net Cashflow`)
        );
      }
    }
  }
  return transaction_list;
}
function GenerateDebitTxnForMonth(
  net_expense: number,
  month: number,
  account_list: AccountLike[] = [],
  account_balances: AccountBalance[] = [],
  account_map_for_current_month_running_balance: Record<string, number>
): Transaction[] {
  const transaction_list: Transaction[] = [];
  let amount_to_debit = Math.abs(net_expense);
  const emergency = GetAccountByCategory("e", account_list);
  const savings = GetAccountByCategory("s", account_list);
  const investment = GetAccountByCategory("i", account_list);
  const accounts_in_order = [savings, emergency, investment];

  for (const account of accounts_in_order) {
    if (!account) continue;
    const month_for_balance = month === 1 ? 1 : month - 1;
    const balance = GetBalanceBy(month_for_balance, account._id, account_balances);
    let total_running_balance = 0;
    if (account_map_for_current_month_running_balance[account._id])
      total_running_balance += account_map_for_current_month_running_balance[account._id];

    if (balance) {
      const money_available = balance.balance + total_running_balance;
      if (money_available >= amount_to_debit) {
        transaction_list.push(InitiateTransaction(month, account._id, "dr", amount_to_debit, "To fund expenses"));
        amount_to_debit = 0;
      }
      if (money_available < amount_to_debit) {
        transaction_list.push(InitiateTransaction(month, account._id, "dr", money_available, "To fund expenses"));
        amount_to_debit -= money_available;
      }
    }
  }
  return transaction_list;
}

export function GenerateTransactionsAndAccountBalances(
  income_statement: MonthlyStatement[] = [],
  expense_statement: MonthlyStatement[] = [],
  fund_distribution_percentage_list: FDPLike[] = [],
  account_list: AccountLike[] = [],
  loan_accounts: LoanLike[] = []
): TxnResult {
  const transaction_list: Transaction[] = [];
  let account_balances: AccountBalance[] = [];
  const account_map = GetHashmap(account_list, (account: any) => account._id);
  const FDP_month_map: Record<number, FDPLike> = {};
  if (income_statement.length !== expense_statement.length) return { transaction_list, account_balances, FDP_month_map };

  const emergency = GetAccountByCategory("e", account_list);
  const savings = GetAccountByCategory("s", account_list);
  const investment = GetAccountByCategory("i", account_list);

  income_statement.forEach((income, index) => {
    if (index + 1 === 1) {
      if (emergency) {
        transaction_list.push(InitiateTransaction(1, emergency._id, "cr", emergency.init_balance, "Initial Balance"));
      }
      if (savings) {
        transaction_list.push(InitiateTransaction(1, savings._id, "cr", savings.init_balance, "Initial Balance"));
      }
      if (investment) {
        transaction_list.push(InitiateTransaction(1, investment._id, "cr", investment.init_balance, "Initial Balance"));
      }

      const account_balance_map_for_current_month: Record<string, number> = {};
      transaction_list.forEach((txn) => {
        if (!account_balance_map_for_current_month[txn.account_id]) account_balance_map_for_current_month[txn.account_id] = 0;
        if (txn.tran_type === "cr") account_balance_map_for_current_month[txn.account_id] += txn.amount;
        if (txn.tran_type === "dr") account_balance_map_for_current_month[txn.account_id] -= txn.amount;
      });

      for (const account_id in account_balance_map_for_current_month) {
        if (Object.hasOwnProperty.call(account_balance_map_for_current_month, account_id)) {
          const current_month_balance_amount = account_balance_map_for_current_month[account_id];
          const last_mont_balance = GetBalanceBy(1, account_id, account_balances);
          const { category } = account_map[account_id] || { category: "" };
          let initial_balance = 0;
          if (last_mont_balance) initial_balance = last_mont_balance.balance;
          account_balances.push(InitiateAccountBalance(1, account_id, initial_balance + current_month_balance_amount, category));
        }
      }
    }

    const expense = expense_statement[index];
    const { month, total_income = 0 } = income;
    const { total_expense = 0 } = expense;
    let txn_for_current_month: Transaction[] = [];
    const account_balance_map_for_current_month: Record<string, number> = {};
    const net_income = total_income - total_expense;
    const month_for_balance = month === 1 ? 1 : month - 1;
    const fund_distribution_percentage = GetDistributionPercentageForMonth(
      month,
      income_statement,
      expense_statement,
      account_balances,
      fund_distribution_percentage_list,
      account_list
    );
    if (!FDP_month_map[month]) FDP_month_map[month] = fund_distribution_percentage;

    const account_map_for_current_month_running_balance: Record<string, number> = {};
    const deposit_to_bank_loans_for_the_month = GetLoanStartingOnMonth(month, loan_accounts);

    deposit_to_bank_loans_for_the_month.forEach(({ principal_amount, title }) => {
      if (savings) {
        if (!account_map_for_current_month_running_balance[savings._id])
          account_map_for_current_month_running_balance[savings._id] = 0;
        account_map_for_current_month_running_balance[savings._id] += principal_amount;
        txn_for_current_month.push(InitiateTransaction(month, savings._id, "cr", principal_amount, `'Loan' ${title}`));
      }
    });

    if (month > 1) {
      [investment, savings, emergency].forEach((account) => {
        if (!account) return;
        if (!account_map_for_current_month_running_balance[account._id])
          account_map_for_current_month_running_balance[account._id] = 0;
        if (IsROIApplicable(month, account)) {
          const balance = GetRollingAvgBalance(month - 1, account._id, account_balances, 12);
          if (balance && balance.balance) {
            const roi = GetROI(month, account);
            const total_balance = balance.balance;
            const amount = total_balance * (roi / 100);
            account_map_for_current_month_running_balance[account._id] += amount;
            txn_for_current_month.push(InitiateTransaction(month, account._id, "cr", amount, `Interest of ${roi} %`));
          }
        }
      });
    }

    if (net_income >= 0) {
      txn_for_current_month = [
        ...txn_for_current_month,
        ...GenerateCreditTxnForMonth(net_income, month, fund_distribution_percentage, account_list),
      ];
    } else {
      txn_for_current_month = [
        ...txn_for_current_month,
        ...GenerateDebitTxnForMonth(net_income, month, account_list, account_balances, account_map_for_current_month_running_balance),
      ];
    }

    txn_for_current_month.forEach((txn) => {
      if (!account_balance_map_for_current_month[txn.account_id]) account_balance_map_for_current_month[txn.account_id] = 0;
      if (txn.tran_type === "cr") account_balance_map_for_current_month[txn.account_id] += txn.amount;
      if (txn.tran_type === "dr") account_balance_map_for_current_month[txn.account_id] -= txn.amount;
      transaction_list.push(txn);
    });

    for (const account_id in account_balance_map_for_current_month) {
      if (Object.hasOwnProperty.call(account_balance_map_for_current_month, account_id)) {
        const current_month_balance_amount = account_balance_map_for_current_month[account_id];
        const last_mont_balance = GetBalanceBy(month_for_balance, account_id, account_balances);
        const { category } = account_map[account_id] || { category: "" };
        let initial_balance = 0;
        if (last_mont_balance) initial_balance = last_mont_balance.balance;
        const new_balance = InitiateAccountBalance(month, account_id, initial_balance + current_month_balance_amount, category);
        if (month === 1) {
          account_balances = account_balances.filter((_) => !(_.month === 1 && _.account_id === account_id));
        }
        account_balances.push(new_balance);
      }
    }
  });

  return { transaction_list, account_balances, FDP_month_map };
}

export function AggregateBalanceAndTransactionsByMonth(
  transaction_list: Transaction[] = [],
  account_balances: AccountBalance[] = [],
  account_list: AccountLike[] = []
) {
  const account_map = GetHashmap(account_list, (account: any) => account._id);

  const aggregates_transactions = transaction_list.reduce<Record<number, Record<string, Transaction[]>>>((acc, transaction) => {
    const { month, account_id, tran_desc, tran_type, amount } = transaction;
    const _txn = { month, account_id, tran_desc, tran_type, amount, acc_name: account_map[account_id]?.title };
    if (!acc[month]) acc[month] = {};
    if (!acc[month][account_id]) acc[month][account_id] = [];
    acc[month][account_id].push(_txn);
    return acc;
  }, {});

  const result = account_balances.reduce<Record<number, Record<string, any>>>((acc, account_balance) => {
    const { month, account_id, balance, category, FDP } = account_balance;
    const _balance = { month, account_id, balance, category, acc_name: account_map[account_id]?.title, FDP };
    const _txn = aggregates_transactions[month]?.[account_id];
    if (!acc[month]) acc[month] = {};
    if (!acc[month][account_id])
      acc[month][account_id] = { txn: _txn, balance: [], month };
    acc[month][account_id].balance.push(_balance);
    return acc;
  }, {});

  return { result, aggregates_transactions };
}

export function OpenAggregation(aggregates_transactions: Record<number, Record<string, any>> = {}): any[] {
  const result: any[] = [];
  for (const month in aggregates_transactions) {
    if (Object.hasOwnProperty.call(aggregates_transactions, month)) {
      const data_by_account_id = aggregates_transactions[month];
      const balance_and_txns = { month: parseInt(month), data: [] as any[] };
      for (const account_id in data_by_account_id) {
        if (Object.hasOwnProperty.call(data_by_account_id, account_id)) {
          const data = data_by_account_id[account_id];
          balance_and_txns.data.push({ ...data, month: parseInt(month) });
        }
      }
      result.push(balance_and_txns);
    }
  }
  result.sort((a, b) => a.month - b.month);
  return result;
}

export function ComputeAvgExpense(expense_statement: MonthlyStatement[] = [], from_month: number): number {
  const start_index = from_month - 1;
  let avg_expense = 0;
  let element_counter = 0;
  for (let index = start_index; index < start_index + 12; index++) {
    const element = expense_statement[index];
    if (element) {
      avg_expense += element.total_expense || 0;
      element_counter++;
    }
  }
  avg_expense = element_counter ? avg_expense / element_counter : 0;
  if (expense_statement.length === 0) avg_expense = 0;
  return avg_expense;
}

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
import { ComputeAssetSchedule, ComputeAssetScenarios, ComputeIncomeTaxExpenseSchedule } from "./assets";
import { createBalanceLedger, resolveWithdrawalOrder } from "./funding";
import type { TaxRuleSet } from "../tax/schema";
import type { CashFlowLike, CashFlowChangeLike } from "./statements";

export interface PlanForSnapshot {
  cashflow_list?: CashFlowLike[];
  cashflow_change_list?: CashFlowChangeLike[];
  account_list?: AccountLike[];
  loan_accounts?: LoanLike[];
  fund_distribution_percentage?: FDPLike[];
  asset_list?: any[];
  tax_settings?: any;
  /** user-set outflow ladder (account ids, first = drained first) */
  withdrawal_order?: string[];
  /** SIP funding policy — protect_emergency_for_sip defaults to true */
  withdrawal_settings?: { protect_emergency_for_sip?: boolean };
  timestamp?: number;
}

export interface SnapshotOptions {
  /** versioned rule set resolved from Tax_Rule_Store (asset TDS / capital gains / income tax) */
  tax_rules?: TaxRuleSet;
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
  /** asset-class fields — present only when the plan has assets or tax enabled */
  asset_month_map?: Record<number, any[]>;
  asset_summary?: any;
  tax_summary?: Record<string, any>;
  tax_expense_cashflow?: any[];
  bucket_growth?: Record<string, { value: number; growth_rate: number }>;
  asset_scenarios?: any;
  /** SIP instalments the withdrawal ladder could not fund (skipped, unfunded in the asset) */
  skipped_sips?: { month: number; asset_id: string; title: string; amount: number }[];
  /**
   * Monthly expense shortfalls the accounts could NOT cover. Expenses are
   * obligations and are never skipped — this list exposes the plan's gaps
   * (only present when there is at least one unfunded month).
   */
  unfunded_expenses?: { month: number; amount: number }[];
}

export function ComputePlanSnapshot(
  plan: PlanForSnapshot = {},
  duration = 50,
  options: SnapshotOptions = {}
): PlanSnapshot {
  const _plan = plan;
  const plan_duration = duration;
  const rules = options.tax_rules;
  const has_assets = Array.isArray(_plan.asset_list) && _plan.asset_list.length > 0;
  const has_tax = !!_plan.tax_settings?.income_tax_enabled;
  const asset_mode = has_assets || has_tax;

  function CashFlowToStatement(plan_obj: PlanForSnapshot, dur: number, auto_expense_cashflow: any[] = []) {
    let income_statement: MonthlyStatement[] = [];
    let expense_statement: MonthlyStatement[] = [];
    if (plan_obj) {
      let expense_list = (plan_obj.cashflow_list || []).filter((_: any) => _.category === "e");
      const income_list = (plan_obj.cashflow_list || []).filter((_: any) => _.category === "i");
      expense_list = [...expense_list, ...auto_expense_cashflow];
      const cashflow_change_list = plan_obj.cashflow_change_list || [];
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

  // ---- asset projection + auto income-tax expense ----
  let asset_schedule: ReturnType<typeof ComputeAssetSchedule> | null = null;
  let tax_expense_cashflow: any[] = [];
  let tax_prerun_summary: ReturnType<typeof ComputeAssetSchedule>["tax_summary"] | null = null;
  if (asset_mode && rules) {
    // PHASE A — full-funding preview (legacy math). Bucket balances do not
    // exist yet, and the annual income-tax expense needs the asset income
    // streams; the real (funding-aware) schedule is re-run in PHASE B below.
    const preview = ComputeAssetSchedule(_plan, plan_duration, rules);
    tax_prerun_summary = preview.tax_summary;
    if (_plan.tax_settings?.income_tax_enabled) {
      const income_statement = GetMonthlyIncomeList(
        plan_duration,
        income_list,
        _plan.cashflow_change_list || []
      );
      tax_expense_cashflow = ComputeIncomeTaxExpenseSchedule(
        _plan,
        plan_duration,
        rules,
        _plan.tax_settings,
        income_statement,
        preview.tax_summary
      );
    }
  }

  const expense_list = [
    ...((_plan.cashflow_list || []).filter((_) => _.category === "e") as CashFlowLike[]),
    ...emi_expense_cashflow,
    ...tax_expense_cashflow,
  ].map((expense) => {
    const cashflow_changes = (_plan.cashflow_change_list || []).filter(
      (c) => c.cashflow_id === expense._id && c.category === "e"
    );
    return { ...expense, cashflow_changes };
  });

  const account_list = DeepCopy(_plan.account_list || []).sort((a: any, b: any) => (a.start_month || 0) - (b.start_month || 0));

  const cashflow = _plan
    ? CashFlowToStatement(_plan, plan_duration, [...emi_expense_cashflow, ...tax_expense_cashflow])
    : { income_statement: [], expense_statement: [] };

  const net_cashflow = cashflow.income_statement.map((raw_income_obj, index) => {
    const expense_obj = cashflow.expense_statement[index];
    const net = raw_income_obj.total_income! - expense_obj.total_expense!;
    return { month: expense_obj.month, total: parseInt(String(net)) };
  });

  const fund_distribution_percentage_list = DeepCopy(_plan.fund_distribution_percentage || []).sort(
    (a: any, b: any) => a.start_month - b.start_month
  );

  let account_balances_and_transactions = GenerateTransactionsAndAccountBalances(
    cashflow.income_statement,
    cashflow.expense_statement,
    fund_distribution_percentage_list,
    account_list,
    loan_account_list,
    _plan.withdrawal_order
  );

  // PHASE B+C (fixed-point) — SIP funding and expense funding must see the SAME
  // monthly pools:
  //   - SIPs draw from the withdrawal ladder (funding account first, then the
  //     ladder; an instalment is SKIPPED — never partially funded, never
  //     overdrawing — when the ladder cannot cover it),
  //   - expense/EMI/prepayment drawdowns fund from pools AFTER asset credits
  //     settle and the month's SIP debits settle (credits-first rule).
  // Asset txns are injected into the bucket funding pools (balance entries stay
  // pure; the asset pass applies its own txns once) and the bucket↔asset
  // passes re-iterate until the asset decisions stabilise.
  if (asset_mode && rules) {
    const ordered_accounts = resolveWithdrawalOrder(account_list, _plan.withdrawal_order);
    const protect_emergency = _plan.withdrawal_settings?.protect_emergency_for_sip !== false;
    let previous_txns: any[] | null = null;
    let stable = false;
    for (let round = 0; round < 4; round++) {
      // bucket pass — expenses fund from pools that include the asset flows
      const bucket_run = GenerateTransactionsAndAccountBalances(
        cashflow.income_statement,
        cashflow.expense_statement,
        fund_distribution_percentage_list,
        account_list,
        loan_account_list,
        _plan.withdrawal_order,
        previous_txns
          ? (account_id: string, month: number): number => {
              let sum = 0;
              const acc = String(account_id);
              for (const txn of previous_txns!) {
                if (String(txn.account_id) !== acc) continue;
                if (txn.month < month) sum += txn.tran_type === "cr" ? txn.amount : -txn.amount;
                else if (txn.month === month) sum += txn.tran_type === "cr" ? txn.amount : -txn.amount;
              }
              return sum;
            }
          : undefined
      );
      account_balances_and_transactions = bucket_run;

      // asset pass — SIPs/credits applied onto those balances (real apply)
      const ledger = createBalanceLedger(bucket_run.account_balances);
      const candidate = ComputeAssetSchedule(_plan, plan_duration, rules, {
        ctx: {
          getBalance: ledger.get,
          applyTxn: (txn: any) => ledger.apply(txn),
          orderedAccounts: ordered_accounts,
          protectEmergency: protect_emergency,
        },
      });
      stable =
        previous_txns !== null &&
        candidate.txns.length === previous_txns.length &&
        JSON.stringify(candidate.txns) === JSON.stringify(previous_txns);
      asset_schedule = candidate;
      if (stable) break;
      previous_txns = candidate.txns;
    }
    const final_asset = asset_schedule!;
    account_balances_and_transactions = {
      transaction_list: [
        ...account_balances_and_transactions.transaction_list,
        ...final_asset.txns,
      ],
      account_balances: account_balances_and_transactions.account_balances,
      FDP_month_map: account_balances_and_transactions.FDP_month_map,
      unfunded_expense_by_month: account_balances_and_transactions.unfunded_expense_by_month,
    };
  }

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

  const snapshot: PlanSnapshot = {
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

  // Expense gaps never disappear: expose months the accounts couldn't fund.
  const unfunded_expense_by_month = account_balances_and_transactions.unfunded_expense_by_month || {};
  const unfunded_months = Object.keys(unfunded_expense_by_month).map((month) => ({
    month: parseInt(month),
    amount: unfunded_expense_by_month[Number(month)],
  }));
  if (unfunded_months.length > 0) {
    snapshot.unfunded_expenses = unfunded_months;
  }

  // Asset/tax fields only when the plan uses them — old plans stay byte-identical.
  if (asset_schedule) {
    // the income-tax expense used the full-funding preview's per-FY numbers
    // (incl. TDS credit); carry that credit onto the real schedule's summary.
    if (tax_prerun_summary && _plan.tax_settings?.income_tax_enabled) {
      for (const fy of Object.keys(tax_prerun_summary)) {
        const credit = tax_prerun_summary[fy]?.tds_credit_used;
        if (credit !== undefined) {
          if (!asset_schedule.tax_summary[fy]) asset_schedule.tax_summary[fy] = tax_prerun_summary[fy];
          else asset_schedule.tax_summary[fy].tds_credit_used = credit;
        }
      }
    }
    snapshot.asset_month_map = asset_schedule.asset_month_map;
    snapshot.asset_summary = asset_schedule.asset_summary;
    snapshot.tax_summary = asset_schedule.tax_summary;
    snapshot.bucket_growth = asset_schedule.bucket_growth;
    snapshot.tax_expense_cashflow = tax_expense_cashflow;
    if (asset_schedule.skipped_sips.length > 0) {
      snapshot.skipped_sips = asset_schedule.skipped_sips;
    }
    if (has_assets) {
      snapshot.asset_scenarios = ComputeAssetScenarios(_plan, plan_duration, rules);
    }
  }

  return snapshot;
}

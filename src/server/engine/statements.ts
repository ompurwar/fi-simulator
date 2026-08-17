/** Monthly income/expense statement services (ported verbatim). */

export interface CashFlowLike {
  _id: string;
  category: "i" | "e";
  type: "o" | "p";
  frequency: "m" | "q" | "h" | "y" | null;
  amount: number;
  desc: string;
  start_month: number;
  end_month: number;
  active: boolean;
  primary?: boolean;
}

export interface CashFlowChangeLike {
  _id: string;
  category: "i" | "e";
  active: boolean;
  change_type: "f" | "p";
  value: number;
  cashflow_id: string;
  start_month: number;
  end_month: number;
  frequency: "m" | "q" | "h" | "y" | "o";
}

export interface StatementBreakdown {
  id: string;
  amount: number;
  change: number;
  cashflow_title: string;
}

export interface MonthlyStatement {
  month: number;
  total_income?: number;
  income_breakdown?: StatementBreakdown[];
  total_expense?: number;
  expense_breakdown?: StatementBreakdown[];
}

const frequency_month_map: Record<string, number> = { m: 0, q: 3, h: 6, y: 12 };

export function CashFlowChangesToCashFlowChangesByMonth(
  cashflow_change_list: CashFlowChangeLike[] = [],
  cap = 10
): (CashFlowChangeLike & { month: number })[] {
  const month_cashflow_change_list: (CashFlowChangeLike & { month: number })[] = [];

  cashflow_change_list.forEach((cashflow_change) => {
    if (cashflow_change.active) {
      const {
        _id,
        change_type,
        value,
        cashflow_id,
        start_month,
        end_month,
        frequency,
      } = cashflow_change;

      let counter = 0;
      for (let month = start_month; month <= end_month; month++) {
        counter++;
        const freq = frequency_month_map[frequency] ?? 0;
        if (counter % freq === 1 || freq === 0) {
          const cashflow_change_by_month: any = { ...cashflow_change };
          delete cashflow_change_by_month.start_month;
          delete cashflow_change_by_month.end_month;
          cashflow_change_by_month.month = month;
          cashflow_change_by_month._id = `${_id}-${month}`;
          month_cashflow_change_list.push(cashflow_change_by_month);
        }
        if (month === cap) break;
      }
    }
  });
  return month_cashflow_change_list;
}

function GetCashFlowChangeFor(
  month: number,
  cashflow_id: string,
  category: string,
  cashflow_change_list: (CashFlowChangeLike & { month: number })[] = []
): (CashFlowChangeLike & { month: number }) | undefined {
  return cashflow_change_list.find(
    (cashflow_change) =>
      cashflow_change.month === month &&
      cashflow_change.cashflow_id === cashflow_id &&
      cashflow_change.category === category
  );
}

function ComputeUpdatedAmount(initial_amount: number, change_type: string, change_value: number): number {
  let update_amount = 0;
  if (change_type === "f") update_amount = initial_amount + change_value;
  if (change_type === "p") {
    const change_amount = (change_value * initial_amount) / 100;
    update_amount = initial_amount + change_amount;
  }
  return update_amount;
}

function IsActive(cash_flow: CashFlowLike, current_month: number): boolean {
  return current_month >= cash_flow.start_month && current_month <= cash_flow.end_month;
}

function GetActiveList(cash_flow_list: CashFlowLike[] = [], current_month: number): CashFlowLike[] {
  return cash_flow_list.filter((cf) => IsActive(cf, current_month));
}

function CreateBreakDownObj(id: string, amount: number, change: number, cashflow_title: string): StatementBreakdown {
  return Object.freeze({ id, amount, change, cashflow_title });
}

export function GetMonthlyIncomeList(
  plan_duration: number,
  income_list: CashFlowLike[] = [],
  cashflow_changes: CashFlowChangeLike[] = []
): MonthlyStatement[] {
  const monthly_income_list: MonthlyStatement[] = [];
  const cashflow_change_list_by_month = CashFlowChangesToCashFlowChangesByMonth(cashflow_changes, plan_duration);

  const recent_income_value_map: Record<string, number> = {};
  const income_month_number: Record<string, number> = {};

  function IncrementIncomeMonthNumber(income_id: string) {
    income_month_number[income_id] = (income_month_number[income_id] || 0) + 1;
  }
  function GetIncomeMonthNumber(income_id = ""): number {
    return income_month_number[income_id];
  }
  function SetRecentIncomeValue(income_id = "", value: number) {
    recent_income_value_map[income_id] = value;
  }
  function GetRecentIncomeValue(income_id = ""): number {
    return recent_income_value_map[income_id];
  }

  for (let current_month = 1; current_month <= plan_duration; current_month++) {
    let cashflow_change: (CashFlowChangeLike & { month: number }) | undefined;
    const active_income_list = GetActiveList(income_list, current_month);
    const monthly_income_object: MonthlyStatement = {
      month: current_month,
      total_income: 0,
      income_breakdown: [],
    };

    active_income_list.forEach((active_income) => {
      if (active_income.type === "p") {
        const { frequency } = active_income;
        IncrementIncomeMonthNumber(active_income._id);
        const current_income_month = GetIncomeMonthNumber(active_income._id);

        if (
          active_income.start_month === current_month ||
          current_income_month % ((frequency_month_map as Record<string, number>)[frequency as string] ?? 0) === 1 ||
          ((frequency_month_map as Record<string, number>)[frequency as string] ?? 0) === 0
        ) {
          if (active_income.start_month === current_month)
            SetRecentIncomeValue(active_income._id, active_income.amount);

          const current_income = GetRecentIncomeValue(active_income._id) || 0;
          cashflow_change = GetCashFlowChangeFor(current_month, active_income._id, "i", cashflow_change_list_by_month);
          let updated_income = current_income;

          if (cashflow_change) {
            updated_income = ComputeUpdatedAmount(current_income, cashflow_change.change_type, cashflow_change.value);
            SetRecentIncomeValue(active_income._id, updated_income);
          }

          monthly_income_object.total_income = (monthly_income_object.total_income || 0) + updated_income;
          monthly_income_object.income_breakdown!.push(
            CreateBreakDownObj(active_income._id, updated_income, updated_income - current_income, active_income.desc)
          );
        }
      }

      if (active_income.type === "o") {
        if (active_income.start_month === current_month)
          SetRecentIncomeValue(active_income._id, active_income.amount);

        const current_income = GetRecentIncomeValue(active_income._id);
        cashflow_change = GetCashFlowChangeFor(current_month, active_income._id, "i", cashflow_change_list_by_month);
        let updated_income = current_income;

        if (cashflow_change) {
          updated_income = ComputeUpdatedAmount(current_income, cashflow_change.change_type, cashflow_change.value);
          SetRecentIncomeValue(active_income._id, updated_income);
        }

        monthly_income_object.total_income = (monthly_income_object.total_income || 0) + updated_income;
        monthly_income_object.income_breakdown!.push(
          CreateBreakDownObj(active_income._id, updated_income, updated_income - current_income, active_income.desc)
        );
      }
    });

    monthly_income_list.push(Object.freeze(monthly_income_object));
  }

  return monthly_income_list;
}

export function GetMonthlyExpenseList(
  plan_duration: number,
  expense_list: CashFlowLike[] = [],
  cashflow_changes: CashFlowChangeLike[] = []
): MonthlyStatement[] {
  const monthly_expense_list: MonthlyStatement[] = [];
  const cashflow_change_list_by_month = CashFlowChangesToCashFlowChangesByMonth(cashflow_changes, plan_duration);

  const recent_expense_value_map: Record<string, number> = {};
  const expense_month_number: Record<string, number> = {};

  function IncrementExpenseMonthNumber(expense_id: string) {
    expense_month_number[expense_id] = (expense_month_number[expense_id] || 0) + 1;
  }
  function GetExpenseMonthNumber(expense_id = ""): number {
    return expense_month_number[expense_id];
  }
  function SetRecentExpenseValue(expense_id = "", value: number) {
    recent_expense_value_map[expense_id] = value;
  }
  function GetRecentExpenseValue(expense_id = ""): number {
    return recent_expense_value_map[expense_id];
  }

  for (let current_month = 1; current_month <= plan_duration; current_month++) {
    let cashflow_change: (CashFlowChangeLike & { month: number }) | undefined;
    const active_expense_list = GetActiveList(expense_list, current_month);
    const monthly_expense_object: MonthlyStatement = {
      month: current_month,
      total_expense: 0,
      expense_breakdown: [],
    };

    active_expense_list.forEach((active_expense) => {
      if (active_expense.type === "p") {
        const { frequency } = active_expense;
        IncrementExpenseMonthNumber(active_expense._id);
        const current_expense_month = GetExpenseMonthNumber(active_expense._id);

        if (
          active_expense.start_month === current_month ||
          current_expense_month % ((frequency_month_map as Record<string, number>)[frequency as string] ?? 0) === 1 ||
          ((frequency_month_map as Record<string, number>)[frequency as string] ?? 0) === 0
        ) {
          if (active_expense.start_month === current_month)
            SetRecentExpenseValue(active_expense._id, active_expense.amount);

          const current_expense = GetRecentExpenseValue(active_expense._id);
          cashflow_change = GetCashFlowChangeFor(current_month, active_expense._id, "e", cashflow_change_list_by_month);
          let updated_expense = current_expense;

          if (cashflow_change) {
            updated_expense = ComputeUpdatedAmount(current_expense, cashflow_change.change_type, cashflow_change.value);
            SetRecentExpenseValue(active_expense._id, updated_expense);
          }

          monthly_expense_object.total_expense = (monthly_expense_object.total_expense || 0) + updated_expense;
          monthly_expense_object.expense_breakdown!.push(
            CreateBreakDownObj(active_expense._id, updated_expense, updated_expense - current_expense, active_expense.desc)
          );
        }
      }

      if (active_expense.type === "o") {
        if (active_expense.start_month === current_month)
          SetRecentExpenseValue(active_expense._id, active_expense.amount);

        const current_expense = GetRecentExpenseValue(active_expense._id);
        cashflow_change = GetCashFlowChangeFor(current_month, active_expense._id, "e", cashflow_change_list_by_month);
        let updated_expense = current_expense;

        if (cashflow_change) {
          updated_expense = ComputeUpdatedAmount(current_expense, cashflow_change.change_type, cashflow_change.value);
          SetRecentExpenseValue(active_expense._id, updated_expense);
        }

        monthly_expense_object.total_expense = (monthly_expense_object.total_expense || 0) + updated_expense;
        monthly_expense_object.expense_breakdown!.push(
          CreateBreakDownObj(active_expense._id, updated_expense, updated_expense - current_expense, active_expense.desc)
        );
      }
    });

    monthly_expense_list.push(Object.freeze(monthly_expense_object));
  }

  return monthly_expense_list;
}

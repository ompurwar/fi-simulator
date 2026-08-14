"use client";

import { useMemo } from "react";

/** Port of runway.composable.js — months of survival given avg expense & net worth. */
export function useRunway(
  expense_statement: any[] = [],
  account_balances: any[] = [],
  month: number
) {
  return useMemo(() => {
    // avg expense over trailing months up to `month` (mirror of TransactionLogic.ComputeAvgExpense)
    const startIndex = Math.max(0, month - 12);
    const window = expense_statement.slice(startIndex, month);
    const sum = window.reduce((acc, e) => acc + (e.total_expense || 0), 0);
    const avg_expense = window.length ? sum / window.length : 0;

    // net worth = sum of current month account balances (original shape: [{ balance: [{ balance, category }] }])
    const net_worth = account_balances.reduce(
      (acc, curr) => acc + (curr.balance?.[0]?.balance || 0),
      0
    );

    const runway = expense_statement.length && avg_expense > 0 ? net_worth / avg_expense : 0;
    return { avg_expense, net_worth, runway };
  }, [expense_statement, account_balances, month]);
}

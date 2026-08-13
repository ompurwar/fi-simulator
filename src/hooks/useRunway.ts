"use client";

import { useMemo } from "react";

/** Port of runway.composable.js — months of survival given avg expense & net worth. */
export function useRunway(
  expense_statement: any[] = [],
  account_balances: any[] = [],
  month: number
) {
  return useMemo(() => {
    // avg expense over trailing 12 months up to `month`
    const startIndex = Math.max(0, month - 12);
    const window = expense_statement.slice(startIndex, month);
    const sum = window.reduce((acc, e) => acc + (e.total_expense || 0), 0);
    const avg_expense = window.length ? sum / window.length : 0;

    // net worth = sum of latest balance per account up to `month`
    const accountMap: Record<string, number> = {};
    account_balances.forEach((b) => {
      if (b.month <= month) accountMap[b.account_id] = b.balance;
    });
    const net_worth = Object.values(accountMap).reduce((a, b) => a + (b || 0), 0);

    const runway = avg_expense > 0 ? net_worth / avg_expense : 0;
    return { avg_expense, net_worth, runway };
  }, [expense_statement, account_balances, month]);
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Plan } from "@/store";

export interface PlanSnapshot {
  income_list: any[];
  expense_list: any[];
  account_list: any[];
  loan_account_list: any[];
  emi_schedule: any[];
  emi_expense_cashflow: any[];
  cashflow: { income_statement: any[]; expense_statement: any[] };
  net_cashflow: { month: number; total: number }[];
  fund_distribution_percentage_list: any[];
  income_expense_and_net_cashflow: any[];
  account_balances_and_transactions: any;
  aggregated_account_balances_and_transactions_by_month: any;
  balance_and_transaction_by_month: any[];
  asset_month_map?: Record<number, any[]>;
  asset_summary?: any;
  tax_summary?: Record<string, any>;
  tax_expense_cashflow?: any[];
  bucket_growth?: Record<string, { value: number; growth_rate: number }>;
  asset_scenarios?: any;
  skipped_sips?: { month: number; asset_id: string; title: string; amount: number }[];
  unfunded_expenses?: { month: number; amount: number }[];
}

/** Server-side plan engine — fetches the full simulation snapshot from /engine/plan_snapshot. */
export function usePlanEngine(plan: Plan | null, duration = 50) {
  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSnapshot = useCallback(async () => {
    if (!plan) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    try {
      const data = await api.PlanSnapshot(plan, duration);
      setSnapshot(data);
    } finally {
      setLoading(false);
    }
  }, [plan, duration]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  return useMemo(
    () => ({
      loading,
      refresh: fetchSnapshot,
      income_list: snapshot?.income_list || [],
      expense_list: snapshot?.expense_list || [],
      account_list: snapshot?.account_list || [],
      loan_account_list: snapshot?.loan_account_list || [],
      emi_schedule: snapshot?.emi_schedule || [],
      emi_expense_cashflow: snapshot?.emi_expense_cashflow || [],
      cashflow: snapshot?.cashflow || { income_statement: [], expense_statement: [] },
      net_cashflow: snapshot?.net_cashflow || [],
      fund_distribution_percentage_list: snapshot?.fund_distribution_percentage_list || [],
      income_expense_and_net_cashflow: snapshot?.income_expense_and_net_cashflow || [],
      account_balances_and_transactions: snapshot?.account_balances_and_transactions || {
        transaction_list: [],
        account_balances: [],
        FDP_month_map: {},
      },
      aggregated_account_balances_and_transactions_by_month:
        snapshot?.aggregated_account_balances_and_transactions_by_month || { result: {}, aggregates_transactions: {} },
      balance_and_transaction_by_month: snapshot?.balance_and_transaction_by_month || [],
      asset_month_map: snapshot?.asset_month_map || undefined,
      asset_summary: snapshot?.asset_summary || undefined,
      tax_summary: snapshot?.tax_summary || undefined,
      tax_expense_cashflow: snapshot?.tax_expense_cashflow || undefined,
      bucket_growth: snapshot?.bucket_growth || undefined,
      asset_scenarios: snapshot?.asset_scenarios || undefined,
      skipped_sips: snapshot?.skipped_sips || [],
      unfunded_expenses: snapshot?.unfunded_expenses || [],
    }),
    [snapshot, loading, fetchSnapshot]
  );
}

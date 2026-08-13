"use client";

import { useMemo } from "react";

const seq_map: Record<string, number> = { e: 0, s: 1, i: 2 };

/** Port of balance.composable.js — sorts account balances e→s→i. */
export function useBalanceSeq(balances: any[] = []) {
  return useMemo(() => {
    return [...balances].sort((a, b) => {
      const sa = seq_map[a.category] ?? 9;
      const sb = seq_map[b.category] ?? 9;
      return sa - sb;
    });
  }, [balances]);
}

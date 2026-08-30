/**
 * Withdrawal-order engine.
 *
 * A plan may declare `withdrawal_order` (array of account ids, first = drained
 * first). Every outflow asks money from the ladder in that order instead of a
 * hardcoded bucket sequence:
 *   - expense/EMI/prepayment shortfalls (income < expense),
 *   - SIP funding (funding account first, then the rest of the ladder; if the
 *     whole ladder cannot cover the instalment the SIP is SKIPPED, not
 *     partially funded and never allowed to overdraw an account).
 *
 * When no `withdrawal_order` is set, the ladder defaults to the legacy order
 * savings → emergency → investment (each bucket by category).
 */

export interface OrderableAccount {
  _id: string;
  title?: string;
  category: "s" | "e" | "i";
  type: "a" | "l";
  roi?: number;
}

const CATEGORY_RANK: Record<string, number> = { s: 0, e: 1, i: 2 };

/** Legacy order: savings → emergency → investment. */
export function defaultWithdrawalOrder<T extends OrderableAccount>(
  account_list: T[] = []
): T[] {
  return (account_list || [])
    .filter((a) => a && a.type === "a")
    .slice()
    .sort((a, b) => {
      const rank =
        (CATEGORY_RANK[a.category] ?? 3) - (CATEGORY_RANK[b.category] ?? 3);
      return rank !== 0 ? rank : String(a._id).localeCompare(String(b._id));
    });
}

/**
 * Resolve the plan's withdrawal ladder. `withdrawal_order` entries are mapped
 * to type-"a" accounts in the given order; unknown/stale ids are skipped;
 * accounts missing from the list are appended in the default order.
 */
export function resolveWithdrawalOrder<T extends OrderableAccount>(
  account_list: T[] = [],
  withdrawal_order?: string[]
): T[] {
  const by_id = new Map<string, T>();
  for (const a of account_list || []) {
    if (a && a.type === "a") by_id.set(String(a._id), a);
  }
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const id of withdrawal_order || []) {
    const account = by_id.get(String(id));
    if (account && !seen.has(String(account._id))) {
      ordered.push(account);
      seen.add(String(account._id));
    }
  }
  const rest = account_list.filter(
    (a) => a && a.type === "a" && !seen.has(String(a._id))
  );
  return [...ordered, ...defaultWithdrawalOrder(rest)];
}

export interface DebitPlan {
  account_id: string;
  amount: number;
}

export interface DebitResolution {
  debits: DebitPlan[];
  /** remaining amount that no account in the ladder could cover */
  shortfall: number;
}

/**
 * Allocate an outflow across the ladder: full amount from each account up to
 * its available balance, never touching what isn't there.
 */
export function resolveDebit(
  amount: number,
  ordered_accounts: OrderableAccount[] = [],
  getBalance: (account_id: string) => number
): DebitResolution {
  let remaining = amount;
  const debits: DebitPlan[] = [];
  for (const account of ordered_accounts) {
    if (remaining <= 0) break;
    const available = Math.max(0, getBalance(String(account._id)) || 0);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    if (take > 0) {
      debits.push({ account_id: String(account._id), amount: take });
      remaining -= take;
    }
  }
  return { debits, shortfall: remaining };
}

/**
 * Ladder used for SIP funding: the asset's own funding account first, then the
 * withdrawal order. When `protectEmergency` is enabled the emergency bucket is
 * excluded as a top-up source (the safety net is never auto-raided for
 * investments) — unless it IS the asset's funding account (explicit choice).
 */
export function sipWithdrawalLadder(
  preferred_account_id: string | null,
  ordered_accounts: OrderableAccount[] = [],
  opts: { protectEmergency?: boolean } = {}
): OrderableAccount[] {
  const protect = opts?.protectEmergency !== false;
  const ladder: OrderableAccount[] = [];
  if (preferred_account_id) {
    const preferred = ordered_accounts.find(
      (a) => String(a._id) === String(preferred_account_id)
    );
    if (preferred) ladder.push(preferred);
  }
  for (const account of ordered_accounts) {
    if (
      preferred_account_id &&
      String(account._id) === String(preferred_account_id)
    )
      continue;
    if (protect && account.category === "e") continue;
    ladder.push(account);
  }
  return ladder;
}

export interface BalanceEntry {
  month: number;
  account_id: string;
  balance: number;
}

export interface BalanceLedger {
  /** current (mutated) balance of an account as of a month */
  get: (month: number, account_id: string) => number;
  /** apply a credit/debit txn to every balance entry of the account from its month onward */
  apply: (txn: { month: number; account_id: string; tran_type: "cr" | "dr"; amount: number }) => void;
}

/**
 * Mutable ledger over a planSnapshot account-balances array. Balances are
 * rounded the same way the transaction-merge has always done so existing
 * output stays numerically compatible.
 */
export function createBalanceLedger(entries: BalanceEntry[] = []): BalanceLedger {
  const by_month_account = new Map<string, BalanceEntry>();
  for (const entry of entries) {
    by_month_account.set(`${entry.month}:${entry.account_id}`, entry);
  }
  return {
    get(month, account_id) {
      for (let m = month; m >= 1; m--) {
        const entry = by_month_account.get(`${m}:${account_id}`);
        if (entry) return entry.balance;
      }
      return 0;
    },
    apply(txn) {
      const delta = txn.tran_type === "cr" ? txn.amount : -txn.amount;
      for (const entry of entries) {
        if (
          String(entry.account_id) === String(txn.account_id) &&
          entry.month >= txn.month
        ) {
          entry.balance = Math.round((entry.balance + delta) * 100) / 100;
          by_month_account.set(`${entry.month}:${entry.account_id}`, entry);
        }
      }
    },
  };
}

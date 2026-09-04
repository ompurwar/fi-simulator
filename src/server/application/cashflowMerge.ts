/**
 * Cashflow consolidation helpers — the plan document is the single source of
 * truth for the engine. These merge active `Cash_Flow_Store` / 
 * `Cash_Flow_Change_Store` rows into a plan object (store wins for shared ids;
 * missing ids are appended; ids only present in the store as deleted rows are
 * dropped from the plan).
 */

export function MergeArraysById<Row extends { _id: string } & Record<string, any>>(
  embedded: Row[],
  storeRows: Row[]
): Row[] {
  const by_id = new Map<string, Row>();
  for (const row of embedded) by_id.set(String(row._id), row);
  const store_deleted_ids = new Set<string>();

  for (const row of storeRows) {
    const key = String(row._id);
    if (String(row.status) === "deleted") {
      store_deleted_ids.add(key);
      continue;
    }
    by_id.set(key, row); // store wins (fresher) — updates land there first
  }

  const out: Row[] = [];
  const seen = new Set<string>();
  for (const row of embedded) {
    const key = String(row._id);
    if (store_deleted_ids.has(key)) continue;
    const keep = by_id.get(key)!;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(keep);
    }
  }
  for (const row of by_id.values()) {
    const key = String(row._id);
    if (seen.has(key) || store_deleted_ids.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Merge active store cashflow rows + change rows into a plan object. */
export function MergeStoreIntoPlan(
  plan: any,
  storeLines: any[],
  storeChanges: any[]
): any {
  const cashflow_list = MergeArraysById(plan?.cashflow_list || [], storeLines || []);
  const cashflow_change_list = MergeArraysById(
    plan?.cashflow_change_list || [],
    storeChanges || []
  );
  return { ...plan, cashflow_list, cashflow_change_list };
}

/** True when merging produced a different document (needs a write). */
export function PlanChangedAfterMerge(plan: any, merged: any): boolean {
  return (
    JSON.stringify(plan?.cashflow_list || []) !==
      JSON.stringify(merged.cashflow_list || []) ||
    JSON.stringify(plan?.cashflow_change_list || []) !==
      JSON.stringify(merged.cashflow_change_list || [])
  );
}

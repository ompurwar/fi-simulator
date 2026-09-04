/**
 * Cashflow consolidation helpers — the plan document is the single source of
 * truth for the engine. These merge active `Cash_Flow_Store` / 
 * `Cash_Flow_Change_Store` rows into a plan object (store wins for shared ids;
 * missing ids are appended; ids only present in the store as deleted rows are
 * dropped from the plan). Rows that fail entity validation are dropped — the
 * plan must stay readable for the engine.
 */
import { MakeCashFlow, MakeCashFlowChange } from "../domain/entities";

function rowIsValidCashflow(row: any): boolean {
  try {
    MakeCashFlow(row);
    return true;
  } catch {
    return false;
  }
}

function rowIsValidChange(row: any): boolean {
  try {
    MakeCashFlowChange(row);
    return true;
  } catch {
    return false;
  }
}

export function MergeArraysById<Row extends { _id: string } & Record<string, any>>(
  embedded: Row[],
  storeRows: Row[],
  validator: (row: any) => boolean = () => true
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
    if (!validator(row)) continue; // legacy/corrupt store rows never enter the plan
    by_id.set(key, row); // store wins (fresher) — updates land there first
  }

  const out: Row[] = [];
  const seen = new Set<string>();
  for (const row of embedded) {
    const key = String(row._id);
    if (store_deleted_ids.has(key)) continue;
    const candidate = by_id.get(key)!;
    if (seen.has(key)) continue;
    if (!validator(candidate)) continue; // heal already-corrupt embedded rows
    seen.add(key);
    out.push(candidate);
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
  const cashflow_list = MergeArraysById(
    plan?.cashflow_list || [],
    storeLines || [],
    rowIsValidCashflow
  );
  const cashflow_change_list = MergeArraysById(
    plan?.cashflow_change_list || [],
    storeChanges || [],
    rowIsValidChange
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

"use client";

import { useEffect, useState } from "react";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { MonthPicker } from "@/components/edit/MonthPicker";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faWandMagicSparkles, faArrowRightArrowLeft, faCheck } from "@fortawesome/free-solid-svg-icons";

const inputClass =
  "relative border-[1.6px] rounded-[.5rem] px-3 py-[.25rem] w-full shadow-sm placeholder-dark-500 text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-300 focus:shadow-primary-500 bg-dark-50 flex justify-between transition-all duration-200 text-sm appearance-none";
const labelClass = "text-xs font-medium text-dark-300";

function currentSalary(plan: any): number {
  const income = (plan.cashflow_list || []).find((c: any) => c.category === "i");
  return income?.amount || 0;
}

/** Per-plan convenience figures from a snapshot (buckets + assets = net worth). */
function keyFigures(snap: any, month: number) {
  const balances = snap?.account_balances_and_transactions?.account_balances || [];
  const buckets = balances
    .filter((b: any) => b.month === month)
    .reduce((s: number, b: any) => s + (b.balance || 0), 0);
  const assets = (snap?.asset_month_map?.[month] || []).reduce((s: number, a: any) => s + (a.value || 0), 0);
  const expense = snap?.cashflow?.expense_statement?.[month - 1]?.total_expense || 0;
  const tax_monthly = (snap?.tax_expense_cashflow || []).filter((r: any) => r.start_month === month).reduce(
    (s: number, r: any) => s + (r.amount || 0),
    0
  );
  const income_monthly = snap?.cashflow?.income_statement?.[month - 1]?.total_income || 0;
  return {
    net_worth: buckets + assets,
    assets,
    tax_monthly,
    net_monthly: income_monthly - expense,
  };
}

function DeltaChip({ label, before, after, money = true }: { label: string; before: number; after: number; money?: boolean }) {
  const delta = after - before;
  const color = Math.abs(delta) < 0.01 ? "text-dark-400" : delta > 0 ? "text-emerald-600" : "text-rose-600";
  return (
    <div className="flex items-center justify-between rounded-lg border border-dark-200 bg-dark-50/50 px-2.5 py-1.5 text-xs">
      <span className="text-dark-500 font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-dark-400">
          {money ? <DisplayAmount notation="compact" amount={before} /> : before.toFixed(1)}
        </span>
        <FontAwesomeIcon icon={faArrowRightArrowLeft} className="text-[9px] text-dark-300" />
        <span className={`font-bold ${color}`}>
          {money ? <DisplayAmount notation="compact" amount={after} /> : after.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export function WhatIfDrawer({
  plan,
  currentSnapshot,
  open,
  onClose,
  onApplied,
}: {
  plan: any;
  currentSnapshot: any;
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);

  const [salary, setSalary] = useState<number | "">("");
  const [regime, setRegime] = useState<string>("");
  const [asset_id, setAssetId] = useState("");
  const [asset_growth, setAssetGrowth] = useState<number | "">("");
  const [sale_asset_id, setSaleAssetId] = useState("");
  const [sale_month, setSaleMonth] = useState<number | "">("");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [month, setMonth] = useState(1);

  const assets = plan.asset_list || [];
  const current_salary = currentSalary(plan);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setError("");
      setSalary("");
      setRegime("");
      setAssetId("");
      setAssetGrowth("");
      setSaleAssetId("");
      setSaleMonth("");
    }
  }, [open]);

  function buildPatches(): any[] {
    const patches: any[] = [];
    if (typeof salary === "number" && salary > 0) patches.push({ op: "set_salary", amount: salary });
    if (regime === "new" || regime === "old") patches.push({ op: "update_tax_settings", regime });
    if (asset_id && typeof asset_growth === "number" && asset_growth >= 0)
      patches.push({ op: "update_asset", asset_id, growth_rate: asset_growth });
    if (sale_asset_id && typeof sale_month === "number" && sale_month >= 1)
      patches.push({ op: "sell_asset", asset_id: sale_asset_id, month: sale_month });
    return patches;
  }

  async function Simulate() {
    const patches = buildPatches();
    if (patches.length === 0) {
      setError("Pick at least one change to simulate.");
      return;
    }
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/engine/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan_id: plan._id, patches }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || "Simulation failed");
      } else {
        setResult({ snapshot: json.data.snapshot, applied_patches: json.data.applied_patches });
      }
    } catch (e: any) {
      setError(e?.message || "Simulation failed");
    }
    setRunning(false);
  }

  function Apply() {
    // convert the scenario back into real local mutations — the plan-page Save
    // button syncs them to the server (same pattern as every other editor)
    let next = { ...plan };
    if (typeof salary === "number" && salary > 0) {
      next = {
        ...next,
        cashflow_list: (next.cashflow_list || []).map((c: any) =>
          c.category === "i" ? { ...c, amount: salary } : c
        ),
      };
    }
    if (regime === "new" || regime === "old") {
      next = { ...next, tax_settings: { ...(next.tax_settings || {}), regime } };
    }
    if (asset_id && typeof asset_growth === "number" && asset_growth >= 0) {
      next = {
        ...next,
        asset_list: (next.asset_list || []).map((a: any) =>
          String(a._id) === String(asset_id) ? { ...a, growth_rate: asset_growth } : a
        ),
      };
    }
    if (sale_asset_id && typeof sale_month === "number" && sale_month >= 1) {
      next = {
        ...next,
        asset_list: (next.asset_list || []).map((a: any) =>
          String(a._id) === String(sale_asset_id) ? { ...a, sale_month } : a
        ),
      };
    }
    update_plan_local(next);
    onApplied();
  }

  if (!open) return null;

  const before = keyFigures(currentSnapshot, month);
  const after = result ? keyFigures(result.snapshot, month) : before;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-dark-900/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto border-l border-dark-200 bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-dark-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <FontAwesomeIcon icon={faWandMagicSparkles} className="text-sm" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-dark-800">What-if Simulation</h3>
              <p className="text-xs text-dark-400">Same engine as the MCP simulate_plan — nothing is saved</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-dark-400 hover:bg-dark-50">
            <FontAwesomeIcon icon={faXmark} className="text-sm" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 rounded-xl border border-dark-200 p-3">
            <span className={labelClass}>Salary (₹/month)</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                placeholder={`Current: ${current_salary || 0}`}
                value={salary}
                onChange={(e) => setSalary(e.target.value ? Number(e.target.value) : "")}
                className={inputClass}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg border border-dark-200 px-2 py-1.5 text-[10px] font-bold text-dark-500 hover:bg-dark-50"
                onClick={() => setSalary(Math.round(current_salary * 1.2))}
                title="Set to +20%"
              >
                +20%
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded-xl border border-dark-200 p-3">
            <span className={labelClass}>Tax Regime</span>
            <div className="flex gap-1.5">
              {["new", "old"].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition-all ${
                    regime === r ? "border-primary-300 bg-primary-50 text-primary-700" : "border-dark-200 text-dark-500 hover:bg-dark-50"
                  }`}
                  onClick={() => setRegime(regime === r ? "" : r)}
                >
                  {r === "new" ? "New regime" : "Old regime"}
                </button>
              ))}
            </div>
          </div>

          {assets.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-dark-200 p-3">
              <span className={labelClass}>Asset growth override</span>
              <select value={asset_id} onChange={(e) => setAssetId(e.target.value)} className={inputClass}>
                <option value="">Pick an asset…</option>
                {assets.map((a: any) => (
                  <option key={a._id} value={a._id}>
                    {a.title} ({a.asset_class})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                placeholder="Growth %/yr"
                value={asset_growth}
                disabled={!asset_id}
                onChange={(e) => setAssetGrowth(e.target.value ? Number(e.target.value) : "")}
                className={inputClass}
              />
            </div>
          )}

          {assets.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-dark-200 p-3">
              <span className={labelClass}>Sell an asset</span>
              <select value={sale_asset_id} onChange={(e) => setSaleAssetId(e.target.value)} className={inputClass}>
                <option value="">Pick an asset…</option>
                {assets.map((a: any) => (
                  <option key={a._id} value={a._id}>
                    {a.title} ({a.asset_class})
                  </option>
                ))}
              </select>
              {sale_asset_id && (
                <div className="flex items-center gap-2">
                  <MonthPicker
                    plan_timestamp={plan.timestamp}
                    duration={plan?.duration || 600}
                    month={typeof sale_month === "number" ? sale_month : 1}
                    onChange={(m) => setSaleMonth(m)}
                  />
                  {typeof sale_month === "number" && (
                    <button type="button" className="shrink-0 text-[10px] font-bold text-rose-500 hover:underline" onClick={() => setSaleMonth("")}>
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <Button variant="primary" sub_variant="solid" className="w-full p-2" onClick={Simulate} disabled={running}>
            {running ? "Simulating…" : "Simulate"}
          </Button>
          {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700">{error}</div>}

          {result && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-xl border border-dark-200 bg-dark-50/50 px-3 py-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Compare at</span>
                  <MonthPicker
                    plan_timestamp={plan.timestamp}
                    duration={plan?.duration || 600}
                    month={month}
                    onChange={setMonth}
                  />
                </div>
              </div>
              <DeltaChip label="Net Worth" before={before.net_worth} after={after.net_worth} />
              <DeltaChip label="Assets" before={before.assets} after={after.assets} />
              <DeltaChip label="Monthly Tax" before={before.tax_monthly} after={after.tax_monthly} />
              <DeltaChip label="Net Cashflow" before={before.net_monthly} after={after.net_monthly} />

              <div className="rounded-lg bg-dark-50 p-2 text-[11px] text-dark-500">
                Applied patches: {result.applied_patches.map((p: any) => p.op).join(", ")}
              </div>

              <Button variant="neutral" sub_variant="solid" className="w-full p-2 text-emerald-700 border-emerald-300" onClick={Apply}>
                <FontAwesomeIcon icon={faCheck} className="text-sm" />
                Apply to plan
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

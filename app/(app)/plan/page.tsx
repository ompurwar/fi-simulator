"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { usePlanEngine } from "@/hooks/usePlanEngine";
import { useRunway } from "@/hooks/useRunway";
import { useBalanceSeq } from "@/hooks/useBalanceSeq";
import { useWalkThrough } from "@/hooks/useWalkThrough";
import { BuildScenarioLines, BuildWealthChartData } from "@/lib/wealthChart";
import { WhatIfDrawer } from "@/components/plan/WhatIfDrawer";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { MyChart } from "@/components/ui/MyChart";
import { MonthSlider } from "@/components/plan/MonthSlider";
import { Disclosure, Popover } from "@headlessui/react";
import { FireNotification } from "@/store/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightToBracket,
  faArrowRightFromBracket,
  faLandmarkFlag,
  faSackDollar,
  faFileInvoice,
  faCircleDollarToSlot,
  faFileLines,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faScaleBalanced,
  faFloppyDisk,
  faGauge,
  faXmark,
  faUpLong,
  faDownLong,
  faArrowRightArrowLeft,
  faBolt,
  faPiggyBank,
  faVault,
  faMoneyBillTrendUp,
  faShareNodes,
  faCircleExclamation,
  faPenToSquare,
  faWallet,
  faChartLine,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";

function GetMonthAndYear(plan: any, month: number) {
  if (!plan?.timestamp) return "";
  const start = new Date(plan.timestamp);
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]}-${d.getFullYear()}`;
}

function MonthlyIncomeExpense({ cashflow, category, previous }: { cashflow: any; category: "income" | "expense"; previous?: number }) {
  const is_income = category === "income";
  const total = is_income ? cashflow?.total_income : cashflow?.total_expense;
  const breakdown = is_income ? cashflow?.income_breakdown : cashflow?.expense_breakdown;
  const count = breakdown?.length || 0;

  return (
    <div className="flex flex-1 min-w-0 flex-col justify-between gap-1.5 rounded-2xl border border-dark-200 bg-white p-3.5 text-dark-700 shadow-xs transition-all duration-200 hover:shadow-md md:h-[8.5rem] md:p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`relative flex h-7 w-7 items-center justify-center rounded-lg ${
              is_income ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
            }`}
          >
            <FontAwesomeIcon
              icon={is_income ? faArrowRightToBracket : faArrowRightFromBracket}
              className={`text-xs ${is_income ? "rotate-[135deg]" : "rotate-[-45deg]"}`}
            />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold text-dark-700 shadow-2xs border border-dark-200">
                {count}
              </span>
            )}
          </div>
          <span className="text-xs font-bold text-dark-600 uppercase tracking-wider">{category}</span>
        </div>
      </div>

      <div>
        <DisplayAmount
          className="text-xl font-bold text-dark-800 md:text-2xl"
          notation={Math.abs(total || 0) > 99999 ? "compact" : "standard"}
          amount={total || 0}
        />
      </div>

      {previous ? (
        <div className="text-[10px] font-medium text-dark-400 truncate">
          <span className={total >= previous ? (is_income ? "text-emerald-600" : "text-rose-600") : (is_income ? "text-rose-600" : "text-emerald-600")}>
            {total >= previous ? "+" : "-"}
            {Math.abs(((total - previous) / previous) * 100).toFixed(1)}%
            <FontAwesomeIcon icon={total >= previous ? faUpLong : faDownLong} className="ml-0.5 text-[9px]" />
          </span>{" "}
          vs last mo
        </div>
      ) : null}
    </div>
  );
}

function MonthlyStatement({ details, mobile = false }: { details: any; mobile?: boolean }) {
  const income = details?.income?.income_breakdown || [];
  const expense = details?.expense?.expense_breakdown || [];
  const row = (b: any, i: number) => (
    <div key={i} className="flex justify-between items-center gap-2 py-1 text-xs">
      <span className="truncate text-dark-600 font-medium first-letter:uppercase">{b.cashflow_title}</span>
      <span className="flex items-center gap-1 shrink-0">
        <DisplayAmount className="font-bold text-dark-800" amount={b.amount} />
        {b.change > 0 ? (
          <FontAwesomeIcon icon={faUpLong} className="text-xs text-emerald-600" />
        ) : b.change < 0 ? (
          <FontAwesomeIcon icon={faDownLong} className="text-xs text-rose-600" />
        ) : null}
      </span>
    </div>
  );

  const content = (
    <div className="flex flex-col justify-between gap-4 md:flex-row">
      <div className="flex flex-col gap-1 md:w-1/2">
        <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Income Breakdown</div>
        {income.length ? income.map(row) : <div className="grid h-10 mt-1 text-xs border border-dashed border-dark-200 rounded-lg place-content-center text-dark-400">No income available</div>}
      </div>
      <div className="flex flex-col gap-1 pt-3 border-t border-dark-100 md:w-1/2 md:border-l md:border-t-0 md:px-4 md:pt-0">
        <div className="text-xs font-bold uppercase tracking-wider text-rose-700">Expense Breakdown</div>
        {expense.length ? expense.map(row) : <div className="grid h-10 mt-1 text-xs border border-dashed border-dark-200 rounded-lg place-content-center text-dark-400">No expense available</div>}
      </div>
    </div>
  );

  return (
    <Disclosure as="div" className="w-full" defaultOpen>
      {({ open }) => (
        <>
          <Disclosure.Button className={`flex w-full justify-between rounded-xl bg-white border border-dark-200 px-4 py-3 text-xs font-bold text-dark-700 shadow-2xs hover:bg-dark-50/50 transition-colors ${open ? "mb-2" : "mb-3"}`}>
            <span className="flex items-center gap-2">
              <FontAwesomeIcon icon={faFileLines} className="text-primary-600" />
              <span>Monthly Statement Breakdown</span>
            </span>
            <FontAwesomeIcon icon={faChevronDown} className={`w-3.5 h-3.5 self-center text-dark-400 transition-transform ${open ? "rotate-180 transform" : ""}`} />
          </Disclosure.Button>
          <Disclosure.Panel className="w-full p-4 mb-3 text-sm transition-all border border-dark-200 rounded-xl bg-white shadow-2xs">{content}</Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}

function BalanceAndTxn({
  balances,
  month,
  fdpMonthMap,
  accountList,
  expenseStatement,
  alignment = "v",
  onEdit,
  assetSummary,
  bucketGrowth,
  assetScenarios,
  currentAssetTotal = 0,
  currentAssetByClass,
  planDuration = 600,
}: {
  balances: any[];
  month: number;
  fdpMonthMap?: Record<number, any>;
  accountList?: any[];
  expenseStatement?: any[];
  alignment?: "h" | "v";
  onEdit?: (account_id: string) => void;
  assetSummary?: any;
  bucketGrowth?: Record<string, { value: number; growth_rate: number }>;
  assetScenarios?: any;
  currentAssetTotal?: number;
  currentAssetByClass?: Record<string, number>;
  planDuration?: number;
}) {
  const seq = { e: 1, emergency: 1, s: 2, savings: 2, i: 3, investment: 3 } as Record<string, number>;
  const sorted = useBalanceSeq(balances).sort(
    (a: any, b: any) => (seq[a.balance?.[0]?.category] || 99) - (seq[b.balance?.[0]?.category] || 99)
  );
  const { runway, avg_expense, net_worth } = useRunway(expenseStatement || [], balances, month);
  const currentFdp = fdpMonthMap?.[month];

  function getRoi(category: string) {
    return accountList?.find((a: any) => a.category === category)?.roi ?? "";
  }

  function blendedRoi(category: string) {
    const g = bucketGrowth?.[category];
    return g && g.value > 0 ? g.growth_rate : undefined;
  }

  const ASSET_CLASS_LABELS: Record<string, string> = {
    fd: "Fixed Deposits", bond: "Bonds", savings: "Savings", gold: "Gold / SGB", ppf: "PPF",
    equity: "Equity (India)", equity_foreign: "Equity (Foreign)", mf: "Mutual Funds",
    real_estate: "Real Estate", vda: "Crypto / VDA",
  };
  const ASSET_CLASS_COLORS: Record<string, string> = {
    fd: "#8b5cf6", bond: "#6366f1", savings: "#10b981", gold: "#f59e0b", ppf: "#06b6d4",
    equity: "#3b82f6", equity_foreign: "#ec4899", mf: "#14b8a6", real_estate: "#f97316", vda: "#ef4444",
  };

  // CURRENT month asset values (from asset_month_map) — never the end-of-plan
  // projection (asset_summary aggregates the LAST projected month).
  const asset_by_class: [string, number][] =
    currentAssetByClass && Object.keys(currentAssetByClass).length > 0
      ? Object.entries(currentAssetByClass).filter(([, v]) => v > 0)
      : assetSummary?.by_class
        ? Object.entries(assetSummary.by_class)
            .map(([k, c]: any) => [k, c.value] as [string, number])
            .filter(([, v]) => v > 0)
        : [];
  const asset_total_now = currentAssetTotal || asset_by_class.reduce((s, [, v]) => s + v, 0);
  const asset_total_end = assetSummary?.total_value || 0;
  const incl_investments_runway = avg_expense > 0 ? (net_worth + currentAssetTotal) / avg_expense : 0;

  function netVariation(txn: any[] = []) {
    return txn.reduce((acc, t) => {
      if (t.tran_type === "cr") return acc + (t.amount || 0);
      if (t.tran_type === "dr") return acc - (t.amount || 0);
      return acc;
    }, 0);
  }

  return (
    <div className={`flex h-fit flex-col justify-between gap-4 ${alignment === "h" ? "md:flex-row" : ""}`}>
      <div className={`flex flex-col gap-4 shrink-0 md:min-w-[15.5rem] ${alignment === "h" ? "md:flex-row" : ""}`}>
        {/* Runway & Net Worth KPI Card (Lucid Style) */}
        <div className={`flex flex-col justify-center gap-3 rounded-2xl border border-dark-200 bg-white p-4 shadow-xs ${alignment === "v" ? "w-full" : "md:w-[14.5rem]"}`}>
          <div className="flex items-center justify-between border-b border-dark-100 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <FontAwesomeIcon icon={faGauge} className="text-xs" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-dark-700">Runway</span>
            </div>

            {currentFdp?.strategy && (
              <div className="group/strategy relative flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200 cursor-help">
                <span>{currentFdp.strategy}</span>
                <FontAwesomeIcon icon={faCircleExclamation} className="text-amber-500 text-[10px]" />

                {/* Tooltip */}
                <div className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 hidden w-52 rounded-xl border border-dark-200 bg-white p-2.5 text-left text-xs font-normal text-dark-700 shadow-xl group-hover/strategy:block">
                  <div className="flex items-center justify-between border-b border-dark-100 pb-1 mb-1.5">
                    <span className="font-bold text-dark-800">{currentFdp.strategy}</span>
                    <span className="rounded bg-amber-50 px-1 text-[10px] font-bold text-amber-600">Strategy</span>
                  </div>
                  <p className="mb-1.5 text-[11px] text-dark-500 leading-snug">
                    Surplus cashflow allocation for this month:
                  </p>
                  <div className="grid grid-cols-3 gap-1 text-center text-[10px] font-bold">
                    <span className="rounded bg-blue-50 py-0.5 text-blue-700">E: {currentFdp.e}%</span>
                    <span className="rounded bg-amber-50 py-0.5 text-amber-700">S: {currentFdp.s}%</span>
                    <span className="rounded bg-emerald-50 py-0.5 text-emerald-700">I: {currentFdp.i}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-extrabold ${runway < 6 ? "text-danger-600" : "text-emerald-600"}`}>
                {runway < 12 ? runway.toFixed(1) : (runway / 12).toFixed(1)}
              </span>
              <span className="text-sm font-bold text-dark-500">{runway < 12 ? "months" : "years"}</span>
            </div>
            <span className="text-[11px] text-dark-400">Cash-runway coverage</span>
            {currentAssetTotal > 0 && incl_investments_runway > 0 && (
              <div className="text-[10px] text-dark-400">
                incl. investments ≈{" "}
                {incl_investments_runway < 12 ? `${incl_investments_runway.toFixed(1)} months` : `${(incl_investments_runway / 12).toFixed(1)} yrs`}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-dark-100 pt-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Net Worth</span>
              <DisplayAmount
                className="text-base font-bold text-dark-800"
                notation="compact"
                amount={net_worth + asset_total_now}
              />
              {asset_total_now > 0 && (
                <div className="inline-flex items-center gap-1 text-[10px] text-dark-400">
                  <span>incl.</span>
                  <DisplayAmount notation="compact" amount={asset_total_now} />
                  <span>assets</span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Burn Rate</span>
              <DisplayAmount className="text-base font-bold text-dark-800" notation="compact" amount={avg_expense} />
              <span className="text-[10px] text-dark-400 font-medium">/ month avg</span>
            </div>
          </div>
        </div>

        {/* Asset Mix Doughnut Card (Lucid Style) */}
        {asset_by_class.length > 0 && (
          <div className={`flex flex-col gap-3 rounded-2xl border border-dark-200 bg-white p-4 shadow-xs ${alignment === "h" ? "" : "w-full"}`}>
            <div className="flex justify-between items-baseline border-b border-dark-100 pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <FontAwesomeIcon icon={faMoneyBillTrendUp} className="text-xs" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-dark-700">Asset Mix</span>
                <span className="text-[10px] font-medium text-dark-400">(now · chart's top segment)</span>
              </div>
              <DisplayAmount className="text-xs font-bold text-primary-600 whitespace-nowrap" notation="compact" amount={asset_total_now} />
            </div>

            <div className="flex items-center gap-3">
              <div className="h-[100px] w-[100px] shrink-0">
                <MyChart
                  labels={asset_by_class.map(([k]) => ASSET_CLASS_LABELS[k] || k)}
                  dataset={[
                    {
                      data: asset_by_class.map(([, v]) => v),
                      backgroundColor: asset_by_class.map(([k]) => ASSET_CLASS_COLORS[k] || "#64748b"),
                      borderWidth: 0,
                      hoverOffset: 4,
                    },
                  ]}
                  chart_type="doughnut"
                  height={100}
                />
              </div>
              <div className="flex w-full flex-col gap-1 overflow-hidden">
                {asset_by_class.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5 text-[11px]">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ASSET_CLASS_COLORS[k] || "#64748b" }} />
                    <span className="truncate text-dark-600 font-medium flex-1">{ASSET_CLASS_LABELS[k] || k}</span>
                    <span className="text-[10px] text-dark-400 font-mono">
                      {asset_total_now > 0 ? `${Math.round((v / asset_total_now) * 100)}%` : "0%"}
                    </span>
                    <DisplayAmount className="font-bold text-dark-800" notation="compact" amount={v} />
                  </div>
                ))}
              </div>
            </div>

            {assetScenarios && asset_total_end > 0 && (
              <div className="flex flex-col gap-1 border-t border-dark-100 pt-2 text-[10px]">
                <span className="text-[9px] font-bold uppercase tracking-wider text-dark-400">
                  At plan end (M{planDuration})
                </span>
                <div className="flex flex-wrap justify-between gap-1.5">
                  <span className="text-danger-600 font-medium">Cons: <DisplayAmount notation="compact" amount={assetScenarios.conservative.total_value} /></span>
                  <span className="text-dark-700 font-bold">Exp: <DisplayAmount notation="compact" amount={assetScenarios.expected.total_value} /></span>
                  <span className="text-emerald-600 font-medium">Aggr: <DisplayAmount notation="compact" amount={assetScenarios.aggressive.total_value} /></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bucket Accounts (Lucid Cards) */}
        <div className={`flex flex-col gap-3 ${alignment === "h" ? "" : "w-full"}`}>
          {sorted.map((account: any, idx: number) => {
            const b = account.balance?.[0];
            if (!b) return null;
            const variation = netVariation(account.txn);
            const is_emergency = b.category === "e" || b.category === "emergency";
            const is_savings = b.category === "s" || b.category === "savings";
            const is_investment = b.category === "i" || b.category === "investment";

            let borderClass = "border-l-primary-400";
            let icon = faVault;
            if (is_savings) {
              borderClass = "border-l-amber-400";
              icon = faPiggyBank;
            } else if (is_investment) {
              borderClass = "border-l-emerald-400";
              icon = faChartLine;
            }

            return (
              <div
                key={b.account_id || idx}
                className={`flex relative flex-col gap-2 rounded-xl bg-white shadow-xs border border-dark-200 border-l-4 ${borderClass} p-3.5 transition-all hover:shadow-md w-full`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                      <FontAwesomeIcon icon={icon} className="text-xs" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-dark-800 first-letter:uppercase block">{b.acc_name}</span>
                      <DisplayAmount className="text-base font-extrabold text-dark-800" notation="standard" amount={b.balance} />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      {/* ROI / Growth Chip */}
                      {(blendedRoi(b.category) !== undefined || getRoi(b.category)) && (
                        <div
                          className="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200"
                          title={
                            blendedRoi(b.category) !== undefined
                              ? "Blended: account ROI applies to idle cash only — asset growth accrues separately in your holdings"
                              : "Annual ROI credited on the account's idle cash balance"
                          }
                        >
                          <span>{blendedRoi(b.category) !== undefined ? `~${blendedRoi(b.category)}%` : `${getRoi(b.category)}%`}</span>
                          <span className="text-[9px] font-normal uppercase text-emerald-600">
                            {blendedRoi(b.category) !== undefined ? "Blended" : "ROI"}
                          </span>
                        </div>
                      )}

                      {/* Edit Account Button */}
                      <button
                        type="button"
                        onClick={() => onEdit?.(b.account_id)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-dark-200 bg-dark-50 text-dark-400 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 transition-colors"
                        title="Edit Account"
                      >
                        <FontAwesomeIcon icon={faPenToSquare} className="text-[10px]" />
                      </button>
                    </div>

                    {variation !== 0 && (
                      <div className={`flex items-center gap-1 text-xs font-bold ${variation > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        <FontAwesomeIcon icon={variation > 0 ? faUpLong : faDownLong} className="text-[10px]" />
                        <DisplayAmount notation="compact" amount={Math.abs(variation)} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Mini Transactions list */}
                {(account.txn || []).filter((t: any) => t.amount > 0).length > 0 && (
                  <div className="flex flex-col gap-1.5 border-t border-dark-100 pt-2.5 max-h-28 overflow-y-auto pr-1">
                    {(account.txn || [])
                      .filter((t: any) => t.amount > 0)
                      .map((txn: any, tidx: number) => (
                        <div key={tidx} className="flex justify-between items-center text-xs text-dark-600">
                          <span className="truncate font-medium text-dark-500 pr-2">{txn.tran_desc}</span>
                          <div className={`inline-flex items-center gap-0.5 font-bold shrink-0 ${txn.tran_type === "cr" ? "text-emerald-600" : "text-rose-600"}`}>
                            <span>{txn.tran_type === "cr" ? "+" : "-"}</span>
                            <DisplayAmount notation="compact" amount={txn.amount} />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlanPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan_id = searchParams.get("p_id") || "";

  const plans = useFiPlanStore((s) => s.plans);
  const selected_plan_id = useFiPlanStore((s) => s.selected_plan_id);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);
  const plan_duration = useFiPlanStore((s) => s.plan_duration);
  const setGodPlanEntity = useFiPlanStore((s) => s.set_god_plan_entity);
  const setShareData = useFiPlanStore((s) => s.set_share_data);
  const sync_plan = useFiPlanStore((s) => s.sync_plan);
  const plan_synced_map = useFiPlanStore((s) => s.plan_synced_map);

  // month lives in the URL (?month=N) so views are shareable and back/forward works
  const month_param = searchParams.get("month");
  const initial_month = Math.max(
    1,
    Math.min(plan_duration, parseInt(month_param || "", 10) || 1)
  );
  const [current_month, setCurrentMonth] = useState(initial_month);
  const [simulation_open, setSimulationOpen] = useState(false);
  const [show_scenarios, setShowScenarios] = useState(false);
  const [whatif_open, setWhatifOpen] = useState(false);

  const plan = useMemo(
    () => plans.find((p) => p._id === (plan_id || selected_plan_id)) || plans[0],
    [plans, plan_id, selected_plan_id]
  );

  const engine = usePlanEngine(plan, plan_duration);
  const { cashflow, income_list, loan_account_list, income_expense_and_net_cashflow, account_balances_and_transactions } = engine;

  const monthly_details = income_expense_and_net_cashflow[current_month - 1] || null;
  const previous_details = current_month > 1 ? income_expense_and_net_cashflow[current_month - 2] || null : null;

  const current_month_balances = monthly_details?.balances || [];
  const { runway } = useRunway(cashflow.expense_statement, current_month_balances, current_month);

  const startWalkThrough = useWalkThrough(plan);

  useEffect(() => {
    if (plan_id && plan_id !== selected_plan_id) setSelectedPlanId(plan_id);
  }, [plan_id, selected_plan_id, setSelectedPlanId]);

  // keep the URL in sync with the current month (drop the param for month 1)
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (current_month <= 1) params.delete("month");
    else params.set("month", String(current_month));
    const qs = params.toString();
    const next = `/plan${qs ? `?${qs}` : ""}`;
    if (window.location.pathname + window.location.search !== next) {
      router.replace(next, { scroll: false });
    }
  }, [current_month, router, searchParams]);

  // honor browser back/forward on the month param
  useEffect(() => {
    const from_url = parseInt(searchParams.get("month") || "", 10);
    if (from_url && from_url !== current_month) {
      setCurrentMonth(Math.max(1, Math.min(plan_duration, from_url)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (plan && !plan.modified_at) {
      setSimulationOpen(true);
      const t = setTimeout(() => setSimulationOpen(false), 2500);
      return () => clearTimeout(t);
    }
  }, [plan]);

  function HandleEdit(entity_type: string, sub_entity_type = "", entity_id = "") {
    setGodPlanEntity({ active: true, plan_id: plan?._id, entity_type, sub_entity_type, entity_id, meta_data: null });
    router.push("/edit");
  }

  function OnCompare() {
    router.push(`/plans/compare?p_ids=${plan?._id}`);
  }

  function OnShare() {
    setShareData({ modal_state: "open", type: "template", ids: [plan?._id], category: "t-i" });
  }

  async function Save() {
    if (!plan) return;
    try {
      await sync_plan(plan._id);
      FireNotification({ title: "Plan saved", variant: "success" });
    } catch (e: any) {
      FireNotification({ title: "Save failed", desc: e.message, variant: "danger" });
    }
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-dark-500">No plan yet.</p>
        <Button onClick={() => useFiPlanStore.getState().set_plan_component_state("open")}>Create your first plan</Button>
      </div>
    );
  }

  // chart colors read from CSS vars at runtime, matching original balance_chart_data
  const cssVar = (name: string) =>
    typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue(name) : "";
  // sliding window chart — port of original balance_chart_data (plan.page.vue):
  // the chart shows a WINDOW_SIZE-month window of the full timeline; the window
  // slides as the hovered month crosses each boundary and the annotation resets
  // to the first item of the window.
  const WINDOW_SIZE = 20;
  const window_number = parseInt(String(current_month / WINDOW_SIZE));
  const window_start_point = window_number > 0 ? WINDOW_SIZE * window_number - 1 : 0;
  const balance_chart_months = Math.min(WINDOW_SIZE, plan_duration);
  const balance_chart_labels = Array.from({ length: plan_duration }, (_, i) => GetMonthAndYear(plan, i + 1)).slice(
    window_start_point,
    window_start_point + balance_chart_months
  );
  const balance_chart_datasets = BuildWealthChartData(
    engine,
    { window_start: window_start_point, window_size: balance_chart_months },
    cssVar,
    balance_chart_labels
  ).datasets;
  const scenario_datasets = show_scenarios
    ? BuildScenarioLines(engine, { window_start: window_start_point, window_size: balance_chart_months }, cssVar)
    : [];

  const aggregated_balance_for_month =
    current_month_balances.reduce((acc: number, b: any) => acc + (b.balance?.[0]?.balance || 0), 0) +
    (engine.asset_month_map?.[current_month] || []).reduce((acc: number, a: any) => acc + (a.value || 0), 0);
  const is_plan_synced = plan_synced_map[plan._id] !== false;

  // matching original ToDisplayableMoney + annotation
  // original get_local prefers window.navigator.language
  const money_local =
    (typeof window !== "undefined" && window.navigator?.language) ||
    useFiPlanStore.getState().local ||
    "en-IN";
  const ToDisplayableMoney = (value: any) =>
    Intl.NumberFormat(money_local, {
      style: "currency",
      notation: "compact",
      currency: useFiPlanStore.getState().currency || "INR",
      maximumSignificantDigits: 2,
    }).format(value);
  const annotation = !aggregated_balance_for_month
    ? []
    : [
        {
          value: GetMonthAndYear(plan, current_month),
          content: [GetMonthAndYear(plan, current_month), `Net worth : ${ToDisplayableMoney(aggregated_balance_for_month.toFixed(2))}`],
        },
      ];

  // One-time purchases (type "o" expenses, e.g. down payment / wedding) render
  // as distinct markers on the chart: a dashed warning line with a tag — clearly
  // different from the sliding window bars and from the net-worth annotation.
  // Markers slide in/out with the window like the bars.
  const warning_color = cssVar("--color-warning-600") || "#d97706";
  const one_time_purchases = (plan.cashflow_list || []).filter(
    (c: any) => c.category === "e" && c.type === "o"
  );
  const purchase_annotations = one_time_purchases
    .filter(
      (p: any) =>
        p.start_month > window_start_point && p.start_month <= window_start_point + WINDOW_SIZE
    )
    .map((p: any) => ({
      value: GetMonthAndYear(plan, p.start_month),
      content: [String(p.desc || "Purchase"), `${ToDisplayableMoney(Number(p.amount))}`],
      borderColor: warning_color,
      borderDash: [4, 4] as [number, number],
      borderWidth: 2,
      labelColor: warning_color,
      labelPosition: "end" as const,
      font: { size: 9, weight: 600 } as any,
    }));
  const chart_annotations = [...purchase_annotations, ...annotation];

  return (
    <div className="flex flex-col gap-3 md:flex-row md:gap-4">
      {/* Left manager sidebar (desktop) */}
      <div className="hidden md:flex md:flex-col w-60 lg:w-64 shrink-0 gap-1 rounded-2xl border border-dark-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs h-fit self-start sticky top-20">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-dark-400 dark:text-slate-400">Plan Modules</span>
          <span className="text-[10px] font-bold text-dark-400 dark:text-slate-400 bg-dark-100/80 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">7 Active</span>
        </div>

        <div
          className="group flex items-center justify-between gap-2 rounded-xl p-2 transition-all duration-200 hover:bg-dark-50 dark:hover:bg-slate-800 hover:shadow-2xs cursor-pointer border border-transparent hover:border-dark-200 dark:hover:border-slate-700"
          onClick={() => router.push("/networth")}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 transition-transform group-hover:scale-105">
              <FontAwesomeIcon icon={faWallet} className="text-sm" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-dark-700 dark:text-slate-200 group-hover:text-dark-900 dark:group-hover:text-white leading-tight whitespace-nowrap">Net Worth</span>
              <span className="text-[10px] text-dark-400 dark:text-slate-400 font-medium leading-none mt-0.5">Holdings & Sync</span>
            </div>
          </div>
          <FontAwesomeIcon icon={faChevronRight} className="text-dark-300 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] mr-1" />
        </div>

        <div
          className="group flex items-center justify-between gap-2 rounded-xl p-2 transition-all duration-200 hover:bg-dark-50 dark:hover:bg-slate-800 hover:shadow-2xs cursor-pointer border border-transparent hover:border-dark-200 dark:hover:border-slate-700"
          onClick={() => HandleEdit("cashflow", "income")}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 transition-transform group-hover:scale-105">
              <FontAwesomeIcon icon={faArrowRightToBracket} className="rotate-[135deg] text-sm" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-dark-700 dark:text-slate-200 group-hover:text-dark-900 dark:group-hover:text-white leading-tight whitespace-nowrap">Income Manager</span>
              <span className="text-[10px] text-dark-400 dark:text-slate-400 font-medium leading-none mt-0.5">Inflows & Growth</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {income_list.length > 0 && (
              <span className="flex h-5 min-w-[18px] items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 text-[10px] font-bold shrink-0">
                {income_list.length}
              </span>
            )}
            <FontAwesomeIcon icon={faChevronRight} className="text-dark-300 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]" />
          </div>
        </div>

        <div
          className="group flex items-center justify-between gap-2 rounded-xl p-2 transition-all duration-200 hover:bg-dark-50 dark:hover:bg-slate-800 hover:shadow-2xs cursor-pointer border border-transparent hover:border-dark-200 dark:hover:border-slate-700"
          onClick={() => HandleEdit("cashflow", "expense")}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 transition-transform group-hover:scale-105">
              <FontAwesomeIcon icon={faArrowRightFromBracket} className="rotate-[-45deg] text-sm" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-dark-700 dark:text-slate-200 group-hover:text-dark-900 dark:group-hover:text-white leading-tight whitespace-nowrap">Expense Manager</span>
              <span className="text-[10px] text-dark-400 dark:text-slate-400 font-medium leading-none mt-0.5">Outflows & Spends</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {engine.expense_list.length > 0 && (
              <span className="flex h-5 min-w-[18px] items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-1.5 text-[10px] font-bold shrink-0">
                {engine.expense_list.length}
              </span>
            )}
            <FontAwesomeIcon icon={faChevronRight} className="text-dark-300 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]" />
          </div>
        </div>

        <div
          className="group flex items-center justify-between gap-2 rounded-xl p-2 transition-all duration-200 hover:bg-dark-50 dark:hover:bg-slate-800 hover:shadow-2xs cursor-pointer border border-transparent hover:border-dark-200 dark:hover:border-slate-700"
          onClick={() => HandleEdit("loan", "")}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 transition-transform group-hover:scale-105">
              <FontAwesomeIcon icon={faLandmarkFlag} className="text-sm" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-dark-700 dark:text-slate-200 group-hover:text-dark-900 dark:group-hover:text-white leading-tight whitespace-nowrap">Loan Manager</span>
              <span className="text-[10px] text-dark-400 dark:text-slate-400 font-medium leading-none mt-0.5">EMIs & Payoffs</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {loan_account_list.length > 0 && (
              <span className="flex h-5 min-w-[18px] items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 text-[10px] font-bold shrink-0">
                {loan_account_list.length}
              </span>
            )}
            <FontAwesomeIcon icon={faChevronRight} className="text-dark-300 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]" />
          </div>
        </div>

        <div
          className="group flex items-center justify-between gap-2 rounded-xl p-2 transition-all duration-200 hover:bg-dark-50 dark:hover:bg-slate-800 hover:shadow-2xs cursor-pointer border border-transparent hover:border-dark-200 dark:hover:border-slate-700"
          onClick={() => HandleEdit("fdp", "")}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 transition-transform group-hover:scale-105">
              <FontAwesomeIcon icon={faSackDollar} className="text-sm" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-dark-700 dark:text-slate-200 group-hover:text-dark-900 dark:group-hover:text-white leading-tight whitespace-nowrap">Money Manager</span>
              <span className="text-[10px] text-dark-400 dark:text-slate-400 font-medium leading-none mt-0.5">Buckets & ROI</span>
            </div>
          </div>
          <FontAwesomeIcon icon={faChevronRight} className="text-dark-300 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] mr-1" />
        </div>

        <div
          className="group flex items-center justify-between gap-2 rounded-xl p-2 transition-all duration-200 hover:bg-dark-50 dark:hover:bg-slate-800 hover:shadow-2xs cursor-pointer border border-transparent hover:border-dark-200 dark:hover:border-slate-700"
          onClick={() => HandleEdit("asset", "")}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 transition-transform group-hover:scale-105">
              <FontAwesomeIcon icon={faVault} className="text-sm" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-dark-700 dark:text-slate-200 group-hover:text-dark-900 dark:group-hover:text-white leading-tight whitespace-nowrap">Assets</span>
              <span className="text-[10px] text-dark-400 dark:text-slate-400 font-medium leading-none mt-0.5">Mix & Growth</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {(plan?.asset_list || []).length > 0 && (
              <span className="flex h-5 min-w-[18px] items-center justify-center rounded-full bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 px-1.5 text-[10px] font-bold shrink-0">
                {(plan?.asset_list || []).length}
              </span>
            )}
            <FontAwesomeIcon icon={faChevronRight} className="text-dark-300 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]" />
          </div>
        </div>

        <div
          className="group flex items-center justify-between gap-2 rounded-xl p-2 transition-all duration-200 hover:bg-dark-50 dark:hover:bg-slate-800 hover:shadow-2xs cursor-pointer border border-transparent hover:border-dark-200 dark:hover:border-slate-700"
          onClick={() => HandleEdit("tax", "")}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 transition-transform group-hover:scale-105">
              <FontAwesomeIcon icon={faFileInvoice} className="text-sm" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-dark-700 dark:text-slate-200 group-hover:text-dark-900 dark:group-hover:text-white leading-tight whitespace-nowrap">Tax Manager</span>
              <span className="text-[10px] text-dark-400 dark:text-slate-400 font-medium leading-none mt-0.5">Old / New Regime</span>
            </div>
          </div>
          <FontAwesomeIcon icon={faChevronRight} className="text-dark-300 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] mr-1" />
        </div>
      </div>

      {/* Center column */}
      <div className="flex w-full flex-col gap-4 p-2 md:mt-2 md:w-[55%] xl:w-[60%] md:gap-2">
        {/* Month slider + cockpit popover */}
        <div className="fixed bottom-0 z-40 grid w-[96vw] justify-items-center rounded-xl bg-dark-800 p-3 md:relative md:z-0 md:bottom-2 md:flex md:w-full md:justify-between md:overflow-x-hidden md:hover:overflow-x-visible md:rounded-xl md:bg-dark-900 md:m-1 mb-3 shadow-warning-200 shadow-lg md:shadow-dark-400 md:shadow-md border md:border-0 transition-all duration-250">
          <MonthSlider value={current_month} max={plan_duration} planTimestamp={plan.timestamp} onChange={setCurrentMonth} />
          <Popover className="absolute top-[-1.5rem] flex justify-center rounded-full self-center md:hidden">
            <Popover.Button className="grid h-[50px] w-[50px] place-content-center justify-items-center gap-2 rounded-full border-2 border-primary-400 bg-white text-2xl font-medium text-primary-600 shadow-md">
              <FontAwesomeIcon icon={faGauge} className="md:hidden" />
            </Popover.Button>
            <Popover.Panel className="absolute z-10 mt-3 w-[95vw] -translate-y-[105%] transform md:w-fit">
              <div className="mx-2 overflow-hidden border border-dark-200 rounded-2xl bg-white shadow-2xl">
                <div className="relative flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between border-b border-dark-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-50 text-primary-600">
                        <FontAwesomeIcon icon={faGauge} className="text-xs" />
                      </div>
                      <span className="text-sm font-bold text-dark-800">Plan Cockpit</span>
                    </div>
                    <Popover.Button className="flex h-7 w-7 items-center justify-center rounded-lg bg-dark-100 text-dark-500 hover:bg-dark-200">
                      <FontAwesomeIcon icon={faXmark} className="text-xs" />
                    </Popover.Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div
                      className="flex items-center gap-2 rounded-xl border border-dark-200 bg-white p-2.5 shadow-2xs hover:bg-dark-50 cursor-pointer"
                      onClick={() => router.push("/networth")}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <FontAwesomeIcon icon={faWallet} className="text-xs" />
                      </div>
                      <span className="text-xs font-bold text-dark-700">Net Worth</span>
                    </div>

                    <div
                      className="flex items-center gap-2 rounded-xl border border-dark-200 bg-white p-2.5 shadow-2xs hover:bg-dark-50 cursor-pointer"
                      onClick={() => HandleEdit("cashflow", "income")}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <FontAwesomeIcon icon={faArrowRightToBracket} className="rotate-[135deg] text-xs" />
                      </div>
                      <span className="text-xs font-bold text-dark-700">Income</span>
                    </div>

                    <div
                      className="flex items-center gap-2 rounded-xl border border-dark-200 bg-white p-2.5 shadow-2xs hover:bg-dark-50 cursor-pointer"
                      onClick={() => HandleEdit("cashflow", "expense")}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                        <FontAwesomeIcon icon={faArrowRightFromBracket} className="rotate-[-45deg] text-xs" />
                      </div>
                      <span className="text-xs font-bold text-dark-700">Expense</span>
                    </div>

                    <div
                      className="flex items-center gap-2 rounded-xl border border-dark-200 bg-white p-2.5 shadow-2xs hover:bg-dark-50 cursor-pointer"
                      onClick={() => HandleEdit("loan", "")}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <FontAwesomeIcon icon={faLandmarkFlag} className="text-xs" />
                      </div>
                      <span className="text-xs font-bold text-dark-700">Loans</span>
                    </div>

                    <div
                      className="flex items-center gap-2 rounded-xl border border-dark-200 bg-white p-2.5 shadow-2xs hover:bg-dark-50 cursor-pointer"
                      onClick={() => HandleEdit("fdp", "")}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <FontAwesomeIcon icon={faSackDollar} className="text-xs" />
                      </div>
                      <span className="text-xs font-bold text-dark-700">Money</span>
                    </div>

                    <div
                      className="flex items-center gap-2 rounded-xl border border-dark-200 bg-white p-2.5 shadow-2xs hover:bg-dark-50 cursor-pointer"
                      onClick={() => HandleEdit("asset", "")}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                        <FontAwesomeIcon icon={faVault} className="text-xs" />
                      </div>
                      <span className="text-xs font-bold text-dark-700">Assets</span>
                    </div>

                    <div
                      className="col-span-2 flex items-center gap-2 rounded-xl border border-dark-200 bg-white p-2.5 shadow-2xs hover:bg-dark-50 cursor-pointer"
                      onClick={() => HandleEdit("tax", "")}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                        <FontAwesomeIcon icon={faFileInvoice} className="text-xs" />
                      </div>
                      <span className="text-xs font-bold text-dark-700">Tax Manager</span>
                    </div>
                  </div>
                </div>
              </div>
            </Popover.Panel>
          </Popover>
        </div>

        {/* Mobile wealth card */}
        <div className="flex flex-col p-3.5 mt-2 rounded-2xl border border-dark-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs md:hidden">
          <div className="flex flex-col gap-2 pb-2.5 border-b border-dark-100 dark:border-slate-800 mb-2">
            <div className="flex justify-between items-start gap-2">
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400 dark:text-slate-400">Net Worth</span>
                <DisplayAmount className="text-lg font-extrabold text-dark-800 dark:text-white truncate" amount={aggregated_balance_for_month} />
              </div>
              <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                <span className="rounded-md bg-dark-50 dark:bg-slate-800 border border-dark-100 dark:border-slate-700 px-2 py-0.5 text-xs font-bold text-dark-700 dark:text-slate-200">
                  {GetMonthAndYear(plan, current_month)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 w-full">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-primary-300 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/60 px-2.5 py-1 text-xs font-bold text-primary-700 dark:text-primary-300 hover:bg-primary-100 transition-all"
                onClick={() => setWhatifOpen(true)}
              >
                <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xs text-primary-500" />
                <span>What-if</span>
              </button>
              {is_plan_synced ? (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-dark-200 dark:border-slate-700 bg-dark-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-dark-700 dark:text-slate-200 hover:bg-dark-100"
                  onClick={OnCompare}
                >
                  <FontAwesomeIcon icon={faScaleBalanced} className="text-primary-600 text-xs" />
                  <span>Compare</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-primary-700"
                  onClick={Save}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} className="text-xs" />
                  <span>Save</span>
                </button>
              )}
            </div>
          </div>
          <div className="w-full mt-auto" style={{ aspectRatio: "400 / 350" }}>
            <MyChart
              labels={balance_chart_labels}
              dataset={[...balance_chart_datasets, ...scenario_datasets]}
              stacked
              chart_type="bar"
              height={350}
              width={400}
              annotation={chart_annotations}
              formatter={ToDisplayableMoney}
              onClick={(index) => setCurrentMonth(Math.min(plan_duration, window_start_point + index + 1))}
            />
          </div>
        </div>

        {/* Income/Expense + Net Cashflow KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 w-full">
          <MonthlyIncomeExpense cashflow={monthly_details?.income} category="income" previous={previous_details?.income?.total_income} />
          <MonthlyIncomeExpense cashflow={monthly_details?.expense} category="expense" previous={previous_details?.expense?.total_expense} />
          <div className="flex flex-1 min-w-0 flex-col justify-between gap-1.5 rounded-2xl border border-dark-200 bg-white p-3.5 shadow-xs transition-all duration-200 hover:shadow-md md:h-[8.5rem] md:p-4">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                  (monthly_details?.net_cashflow?.total || 0) < 0
                    ? "bg-rose-50 text-rose-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                <FontAwesomeIcon icon={faCircleDollarToSlot} className="text-xs" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-dark-600">Net Cashflow</span>
            </div>
            <div>
              <DisplayAmount
                className={`text-xl font-bold md:text-2xl ${
                  (monthly_details?.net_cashflow?.total || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
                notation={Math.abs(monthly_details?.net_cashflow?.total || 0) > 99999 ? "compact" : "standard"}
                amount={monthly_details?.net_cashflow?.total || 0}
              />
            </div>
            {previous_details?.net_cashflow?.total ? (
              <div className="text-[10px] font-medium text-dark-400 truncate">
                <span
                  className={
                    monthly_details?.net_cashflow?.total >= previous_details?.net_cashflow?.total
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }
                >
                  {monthly_details?.net_cashflow?.total >= previous_details?.net_cashflow?.total ? "+" : "-"}
                  {Math.abs(
                    ((monthly_details?.net_cashflow?.total - previous_details?.net_cashflow?.total) /
                      previous_details?.net_cashflow?.total) *
                      100
                  ).toFixed(1)}
                  %
                  <FontAwesomeIcon
                    icon={
                      monthly_details?.net_cashflow?.total >= previous_details?.net_cashflow?.total
                        ? faUpLong
                        : faDownLong
                    }
                    className="ml-0.5 text-[9px]"
                  />
                </span>{" "}
                vs last mo
              </div>
            ) : null}
          </div>
        </div>

        {/* Monthly statement (mobile) */}
        <div className="flex grow md:hidden mb-3">
          <MonthlyStatement details={monthly_details} mobile />
        </div>

        {/* Monthly statement (desktop) */}
        <div className="hidden w-full md:flex">
          <MonthlyStatement details={monthly_details} />
        </div>

        {/* Net worth chart + BalanceAndTxn (desktop) */}
        <div className="flex flex-col justify-between gap-4 mb-20 md:mb-0 md:flex-row md:items-start">
          <div className="flex-col hidden h-fit p-4 border border-dark-200 rounded-2xl bg-white shadow-xs md:flex md:flex-1 w-full overflow-hidden self-start md:sticky md:top-2">
            <div className="flex justify-between items-center mb-3 pb-2.5 border-b border-dark-100">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Net Worth</span>
                <DisplayAmount className="text-xl font-extrabold text-dark-800" amount={aggregated_balance_for_month} />
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-dark-200 bg-dark-50/50 p-1">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-dark-600 hover:bg-white hover:shadow-2xs disabled:opacity-30 transition-all"
                  disabled={current_month === 1}
                  onClick={() => setCurrentMonth((m) => Math.max(1, m - 1))}
                  title="Previous Month"
                >
                  <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
                </button>
                <span className="px-2 text-xs font-bold text-dark-800 min-w-[90px] text-center">
                  {GetMonthAndYear(plan, current_month)}
                </span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-dark-600 hover:bg-white hover:shadow-2xs disabled:opacity-30 transition-all"
                  disabled={current_month === plan_duration}
                  onClick={() => setCurrentMonth((m) => Math.min(plan_duration, m + 1))}
                  title="Next Month"
                >
                  <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {engine.asset_scenarios && (
                  <button
                    type="button"
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all ${
                      show_scenarios
                        ? "border-primary-300 bg-primary-50 text-primary-700"
                        : "border-dark-200 bg-dark-50/50 text-dark-500 hover:bg-white"
                    }`}
                    onClick={() => setShowScenarios((v) => !v)}
                    title="Overlay ±1σ asset scenario bands (plan end projection)"
                  >
                    <FontAwesomeIcon icon={faChartLine} className="text-xs" />
                    Scenarios
                  </button>
                )}
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-lg border border-primary-300 bg-primary-50 px-2 py-1 text-[10px] font-bold text-primary-700 hover:bg-primary-100 transition-all"
                  onClick={() => setWhatifOpen(true)}
                  title="Simulate what-if changes without saving"
                >
                  <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xs" />
                  What-if
                </button>
              </div>
            </div>

            <div className="h-[500px] w-full">
          <MyChart
            labels={balance_chart_labels}
            dataset={[...balance_chart_datasets, ...scenario_datasets]}
            stacked
            chart_type="bar"
            height={500}
            width={400}
            annotation={chart_annotations}
            formatter={ToDisplayableMoney}
            onClick={(index) => setCurrentMonth(Math.min(plan_duration, window_start_point + index + 1))}
          />
            </div>
          </div>
          <BalanceAndTxn
            balances={current_month_balances}
            month={current_month}
            fdpMonthMap={account_balances_and_transactions.FDP_month_map}
            accountList={engine.account_list}
            expenseStatement={cashflow.expense_statement}
            alignment="v"
            onEdit={(account_id) => HandleEdit("account", "", account_id)}
            assetSummary={engine.asset_summary}
            bucketGrowth={engine.bucket_growth}
            assetScenarios={engine.asset_scenarios}
            currentAssetTotal={(engine.asset_month_map?.[current_month] || []).reduce((acc: number, a: any) => acc + (a.value || 0), 0)}
            currentAssetByClass={(engine.asset_month_map?.[current_month] || []).reduce((acc: Record<string, number>, a: any) => {
              acc[a.asset_class] = (acc[a.asset_class] || 0) + (a.value || 0);
              return acc;
            }, {})}
            planDuration={plan_duration}
          />
        </div>
      </div>

      {/* Transactions sidebar */}
      <div className="hidden overflow-hidden transition-all duration-200 rounded-2xl border border-dark-200 bg-white shadow-xs h-fit grow md:flex md:flex-col md:min-w-[21rem] md:max-w-[25rem] shrink-0">
        <div className="flex items-center justify-between gap-2 px-3.5 py-3 border-b border-dark-100 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <FontAwesomeIcon icon={faArrowRightArrowLeft} className="text-xs rotate-[-45deg]" />
            </div>
            <span className="truncate text-xs font-bold uppercase tracking-wider text-dark-800">Transactions</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg border border-dark-200 bg-white px-2 py-1 text-xs font-semibold text-dark-700 hover:bg-dark-50 shadow-2xs transition-colors"
              onClick={OnCompare}
              title="Compare Plans"
            >
              <FontAwesomeIcon icon={faScaleBalanced} className="text-primary-600 text-xs" />
              <span>Compare</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg bg-primary-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-primary-600 disabled:opacity-40 transition-colors"
              onClick={Save}
              disabled={is_plan_synced}
              title="Save Plan Changes"
            >
              <FontAwesomeIcon icon={faFloppyDisk} className="text-xs" />
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* month rows */}
        <div
          className="flex flex-col gap-2 p-3 overflow-y-auto text-xs transition-all bg-white scroll-smooth"
          style={{ maxHeight: "calc(100vh - 120px)" }}
        >
          {income_expense_and_net_cashflow.map((d: any, index: number) => {
            if (Math.abs(current_month - index) >= 12) return null;
            const net = d.net_cashflow?.total || 0;
            const is_selected = d.month === current_month;
            return (
              <div
                key={d.month}
                className={`relative flex w-full cursor-pointer flex-col rounded-xl border p-3 shadow-xs transition-all duration-200 hover:shadow-md ${
                  is_selected
                    ? "border-primary-400 bg-primary-50/40 ring-2 ring-primary-400/20"
                    : "border-dark-200 bg-white hover:bg-dark-50/40"
                }`}
                onClick={() => setCurrentMonth(d.month)}
              >
                <div className="flex items-center justify-between gap-2 border-b border-dark-100 pb-1.5 mb-1.5">
                  <span
                    className={`text-xs font-bold ${
                      is_selected ? "text-primary-700" : "text-dark-800"
                    }`}
                  >
                    {GetMonthAndYear(plan, d.month)}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-dark-400 font-bold">Net:</span>
                    <DisplayAmount
                      className={`font-bold text-xs ${net >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                      amount={net}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-dark-400 font-medium">Income</span>
                    <DisplayAmount className="font-bold text-dark-700" amount={d.income?.total_income || 0} />
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-dark-400 font-medium">Expense</span>
                    <DisplayAmount className="font-bold text-dark-700" amount={d.expense?.total_expense || 0} />
                  </div>
                </div>

                {/* mini ratio indicator bar */}
                <div className="mt-2 flex h-1 w-full overflow-hidden rounded-full bg-dark-100">
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, 100 - ((d.expense?.total_expense || 0) / (d.income?.total_income || 1)) * 100))}%`,
                    }}
                  />
                  <div
                    className="h-full bg-rose-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, ((d.expense?.total_expense || 0) / (d.income?.total_income || 1)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* simulation modal */}
      {simulation_open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-900/60">
          <div className="p-8 text-center shadow-2xl rounded-2xl bg-dark-50">
            <div className="flex gap-2 p-2 py-1 mx-auto mb-4 text-xl font-bold border rounded-lg w-fit bg-dark-900 text-dark-500">
              <FontAwesomeIcon icon={faBolt} className="self-center text-warning-400" />
              <div>Setting up plan</div>
            </div>
            <div className="w-12 h-12 mx-auto mb-4 border-4 rounded-full animate-spin border-primary-500 border-t-transparent" />
            <p className="font-semibold text-dark-800">Simulating your financial life</p>
          </div>
        </div>
      )}

      {/* Share button teleported into the top nav (#share-button), matching plan.page.vue */}
      {plan &&
        typeof document !== "undefined" &&
        document.getElementById("share-button") &&
        createPortal(
          <button
            type="button"
            onClick={OnShare}
            className="flex items-center justify-center gap-1.5 h-8 w-8 sm:h-9 sm:w-auto sm:px-3 rounded-lg border border-primary-300 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900 shadow-2xs transition-all active:scale-95 text-xs font-bold shrink-0"
            title="Share Plan"
          >
            <span className="hidden sm:inline font-bold leading-none">Share</span>
            <FontAwesomeIcon icon={faShareNodes} className="text-xs text-primary-600 dark:text-primary-400" />
          </button>,
          document.getElementById("share-button")!
        )}

      {whatif_open && plan && (
        <WhatIfDrawer
          plan={plan}
          currentSnapshot={engine}
          open={whatif_open}
          onClose={() => setWhatifOpen(false)}
          onApplied={() => {
            setWhatifOpen(false);
            FireNotification({
              title: "Scenario applied",
              desc: "Changes saved locally — use Save to sync.",
              variant: "success",
              active: true,
              dismissal: "true",
              time_based: true,
              duration: 4000,
              buttons: [],
            });
          }}
        />
      )}
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-50" />}>
      <PlanPageInner />
    </Suspense>
  );
}

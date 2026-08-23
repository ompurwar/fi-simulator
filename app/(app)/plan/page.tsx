"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { usePlanEngine } from "@/hooks/usePlanEngine";
import { useRunway } from "@/hooks/useRunway";
import { useBalanceSeq } from "@/hooks/useBalanceSeq";
import { useWalkThrough } from "@/hooks/useWalkThrough";
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
    <div className="flex h-min-[8rem] w-[48.2%] flex-col gap-2 rounded-2xl border border-dark-200 bg-white p-4 text-dark-700 shadow-xs transition-all duration-200 hover:shadow-md md:h-[9rem] md:w-[14.5rem] md:gap-1.5 md:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg ${
              is_income ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
            }`}
          >
            <FontAwesomeIcon
              icon={is_income ? faArrowRightToBracket : faArrowRightFromBracket}
              className={`text-sm ${is_income ? "rotate-[135deg]" : "rotate-[-45deg]"}`}
            />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-dark-700 shadow-2xs border border-dark-200">
                {count}
              </span>
            )}
          </div>
          <span className="text-xs font-bold text-dark-600 uppercase tracking-wider">{category}</span>
        </div>
      </div>

      <div>
        <DisplayAmount
          className="text-2xl font-bold text-dark-800 md:text-3xl"
          notation={Math.abs(total || 0) > 9999 ? "compact" : "standard"}
          amount={total || 0}
        />
      </div>

      {previous ? (
        <div className="text-[11px] font-medium text-dark-400">
          <span className={total >= previous ? (is_income ? "text-emerald-600" : "text-rose-600") : (is_income ? "text-rose-600" : "text-emerald-600")}>
            {total >= previous ? "+" : "-"}
            {Math.abs(((total - previous) / previous) * 100).toFixed(1)}%
            <FontAwesomeIcon icon={total >= previous ? faUpLong : faDownLong} className="ml-0.5 text-[10px]" />
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

  const asset_by_class = assetSummary?.by_class ? Object.entries(assetSummary.by_class).filter(([, c]: any) => c.value > 0) : [];

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
              <div className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                <span>{currentFdp.strategy}</span>
                <FontAwesomeIcon icon={faCircleExclamation} className="text-amber-500 text-[10px]" />
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
            <span className="text-[11px] text-dark-400">Financial freedom coverage</span>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-dark-100 pt-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Net Worth</span>
              <DisplayAmount
                className="text-base font-bold text-dark-800"
                notation="compact"
                amount={net_worth + (assetSummary?.total_value || 0)}
              />
              {assetSummary?.total_value > 0 && (
                <span className="text-[10px] text-dark-400 whitespace-nowrap">
                  incl. <DisplayAmount notation="compact" amount={assetSummary.total_value} /> assets
                </span>
              )}
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Burn Rate</span>
              <DisplayAmount className="text-base font-bold text-dark-800" notation="compact" amount={avg_expense} />
              <span className="text-[10px] text-dark-400">/ month avg</span>
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
              </div>
              <DisplayAmount className="text-xs font-bold text-primary-600 whitespace-nowrap" notation="compact" amount={assetSummary.total_value} />
            </div>

            <div className="flex items-center gap-3">
              <div className="h-[100px] w-[100px] shrink-0">
                <MyChart
                  labels={asset_by_class.map(([k]: any) => ASSET_CLASS_LABELS[k] || k)}
                  dataset={[
                    {
                      data: asset_by_class.map(([, c]: any) => c.value),
                      backgroundColor: asset_by_class.map(([k]: any) => ASSET_CLASS_COLORS[k] || "#64748b"),
                      borderWidth: 0,
                      hoverOffset: 4,
                    },
                  ]}
                  chart_type="doughnut"
                  height={100}
                />
              </div>
              <div className="flex w-full flex-col gap-1 overflow-hidden">
                {asset_by_class.map(([k, c]: any) => (
                  <div key={k} className="flex items-center gap-1.5 text-[11px]">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ASSET_CLASS_COLORS[k] || "#64748b" }} />
                    <span className="truncate text-dark-600 font-medium flex-1">{ASSET_CLASS_LABELS[k] || k}</span>
                    <span className="text-[10px] text-dark-400 font-mono">
                      {Math.round((c.value / assetSummary.total_value) * 100)}%
                    </span>
                    <DisplayAmount className="font-bold text-dark-800" notation="compact" amount={c.value} />
                  </div>
                ))}
              </div>
            </div>

            {assetScenarios && (
              <div className="flex flex-wrap justify-between gap-1.5 border-t border-dark-100 pt-2 text-[10px]">
                <span className="text-danger-600 font-medium">Cons: <DisplayAmount notation="compact" amount={assetScenarios.conservative.total_value} /></span>
                <span className="text-dark-700 font-bold">Exp: <DisplayAmount notation="compact" amount={assetScenarios.expected.total_value} /></span>
                <span className="text-emerald-600 font-medium">Aggr: <DisplayAmount notation="compact" amount={assetScenarios.aggressive.total_value} /></span>
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

                  <div className="flex flex-col items-end gap-1">
                    {/* ROI / Growth Chip */}
                    {(blendedRoi(b.category) !== undefined || getRoi(b.category)) && (
                      <div className="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        <span>{blendedRoi(b.category) !== undefined ? `~${blendedRoi(b.category)}%` : `${getRoi(b.category)}%`}</span>
                        <span className="text-[9px] font-normal uppercase">ROI</span>
                      </div>
                    )}

                    {variation !== 0 && (
                      <span className={`flex items-center gap-0.5 text-[11px] font-bold ${variation > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        <FontAwesomeIcon icon={variation > 0 ? faUpLong : faDownLong} className="text-[10px]" />
                        <DisplayAmount notation="compact" amount={Math.abs(variation)} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit Account Button */}
                <button
                  type="button"
                  onClick={() => onEdit?.(b.account_id)}
                  className="absolute right-2 top-2 p-1 text-dark-300 hover:text-primary-600 transition-colors"
                  title="Edit Account"
                >
                  <FontAwesomeIcon icon={faPenToSquare} className="text-xs" />
                </button>

                {/* Mini Transactions list */}
                {(account.txn || []).filter((t: any) => t.amount > 0).length > 0 && (
                  <div className="flex flex-col gap-1 border-t border-dark-100 pt-2 max-h-16 overflow-y-auto pr-1">
                    {(account.txn || [])
                      .filter((t: any) => t.amount > 0)
                      .map((txn: any, tidx: number) => (
                        <div key={tidx} className="flex justify-between items-center text-[11px] text-dark-600">
                          <span className="truncate font-medium">{txn.tran_desc}</span>
                          <span className={`font-bold shrink-0 ml-2 ${txn.tran_type === "cr" ? "text-emerald-600" : "text-rose-600"}`}>
                            {txn.tran_type === "cr" ? "+" : "-"}
                            <DisplayAmount notation="compact" amount={txn.amount} />
                          </span>
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
  const balance_chart_datasets = ["e", "s", "i"].map((cat, idx) => ({
    label: cat === "e" ? "EMERGENCY" : cat === "s" ? "SAVINGS" : "INVESTMENT",
    data: Array.from({ length: plan_duration }, (_, i) =>
      account_balances_and_transactions.account_balances.find((b: any) => b.month === i + 1 && b.category === cat)?.balance || 0
    ).slice(window_start_point, window_start_point + balance_chart_months),
    backgroundColor:
      idx === 0
        ? cssVar("--color-dark-300")
        : idx === 1
          ? cssVar("--color-accent-600")
          : cssVar("--color-primary-400"),
    borderColor:
      idx === 0
        ? cssVar("--color-dark-300")
        : idx === 1
          ? cssVar("--color-accent-600")
          : cssVar("--color-primary-500"),
    pointStyle: "circle",
    pointRadius: 0,
    pointHoverRadius: 15,
    borderRadius: idx === 0 ? { topLeft: 3, topRight: 3 } : 0,
    order: [3, 2, 1][idx],
  }));

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
      <div className="flex-wrap justify-between hidden w-56 gap-3 px-2 mt-24 bg-transparent md:flex md:mt-0 md:flex-col md:border-r md:px-0 md:p-2">
        <div className="fixed">
          <div className="flex h-fit w-[210px] cursor-pointer gap-3 border-none p-2 px-2 hover:bg-primary-100" onClick={() => router.push("/networth")}>
            <div className="relative grid h-[3rem] w-[3.6rem] place-content-center self-center rounded-md bg-primary-100 p-2 text-primary-600">
              <FontAwesomeIcon icon={faWallet} className="text-2xl" />
            </div>
            <div className="self-center w-full">
              <div className="flex justify-between grow text-dark-300">
                <div className="text-sm leading-tight w-[5rem] font-medium">Net Worth</div>
              </div>
            </div>
          </div>
          <div className="flex h-fit w-[210px] cursor-pointer gap-3 border-none p-2 px-2 hover:bg-primary-100" onClick={() => HandleEdit("cashflow", "income")}>
            <div className="relative grid h-[3rem] w-[3.6rem] place-content-center self-center rounded-md bg-success-100 p-2 text-success-300">
              <FontAwesomeIcon icon={faArrowRightToBracket} className="rotate-[135deg] text-2xl" />
              <div className="absolute -right-1 -top-1 grid h-[1.2rem] min-w-[1.2rem] px-1 text-[0.7rem] place-content-center rounded-md border border-success-200 bg-dark-50 text-primary-300">{income_list.length}</div>
            </div>
            <div className="self-center w-full">
              <div className="flex justify-between grow text-dark-300">
                <div className="text-sm leading-tight w-[5rem] font-medium">Income Manager</div>
              </div>
            </div>
          </div>
          <div className="flex h-fit w-[210px] cursor-pointer gap-3 p-2 px-2 hover:bg-danger-100" onClick={() => HandleEdit("cashflow", "expense")}>
            <div className="relative grid h-[3rem] w-[3.6rem] place-content-center self-center rounded-md bg-danger-100 p-2 text-danger-300">
              <FontAwesomeIcon icon={faArrowRightFromBracket} className="rotate-[-45deg] text-2xl" />
              <div className="absolute -right-1 -top-1 grid h-[1.2rem] min-w-[1.2rem] px-1 text-[0.7rem] place-content-center rounded-md border border-danger-200 bg-dark-50 text-danger-300">{engine.expense_list.length}</div>
            </div>
            <div className="self-center w-full">
              <div className="flex justify-between grow text-dark-300">
                <div className="text-sm leading-tight w-[5rem] font-medium">Expense Manager</div>
              </div>
            </div>
          </div>
          <div className="flex h-fit w-[210px] cursor-pointer gap-3 p-2 px-2 hover:bg-dark-100" onClick={() => HandleEdit("loan", "")}>
            <div className="relative grid h-[3rem] w-[3.6rem] place-content-center self-center rounded-md bg-dark-100 p-2 text-dark-300">
              <FontAwesomeIcon icon={faLandmarkFlag} className="text-2xl" />
              <div className="absolute -right-1 -top-1 grid h-[1.2rem] min-w-[1.2rem] px-1 text-[0.7rem] place-content-center rounded-md border border-dark-200 bg-dark-50 text-dark-300">{loan_account_list.length}</div>
            </div>
            <div className="self-center w-full">
              <div className="flex justify-between grow text-dark-300">
                <div className="text-sm leading-tight w-[5rem] font-medium">Loan Manager</div>
              </div>
            </div>
          </div>
          <div className="flex h-fit w-[210px] cursor-pointer gap-3 p-2 px-2 hover:bg-warning-100" onClick={() => HandleEdit("fdp", "")}>
            <div className="grid h-[3rem] w-[3.6rem] place-content-center self-center rounded-md bg-warning-100 p-2 text-warning-300">
              <FontAwesomeIcon icon={faSackDollar} className="text-2xl" />
            </div>
            <div className="self-center w-full">
              <div className="flex justify-between grow text-dark-300">
                <div className="text-sm leading-tight w-[5rem] font-medium hover:text-warning-300">Money Manager</div>
              </div>
            </div>
          </div>
          <div className="flex h-fit w-[210px] cursor-pointer gap-3 p-2 px-2 hover:bg-primary-100" onClick={() => HandleEdit("asset", "")}>
            <div className="relative grid h-[3rem] w-[3.6rem] place-content-center self-center rounded-md bg-primary-100 p-2 text-primary-600">
              <FontAwesomeIcon icon={faVault} className="text-2xl" />
              <div className="absolute -right-1 -top-1 grid h-[1.2rem] min-w-[1.2rem] px-1 text-[0.7rem] place-content-center rounded-md border border-primary-200 bg-dark-50 text-primary-300">{(plan?.asset_list || []).length}</div>
            </div>
            <div className="self-center w-full">
              <div className="flex justify-between grow text-dark-300">
                <div className="text-sm leading-tight w-[5rem] font-medium">Assets</div>
              </div>
            </div>
          </div>
          <div className="flex h-fit w-[210px] cursor-pointer gap-3 p-2 px-2 hover:bg-blue-100" onClick={() => HandleEdit("tax", "")}>
            <div className="grid h-[3rem] w-[3.6rem] place-content-center self-center rounded-md bg-blue-100 p-2 text-blue-300">
              <FontAwesomeIcon icon={faFileInvoice} className="text-2xl" />
            </div>
            <div className="self-center w-full">
              <div className="flex justify-between grow text-dark-300">
                <div className="text-sm leading-tight w-[5rem] font-medium hover:text-blue-300">Tax Manager</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Center column */}
      <div className="flex w-full flex-col gap-4 p-2 md:mt-2 md:w-[55%] xl:w-[60%] md:gap-2">
        {/* Month slider + cockpit popover */}
        <div className="fixed bottom-0 z-40 grid w-[96vw] justify-items-center rounded-xl bg-dark-800 p-3 md:relative md:z-0 md:bottom-2 md:flex md:w-full md:justify-between md:overflow-x-hidden md:hover:overflow-x-visible md:rounded-xl md:bg-dark-900 md:m-1 mb-3 shadow-warning-200 shadow-lg md:shadow-dark-400 md:shadow-md border md:border-0 transition-all duration-250">
          <MonthSlider value={current_month} max={plan_duration} planTimestamp={plan.timestamp} onChange={setCurrentMonth} />
          <Popover className="absolute top-[-1.5rem] flex justify-center rounded-full self-center md:hidden">
            <Popover.Button className="grid h-[50px] w-[50px] place-content-center justify-items-center gap-2 rounded-full border-2 bg-dark-800 text-2xl font-medium text-dark-50 md:bg-accent-400">
              <FontAwesomeIcon icon={faGauge} className="md:hidden" />
            </Popover.Button>
            <Popover.Panel className="absolute z-10 mt-3 w-[100vw] -translate-y-[105%] transform md:w-fit">
              <div className="mx-3 overflow-hidden border rounded-lg border-dark-600 bg-dark-800 shadow-4xl">
                <div className="relative flex flex-col gap-3 p-4">
                  <div className="flex gap-2">
                    <div className="font-bold text-dark-100">Cockpit</div>
                    <Popover.Button className="ml-auto grid h-[25px] w-[25px] place-content-center rounded-md bg-dark-600 text-dark-200">
                      <FontAwesomeIcon icon={faXmark} />
                    </Popover.Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {["income", "expense"].map((c) => (
                      <div key={c} className="flex cursor-pointer gap-1.5 rounded-lg border border-dark-600 bg-dark-700 p-2 sm:gap-3" onClick={() => HandleEdit("cashflow", c)}>
                        <div className={`grid h-[2.3rem] w-[3.6rem] place-content-center rounded-md p-2 sm:h-[3rem] ${c === "income" ? "bg-success-100 text-success-300" : "bg-danger-100 text-danger-300"}`}>
                          <FontAwesomeIcon icon={c === "income" ? faArrowRightToBracket : faArrowRightFromBracket} className={`text-xl sm:text-2xl ${c === "income" ? "rotate-[135deg]" : "rotate-[-45deg]"}`} />
                        </div>
                        <div className="self-center text-[10px] font-medium text-dark-200 sm:text-sm">{c === "income" ? "Income Manager" : "Expense Manager"}</div>
                      </div>
                    ))}
                    <div key="loan" className="flex cursor-pointer gap-1.5 rounded-lg border border-dark-600 bg-dark-700 p-2 sm:gap-3" onClick={() => HandleEdit("loan", "")}>
                      <div className="grid h-[2.3rem] w-[3.6rem] place-content-center rounded-md bg-dark-100 p-2 text-dark-300 sm:h-[3rem]">
                        <FontAwesomeIcon icon={faLandmarkFlag} className="text-xl sm:text-2xl" />
                      </div>
                      <div className="self-center text-[10px] font-medium text-dark-200 sm:text-sm">Loan Manager</div>
                    </div>
                    <div key="fdp" className="flex cursor-pointer gap-1.5 rounded-lg border border-dark-600 bg-dark-700 p-2 sm:gap-3" onClick={() => HandleEdit("fdp", "")}>
                      <div className="grid h-[2.3rem] w-[3.6rem] place-content-center rounded-md bg-warning-100 p-2 text-warning-300 sm:h-[3rem]">
                        <FontAwesomeIcon icon={faSackDollar} className="text-xl sm:text-2xl" />
                      </div>
                      <div className="self-center text-[10px] font-medium text-dark-200 sm:text-sm">Money Manager</div>
                    </div>
                  </div>
                </div>
              </div>
            </Popover.Panel>
          </Popover>
        </div>

        {/* Mobile wealth card — matches plan.page.vue chart_ref */}
        <div className="flex flex-col p-4 mt-20 rounded-2xl bg-dark-900 md:hidden md:mt-0">
          <div className="flex justify-between p-1 rounded-md bg-dark-600 sm:rounded-lg sm:p-2">
            <div className="flex-col text-dark-200">
              <div className="flex flex-col justify-between p-1 rounded-md bg-dark-600 text-primary-400">
                <div className="flex text-xs sm:text-base">
                  <div className="self-end text-dark-200">Wealth</div>
                </div>
                <DisplayAmount className="text-sm sm:text-base" amount={aggregated_balance_for_month} />
              </div>
            </div>
        {/* Mobile wealth card */}
        <div className="flex flex-col p-4 mt-2 rounded-2xl border border-dark-200 bg-white shadow-xs md:hidden">
          <div className="flex justify-between items-center pb-2 border-b border-dark-100 mb-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Net Worth</span>
              <DisplayAmount className="text-lg font-extrabold text-dark-800" amount={aggregated_balance_for_month} />
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-bold text-dark-600">{GetMonthAndYear(plan, current_month)}</div>
              {is_plan_synced ? (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-dark-200 bg-dark-50 px-2.5 py-1 text-xs font-semibold text-dark-700 hover:bg-dark-100"
                  onClick={OnCompare}
                >
                  <FontAwesomeIcon icon={faScaleBalanced} className="text-primary-600 text-xs" />
                  <span>Compare</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-primary-600"
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
              dataset={balance_chart_datasets}
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
        <div className="flex flex-wrap justify-between gap-2 mb-3 sm:gap-3 md:mt-0 md:flex-nowrap md:gap-4">
          <MonthlyIncomeExpense cashflow={monthly_details?.income} category="income" previous={previous_details?.income?.total_income} />
          <MonthlyIncomeExpense cashflow={monthly_details?.expense} category="expense" previous={previous_details?.expense?.total_expense} />
          <div className="flex grow md:hidden">
            <MonthlyStatement details={monthly_details} mobile />
          </div>
          <div className="flex w-full flex-col gap-2 rounded-2xl border border-dark-200 bg-white p-4 shadow-xs transition-all duration-200 hover:shadow-md md:h-[9rem] md:w-[19rem] md:gap-1.5 md:p-5">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  (monthly_details?.net_cashflow?.total || 0) < 0
                    ? "bg-rose-50 text-rose-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                <FontAwesomeIcon icon={faCircleDollarToSlot} className="text-sm" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-dark-600">Net Cashflow</span>
            </div>
            <DisplayAmount
              className={`text-2xl font-bold md:text-3xl ${
                (monthly_details?.net_cashflow?.total || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
              amount={monthly_details?.net_cashflow?.total || 0}
            />
            {previous_details?.net_cashflow?.total ? (
              <div className="text-[11px] font-medium text-dark-400">
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
                    className="ml-0.5 text-[10px]"
                  />
                </span>{" "}
                vs last mo
              </div>
            ) : null}
          </div>
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
            </div>

            <div className="h-[500px] w-full">
              <MyChart
                labels={balance_chart_labels}
                dataset={balance_chart_datasets}
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
          />
        </div>
      </div>

      {/* Transactions sidebar */}
      <div className="hidden overflow-hidden transition-all duration-200 rounded-2xl border border-dark-200 bg-white shadow-xs h-fit grow md:flex md:flex-col md:min-w-[19rem] md:max-w-[24rem]">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-dark-100 bg-white">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <FontAwesomeIcon icon={faArrowRightArrowLeft} className="text-xs rotate-[-45deg]" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-dark-800">Transactions</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-dark-200 bg-white px-2.5 py-1 text-xs font-semibold text-dark-700 hover:bg-dark-50 shadow-2xs"
              onClick={OnCompare}
            >
              <FontAwesomeIcon icon={faScaleBalanced} className="text-primary-600 text-xs" />
              <span>Compare</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-primary-600 disabled:opacity-50"
              onClick={Save}
              disabled={is_plan_synced}
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
            onClick={OnShare}
            className="gap-2 rounded-[.5rem] grid place-content-center disabled:opacity-50 text-md hover:opacity-75 font-medium border-2 hover:shadow-sm border-primary-400 text-primary-500 bg-primary-50 h-[2.5rem] px-3"
          >
            <div className="flex gap-2">
              <span className="self-center hidden md:inline">Share</span>
              <FontAwesomeIcon icon={faShareNodes} className="self-center text-lg font-bold" />
            </div>
          </button>,
          document.getElementById("share-button")!
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

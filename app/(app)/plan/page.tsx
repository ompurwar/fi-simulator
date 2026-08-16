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
  const total = category === "income" ? cashflow?.total_income : cashflow?.total_expense;
  const breakdown = category === "income" ? cashflow?.income_breakdown : cashflow?.expense_breakdown;
  const count = breakdown?.length || 0;

  return (
    <div className="flex h-min-[8rem] w-[48.2%] flex-col gap-2 rounded-2xl border bg-dark-50 p-4 shadow-sm md:h-[9rem] md:w-[14.2em] md:gap-1 md:p-6 md:shadow-none">
      <div className="flex gap-2 md:gap-3">
        <div
          className={`relative grid h-[2.3rem] w-[2.3rem] place-content-center self-center rounded-md p-1 sm:h-[2.9rem] sm:w-[2.9rem] md:h-[2rem] md:w-[2rem] ${
            category === "income" ? "bg-success-100 text-success-300" : "bg-danger-100 text-danger-300"
          }`}
        >
          <div
            className={`absolute -right-1 -top-1 grid h-[17px] w-[17px] place-content-center self-center rounded border text-[11px] font-medium sm:h-[20px] sm:w-[20px] sm:rounded-md sm:text-sm md:h-[15px] md:w-[15px] md:rounded-sm md:border-0 md:text-[10px] md:font-normal ${
              category === "income"
                ? "border-primary-200 bg-dark-50 text-success-300"
                : "border-danger-200 bg-dark-50 text-danger-300"
            }`}
          >
            {count}
          </div>
          <FontAwesomeIcon
            icon={category === "income" ? faArrowRightToBracket : faArrowRightFromBracket}
            className={`self-center text-xl md:text-lg ${category === "income" ? "rotate-[135deg]" : "rotate-[-45deg]"}`}
          />
        </div>
        <div className="self-center text-sm text-dark-500 first-letter:uppercase md:text-dark-700">{category}</div>
      </div>
      <div className="self-center-">
        <DisplayAmount
          className="text-2xl font-semibold md:text-4xl"
          notation={Math.abs(total || 0) > 9999 ? "compact" : "standard"}
          amount={total || 0}
        />
      </div>
      {previous ? (
        <div className="text-[10px] text-dark-300 sm:text-xs">
          <span className={total >= previous ? "text-success-300" : "text-danger-300"}>
            {Math.abs(((total - previous) / previous) * 100).toFixed(1)}%
            <FontAwesomeIcon icon={total >= previous ? faUpLong : faDownLong} className="text-[10px] sm:text-xs" />
          </span>{" "}
          vs last month
        </div>
      ) : null}
      {/* breakdown list exists in the original but collapsed=true hardcodes it hidden */}
    </div>
  );
}

function MonthlyStatement({ details, mobile = false }: { details: any; mobile?: boolean }) {
  const income = details?.income?.income_breakdown || [];
  const expense = details?.expense?.expense_breakdown || [];
  const row = (b: any, i: number) => (
    <div key={i} className="flex justify-between gap-2">
      <span className="text-xs font-medium truncate text-dark-500 first-letter:uppercase">{b.cashflow_title}</span>
      <span className="flex items-center gap-1 ml-auto">
        <DisplayAmount className="text-sm" amount={b.amount} />
        {b.change > 0 ? <FontAwesomeIcon icon={faUpLong} className="text-xs text-success-400" /> : b.change < 0 ? <FontAwesomeIcon icon={faDownLong} className="text-xs text-danger-400" /> : null}
      </span>
    </div>
  );

  const content = (
    <div className="flex flex-col justify-between gap-4 md:flex-row">
      <div className="flex flex-col gap-1 md:w-1/2">
        <div className="text-xs font-bold uppercase">Income</div>
        {income.length ? income.map(row) : <div className="grid h-10 mt-2 text-xs border-2 border-dashed rounded-md place-content-center">No income available</div>}
      </div>
      <div className="flex flex-col gap-1 pt-3 border-t md:w-1/2 md:border-l md:border-t-0 md:px-4 md:pt-0">
        <div className="text-xs font-bold uppercase">Expense</div>
        {expense.length ? expense.map(row) : <div className="grid h-10 mt-2 text-xs border-2 border-dashed rounded-md place-content-center">No expense available</div>}
      </div>
    </div>
  );

  if (mobile) {
    return (
      <Disclosure as="div" className="w-full" defaultOpen>
        {({ open }) => (
          <>
            <Disclosure.Button className={`flex w-full justify-between rounded-lg bg-dark-100 px-4 py-4 text-sm font-semibold text-dark-500 ${open ? "mb-2" : "mb-3"}`}>
              <span><FontAwesomeIcon icon={faFileLines} className="mr-1" /> Monthly Statement</span>
              <FontAwesomeIcon icon={faChevronDown} className={`w-4 h-4 self-center text-dark-400 ${open ? "rotate-180 transform" : ""}`} />
            </Disclosure.Button>
            <Disclosure.Panel className="w-full p-4 mb-3 text-sm transition-all border rounded-b-xl rounded-t-md">{content}</Disclosure.Panel>
          </>
        )}
      </Disclosure>
    );
  }

  return (
    <Disclosure as="div" className="w-full" defaultOpen>
      {({ open }) => (
        <>
          <Disclosure.Button className={`flex w-full justify-between rounded-lg bg-dark-100 px-4 py-2 text-sm font-semibold text-dark-500 ${open ? "mb-2" : "mb-3"}`}>
            <span><FontAwesomeIcon icon={faFileLines} className="mr-1" /> Monthly Statement</span>
            <FontAwesomeIcon icon={faChevronDown} className={`w-4 h-4 self-center text-dark-400 ${open ? "rotate-180 transform" : ""}`} />
          </Disclosure.Button>
          <Disclosure.Panel className="p-4 mb-3 text-sm transition-all border rounded-b-xl rounded-t-md">{content}</Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}

/** Paginated transaction rows for one account card (5 per page). */
const TXN_PAGE_SIZE = 5;

function AccountTxns({ txns, month }: { txns: any[]; month: number }) {
  const rows = (txns || []).filter((t: any) => t.amount > 0);
  const pages = Math.max(1, Math.ceil(rows.length / TXN_PAGE_SIZE));
  const [page, setPage] = useState(0);
  const safe_page = Math.min(page, pages - 1);
  const visible = rows.slice(safe_page * TXN_PAGE_SIZE, safe_page * TXN_PAGE_SIZE + TXN_PAGE_SIZE);

  return (
    <>
      {visible.map((txn: any, tidx: number) => (
        <div key={tidx} className="mr-1 flex gap-2 text-[9px] text-dark-200 sm:mr-3 sm:text-[12px] md:text-[10px]">
          <span className="font-medium md:font-normal">{txn.tran_desc}</span>
          <div className="flex ml-auto">
            <strong>
              <DisplayAmount
                className="text-dark-400"
                notation={txn.amount > 999999 ? "compact" : "standard"}
                amount={txn.amount}
              />
            </strong>
          </div>
          <div className={txn.tran_type === "cr" ? "text-success-400" : "text-red-400"}>{txn.tran_type}</div>
        </div>
      ))}
      {pages > 1 && (
        <div className="mr-1 flex items-center justify-between gap-2 pt-1 text-[10px] text-dark-300">
          <button
            type="button"
            aria-label="Previous transactions"
            disabled={safe_page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-dark-800 disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-2.5 w-2.5" />
            Prev
          </button>
          <span>
            {safe_page + 1}/{pages}
          </span>
          <button
            type="button"
            aria-label="Next transactions"
            disabled={safe_page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-dark-800 disabled:opacity-40"
          >
            Next
            <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </>
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
}: {  balances: any[];
  month: number;
  fdpMonthMap?: Record<number, any>;
  accountList?: any[];
  expenseStatement?: any[];
  alignment?: "h" | "v";
  onEdit?: (account_id: string) => void;
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

  function netVariation(txn: any[] = []) {
    return txn.reduce((acc, t) => {
      if (t.tran_type === "cr") return acc + (t.amount || 0);
      if (t.tran_type === "dr") return acc - (t.amount || 0);
      return acc;
    }, 0);
  }

  return (
    <div className={`flex h-full flex-col justify-between gap-4 ${alignment === "h" ? "md:flex-row" : ""}`}>
      <div className={`flex flex-col gap-4 ${alignment === "h" ? "md:flex-row" : ""}`}>
        <div className={`flex flex-col justify-center gap-1 divide-y divide-dark-400 rounded-2xl bg-dark-900 p-4 px-3 ${alignment === "v" ? "w-full" : "md:w-[14.5rem]"}`}>
          <div className="relative flex justify-between">
            <div className="flex flex-col self-center gap-1- grow">
              <div className="relative flex justify-between gap-3">
                <div className="text-lg font-medium">Runway</div>
                  {currentFdp?.strategy && (
                  <div className="h-fit flex gap-1 text-right peer text-[10px] py-0.5 px-2 self-center bg-warning-200 rounded-md text-warning-800" aria-describedby="tooltip">
                    <div className="ml-auto">
                      {currentFdp.strategy}
                      <FontAwesomeIcon icon={faCircleExclamation} className="text-warning-500" />
                    </div>
                  </div>
                )}
                {currentFdp?.strategy && (
                  <div
                    role="tooltip"
                    className="absolute left-0 top-full z-[20] mt-2 flex flex-col gap-1 border border-dark-800 rounded-md bg-dark-900 p-1 px-2 text-xs shadow-md shadow-dark-700 opacity-0 invisible transition-all duration-300 peer-hover:opacity-100 peer-hover:visible"
                  >
                    <div className="flex gap-1 mb-1 text-[10px] font-bold">
                      <div>{currentFdp.strategy}</div> Strategy
                    </div>
                    <div className="flex gap-1">
                      <div className="text-dark-100">{currentFdp.e} %</div>
                      <div className="ml-auto w-[10ch] text-[10px] text-dark-400">Emergency</div>
                    </div>
                    <div className="flex gap-1">
                      <div className="text-dark-100">{currentFdp.s} %</div>
                      <div className="ml-auto w-[10ch] text-[10px] text-dark-400">Savings</div>
                    </div>
                    <div className="flex gap-1">
                      <div className="text-dark-100">{currentFdp.i} %</div>
                      <div className="ml-auto w-[10ch] text-[10px] text-dark-400">Investment</div>
                    </div>
                  </div>
                )}
              </div>
              {avg_expense > 0 && (
                <div className={`text-3xl font-bold ${runway < 6 ? "text-danger-400" : "text-success-400"}`}>
                  {runway < 12 ? runway.toFixed(1) : (runway / 12).toFixed(1)}{" "}
                  <span className="text-lg">{runway < 12 ? "mth" : "yrs"}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <div className="flex flex-col">
              <div className="md:text-xs">Net Worth</div>
              <DisplayAmount className="text-lg font-bold text-dark-400" notation="compact" amount={net_worth} />
            </div>
            <div className="flex flex-col">
              <div className="md:text-xs">Burn Rate</div>
              <DisplayAmount className="text-lg font-bold text-dark-400" notation="compact" amount={avg_expense} />
            </div>
          </div>
        </div>

        <div className={`flex flex-col gap-2 ${alignment === "h" ? "" : "w-full"}`}>
          {sorted.map((account: any, idx: number) => {
            const b = account.balance?.[0];
            if (!b) return null;
            const variation = netVariation(account.txn);
            return (
              <div
                key={b.account_id || idx}
                className="flex relative md:flex-col gap-1 md:mb-0 rounded-2xl bg-dark-50 shadow-sm border sm:min-h-[100px] w-full md:w-[14.5rem] p-2 sm:p-4"
              >
                <div className="flex self-center gap-2 md:mb-2 md:w-full">
                  <div className="relative grid h-[2.5rem] w-[2.5rem] place-content-center self-center rounded-md bg-dark-100 text-dark-400 sm:h-[3rem] sm:w-[3rem]">
                    {(b.category === "s" || b.category === "savings") && <FontAwesomeIcon icon={faPiggyBank} className="text-xl sm:text-2xl" />}
                    {(b.category === "e" || b.category === "emergency") && <FontAwesomeIcon icon={faVault} className="text-xl sm:text-2xl" />}
                    {(b.category === "i" || b.category === "investment") && <FontAwesomeIcon icon={faMoneyBillTrendUp} className="text-xl sm:text-2xl" />}
                    {!["s", "savings", "e", "emergency", "i", "investment"].includes(b.category) && (
                      <span className="text-xs font-bold text-dark-400">{b.category?.[0]?.toUpperCase()}</span>
                    )}
                    {currentFdp && getRoi(b.category) && (
                      <div className="absolute -right-1 -top-2 grid w-[1.6rem] place-content-center rounded-md border border-dark-200 bg-dark-50 px-4 text-[10px] font-semibold sm:w-[3em] sm:px-0 sm:text-xs sm:leading-[1.2rem]">
                        {getRoi(b.category)}%
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col self-center">
                    <div className="py-0 text-[10px] text-dark-200 sm:text-xs">{b.acc_name}</div>
                    <div className="flex flex-col p-1 py-0 font-bold gap-2-">
                      <DisplayAmount
                        className="text-[12px] sm:text-lg"
                        notation={b.balance > 9999 ? "compact" : "standard"}
                        amount={b.balance}
                      />
                      <span
                        className={`flex gap-1 text-[10px] sm:gap-2 ${
                          variation > 0 ? "text-success-300" : "text-danger-300"
                        }`}
                      >
                        <FontAwesomeIcon icon={variation > 0 ? faUpLong : faDownLong} />
                        <DisplayAmount
                          notation={Math.abs(variation) > 99999 ? "compact" : "standard"}
                          amount={variation}
                        />
                      </span>
                    </div>
                  </div>
                </div>
                {/* account edit button — top-right corner of the card */}
                <div className="absolute right-1 top-1 w-fit">
                  <button
                    type="button"
                    onClick={() => onEdit?.(b.account_id)}
                    className="py-1 text-xs font-medium text-dark-300 hover:bg-opacity-30 focus:outline-none sm:px-2 sm:text-sm md:px-0"
                  >
                    <FontAwesomeIcon icon={faPenToSquare} />
                  </button>
                </div>
                <hr className="hidden mb-1 md:block" />
                <div className="flex flex-col self-center h-16 gap-1 pl-2 overflow-y-scroll border-l-2 sm:pl-4 md:h-8 md:w-full md:border-0 md:pl-0">
                  <AccountTxns key={`${b.account_id}-${month}`} txns={account.txn || []} month={month} />
                </div>
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

  const [current_month, setCurrentMonth] = useState(1);
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

  const aggregated_balance_for_month = current_month_balances.reduce((acc: number, b: any) => acc + (b.balance?.[0]?.balance || 0), 0);
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
    <div className="flex flex-col gap-3 md:flex-row md:gap-10">
      {/* Left manager sidebar (desktop) */}
      <div className="flex-wrap justify-between hidden w-56 gap-3 px-4 mt-24 bg-transparent md:flex md:mt-0 md:flex-col md:border-r md:px-0 md:p-4">
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
              <div className="absolute -right-1 -top-1 grid h-[1.2rem] w-[1.2rem] place-content-center rounded-md border border-success-200 bg-dark-50 text-primary-300">{income_list.length}</div>
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
              <div className="absolute -right-1 -top-1 grid h-[1.2rem] w-[1.2rem] place-content-center rounded-md border border-danger-200 bg-dark-50 text-danger-300">{engine.expense_list.length}</div>
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
              <div className="absolute -right-1 -top-1 grid h-[1.2rem] w-[1.2rem] place-content-center rounded-md border border-dark-200 bg-dark-50 text-dark-300">{loan_account_list.length}</div>
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
          <div className="flex h-fit w-[210px] cursor-pointer gap-3 p-2 px-2 hover:bg-blue-100">
            <div className="grid h-[3rem] w-[3.6rem] place-content-center self-center rounded-md bg-blue-100 p-2 text-blue-300">
              <FontAwesomeIcon icon={faFileInvoice} className="text-2xl" />
            </div>
            <div className="relative self-center w-full">
              <div className="absolute bottom-2 -right-3 rounded-md bg-purple-100 px-2 py-0.5 text-[9px] font-bold text-purple-400">Coming Soon</div>
              <div className="flex justify-between grow text-dark-300">
                <div className="text-sm leading-tight w-[5rem] font-medium hover:text-blue-300">Tax Manager</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Center column */}
      <div className="flex w-full flex-col gap-4 p-2 md:mt-2 md:w-[50%] md:gap-2">
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
            <div className="flex flex-col text-primary-400">
              <div className="flex justify-end gap-1">
                {is_plan_synced && (
                  <button className="flex flex-row justify-center gap-2 rounded-md bg-dark-900 p-1 px-2 text-[10px] sm:p-2 sm:text-xs h-fit" onClick={OnCompare}>
                    <FontAwesomeIcon icon={faScaleBalanced} className="self-center text-primary-500 sm:text-md" />
                    <div className="self-center">Compare</div>
                  </button>
                )}
                {!is_plan_synced && (
                  <button className="flex h-full flex-row justify-center gap-2 rounded-md bg-dark-900 p-1 px-2 text-[11px] sm:p-2 sm:text-xs" onClick={Save}>
                    <span className="self-center">Save</span>
                    <FontAwesomeIcon icon={faFloppyDisk} className="self-center text-primary-500 text-md" />
                  </button>
                )}
              </div>
              <div className={`px-1 text-sm sm:text-base ${!is_plan_synced ? "text-right" : ""}`}>{GetMonthAndYear(plan, current_month)}</div>
            </div>
          </div>
          {/* aspectRatio 400/350 reproduces the original canvas attr ratio (width 400, height 350) */}
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

        {/* Income/Expense + Net Cashflow (mt-[32rem]- is a dead class in the original) */}
        <div className="flex flex-wrap justify-between gap-2 mb-3 sm:gap-3 md:mt-0 md:flex-nowrap md:gap-6">
          <MonthlyIncomeExpense cashflow={monthly_details?.income} category="income" previous={previous_details?.income?.total_income} />
          <MonthlyIncomeExpense cashflow={monthly_details?.expense} category="expense" previous={previous_details?.expense?.total_expense} />
          <div className="flex grow md:hidden">
            <MonthlyStatement details={monthly_details} mobile />
          </div>
          <div className="flex w-full flex-col gap-2 rounded-2xl border bg-dark-50 p-4 md:h-[9rem] md:w-[19rem] md:gap-1 md:p-6 md:shadow-none">
            <div className="flex gap-3">
              <div className={`grid h-[2.4rem] w-[2.4rem] place-content-center rounded-md bg-dark-100 p-1 md:h-[2rem] md:w-[2rem] ${(monthly_details?.net_cashflow?.total || 0) < 0 ? "text-danger-300 bg-danger-100" : "text-warning-300 bg-warning-100"}`}>
                <FontAwesomeIcon icon={faCircleDollarToSlot} className="self-center text-xl sm:text-2xl md:text-lg" />
              </div>
              <div className="self-center text-xl text-dark-500 md:text-sm md:text-dark-700">Net Cashflow</div>
            </div>
            <DisplayAmount className="text-2xl font-semibold md:text-4xl" amount={monthly_details?.net_cashflow?.total || 0} />
            {previous_details?.net_cashflow?.total ? (
              <div className="text-xs text-dark-300">
                <span className={monthly_details?.net_cashflow?.total >= previous_details?.net_cashflow?.total ? "text-success-300" : "text-danger-300"}>
                  {(((monthly_details?.net_cashflow?.total - previous_details?.net_cashflow?.total) / previous_details?.net_cashflow?.total) * 100).toFixed(1)}%
                  <FontAwesomeIcon icon={monthly_details?.net_cashflow?.total >= previous_details?.net_cashflow?.total ? faUpLong : faDownLong} className="text-xs" />
                </span> vs last month
              </div>
            ) : null}
          </div>
        </div>

        {/* Monthly statement (desktop) */}
        <div className="hidden w-full md:flex">
          <MonthlyStatement details={monthly_details} />
        </div>

        {/* Net worth chart + BalanceAndTxn (desktop) */}
        <div className="flex flex-col justify-between gap-4 mb-20 md:mb-0 md:flex-row">
          <div className="flex-col hidden h-full p-4 border rounded-2xl bg-dark-900 md:flex">
            <div className="flex flex-row-reverse justify-between gap-5">
              <div className="flex">
                <button className="p-1 transition-colors duration-200 bg-transparent rounded-md text-warning-300 hover:bg-dark-600 disabled:opacity-50" disabled={current_month === 1} onClick={() => setCurrentMonth((m) => Math.max(1, m - 1))}>
                  <FontAwesomeIcon icon={faChevronLeft} className="self-center text-lg" />
                </button>
                <div className="mx-3 w-[8ch] self-center text-center text-xl text-dark-200">{GetMonthAndYear(plan, current_month)}</div>
                <button className="p-1 transition-colors duration-200 bg-transparent rounded-md text-warning-300 hover:bg-dark-600 disabled:opacity-50" disabled={current_month === plan_duration} onClick={() => setCurrentMonth((m) => Math.min(plan_duration, m + 1))}>
                  <FontAwesomeIcon icon={faChevronRight} className="self-center text-lg" />
                </button>
              </div>
              <div className="flex flex-col-reverse text-xl text-primary-400">
                <DisplayAmount amount={aggregated_balance_for_month} />
                <div className="self-end text-xs text-dark-200">Net worth</div>
              </div>
            </div>
            {/* matches original: chart_height=500, chart sits directly below the header */}
            <div className="h-[500px] w-[28rem]">
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
          />
        </div>
      </div>

      {/* Transactions sidebar */}
      <div className="hidden overflow-hidden transition-all duration-200 rounded-none h-fit grow md:flex md:flex-col md:border-l">
        <div className="flex justify-end gap-3 px-4 pt-6 pb-5 bg-white border-t">
          <div className="flex gap-2 mr-auto border-r-2 grow">
            <div className="grid p-2 rounded-md place-content-center bg-dark-100 text-dark-300">
              <FontAwesomeIcon icon={faArrowRightArrowLeft} className="rotate-[-45deg]" />
            </div>
            <div className="self-center">Transactions</div>
          </div>
          <button className="flex gap-2 p-1 px-2 rounded-md bg-dark-900 text-dark-100 disabled:opacity-70" onClick={Save} disabled={is_plan_synced}>
            <span>Save</span>
            <FontAwesomeIcon icon={faFloppyDisk} className="self-center text-primary-500" />
          </button>
          <button className="flex gap-2 p-1 px-2 rounded-md bg-dark-900 text-dark-100" onClick={OnCompare}>
            <div>Compare</div>
            <FontAwesomeIcon icon={faScaleBalanced} className="self-center text-primary-500" />
          </button>
        </div>
        {/* month rows, matching IncomeExpenseAndNetCashflowStatement.vue (text-xs root, ±12 months) */}
        <div
          className="flex flex-col items-center justify-between px-4 py-2 overflow-y-scroll text-xs transition-all duration-200 bg-white scroll-smooth md:snap-y snap-mandatory"
          style={{ maxHeight: "130vh", minHeight: "fit-content" }}
        >
          {income_expense_and_net_cashflow.map((d: any, index: number) => {
            if (Math.abs(current_month - index) >= 12) return null;
            return (
              <div
                key={d.month}
                className={`relative my-2 flex w-full cursor-pointer flex-col rounded-md border p-4 shadow-sm snap-start overflow-x-clip snap-always hover:bg-dark-200 ${
                  d.month === current_month
                    ? "border-primary-100 bg-primary-100 shadow-md shadow-primary-100"
                    : "bg-dark-50"
                }`}
                onClick={() => setCurrentMonth(d.month)}
              >
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-1/4">
                    <div className={`w-[70px] py-2 text-center text-dark-500 ${d.month === current_month ? "font-bold" : ""}`}>
                      {GetMonthAndYear(plan, d.month)}
                    </div>
                  </div>
                  <div className="w-full md:w-1/4">
                    <div className="flex flex-col">
                      <span className="text-dark-300 md:text-xs">Income </span>
                      <DisplayAmount className="mr-2 font-bold text-dark-400" amount={d.income?.total_income || 0} />
                    </div>
                  </div>
                  <div className="w-full md:w-1/4">
                    <div className="flex flex-col">
                      <span className="text-dark-300 md:text-xs">Expense </span>
                      <DisplayAmount className="mr-2 font-bold text-dark-400" amount={d.expense?.total_expense || 0} />
                    </div>
                  </div>
                  <div className="w-full md:w-1/4">
                    <div className="flex flex-col">
                      <span className="text-dark-300 md:text-xs">Net </span>
                      <DisplayAmount className="mr-2 font-bold text-dark-600" amount={d.net_cashflow?.total || 0} />
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 flex h-[.15rem] w-full rounded-b-xl">
                  <div
                    className="h-full bg-success-500 opacity-[.5]"
                    style={{
                      width: `${100 - ((d.expense?.total_expense || 0) / (d.income?.total_income || 1)) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full border-l-2 border-dark-400 bg-danger-500 opacity-[.5]"
                    style={{
                      width: `${((d.expense?.total_expense || 0) / (d.income?.total_income || 1)) * 100}%`,
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

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { usePlanEngine } from "@/hooks/usePlanEngine";
import { useRunway } from "@/hooks/useRunway";
import { BuildWealthChartData } from "@/lib/wealthChart";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { MyChart } from "@/components/ui/MyChart";
import { ModalUi } from "@/components/ui/ModalUi";
import { FireNotification } from "@/store/notifications";
import { Track, EVENT_TYPES } from "@/lib/tracker";
import { Listbox } from "@headlessui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faPenToSquare,
  faExpand,
  faPlus,
  faCloudArrowUp,
  faChevronLeft,
  faChevronRight,
  faSort,
  faCodeBranch,
  faCircleCheck,
  faArrowRightToBracket,
  faLandmarkFlag,
  faSackDollar,
  faUpLong,
  faDownLong,
  faFileLines,
  faChevronDown,
  faShareNodes,
} from "@fortawesome/free-solid-svg-icons";

const MAX_PLAN_LIMIT = 3;

function GetMonthAndYear(plan: any, month: number) {
  if (!plan?.timestamp) return "";
  const start = new Date(plan.timestamp);
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]}-${d.getFullYear()}`;
}

function GetMonthDiff(plan_1_timestamp: string, plan_2_timestamp: string) {
  const d1 = new Date(plan_1_timestamp);
  const d2 = new Date(plan_2_timestamp);
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1;
}

function GetMonthDetails(month: number, income_expense_and_net_cashflow: any[] = []) {
  return income_expense_and_net_cashflow[month - 1] || null;
}

/** Port of plan/ComparablePlanWidget.vue. */
function ComparablePlanWidget({
  current_plan_id,
  current_month,
  offset,
  children,
  onStatementUpdate,
}: {
  current_plan_id: string;
  current_month: number;
  offset: number;
  children: React.ReactNode;
  onStatementUpdate: (data: { statement: any[]; plan_id: string; title: string; asset_month_map?: Record<number, any[]> }) => void;
}) {
  const plan = useFiPlanStore((s) => s.plans.find((p) => p._id === current_plan_id));
  const plan_duration = useFiPlanStore((s) => s.plan_duration);
  const plan_synced_map = useFiPlanStore((s) => s.plan_synced_map);
  const sync_plan = useFiPlanStore((s) => s.sync_plan);
  const engine = usePlanEngine(plan || null, plan_duration);

  const current_hover_month = current_month + offset * 1;
  const monthly_details = GetMonthDetails(current_hover_month, engine.income_expense_and_net_cashflow);
  const current_month_balances = monthly_details?.balances || [];
  const expense_statement = engine.cashflow.expense_statement;
  const { runway, net_worth, avg_expense } = useRunway(expense_statement, current_month_balances, current_hover_month);

  const seq = { e: 1, s: 2, i: 3 } as Record<string, number>;
  const account_balances = [...current_month_balances].sort(
    (a: any, b: any) => (seq[a.balance?.[0]?.category] || 99) - (seq[b.balance?.[0]?.category] || 99)
  );

  const is_plan_synced = plan_synced_map[plan?._id || ""] !== false;
  const [plan_sync_inprogress, setPlanSyncInprogress] = useState(false);

  const cssVar = (name: string) =>
    typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue(name) : "";

  const WINDOW_SIZE = 20;
  const window_number = parseInt(String(current_hover_month / WINDOW_SIZE));
  const window_start_point = window_number > 0 ? WINDOW_SIZE * window_number - 1 : 0;

  const balance_chart_data = useMemo(() => {
    const labels = engine.balance_and_transaction_by_month
      .map((b: any) => GetMonthAndYear(plan, b.month))
      .splice(window_start_point, WINDOW_SIZE);
    return BuildWealthChartData(engine, { window_start: window_start_point, window_size: WINDOW_SIZE }, cssVar, labels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.balance_and_transaction_by_month, engine.asset_month_map, current_hover_month]);

  const current_assets_now = (engine.asset_month_map?.[current_hover_month] || []).reduce(
    (acc: number, a: any) => acc + (a.value || 0),
    0
  );
  const aggregated_balance_for_month =
    current_month_balances.reduce((acc: number, curr: any) => acc + (curr.balance?.[0]?.balance || 0), 0) +
    current_assets_now;

  const money_local =
    (typeof window !== "undefined" && window.navigator?.language) || useFiPlanStore.getState().local || "en-IN";
  const ToDisplayableMoney = (value: any) =>
    Intl.NumberFormat(money_local, {
      style: "currency",
      notation: value < 100000 ? "standard" : "compact",
      currency: useFiPlanStore.getState().currency || "INR",
      maximumSignificantDigits: 2,
    }).format(value);

  const annotation = !aggregated_balance_for_month
    ? []
    : [
        {
          value: GetMonthAndYear(plan, current_hover_month),
          content: [
            GetMonthAndYear(plan, current_hover_month),
            `Net worth : ${ToDisplayableMoney(aggregated_balance_for_month.toFixed(2))}`,
          ],
        },
      ];

  const runway_text =
    avg_expense === 0
      ? "N/A"
      : `${runway < 12 ? runway.toFixed(1) : (runway / 12).toFixed(1)} ${runway < 12 ? "mth" : "yrs"}`;

  useEffect(() => {
    onStatementUpdate({
      statement: engine.income_expense_and_net_cashflow,
      plan_id: plan?._id || "",
      title: plan?.title || "",
      asset_month_map: engine.asset_month_map || {},
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.income_expense_and_net_cashflow, engine.asset_month_map]);

  async function SavePlan() {
    setPlanSyncInprogress(true);
    if (!is_plan_synced) await sync_plan(plan?._id || "");
    setPlanSyncInprogress(false);
  }

  const statementRow = (b: any, i: number) => (
    <div key={i} className="flex justify-between gap-2">
      <div className="self-center truncate text-xs font-medium text-dark-500 first-letter:uppercase font-montserrat">
        {b.cashflow_title}
      </div>
      <div className="ml-auto flex justify-end gap-1">
        <DisplayAmount className="text-md" amount={b.amount} />
        {b.change > 0 && <FontAwesomeIcon icon={faUpLong} className="self-center text-xs text-success-400" />}
        {b.change < 0 && <FontAwesomeIcon icon={faDownLong} className="self-center text-xs text-danger-400" />}
        {b.change === 0 && <FontAwesomeIcon icon={faDownLong} className="self-center text-xs text-transparent" />}
        {b.change ? (
          <div className="mb-1 flex gap-1 self-end text-[10px] font-bold md:w-[3.4rem]">
            (
            <div className="flex">
              {b.change > 0 && <div>+</div>}
              <DisplayAmount notation="compact" amount={b.change} />
            </div>
            )
          </div>
        ) : (
          <div className="mb-1 flex gap-1 self-end text-[10px] font-bold md:w-[3.4rem]" />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-4 border-0 bg-transparent px-5 pt-5">
      {/* header row */}
      <div className="flex snap-start gap-4 overflow-x-scroll- py-2">
        <div className="flex flex-col px-0">
          <div className="w-[11rem] truncate text-xl font-bold text-dark-300 md:w-[17rem] md:text-2xl">
            {plan?.title}
          </div>
          <div className="h-[1rem] w-[11rem] truncate text-xs text-dark-200 md:w-[12rem]">{plan?.description}</div>
        </div>
        <div className="ml-auto flex h-fit snap-start justify-between gap-2 md:pl-3">
          <button
            onClick={SavePlan}
            disabled={is_plan_synced}
            className={`gap-2 rounded-[.5rem] grid place-content-center disabled:opacity-50 text-xs hover:opacity-75 font-medium border-2 hover:shadow-sm ${
              is_plan_synced
                ? "border-dark-100 text-dark-400 bg-dark-50"
                : "border-primary-500 border-[2px] text-primary-50 bg-primary-500"
            } flex h-fit w-full gap-2 rounded-lg px-2 py-1 font-bold`}
          >
            <div className="flex gap-2">
              <span className={`hidden self-center md:inline ${!is_plan_synced ? "animate-pulse" : ""}`}> Save </span>
              {plan_sync_inprogress ? (
                <svg className="-ml-1 h-[20px] w-[20px] animate-spin self-center" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <FontAwesomeIcon icon={faCloudArrowUp} className={`self-center font-bold md:text-lg ${!is_plan_synced ? "animate-pulse" : ""}`} />
              )}
            </div>
          </button>
          <div className="flex w-0 border-l border-dark-200" />
          {children}
        </div>
      </div>

      {/* chart — matches ComparablePlanWidget.vue: border-b-2 wrapper + h-full div + 200px canvas */}
      <div className="mb-3 flex flex-col gap-12 rounded-xl px-0">
        <div className="flex flex-col gap-6 place-content-end">
          <div className="flex w-full flex-col">
            <div className="w-full px-2 border-b-2">
              <div className="h-full" style={{ height: 200 }}>
                <MyChart
                  labels={balance_chart_data.labels}
                  dataset={balance_chart_data.datasets}
                  stacked
                  chart_type="bar"
                  height={200}
                  width={450}
                  formatter={ToDisplayableMoney}
                  annotation={annotation}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* net worth / runway */}
      <div className="mb-3 flex justify-between gap-12 rounded-xl px-0">
        <div className="flex flex-col">
          <div className="text-dark-200">Net worth</div>
          <DisplayAmount className="text-3xl font-bold text-primary-500" notation="compact" amount={net_worth + current_assets_now} />
          {current_assets_now > 0 && (
            <div className="text-[10px] text-dark-400">
              incl. <DisplayAmount notation="compact" amount={current_assets_now} /> assets
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <div className="ml-auto text-dark-200">Runway</div>
          <div className="ml-auto text-3xl font-bold text-dark-300">{runway_text}</div>
        </div>
      </div>

      {/* account balances */}
      <div className="flex flex-col justify-between gap-12 rounded-xl px-0">
        <div className="flex flex-col divide-y-2 overflow-hidden rounded-xl border border-dark-100 shadow-sm border-collapse">
          {account_balances.map((account: any, index: number) => (
            <div className="flex" key={index}>
              <div className="w-[10rem] border-r bg-slate-100 p-3 md:w-[15rem]">{account.balance[0].acc_name}</div>
              <div className="ml-auto p-3">
                <DisplayAmount
                  notation={account.balance[0].balance > 9999 ? "compact" : "standard"}
                  amount={account.balance[0].balance}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* income / expense / net cashflow */}
      <div className="mb-3 flex flex-col justify-between gap-12 rounded-xl px-0">
        <div className="flex flex-col divide-y-2 overflow-hidden rounded-xl border border-dark-100 shadow-sm border-collapse">
          <div className="flex">
            <div className="w-[10rem] border-r bg-slate-100 p-3 md:w-[15rem]">Income</div>
            <div className="ml-auto p-3">
              <DisplayAmount amount={monthly_details?.income?.total_income || 0} />
            </div>
          </div>
          <div className="flex">
            <div className="w-[10rem] border-r bg-slate-100 p-3 md:w-[15rem]">Expense</div>
            <div className="ml-auto p-3">
              <DisplayAmount amount={monthly_details?.expense?.total_expense || 0} />
            </div>
          </div>
          <div className="flex">
            <div className="w-[10rem] border-r bg-slate-100 p-3 md:w-[15rem]">Net Cashflow</div>
            <div className="ml-auto p-3">
              <DisplayAmount amount={monthly_details?.net_cashflow?.total || 0} />
            </div>
          </div>
        </div>
      </div>

      {/* monthly statement */}
      <div className="mb-56 flex px-0">
        <div className="w-full">
          <details className="w-full">
            <summary className="flex w-full cursor-pointer list-none justify-between rounded-lg bg-dark-100 px-4 py-4 text-left text-sm font-semibold text-dark-500 shadow-sm hover:bg-dark-200 md:py-2">
              <span>
                <FontAwesomeIcon className="mr-1 text-md" icon={faFileLines} /> Monthly Statement
              </span>
              <FontAwesomeIcon icon={faChevronDown} className="h-4 w-4 self-center text-dark-400" />
            </summary>
            <div className="mb-3 w-full rounded-b-xl rounded-t-md border p-4 text-sm text-gray-500 transition-all duration-150">
              <div className="flex grow flex-col justify-between gap-4">
                {monthly_details?.income && (
                  <div className="flex flex-col gap-1">
                    <div className="flex text-xs font-bold uppercase">Income</div>
                    {(monthly_details.income.income_breakdown || []).map(statementRow)}
                    {!monthly_details.income.income_breakdown.length && (
                      <div className="mt-2 grid h-10 place-content-center rounded-md border-2 border-dashed">No income available</div>
                    )}
                  </div>
                )}
                {monthly_details?.expense && (
                  <div className="flex flex-col gap-1 border-t pt-3">
                    <div className="flex text-xs font-bold uppercase">Expense</div>
                    {(monthly_details.expense.expense_breakdown || []).map(statementRow)}
                    {!monthly_details.expense.expense_breakdown.length && (
                      <div className="mt-2 grid h-10 place-content-center rounded-md border-2 border-dashed">No expense available</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

/** Port of compare_plan.page.vue — side-by-side plan comparison. */
function ComparePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plans = useFiPlanStore((s) => s.plans);
  const plan_duration = useFiPlanStore((s) => s.plan_duration);
  const setPlanDuration = useFiPlanStore((s) => s.set_plan_duration) as any;
  const setGodPlanEntity = useFiPlanStore((s) => s.set_god_plan_entity);
  const setShareData = useFiPlanStore((s) => s.set_share_data);

  const [current_hover_month_input, setCurrentHoverMonthInput] = useState(1);
  const [current_hover_month, setCurrentHoverMonth] = useState(1);
  const [duration, setDuration] = useState(plan_duration);
  const [show_control_panel, setShowControlPanel] = useState(false);
  const [selected_plan_id, setSelectedPlanId] = useState("");
  const [plan_balance_map, setPlanBalanceMap] = useState<
    Record<string, { title: string; statement: any[]; asset_month_map?: Record<number, any[]> }>
  >({});

  const plan_ids = useMemo(
    () => (searchParams.get("p_ids") || "").split(",").filter(Boolean).slice(0, MAX_PLAN_LIMIT),
    [searchParams]
  );

  const plans_to_be_compared = plan_ids
    .map((id) => plans.find((p) => p._id === id))
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const most_recent_plan: any = plans_to_be_compared[0];
  const plan_offset_map: Record<string, number> = {};
  for (const p of plans_to_be_compared as any[]) {
    plan_offset_map[p._id] = GetMonthDiff(p.timestamp, most_recent_plan.timestamp);
  }

  const available_plans = plans.filter((p) => !plan_ids.includes(p._id));

  // aggregated balance map (per plan, per month) — FULL net worth = buckets + assets
  const aggregated_balance_map = useMemo(() => {
    const map: Record<string, { title: string; plan_id: string; aggregated_balance: number[] }> = {};
    for (const plan_id of Object.keys(plan_balance_map)) {
      const { title, statement, asset_month_map } = plan_balance_map[plan_id];
      map[plan_id] = { title, plan_id, aggregated_balance: [] };
      for (let index = 0; index < duration - 1; index++) {
        const month = index + 1;
        const buckets = (statement[index]?.balances || []).reduce(
          (acc: number, curr: any) => acc + (curr.balance?.[0]?.balance || 0),
          0
        );
        const assets = (asset_month_map?.[month] || []).reduce((acc: number, a: any) => acc + (a.value || 0), 0);
        map[plan_id].aggregated_balance.push(buckets + assets);
      }
    }
    return map;
  }, [plan_balance_map, duration]);

  const randomHexColor = () =>
    `#${Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padEnd(6, "0")}`;

  const aggregated_balance_chart_data = useMemo(() => {
    const labels: string[] = [];
    const datasets: any[] = [];
    for (const plan_id of Object.keys(aggregated_balance_map)) {
      const { title, aggregated_balance } = aggregated_balance_map[plan_id];
      const color = randomHexColor();
      datasets.push({
        data: aggregated_balance,
        label: title.toLocaleUpperCase(),
        backgroundColor: color,
        borderColor: color,
        pointStyle: "circle",
        type: "line",
        pointRadius: 0,
        pointHoverRadius: 5,
        borderRadius: { topLeft: 3, topRight: 3 },
        pointHoverBorderColor:
          typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue("--color-dark-50") : "",
        pointHoverColor:
          typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue("--color-dark-500") : "",
        pointHoverBorderWidth: 5,
      });
    }
    labels.push(...(datasets[0]?.data.map((_: any, index: number) => GetMonthAndYear(most_recent_plan, index + 1)) || []));
    return { labels, datasets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregated_balance_map]);

  const annotation = useMemo(() => {
    if (!aggregated_balance_chart_data.labels.length || !aggregated_balance_chart_data.datasets.length) return [];
    return [
      {
        value: aggregated_balance_chart_data.labels[current_hover_month - 1],
        content: [aggregated_balance_chart_data.labels[current_hover_month - 1]],
      },
    ];
  }, [aggregated_balance_chart_data, current_hover_month]);

  const money_local =
    (typeof window !== "undefined" && window.navigator?.language) || useFiPlanStore.getState().local || "en-IN";
  const ToDisplayableMoney = (value: any) =>
    Intl.NumberFormat(money_local, {
      style: "currency",
      notation: value < 100000 ? "standard" : "compact",
      currency: useFiPlanStore.getState().currency || "INR",
      maximumSignificantDigits: 2,
    }).format(value);

  function updateQuery(ids: string[]) {
    router.push(`/plans/compare?p_ids=${ids.join(",")}`);
  }
  function removePlan(id: string) {
    updateQuery(plan_ids.filter((x) => x !== id));
  }
  function addPlan(plan_id?: string) {
    if (!plan_id) return;
    if (!plan_ids.includes(plan_id)) {
      const newIds = [...plan_ids, plan_id];
      Track(EVENT_TYPES.COMPARE.id, { plan_ids: newIds }, {});
      updateQuery(newIds);
    } else {
      alert("Plan is already selected!");
    }
  }
  function OnEdit(plan_id: string) {
    setSelectedPlanId(plan_id);
    setShowControlPanel(true);
  }
  function Close() {
    setShowControlPanel(false);
    setSelectedPlanId("");
  }
  function HandleEdit(entity_type: string, sub_entity_type: string) {
    setGodPlanEntity({ active: true, plan_id: selected_plan_id, sub_entity_type, entity_type, entity_id: "" });
    router.push("/edit");
  }
  function OnStatementUpdate({ plan_id, title, statement, asset_month_map }: { plan_id: string; title: string; statement: any[]; asset_month_map?: Record<number, any[]> }) {
    setPlanBalanceMap((m) => ({ ...m, [plan_id]: { title, statement, asset_month_map } }));
  }
  function SetNextMonth() {
    setCurrentHoverMonthInput((v) => v + 1);
  }
  function SetPreviousMonth() {
    setCurrentHoverMonthInput((v) => v - 1);
  }
  function OnShareButtonClicked() {
    setShareData({ modal_state: "open", type: "template", ids: plan_ids, category: "t-c" });
  }

  useEffect(() => {
    setCurrentHoverMonth(current_hover_month_input);
  }, [current_hover_month_input]);

  useEffect(() => {
    setPlanDuration(duration);
  }, [duration, setPlanDuration]);

  const [can_exit, setCanExit] = useState(true);
  function Exit() {
    const dur = 15000;
    if (can_exit) {
      setCanExit(false);
      FireNotification({
        title: "Confirmation Needed!",
        desc: " Are you sure you want to exit Comparison mode?",
        variant: "neutral",
        active: true,
        dismissal: "true",
        time_based: true,
        duration: dur,
        on_close: () => setCanExit(true),
        buttons: [{ text: "Yes", handler: () => router.push("/plan") }],
      });
      setTimeout(() => setCanExit(true), dur);
    }
  }

  const editTiles = [
    {
      entity_type: "cashflow",
      sub_entity_type: "income",
      label: "Income Manager",
      icon: faArrowRightToBracket,
      iconCls: "self-center text-2xl rotate-[135deg]",
      boxCls: "text-success-300 bg-success-100",
      hoverCls: "hover:bg-primary-100",
    },
    {
      entity_type: "cashflow",
      sub_entity_type: "expense",
      label: "Expense Manager",
      icon: faArrowRightToBracket,
      iconCls: "self-center text-2xl rotate-[135deg]",
      boxCls: "text-danger-300 bg-danger-100",
      hoverCls: "hover:bg-danger-100",
    },
    {
      entity_type: "loan",
      sub_entity_type: "",
      label: "Loan Manager",
      icon: faLandmarkFlag,
      iconCls: "self-center text-2xl",
      boxCls: "text-dark-300 bg-dark-100",
      hoverCls: "hover:bg-dark-100",
    },
    {
      entity_type: "fdp",
      sub_entity_type: "",
      label: "Money Manager",
      icon: faSackDollar,
      iconCls: "self-center text-2xl",
      boxCls: "text-warning-300 bg-warning-100",
      hoverCls: "hover:bg-warning-100",
    },
  ];

  return (
    <div className="relative flex flex-col gap-10 border-0">
      {/* bottom control panel */}
      <div className="fixed bottom-4 left-0 z-10 mx-auto flex w-full justify-center">
        <div className="flex w-[80.6vw] rounded-xl border-2 border-b-0 bg-slate-900 px-4 pt-2 shadow-lg md:pr-2 md:pt-0">
          <div className="flex w-full flex-col">
            <div className="ms:pt-2 flex pt-1">
              <div className="flex w-full gap-5 self-center uppercase text-dark-100">Compare plans</div>
              <div className="flex w-fit justify-end gap-5 self-center pt-1 text-dark-100">
                <button onClick={Exit}>
                  <FontAwesomeIcon icon={faXmark} className="self-center rounded-md bg-dark-200 p-1 px-2 text-lg font-bold text-dark-500" />
                </button>
              </div>
            </div>
            <div className="flex justify-center gap-3">
              {aggregated_balance_chart_data.labels.length > 0 && aggregated_balance_chart_data.datasets.length > 0 && (
                <div className="hidden w-full rounded-lg py-0 md:inline">
                  <div className="h-full" style={{ height: 100 }}>
                    <MyChart
                      labels={aggregated_balance_chart_data.labels}
                      dataset={aggregated_balance_chart_data.datasets}
                      chart_type="bar"
                      stacked={false}
                      height={100}
                      width={400}
                      formatter={ToDisplayableMoney}
                      annotation={annotation}
                    />
                  </div>
                </div>
              )}
              <div className="flex w-fit grow flex-col justify-center gap-2">
                <div className="flex grow justify-between gap-3 md:justify-center">
                  <button
                    className="grid h-fit place-content-center self-center rounded-lg bg-dark-600 p-3 text-lg text-dark-600 hover:bg-dark-700 disabled:opacity-20"
                    onClick={SetPreviousMonth}
                    disabled={current_hover_month === 1}
                  >
                    <FontAwesomeIcon icon={faChevronLeft} className="self-center text-lg text-white md:text-xs" />
                  </button>
                  <div className="w-[10rem] self-center py-2 text-center text-2xl font-bold text-dark-50">
                    {annotation[0]?.value}
                  </div>
                  <button
                    className="grid h-fit place-content-center self-center rounded-lg bg-dark-600 p-3 text-lg text-dark-600 hover:bg-dark-700 disabled:opacity-20"
                    onClick={SetNextMonth}
                    disabled={current_hover_month === duration - 1}
                  >
                    <FontAwesomeIcon icon={faChevronRight} className="self-center text-lg text-white md:text-xs" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-3">
              <input
                type="range"
                step="1"
                style={{ transition: "all" }}
                min="1"
                value={current_hover_month_input}
                max={duration - 1}
                onChange={(e) => setCurrentHoverMonthInput(Number(e.target.value))}
                className="mb-2 w-full accent-success-500 transition-all duration-200"
              />
            </div>
          </div>
        </div>
      </div>

      {/* plan columns */}
      <div className="flex w-fit snap-x snap-mandatory divide-x overflow-x-scroll md:mt-0 md:w-full mt-11">
        {plan_ids.map((plan_id, index) => (
          <div key={plan_id} className="w-[380px] snap-start md:w-1/2">
            <ComparablePlanWidget
              offset={plan_offset_map[plan_id] || 1}
              onStatementUpdate={OnStatementUpdate}
              current_plan_id={plan_id}
              current_month={current_hover_month}
            >
              <div className="flex gap-2 rounded-md border">
                <button
                  aria-label="Edit plan"
                  onClick={() => OnEdit(plan_id)}
                  className="gap-2 rounded-[.5rem] grid place-content-center disabled:opacity-50 text-xs hover:opacity-75 font-medium border-2 hover:shadow-sm border-dark-100 text-dark-400 bg-dark-50 h-fit self-center border-0 px-2 py-1"
                >
                  <div className="flex gap-2">
                    <FontAwesomeIcon icon={faPenToSquare} className="self-center" />
                  </div>
                </button>
                <button
                  aria-label="View plan"
                  onClick={() => router.push(`/plan?p_id=${plan_id}`)}
                  className="gap-2 rounded-[.5rem] grid place-content-center disabled:opacity-50 text-xs hover:opacity-75 font-medium border-2 hover:shadow-sm border-dark-100 text-dark-400 bg-dark-50 ml-1 h-fit self-center border-0 py-1 pr-2"
                >
                  <div className="flex gap-2">
                    <FontAwesomeIcon icon={faExpand} className="self-center" />
                  </div>
                </button>
                {plans_to_be_compared.length > 1 && (
                  <button
                    aria-label="Remove from comparison"
                    onClick={() => removePlan(plan_id)}
                    className="gap-2 rounded-[.5rem] grid place-content-center disabled:opacity-50 text-md hover:opacity-75 font-medium border-2 hover:shadow-sm border-dark-100 text-dark-400 bg-dark-50 h-fit self-center border-0 px-2 py-1"
                  >
                    <div className="flex gap-2">
                      <FontAwesomeIcon icon={faXmark} />
                    </div>
                  </button>
                )}
              </div>
            </ComparablePlanWidget>
          </div>
        ))}

        {plans_to_be_compared.length < MAX_PLAN_LIMIT && (
          <div className="mt-11 flex flex-col gap-3 px-5 py-16 md:mt-0 md:w-1/2">
            <div className="flex justify-center text-dark-300">
              <FontAwesomeIcon icon={faPlus} className="text-9xl" />
            </div>
            <Listbox value={available_plans[0]?._id} onChange={(v: string) => addPlan(v)}>
              <div className="relative w-full self-center">
                <Listbox.Button className="w-full relative h-[2.5rem] cursor-default rounded-md bg-dark-50 py-2 pl-3 pr-10 text-left shadow-sm border-2 border-dark-100 hover:border-dark-200 sm:text-sm">
                  <span className="block truncate font-inter text-dark-500 first-letter:uppercase">
                    {available_plans.find((p) => p._id === available_plans[0]?._id)?.title || "Select..."}
                  </span>
                  <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-dark-500">
                    <FontAwesomeIcon icon={faSort} />
                  </span>
                </Listbox.Button>
                <Listbox.Options className="absolute z-20 mt-11 max-h-60 w-full overflow-auto rounded-md bg-dark-50 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                  {available_plans.map((plan: any) => (
                    <Listbox.Option
                      key={plan._id}
                      value={plan._id}
                      className={({ active }: { active: boolean }) =>
                        `${plan_ids.includes(plan._id) ? "bg-dark-100 text-dark-600" : "text-dark-500"} ${
                          active ? "bg-dark-100 text-dark-600" : ""
                        } relative flex cursor-default select-none justify-between py-2 px-4`
                      }
                    >
                      <span
                        className={`${plan_ids.includes(plan._id) ? "font-medium" : "font-normal"} block truncate text-left`}
                      >
                        {plan.title}
                      </span>
                      {plan.parent_id && (
                        <span className="relative inset-y-0 left-0 flex items-center pl-3 text-dark-500">
                          <FontAwesomeIcon className="self-center text-lg" icon={faCodeBranch} />
                        </span>
                      )}
                      {plan_ids.includes(plan._id) && (
                        <span className="relative inset-y-0 left-0 flex items-center pl-3 text-amber-600">
                          <FontAwesomeIcon icon={faCircleCheck} />
                        </span>
                      )}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </div>
            </Listbox>
            <div className="flex justify-center">
              <Button className="w-[18.5rem] px-2 py-1" disabled={!available_plans.length} onClick={() => addPlan(available_plans[0]?._id)}>
                Add Plan
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* edit modal */}
      <div className="flex w-full">
        <ModalUi show={show_control_panel} onClose={Close} custom_class="w-fit bg-dark-50 rounded-xl p-2" title="Edit">
          <div className="my-3 grid h-fit w-fit grid-cols-2 gap-3">
            {editTiles.map((tile) => (
              <div
                key={tile.label}
                className={`flex h-fit snap-start cursor-pointer gap-3 rounded-lg border bg-dark-50 bg-opacity-25 p-2 px-2 ${tile.hoverCls}`}
                onClick={() => HandleEdit(tile.entity_type, tile.sub_entity_type)}
              >
                <div className={`relative grid h-[3rem] w-[3.6rem] place-content-center self-center rounded-md p-2 ${tile.boxCls}`}>
                  <FontAwesomeIcon icon={tile.icon} className={tile.iconCls} />
                </div>
                <div className="w-full self-center">
                  <div className="flex grow justify-between text-dark-300">
                    <div className="w-[5rem] text-sm font-medium leading-tight">{tile.label}</div>
                    <FontAwesomeIcon icon={faChevronRight} className="self-center px-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ModalUi>
      </div>

      {/* Share button teleported into top nav */}
      {plans_to_be_compared.length > 1 &&
        typeof document !== "undefined" &&
        document.getElementById("share-button") &&
        createPortal(
          <button
            onClick={OnShareButtonClicked}
            className="gap-2 rounded-[.5rem] grid place-content-center disabled:opacity-50 text-md hover:opacity-75 font-medium border-2 hover:shadow-sm border-primary-400 text-primary-500 bg-primary-50 h-[2.5rem] px-3 ml-auto self-center"
          >
            <div className="flex gap-2">
              <span className="hidden md:inline">Share</span>
              <FontAwesomeIcon icon={faShareNodes} className="self-center text-lg font-bold" />
            </div>
          </button>,
          document.getElementById("share-button")!
        )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-50" />}>
      <ComparePageInner />
    </Suspense>
  );
}

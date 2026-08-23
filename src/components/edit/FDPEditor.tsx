"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { MyChart } from "@/components/ui/MyChart";
import { MonthPicker } from "@/components/edit/MonthPicker";
import { api } from "@/lib/api";
import { GetRandomString } from "@/lib/utils";
import { FireNotification } from "@/store/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faXmark,
  faPlus,
  faArrowUpRightFromSquare,
  faCloudArrowUp,
  faPen,
  faChevronRight,
  faChevronLeft,
  faMoneyCheckDollar,
  faTrashCan,
  faSackDollar,
  faVault,
  faPiggyBank,
  faChartLine,
  faCheck,
  faArrowsRotate,
  faCircleCheck,
  faCircleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { faLightbulb, faFileLines } from "@fortawesome/free-regular-svg-icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function GetMMYYYY(month: number, plan_timestamp?: string | number) {
  const start = new Date(plan_timestamp || Date.now());
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** Port of fund_distribution_percentage/FDPCard.vue — Lucid Card Standard */
function FDPCard({
  plan,
  fdp,
  children,
  dimmed,
  selected = false,
  onClick,
}: {
  plan: any;
  fdp: any;
  children?: React.ReactNode;
  dimmed?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const start_date = GetMMYYYY(fdp.start_month, plan?.timestamp);
  const end_date = GetMMYYYY(fdp.end_month, plan?.timestamp);

  return (
    <div
      onClick={onClick}
      className={`group flex flex-col rounded-xl border bg-white p-4 text-dark-700 shadow-xs transition-all duration-200 hover:shadow-md md:max-w-[460px] ${
        selected
          ? "border-primary-400 border-l-4 border-l-primary-500 ring-2 ring-primary-400/20"
          : "border-dark-200 border-l-4 border-l-blue-500"
      } ${dimmed ? "opacity-50" : ""} ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-transform group-hover:scale-105">
              <FontAwesomeIcon icon={faSackDollar} className="text-sm" />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="truncate text-sm font-bold text-dark-800 first-letter:uppercase sm:text-base">
                {fdp.strategy || "Surplus Allocation Strategy"}
              </p>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-dark-400">
                <span className="rounded-md bg-dark-100/80 px-1.5 py-0.5 text-dark-600">
                  {start_date}
                  {start_date !== end_date && ` → ${end_date}`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {children && (
          <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {children}
          </div>
        )}
      </div>

      {/* Distribution visual chips */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-dark-100/80 pt-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/80 px-2 py-1 text-xs font-bold text-blue-700">
          <FontAwesomeIcon icon={faVault} className="text-[10px] text-blue-500" />
          <span>Emergency: {fdp.e}%</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-1 text-xs font-bold text-amber-700">
          <FontAwesomeIcon icon={faPiggyBank} className="text-[10px] text-amber-500" />
          <span>Savings: {fdp.s}%</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2 py-1 text-xs font-bold text-emerald-700">
          <FontAwesomeIcon icon={faChartLine} className="text-[10px] text-emerald-500" />
          <span>Investment: {fdp.i}%</span>
        </div>
      </div>
    </div>
  );
}

/** Port of fund_distribution_percentage/FundDistributionPercentageCommand.vue — Lucid Form Standard */
function FDPCommand({
  plan,
  fdp,
  mode,
  onDone,
}: {
  plan: any;
  fdp?: any;
  mode: "add" | "edit";
  onDone: (result: { action: string; fdp_id?: string }) => void;
}) {
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);
  const [state, setState] = useState<any>({
    start_month: 1,
    end_month: 2,
    s: 10,
    e: 30,
    i: 60,
    active: true,
    loading: false,
    deleting: false,
  });

  useEffect(() => {
    if (fdp) {
      setState((s: any) => ({
        ...s,
        start_month: fdp.start_month,
        end_month: fdp.end_month,
        s: fdp.s,
        e: fdp.e,
        i: fdp.i,
        active: fdp.active,
        loading: false,
        deleting: false,
      }));
    } else {
      setState((s: any) => ({ ...s, start_month: 1, end_month: 2, s: 10, e: 30, i: 60, active: true, loading: false, deleting: false }));
    }
  }, [fdp]);

  const total_percentage = Number(state.e || 0) + Number(state.s || 0) + Number(state.i || 0);
  const is_valid = total_percentage === 100;

  async function SaveChanges() {
    if (!is_valid) return;
    const fdp_obj: any = {
      _id: mode === "add" ? GetRandomString(6) : fdp?._id,
      start_month: state.start_month,
      end_month: state.end_month,
      e: Number(state.e),
      s: Number(state.s),
      i: Number(state.i),
      active: state.active,
    };
    setState((s: any) => ({ ...s, loading: true }));
    const fdp_list = [...(plan.fund_distribution_percentage || [])];
    if (mode === "add") fdp_list.push(fdp_obj);
    else {
      const idx = fdp_list.findIndex((x: any) => x._id === fdp_obj._id);
      if (idx >= 0) fdp_list[idx] = fdp_obj;
    }
    update_plan_local({ ...plan, fund_distribution_percentage: fdp_list });
    setState((s: any) => ({ ...s, loading: false }));
    onDone({ action: "added", fdp_id: fdp_obj._id });
  }

  async function DeleteFdp() {
    setState((s: any) => ({ ...s, deleting: true }));
    const fdp_list = (plan.fund_distribution_percentage || []).filter((x: any) => x._id !== fdp?._id);
    update_plan_local({ ...plan, fund_distribution_percentage: fdp_list });
    setState((s: any) => ({ ...s, deleting: false }));
    onDone({ action: "deleted" });
  }

  const inputClass =
    "w-full rounded-xl border border-dark-200 bg-dark-50/50 px-3.5 py-2 text-sm font-bold text-dark-800 transition-colors focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-dark-200 bg-white p-5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-dark-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <FontAwesomeIcon icon={faMoneyCheckDollar} className="text-sm" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-dark-800">
              {mode === "add" ? "Add Allocation Strategy" : "Edit Allocation Strategy"}
            </h3>
            <p className="text-[11px] font-medium text-dark-400">
              Split monthly cashflow surplus between buckets
            </p>
          </div>
        </div>

        {mode === "edit" && (
          <button
            type="button"
            onClick={DeleteFdp}
            disabled={state.deleting}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50 transition-colors"
          >
            {state.deleting ? (
              <FontAwesomeIcon icon={faArrowsRotate} className="animate-spin text-xs" />
            ) : (
              <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
            )}
          </button>
        )}
      </div>

      {/* Visual Allocation Split Progress Bar */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-dark-100 bg-dark-50/60 p-3">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-dark-600">Allocation Split</span>
          <span
            className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${
              is_valid
                ? "bg-emerald-100 text-emerald-800"
                : "bg-rose-100 text-rose-800"
            }`}
          >
            <FontAwesomeIcon icon={is_valid ? faCircleCheck : faCircleExclamation} className="text-[10px]" />
            {total_percentage}% {is_valid ? "(100% Total)" : "(Must equal 100%)"}
          </span>
        </div>

        <div className="flex h-3 w-full overflow-hidden rounded-full bg-dark-200">
          <div
            style={{ width: `${Math.min(Math.max(state.e || 0, 0), 100)}%` }}
            className="bg-blue-500 transition-all duration-300"
            title={`Emergency: ${state.e}%`}
          />
          <div
            style={{ width: `${Math.min(Math.max(state.s || 0, 0), 100)}%` }}
            className="bg-amber-500 transition-all duration-300"
            title={`Savings: ${state.s}%`}
          />
          <div
            style={{ width: `${Math.min(Math.max(state.i || 0, 0), 100)}%` }}
            className="bg-emerald-500 transition-all duration-300"
            title={`Investment: ${state.i}%`}
          />
        </div>
      </div>

      {/* 3 Allocation Inputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-xs font-bold text-blue-700">
            <FontAwesomeIcon icon={faVault} className="text-[11px]" />
            <span>Emergency %</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              value={state.e}
              onChange={(e) => setState((s: any) => ({ ...s, e: Number(e.target.value) }))}
              required
              className={inputClass}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-dark-400">
              %
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
            <FontAwesomeIcon icon={faPiggyBank} className="text-[11px]" />
            <span>Savings %</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              value={state.s}
              onChange={(e) => setState((s: any) => ({ ...s, s: Number(e.target.value) }))}
              required
              className={inputClass}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-dark-400">
              %
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
            <FontAwesomeIcon icon={faChartLine} className="text-[11px]" />
            <span>Investment %</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              value={state.i}
              onChange={(e) => setState((s: any) => ({ ...s, i: Number(e.target.value) }))}
              required
              className={inputClass}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-dark-400">
              %
            </span>
          </div>
        </div>
      </div>

      {/* Date Range Selection */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-dark-700">Start Month</label>
          <MonthPicker
            plan_timestamp={plan.timestamp}
            duration={plan?.duration || 600}
            month={state.start_month}
            onChange={(m) => setState((s: any) => ({ ...s, start_month: m }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-dark-700">End Month</label>
          <MonthPicker
            plan_timestamp={plan.timestamp}
            duration={plan?.duration || 600}
            month={state.end_month}
            min_month={state.start_month}
            onChange={(m) => setState((s: any) => ({ ...s, end_month: m }))}
          />
        </div>
      </div>

      {/* Submit button */}
      <button
        type="button"
        disabled={!is_valid || state.loading}
        onClick={SaveChanges}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-bold text-white shadow-xs transition-all hover:bg-primary-600 active:scale-[0.99] disabled:opacity-50"
      >
        {state.loading ? (
          <FontAwesomeIcon icon={faArrowsRotate} className="animate-spin text-sm" />
        ) : (
          <FontAwesomeIcon icon={faCheck} className="text-sm" />
        )}
        <span>{mode === "add" ? "Add Allocation Strategy" : "Save Strategy"}</span>
      </button>
    </div>
  );
}

/** Port of fund_distribution_percentage/FDPEditor.vue — the Money Manager editor. */
export function FDPEditor({ plan_id }: { plan_id: string }) {
  const router = useRouter();
  const plans = useFiPlanStore((s) => s.plans);
  const plan_synced_map = useFiPlanStore((s) => s.plan_synced_map);
  const sync_plan = useFiPlanStore((s) => s.sync_plan);

  const plan = plans.find((p) => p._id === plan_id);

  const [stack, setStack] = useState<string[]>(["fdp_list"]);
  const [stage, setStage] = useState("fdp_list");
  const [selected_fdp_id, setSelectedFdpId] = useState("");
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [current_hover_month, setCurrentHoverMonth] = useState(1);
  const [duration, setDuration] = useState(120);
  const [plan_sync_inprogress, setPlanSyncInprogress] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    if (plan) {
      api.PlanSnapshot(plan, Math.max(duration, 120)).then((s) => {
        if (!cancelled) setSnapshot(s);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [plan, duration]);

  const fdp_list = useMemo(() => {
    if (!snapshot) return [];
    const fdp_month_map = snapshot.account_balances_and_transactions?.FDP_month_map || {};
    const principle: any[] = [];
    for (const month of Object.keys(fdp_month_map)) {
      principle.push({ ...fdp_month_map[month], _id: month, month: parseInt(month) });
    }
    principle.sort((a: any, b: any) => a.month - b.month);

    const final_list: any[] = [];
    let prev_fdp: any = null;
    let prev_esi = "";
    principle.forEach((fdp: any, index: number) => {
      const { e, s, i, month } = fdp;
      const current_esi_string = `${e}-${s}-${i}`;
      if (current_esi_string !== prev_esi) {
        if (prev_fdp) final_list.push(prev_fdp);
        prev_fdp = { ...fdp, start_month: month, end_month: month };
        prev_esi = current_esi_string;
      } else {
        if (index + 1 === principle.length) {
          final_list.push(prev_fdp);
        }
      }
      if (prev_fdp) prev_fdp.end_month = month;
    });
    return final_list;
  }, [snapshot]);

  const selected_fdp = fdp_list.find((f: any) => f._id === selected_fdp_id);
  const is_plan_synced = plan_synced_map[plan_id] !== false;
  const show_fdp_list = ["fdp_list", "add_fdp"].includes(stage);
  const show_fdp_meta = ["view_fdp", "edit_fdp"].includes(stage) && !!selected_fdp;
  const show_command = ["add_fdp", "edit_fdp"].includes(stage);

  // Chart data: stacked Emergency / Savings / Investment %
  const fdp_chart_data = useMemo(() => {
    const labels: string[] = [];
    const datasets: any[] = [];
    if (!plan || !snapshot) return { labels, datasets };
    const fdp_month_map = snapshot.account_balances_and_transactions?.FDP_month_map || {};
    const cats: Array<[string, string, string, number]> = [
      ["e", "Emergency", "#3b82f6", 3],
      ["s", "Savings", "#f59e0b", 2],
      ["i", "Investment", "#10b981", 1],
    ];
    for (const [key, label, color, order] of cats) {
      const data: number[] = [];
      for (let month = 1; month <= Math.min(duration, 600); month++) {
        const fdp = fdp_month_map[month];
        data.push(fdp ? fdp[key] : 0);
      }
      datasets.push({
        data,
        label,
        backgroundColor: color,
        borderColor: color,
        pointStyle: "circle",
        pointRadius: 0,
        pointHoverRadius: 5,
        borderRadius: { topLeft: 3, topRight: 3 },
        order,
      });
    }
    for (let month = 1; month <= Math.min(duration, 600); month++) labels.push(GetMMYYYY(month, plan.timestamp));
    return { labels, datasets };
  }, [plan, snapshot, duration]);

  const annotation = fdp_chart_data.labels.length
    ? [{ value: fdp_chart_data.labels[current_hover_month - 1], content: [fdp_chart_data.labels[current_hover_month - 1]] }]
    : [];

  const duration_view_list = [
    { text: "1 yr", value: 12 },
    { text: "3 yrs", value: 36 },
    { text: "5 yrs", value: 60 },
    { text: "10 yrs", value: 120 },
    { text: "20 yrs", value: 240 },
    { text: "Max", value: 600 },
  ];

  function SetState(current_state: string, action: string, fdp_id = "") {
    if (current_state === "fdp_list" && action === "back") router.back();
    if (current_state === "fdp_list" && action === "add") {
      setStage("add_fdp");
      setMode("add");
      setSelectedFdpId("");
      setStack((s) => [...s, "add_fdp"]);
    }
    if (current_state === "fdp_list" && action === "view") {
      setStage("view_fdp");
      setSelectedFdpId(fdp_id);
      setStack((s) => [...s, "view_fdp"]);
    }
    if (current_state === "view_fdp" && action === "edit") {
      setStage("edit_fdp");
      setMode("edit");
      setStack((s) => [...s, "edit_fdp"]);
    }
    if (current_state === "view_fdp" && action === "back") {
      setStage("fdp_list");
      setSelectedFdpId("");
      setStack((s) => s.slice(0, -1));
    }
    if (current_state === "add_fdp" && action === "back") {
      setStage("fdp_list");
      setStack((s) => s.slice(0, -1));
    }
    if (current_state === "edit_fdp" && action === "back") {
      setStage("view_fdp");
      setStack((s) => s.slice(0, -1));
    }
    if (current_state === "edit_fdp" && action === "deleted") {
      setStage("fdp_list");
      setSelectedFdpId("");
      setStack(["fdp_list"]);
    }
  }

  async function SavePlan() {
    setPlanSyncInprogress(true);
    if (!is_plan_synced) await sync_plan(plan_id);
    setPlanSyncInprogress(false);
    FireNotification({
      title: "Success",
      desc: "All changes saved successfully!",
      variant: "success",
      active: true,
      dismissal: "true",
      time_based: true,
      duration: 6000,
      buttons: [],
    });
  }

  const PANEL_STAGES_LABELS: Record<string, string> = {
    fdp_list: "Money Manager",
    view_fdp: selected_fdp ? selected_fdp.strategy || "Strategy" : "Strategy",
    add_fdp: "Add Strategy",
    edit_fdp: "Edit Strategy",
  };
  const breadcrumb_data = stack.map((s) => PANEL_STAGES_LABELS[s] || s);

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col justify-between gap-4 md:min-h-[570px] md:w-[99vw]">
      {/* Breadcrumb Navigation Bar */}
      <div className="flex items-center gap-2 rounded-2xl border border-dark-200 bg-white px-4 py-2.5 shadow-xs">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark-100 text-dark-600 hover:bg-dark-200 transition-colors"
          onClick={() => SetState(stage, "back")}
        >
          <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
        </button>

        <div className="h-4 w-px bg-dark-200 mx-1" />

        <div className="flex items-center gap-1.5 overflow-hidden text-xs font-bold text-dark-700">
          {breadcrumb_data.map((btext: string, index: number) => (
            <div key={index} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-dark-300">/</span>}
              <span className={index === breadcrumb_data.length - 1 ? "text-primary-600" : "text-dark-500"}>
                {btext}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-dark-100 text-dark-600 hover:bg-dark-200 transition-colors"
          onClick={() => router.back()}
        >
          <FontAwesomeIcon icon={faXmark} className="text-xs" />
        </button>
      </div>

      <div className="mb-10 flex h-full flex-col-reverse gap-4 md:mb-0 md:mt-0 md:flex-row">
        {/* Strategy list column */}
        {show_fdp_list && (
          <div className="flex w-full snap-y flex-col gap-3 md:h-[580px] md:w-1/3 md:shrink-0">
            <div className="flex flex-col gap-3 overflow-y-auto pr-1">
              {fdp_list.map((entity: any) => (
                <FDPCard
                  key={entity._id}
                  plan={plan}
                  fdp={entity}
                  dimmed={stage !== "fdp_list"}
                  selected={selected_fdp_id === entity._id}
                  onClick={() => SetState(stage, "view", entity._id)}
                >
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-dark-100 text-dark-500 hover:bg-dark-200 hover:text-dark-800 transition-colors"
                  >
                    <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
                  </button>
                </FDPCard>
              ))}

              {/* Add button */}
              <button
                type="button"
                onClick={() => SetState(stage, "add")}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-dark-200 py-3 text-xs font-bold text-dark-600 hover:border-primary-400 hover:bg-primary-50/40 hover:text-primary-600 transition-all"
              >
                <FontAwesomeIcon icon={faPlus} className="text-xs" />
                <span>Add Allocation Strategy</span>
              </button>

              {/* Unsynced notification */}
              {!is_plan_synced && (
                <div className="flex flex-col gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 text-amber-600" />
                    <span className="font-medium text-amber-800">
                      Changes are not synced automatically. You can review the simulation or save them now.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-800 shadow-2xs hover:bg-amber-50"
                    >
                      <span>View impact</span>
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[10px]" />
                    </button>
                    <button
                      type="button"
                      onClick={SavePlan}
                      disabled={plan_sync_inprogress}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {plan_sync_inprogress ? (
                        <FontAwesomeIcon icon={faArrowsRotate} className="animate-spin text-xs" />
                      ) : (
                        <FontAwesomeIcon icon={faCloudArrowUp} className="text-xs" />
                      )}
                      <span>Save changes</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selected strategy preview */}
        {show_fdp_meta && selected_fdp && (
          <div className={`w-full flex-col gap-2 md:w-[460px] ${show_command ? "hidden md:flex" : "flex"}`}>
            <FDPCard plan={plan} fdp={selected_fdp} selected>
              <button
                type="button"
                disabled={stage !== "view_fdp"}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 transition-colors"
                onClick={() => SetState(stage, "edit", selected_fdp._id)}
              >
                <FontAwesomeIcon icon={faPen} className="text-xs" />
              </button>
            </FDPCard>
          </div>
        )}

        {/* Green divider arrow */}
        {show_command && (
          <div className="hidden md:flex md:items-center md:justify-center md:px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
              <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
            </div>
          </div>
        )}

        {/* Command column */}
        {show_command && (
          <div className="flex h-full w-full flex-col md:h-[580px] md:w-[460px] md:min-w-0">
            <FDPCommand
              plan={plan}
              fdp={mode === "edit" ? selected_fdp : undefined}
              mode={mode}
              onDone={(r) => {
                if (r.action === "deleted") SetState(stage, "deleted");
                if (r.action === "added") SetState(stage, "back");
              }}
            />
          </div>
        )}

        {/* Chart column */}
        <div className={`flex h-full flex-col gap-3 transition-all duration-300 md:ml-auto md:shrink-0 ${show_command ? "md:w-1/3" : "md:w-2/3"}`}>
          <div className="flex flex-col rounded-2xl border border-dark-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-dark-100 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FontAwesomeIcon icon={faChartLine} className="text-xs" />
                </div>
                <span className="text-xs font-bold text-dark-800">Allocation Horizon Projection</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold">
                <span className="flex items-center gap-1 text-blue-600">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Emergency
                </span>
                <span className="flex items-center gap-1 text-amber-600">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Savings
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Investment
                </span>
              </div>
            </div>

            <div className="h-[320px] w-full md:h-[360px]">
              <MyChart
                labels={fdp_chart_data.labels}
                dataset={fdp_chart_data.datasets}
                chart_type="bar"
                stacked
                height={360}
                formatter={(val: any) => `${val}%`}
                annotation={annotation}
              />
            </div>
          </div>

          {/* Timeframe & Month navigator */}
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-dark-200 bg-white p-2.5 shadow-xs">
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 rounded-lg bg-dark-100 px-2 py-1 text-xs font-bold text-dark-700">
                <span>{fdp_chart_data.labels[current_hover_month - 1] || "Month 1"}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-dark-100 text-dark-600 hover:bg-dark-200 disabled:opacity-30"
                  disabled={current_hover_month === 1}
                  onClick={() => setCurrentHoverMonth((m) => m - 1)}
                >
                  <FontAwesomeIcon icon={faChevronLeft} className="text-[10px]" />
                </button>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-dark-100 text-dark-600 hover:bg-dark-200 disabled:opacity-30"
                  disabled={current_hover_month === duration}
                  onClick={() => setCurrentHoverMonth((m) => m + 1)}
                >
                  <FontAwesomeIcon icon={faChevronRight} className="text-[10px]" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {duration_view_list.map(({ text, value }) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                    duration === value
                      ? "bg-primary-50 text-primary-700 border border-primary-300"
                      : "text-dark-500 hover:bg-dark-100"
                  }`}
                  onClick={() => {
                    setDuration(value);
                    if (current_hover_month > value) setCurrentHoverMonth(1);
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

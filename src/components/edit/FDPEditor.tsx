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
import { faArrowLeft, faXmark, faPlus, faArrowUpRightFromSquare, faCloudArrowUp, faPen, faChevronRight, faChevronLeft, faMoneyCheckDollar, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { faLightbulb, faFileLines } from "@fortawesome/free-regular-svg-icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function GetMMYYYY(month: number, plan_timestamp?: string | number) {
  const start = new Date(plan_timestamp || Date.now());
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** Port of fund_distribution_percentage/FDPCard.vue */
function FDPCard({ plan, fdp, children, dimmed }: { plan: any; fdp: any; children?: React.ReactNode; dimmed?: boolean }) {
  const start_date = GetMMYYYY(fdp.start_month, plan?.timestamp);
  const end_date = GetMMYYYY(fdp.end_month, plan?.timestamp);
  return (
    <div className={`flex w-full flex-col rounded-lg border bg-white p-2 shadow-sm hover:shadow-md md:max-w-[450px] md:min-w-[440px] ${dimmed ? "opacity-50" : ""}`}>
      <div className="flex justify-between">
        <div className="mt-1 flex flex-col justify-between">
          <p className="w-full truncate text-[12px] font-medium text-dark-600 first-letter:uppercase sm:text-base md:w-[15rem]">
            {fdp.strategy}
          </p>
          <div className="flex w-fit gap-1 rounded-md py-1 text-[9px] uppercase text-dark-200 sm:text-[10px] md:text-xs">
            <div className="font-bold">{start_date}</div>
            {start_date !== end_date && (
              <div className="flex gap-1">
                <span> to </span>
                <div className="font-bold">{end_date}</div>
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <div className="flex w-fit content-center self-center rounded-md text-lg">
            <div className="ml-1 self-end py-1 text-xs text-slate-400">E: {fdp.e}%</div>
            <div className="ml-1 self-end py-1 text-xs text-slate-400">S: {fdp.s}%</div>
            <div className="ml-1 self-end py-1 text-xs text-slate-400">I: {fdp.i}%</div>
            <span className="flex w-[2em] justify-center self-center text-dark-300">{children}</span>
          </div>
        </div>
      </div>
      <div className="flex"></div>
    </div>
  );
}

/** Port of fund_distribution_percentage/FundDistributionPercentageCommand.vue */
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

  const distribution_valid = (() => {
    const sum = state.e + state.s + state.i;
    return {
      msg: "Sum of Emergency, Savings and Investment should be 100",
      valid: sum === 100,
    };
  })();

  async function SaveChanges() {
    const fdp_obj: any = {
      _id: mode === "add" ? GetRandomString(6) : fdp?._id,
      start_month: state.start_month,
      end_month: state.end_month,
      e: state.e,
      s: state.s,
      i: state.i,
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
    "relative border-[1.6px] rounded-[.5rem] px-3 py-2 w-full shadow-sm placeholder-dark-500 text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-300 focus:shadow-primary-500 bg-dark-50 flex justify-between transition-all duration-200 text-[1.25rem] appearance-none";

  return (
    <div className="w-full rounded-lg">
      <div className="mb-2 flex flex-col gap-2 rounded-lg p-2">
        <div className="flex gap-3 font-medium text-dark-600">
          <div className="flex gap-3 self-center">
            <FontAwesomeIcon icon={faMoneyCheckDollar} className="self-center text-2xl" />
            <span className="self-center"> Cashflow Allocation Percentage</span>
          </div>
          {mode === "edit" && (
            <div className="ml-auto flex px-2 py-1 text-danger-500" onClick={DeleteFdp}>
              {state.deleting ? (
                <svg className="-ml-1 h-[20px] w-[20px] animate-spin self-center text-dark-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <FontAwesomeIcon icon={faTrashCan} className="self-center" />
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mb-3 flex w-full flex-col gap-3">
        <div>
          <span className="text-sm text-dark-300">Savings </span>
          <input type="number" value={state.s} onChange={(e) => setState((s: any) => ({ ...s, s: Number(e.target.value) }))} required style={{ fontSize: "1.25rem" }} className={inputClass} />
        </div>
        <div>
          <span className="text-sm text-dark-300">Emergency</span>
          <input type="number" value={state.e} onChange={(e) => setState((s: any) => ({ ...s, e: Number(e.target.value) }))} required style={{ fontSize: "1.25rem" }} className={inputClass} />
        </div>
        <div>
          <span className="text-sm text-dark-300">Investment</span>
          <input type="number" value={state.i} onChange={(e) => setState((s: any) => ({ ...s, i: Number(e.target.value) }))} required style={{ fontSize: "1.25rem" }} className={inputClass} />
        </div>
      </div>

      <div className="mt-3 flex w-full gap-3">
        <div className="w-[50%]">
          <span className="text-sm text-dark-300">Start Month</span>
          <div className="relative mt-1">
            <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
              <FontAwesomeIcon icon={faFileLines} className="self-center text-sm text-dark-400" />
            </div>
            <MonthPicker
              plan_timestamp={plan.timestamp}
              duration={plan?.duration || 600}
              month={state.start_month}
              onChange={(m) => setState((s: any) => ({ ...s, start_month: m }))}
            />
          </div>
        </div>
        <div className="w-[50%]">
          <span className="text-sm text-dark-300">End Month</span>
          <div className="relative mt-1">
            <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
              <FontAwesomeIcon icon={faFileLines} className="self-center text-sm text-dark-400" />
            </div>
            <MonthPicker
              plan_timestamp={plan.timestamp}
              duration={plan?.duration || 600}
              month={state.end_month}
              min_month={state.start_month}
              onChange={(m) => setState((s: any) => ({ ...s, end_month: m }))}
            />
          </div>
        </div>
      </div>
      {!distribution_valid.valid && (
        <div className="mt-3 flex">
          <div className="p-2 text-red-500">{distribution_valid.msg}</div>
        </div>
      )}
      <div className="mt-3 flex">
        <div className="w-full">
          <Button variant="primary" sub_variant="solid" className="w-full px-4 py-2" size="md" onClick={SaveChanges}>
            {state.loading ? (
              <svg className="-ml-1 mr-3 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <FontAwesomeIcon icon={faFileLines} className="self-center text-xl" />
            )}
            <div className="self-center">{mode === "add" ? "Add" : "Update"}</div>
          </Button>
        </div>
      </div>
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
    // The original derives strategy ranges from the engine's FDP_month_map
    // (plan.fund_distribution_percentage is empty in the DB — see FDPEditor.vue fdp_list computed)
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
        // strategy changed
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

  // chart: FDP month map percentages (stacked e/s/i)
  const fdp_chart_data = useMemo(() => {
    const labels: string[] = [];
    const datasets: any[] = [];
    if (!plan || !snapshot) return { labels, datasets };
    const fdp_month_map = snapshot.account_balances_and_transactions?.FDP_month_map || {};
    const cats: Array<[string, string, number]> = [
      ["e", "EMERGENCY", 3],
      ["s", "SAVINGS", 2],
      ["i", "INVESTMENT", 1],
    ];
    for (const [key, label, order] of cats) {
      const data: number[] = [];
      for (let month = 1; month <= Math.min(duration, 600); month++) {
        const fdp = fdp_month_map[month];
        data.push(fdp ? fdp[key] : 0);
      }
      datasets.push({
        data,
        label,
        backgroundColor:
          typeof document !== "undefined"
            ? getComputedStyle(document.body).getPropertyValue(key === "e" ? "--color-dark-300" : key === "s" ? "--color-accent-600" : "--color-primary-400")
            : "",
        borderColor:
          typeof document !== "undefined"
            ? getComputedStyle(document.body).getPropertyValue(key === "e" ? "--color-dark-300" : key === "s" ? "--color-accent-600" : "--color-primary-400")
            : "",
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
      desc: " All changes saved successfully!",
      variant: "success",
      active: true,
      dismissal: "true",
      time_based: true,
      duration: 6000,
      buttons: [],
    });
  }

  const PANEL_STAGES_LABELS: Record<string, string> = {
    fdp_list: "Allocation Strategies ",
    view_fdp: selected_fdp ? selected_fdp.strategy : "",
    add_fdp: "Add ",
    edit_fdp: "Edit",
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
    <div className="flex w-full flex-col justify-between gap-3 md:min-h-[570px] md:w-[99vw]">
      {/* breadcrumb bar */}
      <div className="fixed bottom-0 z-20 flex w-full gap-2 border-b-2 border-t-2 bg-dark-50 p-1 pb-2 pt-2 md:relative md:z-0 md:mt-0 md:border-t-0 md:bg-transparent md:pb-2 md:pt-0">
        <div className="flex w-fit cursor-pointer gap-2 px-3 py-1 text-primary-600" onClick={() => SetState(stage, "back")}>
          <FontAwesomeIcon className="self-center text-xl font-bold" icon={faArrowLeft} />
        </div>
        {breadcrumb_data.map((btext: string, index: number) => (
          <div
            key={index}
            className="self-center font-medium text-dark-400 first-letter:uppercase after:ml-2 after:font-medium after:text-dark-200 after:content-['/'] last:after:content-[''] text-[9px] sm:text-xs md:text-xl"
          >
            {btext.substring(0, 20)} {btext?.length > 20 ? "..." : ""}
          </div>
        ))}
        <div className="ml-auto flex w-fit cursor-pointer gap-2 px-3 py-1 text-dark-600" onClick={() => router.back()}>
          <FontAwesomeIcon className="self-center text-xl font-bold" icon={faXmark} />
        </div>
      </div>

      <div className="mb-10 flex h-full flex-col-reverse gap-3 md:mb-0 md:mt-0 md:flex-row md:gap-0">
        {/* fdp list */}
        {show_fdp_list && (
          <div className="flex w-full snap-y flex-col md:h-[580px] md:w-1/3 md:shrink-0">
            <div className="overflow-x-hidden overflow-y-scroll px-0 md:pl-2">
              {fdp_list.map((entity: any) => (
                <div key={entity._id} className="mb-3 snap-start rounded-md capitalize shadow-sm transition-all duration-200">
                  <FDPCard plan={plan} fdp={entity} dimmed={stage !== "fdp_list"}>
                    <div className="self-center" onClick={() => SetState(stage, "view", entity._id)}>
                      <FontAwesomeIcon
                        className={`self-center ${stage !== "fdp_list" ? "text-dark-200 opacity-25" : ""}`}
                        icon={faChevronRight}
                      />
                    </div>
                  </FDPCard>
                </div>
              ))}
              {fdp_list.length <= 5 && (
                <div className="mt-auto flex justify-center rounded-b-md py-3 md:max-w-[450px] md:min-w-[440px]">
                  <Button variant="neutral" sub_variant="outline" size="lg" className="w-full px-3 py-1 text-success-400 hover:border-success-400" onClick={() => SetState(stage, "add")}>
                    <FontAwesomeIcon className="self-center" icon={faPlus} />
                    Add
                  </Button>
                </div>
              )}
              <hr className="md:max-w-[450px] md:min-w-[440px]" />
              {fdp_list.length <= 5 && !is_plan_synced && (
                <div className="mt-auto flex flex-col justify-between gap-3 rounded-b-md py-3 md:max-w-[450px] md:min-w-[440px]">
                  <div className="flex justify-between">
                    <span className="flex rounded-md bg-dark-100 p-2 text-dark-500">
                      <div className="mr-2">
                        <FontAwesomeIcon icon={faLightbulb} />
                      </div>
                      <span className="text-xs text-dark-300">
                        Changes are not synced automatically, you can either save them directly or view its impact on you Fi-Plan and save it later.
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="neutral" sub_variant="outline" size="lg" className="flex w-fit gap-2 px-3 py-1 text-success-400 hover:border-success-400" onClick={() => router.back()}>
                      View changes
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="self-center" />
                    </Button>
                    <Button variant="primary" sub_variant="solid" size="lg" className="flex w-fit gap-2 px-3 py-1 text-success-400 hover:border-success-400" onClick={SavePlan}>
                      Save changes
                      {plan_sync_inprogress ? (
                        <svg className="h-5 w-5 animate-spin self-center text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <FontAwesomeIcon icon={faCloudArrowUp} className={`self-center font-bold md:text-lg ${!is_plan_synced ? "animate-pulse" : ""}`} />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* selected fdp meta */}
        {show_fdp_meta && selected_fdp && (
          <div className={`w-full flex-col gap-2 rounded-md border-dashed md:w-[470px] md:px-2 ${show_command ? "hidden md:flex" : "flex"}`}>
            <FDPCard plan={plan} fdp={selected_fdp}>
              <button
                disabled={stage !== "view_fdp"}
                className="ml-auto self-center pl-3 text-dark-300 disabled:opacity-0"
                onClick={() => SetState(stage, "edit", selected_fdp._id)}
              >
                <FontAwesomeIcon icon={faPen} className="self-center text-sm" />
              </button>
            </FDPCard>
            <div></div>
          </div>
        )}

        {/* divider */}
        {show_command && (
          <div className="mx-4 hidden md:flex md:shrink-0">
            <FontAwesomeIcon className="mt-5 self-center text-3xl text-primary-300" icon={faChevronRight} />
          </div>
        )}

        {/* command column */}
        {show_command && (
          <div className="flex h-full w-full flex-col md:h-[580px] md:w-[470px] md:min-w-0">
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

        {/* chart column */}
        <div className={`flex h-full flex-col gap-3 transition-all duration-300 md:ml-auto md:pl-3 md:shrink-0 ${show_command ? "md:w-1/3" : "md:w-2/3"}`}>
          <div className="flex flex-col justify-end rounded-xl border-2 bg-dark-800 pb-3 sm:h-[380px] md:h-[420px]">
            <div className="h-full w-full px-1 opacity-70 md:h-[400px]">
              <MyChart
                labels={fdp_chart_data.labels}
                dataset={fdp_chart_data.datasets}
                chart_type="bar"
                stacked
                height={400}
                formatter={(val: any) => `${val}%`}
                annotation={annotation}
              />
            </div>
          </div>
          <div className="flex justify-end rounded-0 pb-2">
            <div className="mr-auto flex flex-col gap-1 md:flex-row">
              <div className="w-[4rem] self-center rounded-md text-xs font-bold text-primary-500 sm:text-[14px] md:w-[5.8rem] md:text-lg">
                {fdp_chart_data.labels[current_hover_month - 1]}
              </div>
              <div className="flex md:rotate-0">
                <div className="flex">
                  <button
                    className="h-[1.5rem] w-[1.5rem] self-center rounded-md bg-primary-300 p-1 text-[10px] text-primary-50 transition-color duration-200 hover:bg-dark-100 disabled:opacity-50 sm:w-[2rem] sm:text-xs md:h-[25px] md:w-[25px] md:bg-transparent md:text-dark-300"
                    disabled={current_hover_month === 1}
                    onClick={() => setCurrentHoverMonth((m) => m - 1)}
                  >
                    <FontAwesomeIcon className="self-center" icon={faChevronLeft} />
                  </button>
                </div>
                <div className="flex">
                  <button
                    className="ml-1 h-[1.5rem] w-[1.5rem] self-center rounded-md bg-primary-300 p-1 text-[10px] text-primary-50 transition-color duration-200 hover:bg-dark-100 disabled:opacity-50 sm:w-[2rem] sm:text-xs md:ml-0 md:h-[25px] md:w-[25px] md:bg-transparent md:text-dark-300"
                    disabled={current_hover_month === duration}
                    onClick={() => setCurrentHoverMonth((m) => m + 1)}
                  >
                    <FontAwesomeIcon className="self-center" icon={faChevronRight} />
                  </button>
                </div>
              </div>
            </div>
            {duration_view_list.map(({ text, value }) => (
              <div
                key={value}
                className={`flex w-[5rem] justify-center rounded-lg p-1 text-center text-[10px] font-medium sm:text-xs md:w-[5em] md:p-2 ${
                  duration === value ? "bg-primary-100 text-primary-400 border-primary-300" : "border-dark-100 text-dark-300"
                }`}
                onClick={() => {
                  setDuration(value);
                  if (current_hover_month > value) setCurrentHoverMonth(1);
                }}
              >
                <span className="w-fit self-center">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

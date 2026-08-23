"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { MonthPicker } from "@/components/edit/MonthPicker";
import { GetRandomString } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faXmark, faChevronRight, faVault, faPiggyBank, faCoins, faChartLine, faGlobe, faChartPie, faHouseChimney, faLandmark, faFileShield, faFileInvoiceDollar, faTrashCan, faPlus } from "@fortawesome/free-solid-svg-icons";
import { faFileLines } from "@fortawesome/free-regular-svg-icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthToLabel(month: number, plan_timestamp?: string | number) {
  const start = new Date(plan_timestamp || Date.now());
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

const CLASS_META: Record<string, { label: string; icon: any; growth: number; yield_rate: number; compounding: string; income_frequency: string; income_mode: string; maturity_years?: number }> = {
  fd: { label: "Fixed Deposit", icon: faVault, growth: 0, yield_rate: 6.75, compounding: "quarterly", income_frequency: "q", income_mode: "reinvest", maturity_years: 3 },
  bond: { label: "Bond", icon: faFileInvoiceDollar, growth: 1, yield_rate: 7.5, compounding: "yearly", income_frequency: "y", income_mode: "credit", maturity_years: 5 },
  savings: { label: "Savings Account", icon: faPiggyBank, growth: 0, yield_rate: 3.5, compounding: "monthly", income_frequency: "m", income_mode: "credit" },
  gold: { label: "Gold / SGB", icon: faCoins, growth: 8.5, yield_rate: 2.5, compounding: "none", income_frequency: "y", income_mode: "credit" },
  ppf: { label: "PPF", icon: faFileShield, growth: 0, yield_rate: 7.1, compounding: "yearly", income_frequency: "y", income_mode: "reinvest", maturity_years: 15 },
  equity: { label: "Equity (India)", icon: faChartLine, growth: 12, yield_rate: 1.5, compounding: "none", income_frequency: "y", income_mode: "credit" },
  equity_foreign: { label: "Equity (Foreign)", icon: faGlobe, growth: 12, yield_rate: 1.5, compounding: "none", income_frequency: "y", income_mode: "credit" },
  mf: { label: "Mutual Fund", icon: faChartPie, growth: 12, yield_rate: 0, compounding: "none", income_frequency: "y", income_mode: "credit" },
  real_estate: { label: "Real Estate", icon: faHouseChimney, growth: 8, yield_rate: 2.75, compounding: "none", income_frequency: "m", income_mode: "credit" },
  vda: { label: "Crypto / VDA", icon: faCoins, growth: 20, yield_rate: 0, compounding: "none", income_frequency: "m", income_mode: "credit" },
};

function AssetCard({ plan, asset, children }: { plan: any; asset: any; children?: React.ReactNode }) {
  const meta = CLASS_META[asset.asset_class] || CLASS_META.fd;
  return (
    <div className="flex flex-col rounded-lg border border-l-2 border-l-primary-300 bg-dark-50 p-2 text-dark-200 shadow-sm hover:shadow-md">
      <div className="flex justify-between">
        <div className="mt-1 flex flex-col justify-between">
          <p className="w-full truncate text-[12px] text-dark-200 first-letter:uppercase sm:text-base md:w-[15rem]">{asset.title}</p>
          <DisplayAmount className="w-fit font-medium sm:text-xl" notation="standard" amount={asset.principal} />
          <div className="flex w-fit gap-2 rounded-md py-1 text-[9px] uppercase text-dark-100 sm:text-xs">
            <span className="rounded-md bg-dark-100 px-1.5 py-0.5">{meta.label}</span>
            {asset.maturity_month && (
              <span className="rounded-md bg-warning-100 px-1.5 py-0.5 text-warning-500">
                mat {monthToLabel(asset.maturity_month, plan?.timestamp)}
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto text-right text-[10px] text-dark-500 sm:text-xs">
          <div className="flex items-center gap-1 self-center rounded-md">
            <FontAwesomeIcon icon={meta.icon} className="text-base text-primary-400" />
            <div className="self-center text-xs lowercase">
              +{asset.growth_rate || 0}% <span className="uppercase">grow</span>
            </div>
          </div>
          {asset.yield_rate > 0 && (
            <div className="self-center text-xs lowercase text-success-400">
              {asset.yield_rate}% <span className="uppercase">yield</span>
            </div>
          )}
          <span className={`flex w-[2em] justify-center self-center text-lg ${asset.asset_class === "gold" || asset.asset_class === "real_estate" ? "text-warning-300" : "text-primary-300"}`}>
            {children}
          </span>
        </div>
      </div>
    </div>
  );
}

function AssetCommand({
  plan,
  asset,
  mode,
  onDone,
}: {
  plan: any;
  asset?: any;
  mode: "add" | "edit";
  onDone: (result: { action: string; asset_id?: string }) => void;
}) {
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);
  const [state, setState] = useState<any>(() => initialState("fd"));

  useEffect(() => {
    if (asset) {
      setState({
        ...initialState(asset.asset_class),
        ...asset,
        _id: asset._id,
      });
    } else {
      setState(initialState("fd"));
    }
  }, [asset]);

  function initialState(asset_class: string) {
    const meta = CLASS_META[asset_class] || CLASS_META.fd;
    return {
      title: meta.label,
      asset_class,
      category: "i",
      principal: 100000,
      purchase_month: 1,
      growth_rate: meta.growth,
      yield_rate: meta.yield_rate,
      income_frequency: meta.income_frequency,
      income_mode: meta.income_mode,
      compounding: meta.compounding,
      maturity_month: meta.maturity_years ? meta.maturity_years * 12 : undefined,
      active: true,
      loading: false,
      deleting: false,
    };
  }

  function pickClass(asset_class: string) {
    setState({ ...initialState(asset_class), category: state.category, principal: state.principal, purchase_month: state.purchase_month });
  }

  async function SaveChanges() {
    const asset_obj: any = {
      _id: mode === "add" ? GetRandomString(6) : asset?._id,
      title: state.title,
      asset_class: state.asset_class,
      category: state.category,
      principal: state.principal,
      purchase_month: state.purchase_month,
      growth_rate: state.growth_rate,
      yield_rate: state.yield_rate,
      income_frequency: state.income_frequency,
      income_mode: state.income_mode,
      compounding: state.compounding,
      maturity_month: state.maturity_month,
      active: state.active ?? true,
    };
    setState((s: any) => ({ ...s, loading: true }));
    const asset_list = [...(plan.asset_list || [])];
    if (mode === "add") asset_list.push(asset_obj);
    else {
      const idx = asset_list.findIndex((a: any) => a._id === asset_obj._id);
      if (idx >= 0) asset_list[idx] = asset_obj;
    }
    update_plan_local({ ...plan, asset_list });
    setState((s: any) => ({ ...s, loading: false }));
    onDone({ action: "edited", asset_id: asset_obj._id });
  }

  async function DeleteAsset() {
    setState((s: any) => ({ ...s, deleting: true }));
    const asset_list = (plan.asset_list || []).filter((a: any) => a._id !== asset?._id);
    update_plan_local({ ...plan, asset_list });
    setState((s: any) => ({ ...s, deleting: false }));
    onDone({ action: "deleted" });
  }

  const inputClass =
    "relative border-[1.6px] rounded-[.5rem] px-3 py-[.25rem] w-full shadow-sm placeholder-dark-500 text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-300 focus:shadow-primary-500 bg-dark-50 flex justify-between transition-all duration-200 text-[1.25rem] appearance-none";
  const labelClass = "text-sm text-dark-300";

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg">
      <div className="flex gap-3">
        <FontAwesomeIcon icon={CLASS_META[state.asset_class]?.icon || faLandmark} className="self-center text-2xl text-primary-500" />
        <span className="self-center">Configure {state.title}</span>
      </div>

      <div className="mb-2 flex w-full flex-col gap-2">
        <span className={labelClass}>Asset Class</span>
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(CLASS_META).map((key) => (
            <button
              key={key}
              type="button"
              className={`rounded-md px-2 py-1 text-[10px] sm:text-xs ${state.asset_class === key ? "bg-primary-400 text-white" : "bg-dark-100 text-dark-300 hover:bg-primary-100"}`}
              onClick={() => pickClass(key)}
            >
              {CLASS_META[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex w-full flex-col gap-1">
        <span className={labelClass}>Title</span>
        <input type="text" value={state.title} onChange={(e) => setState((s: any) => ({ ...s, title: e.target.value }))} required className={inputClass} />
      </div>

      <div className="mb-3 flex w-full flex-col gap-2">
        <div className="flex w-full gap-3">
          <div className="w-full">
            <span className={labelClass}>Principal (₹)</span>
            <input type="number" value={state.principal} onChange={(e) => setState((s: any) => ({ ...s, principal: Number(e.target.value) }))} required className={inputClass} />
          </div>
          <div className="w-full">
            <span className={labelClass}>Purchase Date</span>
            <MonthPicker
              plan_timestamp={plan.timestamp}
              duration={plan?.duration || 600}
              month={state.purchase_month || 1}
              onChange={(m) => setState((s: any) => ({ ...s, purchase_month: m }))}
            />
          </div>
        </div>
        <div className="flex w-full gap-3">
          <div className="w-full">
            <span className={labelClass}>Growth %/yr</span>
            <input type="number" min={0} value={state.growth_rate} onChange={(e) => setState((s: any) => ({ ...s, growth_rate: Number(e.target.value) }))} required className={inputClass} />
          </div>
          <div className="w-full">
            <span className={labelClass}>Yield %/yr</span>
            <input type="number" min={0} value={state.yield_rate} onChange={(e) => setState((s: any) => ({ ...s, yield_rate: Number(e.target.value) }))} required className={inputClass} />
          </div>
        </div>
        <div className="flex w-full gap-3">
          <div className="w-full">
            <span className={labelClass}>Income Frequency</span>
            <select value={state.income_frequency} onChange={(e) => setState((s: any) => ({ ...s, income_frequency: e.target.value }))} className={inputClass}>
              <option value="m">Monthly</option>
              <option value="q">Quarterly</option>
              <option value="h">Half-yearly</option>
              <option value="y">Yearly</option>
            </select>
          </div>
          <div className="w-full">
            <span className={labelClass}>Income Mode</span>
            <select value={state.income_mode} onChange={(e) => setState((s: any) => ({ ...s, income_mode: e.target.value }))} className={inputClass}>
              <option value="credit">Credit to bucket</option>
              <option value="reinvest">Reinvest</option>
            </select>
          </div>
        </div>
        <div className="flex w-full gap-3">
          <div className="w-full">
            <span className={labelClass}>Maturity Date (FD/Bond)</span>
            {state.maturity_month ? (
              <MonthPicker
                plan_timestamp={plan.timestamp}
                duration={plan?.duration || 600}
                month={state.maturity_month}
                min_month={state.purchase_month || 1}
                onChange={(m) => setState((s: any) => ({ ...s, maturity_month: m }))}
              />
            ) : (
              <Button variant="neutral" sub_variant="outline" size="md" className="w-full px-3 py-1" onClick={() => setState((s: any) => ({ ...s, maturity_month: (s.purchase_month || 1) + 36 }))}>
                Set maturity date
              </Button>
            )}
            {state.maturity_month && (
              <div className="flex w-fit cursor-pointer px-1 py-0.5 text-[10px] text-danger-400" onClick={() => setState((s: any) => ({ ...s, maturity_month: undefined }))}>
                Clear (no maturity)
              </div>
            )}
          </div>
          <div className="w-full">
            <span className={labelClass}>Bucket</span>
            <select value={state.category} onChange={(e) => setState((s: any) => ({ ...s, category: e.target.value }))} className={inputClass}>
              <option value="i">Investment</option>
              <option value="s">Savings</option>
              <option value="e">Emergency</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mt-3 flex w-full gap-3">
        <div className="w-full">
          <Button variant="primary" sub_variant="solid" className="w-full p-2" onClick={SaveChanges}>
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
        {mode === "edit" && (
          <div className="flex items-center px-2 text-danger-500" onClick={DeleteAsset}>
            <FontAwesomeIcon icon={faTrashCan} className="self-center" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Asset list + per-class command form — the AssetEditor (Money Manager for holdings). */
export function AssetEditor({ plan_id }: { plan_id: string }) {
  const router = useRouter();
  const plans = useFiPlanStore((s) => s.plans);
  const plan = plans.find((p) => p._id === plan_id);

  const [stack, setStack] = useState<string[]>(["asset_list"]);
  const [stage, setStage] = useState("asset_list");
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [selected_id, setSelectedId] = useState("");
  const [importing, setImporting] = useState(false);
  const [import_msg, setImportMsg] = useState("");

  const asset_list = useMemo(() => {
    if (!plan) return [];
    return [...(plan.asset_list || [])].sort((a: any, b: any) => (a.purchase_month || 1) - (b.purchase_month || 1));
  }, [plan]);

  const selected_asset = asset_list.find((a: any) => a._id === selected_id);

  function SetState(current_state: string, action: string, asset_id = "") {
    if (current_state === "asset_list" && action === "back") router.back();
    if (current_state === "asset_list" && action === "add") {
      setMode("add");
      setSelectedId("");
      setStage("add_asset");
      setStack((s) => [...s, "add_asset"]);
    }
    if (current_state === "asset_list" && action === "view") {
      setMode("edit");
      setSelectedId(asset_id);
      setStage("edit_asset");
      setStack((s) => [...s, "edit_asset"]);
    }
    if (current_state === "edit_asset" && action === "back") {
      setStage("asset_list");
      setSelectedId("");
      setStack((s) => s.slice(0, -1));
    }
    if (current_state === "add_asset" && action === "back") {
      setStage("asset_list");
      setStack((s) => s.slice(0, -1));
    }
    if (current_state === "edit_asset" && action === "deleted") {
      setStage("asset_list");
      setSelectedId("");
      setStack(["asset_list"]);
    }
  }

  const PANEL_STAGES_LABELS: Record<string, string> = {
    asset_list: "Asset List",
    add_asset: "Add Asset",
    edit_asset: "Edit Asset",
  };
  const breadcrumb_data = stack.map((s) => PANEL_STAGES_LABELS[s] || s);

  async function ImportFromNetWorth() {
    setImporting(true);
    setImportMsg("");
    try {
      const res = await fetch("/api/plan/import_networth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan_id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setImportMsg(json?.error?.message || "import failed");
      } else {
        const { added, skipped } = json.data || {};
        const labels = added.map((a: any) => a.asset_class).join(", ");
        setImportMsg(added.length > 0 ? `Imported: ${labels}${skipped.length ? ` (skipped existing: ${skipped.join(", ")})` : ""}` : "No new asset classes to import");
      }
    } catch (e: any) {
      setImportMsg(e?.message || "import failed");
    }
    setImporting(false);
  }

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  const show_asset_list = ["asset_list", "add_asset", "edit_asset"].includes(stage);
  const show_asset_command = ["add_asset", "edit_asset"].includes(stage);

  return (
    <div className="flex w-full flex-col justify-between gap-3 md:min-h-[570px]">
      {/* breadcrumb bar */}
      <div className="fixed bottom-0 z-20 flex w-full gap-2 border-b-2 border-t-2 bg-dark-50 p-1 pb-2 pt-2 md:relative md:z-0 md:mt-0 md:border-t-0 md:bg-transparent md:pb-2 md:pt-0">
        <div className="flex w-fit cursor-pointer gap-2 px-3 py-1 text-primary-600" onClick={() => SetState(stage, "back")}>
          <FontAwesomeIcon className="self-center text-xl font-bold" icon={faArrowLeft} />
        </div>
        {breadcrumb_data.map((btext: string, index: number) => (
          <div
            key={index}
            className="self-center font-medium text-dark-400 first-letter:uppercase after:ml-2 after:font-medium after:text-dark-200 after:content-['/'] last:after:content-[''] text-base md:text-xl"
          >
            {btext}
          </div>
        ))}
        <div className="ml-auto flex w-fit cursor-pointer gap-2 px-3 py-1 text-dark-600" onClick={() => router.back()}>
          <FontAwesomeIcon className="self-center text-xl font-bold" icon={faXmark} />
        </div>
      </div>

      <div className={`flex h-full gap-6 md:mt-0 md:flex-row md:gap-0 ${stage === "asset_list" ? "flex-col" : "flex-col-reverse"}`}>
        {/* asset list */}
        {show_asset_list && (
          <div className={`flex-col snap-y md:h-[580px] md:w-1/3 md:shrink-0 ${stage !== "asset_list" ? "hidden md:flex" : "flex"}`}>
            <div className="overflow-y-scroll pl-2 pr-1">
              <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-dark-100 p-2">
                <span className="text-[11px] text-dark-300">Import your holdings from Net Worth (IndMoney)</span>
                <Button variant="neutral" sub_variant="outline" size="md" className="px-2 py-0.5 text-[11px]" onClick={ImportFromNetWorth} disabled={importing}>
                  {importing ? "…" : "Import"}
                </Button>
              </div>
              {import_msg && <div className="mb-2 rounded-md bg-warning-100 p-2 text-[11px] text-dark-400">{import_msg}</div>}
              {asset_list.map((asset: any) => (
                <div key={asset._id} className="mb-3 snap-start rounded-md capitalize shadow-sm transition-all duration-200">
                  <AssetCard plan={plan} asset={asset}>
                    <div className="ml-auto self-center px-3 text-dark-300" onClick={() => SetState(stage, "view", asset._id)}>
                      <FontAwesomeIcon icon={faChevronRight} className="self-center" />
                    </div>
                  </AssetCard>
                </div>
              ))}
              <div className="mt-auto flex justify-center rounded-b-md py-3">
                <Button variant="neutral" sub_variant="outline" size="lg" className="w-full px-3 py-1 text-success-400 hover:border-success-400" onClick={() => SetState(stage, "add")}>
                  <FontAwesomeIcon className="self-center" icon={faPlus} />
                  Add Asset
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* command column */}
        {show_asset_command && (
          <div className="mb-12 flex h-full w-full flex-col md:mb-0 md:h-[580px] md:w-[440px] md:min-w-0">
            <AssetCommand
              plan={plan}
              asset={mode === "edit" ? selected_asset : undefined}
              mode={mode}
              onDone={(r) => {
                if (r.action === "deleted") SetState(stage, "deleted");
                if (r.action === "edited") SetState(stage, "back");
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

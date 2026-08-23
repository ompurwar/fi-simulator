"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { MonthPicker } from "@/components/edit/MonthPicker";
import { GetRandomString } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faXmark,
  faChevronRight,
  faVault,
  faPiggyBank,
  faCoins,
  faChartLine,
  faGlobe,
  faChartPie,
  faHouseChimney,
  faLandmark,
  faFileShield,
  faFileInvoiceDollar,
  faTrashCan,
  faPlus,
  faArrowRotateRight,
  faCheck,
  faArrowsRotate,
  faBuildingColumns,
} from "@fortawesome/free-solid-svg-icons";
import { faFileLines } from "@fortawesome/free-regular-svg-icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthToLabel(month: number, plan_timestamp?: string | number) {
  const start = new Date(plan_timestamp || Date.now());
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

const CLASS_META: Record<
  string,
  {
    label: string;
    icon: any;
    growth: number;
    yield_rate: number;
    volatility: number;
    compounding: string;
    income_frequency: string;
    income_mode: string;
    maturity_years?: number;
  }
> = {
  fd: { label: "Fixed Deposit", icon: faVault, growth: 0, yield_rate: 6.75, volatility: 0, compounding: "quarterly", income_frequency: "q", income_mode: "reinvest", maturity_years: 3 },
  bond: { label: "Bond", icon: faFileInvoiceDollar, growth: 1, yield_rate: 7.5, volatility: 4, compounding: "yearly", income_frequency: "y", income_mode: "credit", maturity_years: 5 },
  savings: { label: "Savings Account", icon: faPiggyBank, growth: 0, yield_rate: 3.5, volatility: 0, compounding: "monthly", income_frequency: "m", income_mode: "credit" },
  gold: { label: "Gold / SGB", icon: faCoins, growth: 8.5, yield_rate: 2.5, volatility: 14, compounding: "none", income_frequency: "y", income_mode: "credit" },
  ppf: { label: "PPF", icon: faFileShield, growth: 0, yield_rate: 7.1, volatility: 0, compounding: "yearly", income_frequency: "y", income_mode: "reinvest", maturity_years: 15 },
  equity: { label: "Equity (India)", icon: faChartLine, growth: 12, yield_rate: 1.5, volatility: 18, compounding: "none", income_frequency: "y", income_mode: "credit" },
  equity_foreign: { label: "Equity (Foreign)", icon: faGlobe, growth: 12, yield_rate: 1.5, volatility: 20, compounding: "none", income_frequency: "y", income_mode: "credit" },
  mf: { label: "Mutual Fund", icon: faChartPie, growth: 12, yield_rate: 0, volatility: 16, compounding: "none", income_frequency: "y", income_mode: "credit" },
  real_estate: { label: "Real Estate", icon: faHouseChimney, growth: 8, yield_rate: 2.75, volatility: 6, compounding: "none", income_frequency: "m", income_mode: "credit" },
  vda: { label: "Crypto / VDA", icon: faCoins, growth: 20, yield_rate: 0, volatility: 40, compounding: "none", income_frequency: "m", income_mode: "credit" },
};

/** Lucid Asset Card styled identically to LoanCard */
function AssetCard({
  plan,
  asset,
  selected = false,
  onClick,
  children,
}: {
  plan: any;
  asset: any;
  selected?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const meta = CLASS_META[asset.asset_class] || CLASS_META.fd;
  const sold = !!asset.sale_month;

  return (
    <div
      onClick={onClick}
      className={`flex flex-col rounded-xl border bg-white p-3 text-dark-700 shadow-xs transition-all duration-200 hover:shadow-md ${
        selected
          ? "border-primary-400 border-l-4 border-l-primary-500 ring-2 ring-primary-400/20"
          : "border-dark-200 border-l-4 border-l-primary-400"
      } ${sold ? "opacity-60" : ""} ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <FontAwesomeIcon icon={meta.icon} className="text-xs" />
            </div>
            <p className="truncate text-sm font-bold text-dark-800 first-letter:uppercase sm:text-base">
              {asset.title}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-dark-500 sm:text-sm font-medium">
            <span className="rounded-md bg-dark-100/70 px-1.5 py-0.5 text-[11px] font-semibold text-dark-700">
              {meta.label}
            </span>
            <span className="text-dark-300">·</span>
            <DisplayAmount className="self-center font-bold text-dark-800" amount={asset.principal} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-dark-500 sm:text-xs">
            <span className="text-dark-400">from</span>
            <span className="font-bold text-dark-700">{monthToLabel(asset.purchase_month || 1, plan?.timestamp)}</span>
            {sold && (
              <span className="rounded bg-danger-50 px-1.5 py-0.2 text-danger-600 lowercase font-bold">
                (sold {monthToLabel(asset.sale_month, plan?.timestamp)})
              </span>
            )}
            {!sold && asset.maturity_month && (
              <span className="rounded bg-warning-50 px-1.5 py-0.2 text-warning-700 lowercase font-bold">
                (mat {monthToLabel(asset.maturity_month, plan?.timestamp)})
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 rounded-lg bg-primary-50/70 px-2 py-0.5 text-[11px] font-bold text-primary-700">
              <span>+{asset.growth_rate || 0}%</span>
              <span className="text-[9px] font-normal uppercase text-primary-600">grow</span>
            </div>
            {asset.yield_rate > 0 && (
              <div className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <span>{asset.yield_rate}%</span>
                <span className="text-[9px] font-normal uppercase text-emerald-600">yield</span>
              </div>
            )}
          </div>

          {children && (
            <div className="mt-1 flex items-center justify-end text-sm text-dark-400" onClick={(e) => e.stopPropagation()}>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "relative border border-dark-200 rounded-lg px-3 py-2 w-full shadow-xs placeholder-dark-400 text-dark-800 text-left focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 bg-white transition-all duration-200 text-sm appearance-none";
const labelClass = "text-xs font-semibold text-dark-600 uppercase tracking-wider";

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
      volatility: meta.volatility,
      income_frequency: meta.income_frequency,
      income_mode: meta.income_mode,
      compounding: meta.compounding,
      maturity_month: meta.maturity_years ? meta.maturity_years * 12 : undefined,
      active: true,
      loading: false,
      deleting: false,
      rent: undefined,
      sip: undefined,
      sale_month: undefined,
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
      volatility: state.volatility,
      income_frequency: state.income_frequency,
      income_mode: state.income_mode,
      compounding: state.compounding,
      maturity_month: state.maturity_month,
      sale_month: state.sale_month,
      purchase_date: state.purchase_date,
      active: state.active ?? true,
      ...(state.rent?.monthly_rent > 0 ? { rent: { monthly_rent: state.rent.monthly_rent, step_pct: state.rent.step_pct || 0, expense_ratio: state.rent.expense_ratio ?? 20 } } : {}),
      ...(state.sip?.amount > 0
        ? { sip: { amount: state.sip.amount, frequency: state.sip.frequency, start_month: state.sip.start_month || 1, step_pct: state.sip.step_pct || 0 } }
        : {}),
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
    if (!window.confirm("Are you sure you want to delete this asset?")) return;
    setState((s: any) => ({ ...s, deleting: true }));
    const asset_list = (plan.asset_list || []).filter((a: any) => a._id !== asset?._id);
    update_plan_local({ ...plan, asset_list });
    setState((s: any) => ({ ...s, deleting: false }));
    onDone({ action: "deleted" });
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Card 1: Asset Classification & Identity */}
      <div className="flex flex-col gap-3.5 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-2.5 border-b border-dark-100 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <FontAwesomeIcon icon={CLASS_META[state.asset_class]?.icon || faLandmark} className="text-sm" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-dark-800">{mode === "add" ? "Add New Asset" : `Configure ${state.title}`}</h3>
            <p className="text-xs text-dark-400">Select asset class and set general properties</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Asset Class</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(CLASS_META).map((key) => {
              const active = state.asset_class === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? "bg-primary-500 text-white shadow-xs"
                      : "bg-dark-50 text-dark-600 border border-dark-200 hover:bg-dark-100"
                  }`}
                  onClick={() => pickClass(key)}
                >
                  <FontAwesomeIcon icon={CLASS_META[key].icon} className="text-xs opacity-80" />
                  <span>{CLASS_META[key].label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>Asset Title</span>
          <input
            type="text"
            value={state.title}
            onChange={(e) => setState((s: any) => ({ ...s, title: e.target.value }))}
            placeholder="e.g. HDFC Bluechip Fund"
            required
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Principal Amount (₹)</span>
            <input
              type="number"
              min={0}
              value={state.principal}
              onChange={(e) => setState((s: any) => ({ ...s, principal: Number(e.target.value) }))}
              required
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Purchase Date</span>
            <MonthPicker
              plan_timestamp={plan.timestamp}
              duration={plan?.duration || 600}
              month={state.purchase_month || 1}
              onChange={(m) => setState((s: any) => ({ ...s, purchase_month: m }))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>Target Allocation Bucket</span>
          <select
            value={state.category}
            onChange={(e) => setState((s: any) => ({ ...s, category: e.target.value }))}
            className={inputClass}
          >
            <option value="i">Investment Bucket (Growth / Retirement)</option>
            <option value="s">Savings Bucket (Short-term Goals / Medium)</option>
            <option value="e">Emergency Bucket (Liquid Safety Net)</option>
          </select>
        </div>
      </div>

      {/* Card 2: Growth & Income Yield */}
      <div className="flex flex-col gap-3.5 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs">
        <div className="border-b border-dark-100 pb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-dark-700">Growth & Cashflow Returns</h4>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Growth %/yr</span>
            <input
              type="number"
              step="0.1"
              min={0}
              value={state.growth_rate}
              onChange={(e) => setState((s: any) => ({ ...s, growth_rate: Number(e.target.value) }))}
              required
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Yield %/yr</span>
            <input
              type="number"
              step="0.1"
              min={0}
              value={state.yield_rate}
              onChange={(e) => setState((s: any) => ({ ...s, yield_rate: Number(e.target.value) }))}
              required
              className={inputClass}
            />
          </div>
          {!["fd", "savings", "ppf"].includes(state.asset_class) && (
            <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <span className={labelClass}>Volatility %</span>
              <input
                type="number"
                step="0.1"
                min={0}
                value={state.volatility ?? 0}
                onChange={(e) => setState((s: any) => ({ ...s, volatility: Number(e.target.value) }))}
                required
                className={inputClass}
              />
            </div>
          )}
        </div>

        {state.asset_class === "gold" && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <input
              type="checkbox"
              id="sgb_toggle"
              className="h-4 w-4 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
              checked={state.yield_rate > 0}
              onChange={(e) =>
                setState((s: any) => ({
                  ...s,
                  yield_rate: e.target.checked ? 2.5 : 0,
                  income_frequency: e.target.checked ? "y" : s.income_frequency,
                }))
              }
            />
            <label htmlFor="sgb_toggle" className="text-xs font-medium text-dark-700 cursor-pointer">
              Sovereign Gold Bond (SGB)? <span className="text-dark-500 font-normal">(Sets 2.5% p.a. regular interest yield)</span>
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Income Frequency</span>
            <select
              value={state.income_frequency}
              onChange={(e) => setState((s: any) => ({ ...s, income_frequency: e.target.value }))}
              className={inputClass}
            >
              <option value="m">Monthly</option>
              <option value="q">Quarterly</option>
              <option value="h">Half-yearly</option>
              <option value="y">Yearly</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Income Mode</span>
            <select
              value={state.income_mode}
              onChange={(e) => setState((s: any) => ({ ...s, income_mode: e.target.value }))}
              className={inputClass}
            >
              <option value="credit">Pay out to account balance</option>
              <option value="reinvest">Reinvest (Compound)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Card 3: Real Estate / Rental Settings (Conditional) */}
      {state.asset_class === "real_estate" && (
        <div className="flex flex-col gap-3.5 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs">
          <div className="border-b border-dark-100 pb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-dark-700">Real Estate & Rental Configuration</h4>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50/40 p-3">
            <input
              type="checkbox"
              id="indexation_gate"
              className="h-4 w-4 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
              checked={state.purchase_date ? state.purchase_date < "2024-07-23" : false}
              onChange={(e) =>
                setState((s: any) => ({
                  ...s,
                  purchase_date: e.target.checked ? "2024-07-22" : undefined,
                }))
              }
            />
            <label htmlFor="indexation_gate" className="text-xs font-medium text-dark-700 cursor-pointer">
              Purchased before Jul 2024? <span className="text-dark-500 font-normal">(Grandfathered 20% Indexation tax rule)</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Monthly Rent (₹)</span>
              <input
                type="number"
                min={0}
                value={state.rent?.monthly_rent || ""}
                onChange={(e) => setState((s: any) => ({ ...s, rent: { ...(s.rent || {}), monthly_rent: Number(e.target.value) } }))}
                placeholder="e.g. 25000"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Rent Step %/yr</span>
              <input
                type="number"
                min={0}
                value={state.rent?.step_pct || 0}
                onChange={(e) => setState((s: any) => ({ ...s, rent: { ...(s.rent || {}), step_pct: Number(e.target.value) } }))}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Expense Ratio %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={state.rent?.expense_ratio ?? 20}
                onChange={(e) => setState((s: any) => ({ ...s, rent: { ...(s.rent || {}), expense_ratio: Number(e.target.value) } }))}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      )}

      {/* Card 4: Recurring SIP Investments */}
      <div className="flex flex-col gap-3 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-dark-100 pb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-dark-700">Recurring Investment (SIP)</h4>
          {state.sip?.amount > 0 && (
            <button
              type="button"
              className="text-xs font-bold text-danger-500 hover:text-danger-700 transition-colors"
              onClick={() => setState((s: any) => ({ ...s, sip: undefined }))}
            >
              Remove SIP
            </button>
          )}
        </div>

        {state.sip?.amount > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className={labelClass}>SIP Amount (₹/period)</span>
                <input
                  type="number"
                  min={0}
                  value={state.sip.amount}
                  onChange={(e) => setState((s: any) => ({ ...s, sip: { ...s.sip, amount: Number(e.target.value) } }))}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className={labelClass}>Frequency</span>
                <select
                  value={state.sip.frequency}
                  onChange={(e) => setState((s: any) => ({ ...s, sip: { ...s.sip, frequency: e.target.value } }))}
                  className={inputClass}
                >
                  <option value="m">Monthly</option>
                  <option value="q">Quarterly</option>
                  <option value="y">Yearly</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className={labelClass}>Start Month</span>
                <MonthPicker
                  plan_timestamp={plan.timestamp}
                  duration={plan?.duration || 600}
                  month={state.sip.start_month || 1}
                  min_month={state.purchase_month || 1}
                  onChange={(m) => setState((s: any) => ({ ...s, sip: { ...s.sip, start_month: m } }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className={labelClass}>Annual Step-up %</span>
                <input
                  type="number"
                  min={0}
                  value={state.sip.step_pct || 0}
                  onChange={(e) => setState((s: any) => ({ ...s, sip: { ...s.sip, step_pct: Number(e.target.value) } }))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        ) : (
          <Button
            variant="neutral"
            sub_variant="outline"
            size="md"
            className="w-full justify-center gap-2 py-2 text-xs font-semibold text-primary-600 hover:bg-primary-50"
            onClick={() =>
              setState((s: any) => ({
                ...s,
                sip: { amount: 10000, frequency: "m", start_month: s.purchase_month || 1, step_pct: 0 },
              }))
            }
          >
            <FontAwesomeIcon icon={faPlus} />
            <span>Enable Recurring SIP</span>
          </Button>
        )}
      </div>

      {/* Card 5: Maturity & Sale Planning */}
      <div className="flex flex-col gap-3 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs">
        <div className="border-b border-dark-100 pb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-dark-700">Maturity & Exit Planning</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Maturity Date (FD/Bond/PPF)</span>
            {state.maturity_month ? (
              <div className="flex flex-col gap-1">
                <MonthPicker
                  plan_timestamp={plan.timestamp}
                  duration={plan?.duration || 600}
                  month={state.maturity_month}
                  min_month={state.purchase_month || 1}
                  onChange={(m) => setState((s: any) => ({ ...s, maturity_month: m }))}
                />
                <button
                  type="button"
                  className="self-start text-[11px] font-semibold text-danger-500 hover:underline"
                  onClick={() => setState((s: any) => ({ ...s, maturity_month: undefined }))}
                >
                  Clear (no maturity)
                </button>
              </div>
            ) : (
              <Button
                variant="neutral"
                sub_variant="outline"
                size="md"
                className="w-full text-xs font-medium"
                onClick={() => setState((s: any) => ({ ...s, maturity_month: (s.purchase_month || 1) + 36 }))}
              >
                Set maturity date
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className={labelClass}>Sell Asset On (Optional Exit)</span>
            {state.sale_month ? (
              <div className="flex flex-col gap-1">
                <MonthPicker
                  plan_timestamp={plan.timestamp}
                  duration={plan?.duration || 600}
                  month={state.sale_month}
                  min_month={state.purchase_month || 1}
                  onChange={(m) => setState((s: any) => ({ ...s, sale_month: m }))}
                />
                <button
                  type="button"
                  className="self-start text-[11px] font-semibold text-danger-500 hover:underline"
                  onClick={() => setState((s: any) => ({ ...s, sale_month: undefined }))}
                >
                  Clear sale date
                </button>
              </div>
            ) : (
              <Button
                variant="neutral"
                sub_variant="outline"
                size="md"
                className="w-full text-xs font-medium"
                onClick={() => setState((s: any) => ({ ...s, sale_month: (s.purchase_month || 1) + 36 }))}
              >
                Set sale date
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="primary"
          sub_variant="solid"
          size="lg"
          className="flex-1 justify-center gap-2 py-2.5 font-bold shadow-xs"
          onClick={SaveChanges}
        >
          {state.loading ? (
            <FontAwesomeIcon icon={faArrowsRotate} className="animate-spin text-sm" />
          ) : (
            <FontAwesomeIcon icon={faCheck} className="text-sm" />
          )}
          <span>{mode === "add" ? "Add Asset to Plan" : "Save Changes"}</span>
        </Button>

        {mode === "edit" && (
          <Button
            variant="danger"
            sub_variant="outline"
            size="lg"
            className="px-4 py-2.5 font-bold text-danger-600 hover:bg-danger-50"
            onClick={DeleteAsset}
            title="Delete Asset"
          >
            <FontAwesomeIcon icon={faTrashCan} />
          </Button>
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
      setStage("add_asset");
      setMode("add");
      setSelectedId("");
      setStack((s) => [...s, "add_asset"]);
    }
    if (current_state === "asset_list" && action === "view") {
      setStage("edit_asset");
      setMode("edit");
      setSelectedId(asset_id);
      setStack((s) => [...s, "edit_asset"]);
    }
    if ((current_state === "add_asset" || current_state === "edit_asset") && action === "back") {
      setStage("asset_list");
      setSelectedId("");
      setStack(["asset_list"]);
    }
    if (action === "deleted") {
      setStage("asset_list");
      setSelectedId("");
      setStack(["asset_list"]);
    }
  }

  const PANEL_STAGES_LABELS: Record<string, string> = {
    asset_list: "Asset List",
    add_asset: "Add Asset",
    edit_asset: selected_asset ? selected_asset.title : "Edit Asset",
  };
  const breadcrumb_data = stack.map((s) => PANEL_STAGES_LABELS[s] || s);

  async function ImportFromNetWorth(mode: "refresh" | "rebuild") {
    setImporting(true);
    setImportMsg("");
    try {
      const res = await fetch("/api/plan/import_networth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan_id, mode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setImportMsg(json?.error?.message || "import failed");
      } else {
        const { added, skipped, refreshed } = json.data || {};
        const msg = [];
        if (added?.length) msg.push(`Added: ${added.length}`);
        if (refreshed?.length) msg.push(`Refreshed: ${refreshed.length}`);
        if (skipped?.length) msg.push(`Skipped: ${skipped.length}`);
        setImportMsg(msg.length > 0 ? msg.join(" | ") : "No classes to import");
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

  const show_asset_list = stage === "asset_list" || stage === "edit_asset" || stage === "add_asset";
  const show_asset_command = stage === "add_asset" || stage === "edit_asset";

  return (
    <div className="flex w-full flex-col justify-between gap-3 md:min-h-[570px] md:w-[99vw]">
      {/* Breadcrumb Bar (Styled identically to LoanEditor) */}
      <div className="fixed bottom-0 z-20 flex w-full items-center gap-2 border-b border-t bg-white px-3 py-2 shadow-xs md:relative md:z-0 md:mt-0 md:border-b md:border-t-0 md:bg-transparent md:px-0 md:py-1 md:shadow-none">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50"
          onClick={() => SetState(stage, "back")}
          title="Back"
        >
          <FontAwesomeIcon className="text-base font-bold" icon={faArrowLeft} />
        </button>
        <div className="h-5 w-[2px] rounded-full bg-primary-400" />
        <div className="flex items-center gap-1 overflow-hidden">
          {breadcrumb_data.map((btext: string, index: number) => (
            <div key={index} className="flex items-center">
              <span className="truncate max-w-[150px] text-xs font-semibold text-dark-600 first-letter:uppercase sm:max-w-[220px] sm:text-sm md:text-lg">
                {btext}
              </span>
              {index < breadcrumb_data.length - 1 && (
                <span className="mx-1.5 font-medium text-dark-300 text-xs sm:text-sm md:text-base">/</span>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-dark-500 transition-colors hover:bg-dark-100 hover:text-dark-800"
          onClick={() => router.back()}
          title="Close"
        >
          <FontAwesomeIcon className="text-lg font-bold" icon={faXmark} />
        </button>
      </div>

      <div className="mb-16 flex h-full flex-col gap-4 md:mb-0 md:mt-0 md:flex-row md:gap-6">
        {/* Left Column: Asset List */}
        {show_asset_list && (
          <div
            className={`flex w-full flex-col md:w-[380px] lg:w-[420px] md:shrink-0 ${
              stage !== "asset_list" ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="flex flex-col gap-3 overflow-x-hidden overflow-y-auto px-0 md:pl-2 md:pr-2 max-h-[calc(100vh-140px)] md:max-h-[640px]">
              {/* IndMoney Net-Worth Sync Card */}
              <div className="flex flex-col gap-2 rounded-xl border border-primary-200/80 bg-primary-50/30 p-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-dark-700">
                    <FontAwesomeIcon icon={faBuildingColumns} className="text-primary-600" />
                    <span>Net Worth Import (IndMoney)</span>
                  </div>
                  {importing && <FontAwesomeIcon icon={faArrowRotateRight} className="animate-spin text-xs text-primary-600" />}
                </div>
                <p className="text-[11px] text-dark-500 leading-tight">
                  Import or sync current holdings directly from your connected portfolio.
                </p>
                <div className="flex w-full gap-2 mt-1">
                  <Button
                    variant="neutral"
                    sub_variant="outline"
                    size="sm"
                    className="flex-1 justify-center gap-1.5 py-1 text-xs font-semibold text-dark-700 hover:border-primary-400 hover:bg-primary-50"
                    onClick={() => ImportFromNetWorth("refresh")}
                    disabled={importing}
                  >
                    <span>Refresh</span>
                  </Button>
                  <Button
                    variant="neutral"
                    sub_variant="outline"
                    size="sm"
                    className="flex-1 justify-center gap-1.5 py-1 text-xs font-semibold text-primary-700 hover:border-primary-500 hover:bg-primary-50"
                    onClick={() => ImportFromNetWorth("rebuild")}
                    disabled={importing}
                  >
                    <span>Rebuild</span>
                  </Button>
                </div>
                {import_msg && (
                  <div className="rounded-lg bg-amber-100/70 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                    {import_msg}
                  </div>
                )}
              </div>

              {/* Empty state */}
              {asset_list.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-dark-300 bg-white p-6 text-center shadow-2xs">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dark-100 text-dark-400 mb-2">
                    <FontAwesomeIcon icon={faVault} className="text-xl" />
                  </div>
                  <h4 className="text-sm font-bold text-dark-700">No Assets Added</h4>
                  <p className="mt-1 text-xs text-dark-400 max-w-[240px]">
                    Add your first asset manually or import from your connected Net Worth.
                  </p>
                </div>
              )}

              {/* Asset Cards List */}
              {asset_list.map((asset: any) => (
                <AssetCard
                  key={asset._id}
                  plan={plan}
                  asset={asset}
                  selected={selected_id === asset._id}
                  onClick={() => SetState(stage, "view", asset._id)}
                >
                  <button
                    type="button"
                    className="p-1 text-dark-400 hover:text-primary-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      SetState(stage, "view", asset._id);
                    }}
                    title="View Details"
                  >
                    <FontAwesomeIcon
                      className={selected_id === asset._id ? "text-primary-500" : "text-dark-400"}
                      icon={faChevronRight}
                    />
                  </button>
                </AssetCard>
              ))}

              {/* Add Asset Button */}
              <div className="pt-1 pb-4">
                <Button
                  variant="neutral"
                  sub_variant="outline"
                  size="lg"
                  className="w-full justify-center gap-2 py-2 font-semibold text-success-600 hover:border-success-500 hover:bg-success-50/50"
                  onClick={() => SetState(stage, "add")}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span>Add an asset</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Right Column: Asset Form Command */}
        {show_asset_command && (
          <div className="flex w-full flex-1 max-w-2xl flex-col overflow-y-auto px-1 md:px-0 max-h-[calc(100vh-140px)] md:max-h-[640px] pb-12">
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

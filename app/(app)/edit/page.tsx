"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { MonthPicker } from "@/components/edit/MonthPicker";
import { MyChart } from "@/components/ui/MyChart";
import { Tab } from "@headlessui/react";
import { api } from "@/lib/api";
import { FireNotification } from "@/store/notifications";
import { GetRandomString } from "@/lib/utils";
import { GetCurrencySymbol } from "@/lib/country";
import { FDPEditor } from "@/components/edit/FDPEditor";
import { LoanEditor } from "@/components/edit/LoanEditor";
import { AccountEditor } from "@/components/edit/AccountEditor";
import { AssetEditor } from "@/components/edit/AssetEditor";
import { TaxManager } from "@/components/edit/TaxManager";
import { WithdrawalOrderEditor } from "@/components/edit/WithdrawalOrderEditor";
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
  faShuffle,
  faArrowTrendUp,
  faArrowTrendDown,
  faMoneyCheckDollar,
  faTrashCan,
  faArrowsRotate,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { faLightbulb, faFileLines } from "@fortawesome/free-regular-svg-icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function GetMonthAndYear(plan: any, month: number) {
  if (!plan?.timestamp) return "";
  const start = new Date(plan.timestamp);
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function GetMMYYYYNameFromMM(month: number, plan_timestamp?: string | number) {
  const start = new Date(plan_timestamp || Date.now());
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function FrequencyToInterval(frequency: string | null) {
  switch (frequency) {
    case "m":
      return "Monthly";
    case "q":
      return "Quarterly";
    case "h":
      return "Half Yearly";
    case "y":
      return "Yearly";
    case null:
      return "Once";
    default:
      return "";
  }
}

/** Lucid Cashflow Card styled identically to LoanCard & AssetCard */
function CashflowCard({
  plan,
  cashflow,
  children,
  dimmed,
  selected = false,
  onClick,
}: {
  plan: any;
  cashflow: any;
  children?: React.ReactNode;
  dimmed?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const is_income = cashflow.category === "i";
  const start_date = GetMonthAndYear(plan, cashflow.start_month);
  const end_date = cashflow.type === "p" ? GetMonthAndYear(plan, cashflow.end_month) : "";

  return (
    <div
      onClick={onClick}
      className={`flex flex-col rounded-xl border bg-white p-3 text-dark-700 shadow-xs transition-all duration-200 hover:shadow-md ${
        selected
          ? is_income
            ? "border-primary-400 border-l-4 border-l-primary-500 ring-2 ring-primary-400/20"
            : "border-danger-400 border-l-4 border-l-danger-500 ring-2 ring-danger-400/20"
          : is_income
          ? "border-dark-200 border-l-4 border-l-primary-400"
          : "border-dark-200 border-l-4 border-l-danger-400"
      } ${dimmed ? "opacity-60" : ""} ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                is_income ? "bg-primary-50 text-primary-600" : "bg-danger-50 text-danger-600"
              }`}
            >
              <FontAwesomeIcon icon={faMoneyCheckDollar} className="text-xs" />
            </div>
            <p className="truncate text-sm font-bold text-dark-800 first-letter:uppercase sm:text-base">
              {cashflow.desc}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-dark-500 sm:text-sm font-medium">
            <span className="rounded-md bg-dark-100/70 px-1.5 py-0.5 text-[11px] font-semibold text-dark-700">
              {FrequencyToInterval(cashflow.frequency)}
            </span>
            <span className="text-dark-300">·</span>
            <DisplayAmount className="self-center font-bold text-dark-800" amount={cashflow.amount} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-dark-500 sm:text-xs">
            <span className="text-dark-400">from</span>
            <span className="font-bold text-dark-700">{start_date}</span>
            {end_date && (
              <>
                <span className="text-dark-400">to</span>
                <span className="font-bold text-dark-700">{end_date}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div
            className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold ${
              is_income ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            <span>{is_income ? "INFLOW" : "OUTFLOW"}</span>
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

/** Port of cashflow/CashflowCommand.vue */
function CashflowCommand({
  plan,
  cashflow,
  category,
  mode,
  onDone,
}: {
  plan: any;
  cashflow?: any;
  category: "i" | "e";
  mode: "add" | "edit";
  onDone: (result: { action: string; cashflow_id?: string }) => void;
}) {
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);
  const storeCurrency = useFiPlanStore((s) => s.currency);
  const common_collection = useFiPlanStore((s) => s.common_collection);
  const currency_symbol = GetCurrencySymbol(storeCurrency || "INR");
  const cashflow_type_options = (common_collection as any)?.cashflow_type || [];
  const cashflow_frequency_options = (common_collection as any)?.cashflow_frequency || [];

  const [state, setState] = useState<any>({
    type: "p",
    frequency: "m",
    amount: 0,
    desc: "salary",
    start_month: 1,
    end_month: 60,
    category: "i",
    loading: false,
    deleting: false,
    active: true,
    primary: false,
  });

  useEffect(() => {
    if (cashflow) {
      setState({
        type: cashflow.type,
        frequency: cashflow.frequency,
        amount: cashflow.amount,
        desc: cashflow.desc,
        start_month: cashflow.start_month,
        end_month: cashflow.end_month,
        category: cashflow.category,
        primary: cashflow.primary,
        active: cashflow.active,
        loading: false,
        deleting: false,
      });
    } else {
      setState((s: any) => ({
        ...s,
        type: "p",
        frequency: "m",
        amount: 0,
        desc: category === "e" ? "Living Expenses" : "Primary Salary",
        start_month: 1,
        end_month: 60,
        category,
        loading: false,
        deleting: false,
        active: true,
        primary: false,
      }));
    }
  }, [cashflow, category]);

  const category_text = state.category === "i" ? "Income" : "Expense";

  function ValidateCashflow(c: any) {
    const error_messages: string[] = [];
    if (!c.desc) error_messages.push("Description is required");
    if (!c.amount) error_messages.push("Amount is required");
    if (!c.type) error_messages.push("Type is required");
    if (!c.category) error_messages.push("Category is required");
    if (!c.frequency && c.start_month !== c.end_month) error_messages.push("Frequency is required");
    if (!c.start_month) error_messages.push("Start month is required");
    return { valid: error_messages.length === 0, error_messages };
  }

  async function SaveChanges() {
    const cashflow_obj: any = {
      _id: mode === "add" ? GetRandomString(6) : cashflow?._id,
      type: state.type,
      frequency: state.frequency,
      amount: state.amount,
      desc: state.desc,
      start_month: state.start_month,
      end_month: state.end_month,
      category: state.category,
      active: state.active,
      primary: state.primary,
    };
    if (state.type === "o") {
      cashflow_obj.frequency = null;
      cashflow_obj.end_month = cashflow_obj.start_month;
    }
    const { valid, error_messages } = ValidateCashflow(cashflow_obj);
    if (!valid) {
      alert(error_messages.join("\n"));
      return;
    }
    setState((s: any) => ({ ...s, loading: true }));
    const cashflow_list = [...(plan.cashflow_list || [])];
    if (mode === "add") {
      cashflow_list.push(cashflow_obj);
    } else {
      const idx = cashflow_list.findIndex((c: any) => c._id === cashflow_obj._id);
      if (idx >= 0) cashflow_list[idx] = cashflow_obj;
    }
    update_plan_local({ ...plan, cashflow_list });
    setState((s: any) => ({ ...s, loading: false }));
    onDone({ action: "added", cashflow_id: cashflow_obj._id });
  }

  async function DeleteCashflow() {
    const result = confirm(
      `Are you sure you want to delete ${state.desc ? `"${state.desc}"` : "this " + category_text} ?`
    );
    if (result !== true) return;
    setState((s: any) => ({ ...s, deleting: true }));
    const cashflow_list = (plan.cashflow_list || []).filter((c: any) => c._id !== cashflow?._id);
    update_plan_local({ ...plan, cashflow_list });
    setState((s: any) => ({ ...s, deleting: false }));
    onDone({ action: "deleted" });
  }

  const is_income = state.category === "i";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-3.5 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-2.5 border-b border-dark-100 pb-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              is_income ? "bg-primary-50 text-primary-600" : "bg-danger-50 text-danger-600"
            }`}
          >
            <FontAwesomeIcon icon={faMoneyCheckDollar} className="text-sm" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-dark-800">
              {mode === "add" ? `Add ${category_text}` : `Configure ${state.desc}`}
            </h3>
            <p className="text-xs text-dark-400">Define {category_text.toLowerCase()} schedule, intervals, and amounts</p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>Description / Label</span>
          <input
            name="Description"
            id="description"
            maxLength={40}
            value={state.desc}
            onChange={(e) => setState((s: any) => ({ ...s, desc: e.target.value }))}
            placeholder="e.g. Base Salary, Rent, Groceries"
            type="text"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>Amount ({currency_symbol})</span>
          <input
            type="number"
            value={state.amount}
            onChange={(e) => setState((s: any) => ({ ...s, amount: Number(e.target.value) }))}
            required
            min={0}
            placeholder="e.g. 150000"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Type</span>
            <div className="flex gap-1.5">
              {(cashflow_type_options as any[]).map((option, index) => {
                const active = state.type === option.value;
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={mode === "edit"}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? "bg-primary-500 text-white shadow-xs"
                        : "bg-dark-50 text-dark-600 border border-dark-200 hover:bg-dark-100 disabled:opacity-50"
                    }`}
                    onClick={() => setState((s: any) => ({ ...s, type: option.value }))}
                  >
                    {option.text}
                  </button>
                );
              })}
            </div>
          </div>

          {state.type === "p" && (
            <div className="flex flex-col gap-1.5">
              <span className={labelClass}>Frequency</span>
              <div className="flex gap-1.5">
                {(cashflow_frequency_options as any[]).map((option, index) => {
                  const active = state.frequency === option.value;
                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={mode === "edit"}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? "bg-primary-500 text-white shadow-xs"
                          : "bg-dark-50 text-dark-600 border border-dark-200 hover:bg-dark-100 disabled:opacity-50"
                      }`}
                      onClick={() => setState((s: any) => ({ ...s, frequency: option.value }))}
                    >
                      {option.text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="flex flex-col gap-1">
            <span className={labelClass}>{state.type === "p" ? "Start Month" : "Event Month"}</span>
            <MonthPicker
              plan_timestamp={plan.timestamp}
              duration={plan?.duration || 600}
              month={state.start_month}
              onChange={(m) => setState((s: any) => ({ ...s, start_month: m }))}
            />
          </div>

          {state.type === "p" && (
            <div className="flex flex-col gap-1">
              <span className={labelClass}>End Month</span>
              <MonthPicker
                plan_timestamp={plan.timestamp}
                duration={plan?.duration || 600}
                month={state.end_month}
                min_month={state.start_month}
                onChange={(m) => setState((s: any) => ({ ...s, end_month: m }))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center gap-3 pt-1">
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
          <span>{mode === "add" ? `Add ${category_text}` : "Save Changes"}</span>
        </Button>

        {mode === "edit" && !state.primary && (
          <Button
            variant="danger"
            sub_variant="outline"
            size="lg"
            className="px-4 py-2.5 font-bold text-danger-600 hover:bg-danger-50"
            onClick={DeleteCashflow}
            title={`Delete ${category_text}`}
          >
            <FontAwesomeIcon icon={faTrashCan} />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Port of cashflow_change/CashflowChangeCard.vue */
function CashflowChangeCard({
  plan,
  cashflow_change,
  children,
  onClick,
}: {
  plan: any;
  cashflow_change: any;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  const start_date = GetMonthAndYear(plan, cashflow_change.start_month);
  const end_date = GetMonthAndYear(plan, cashflow_change.end_month);
  const is_positive = cashflow_change.value > 0;
  const is_income = cashflow_change.category === "i";

  let badge_color = "";
  if (is_income) {
    badge_color = is_positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
  } else {
    badge_color = is_positive ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700";
  }

  return (
    <div
      onClick={onClick}
      className={`flex flex-col rounded-xl border border-dark-200 bg-white p-3 text-dark-700 shadow-xs transition-all duration-200 hover:shadow-md border-l-4 ${
        is_positive ? "border-l-primary-400" : "border-l-amber-400"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${badge_color}`}>
              <FontAwesomeIcon icon={is_positive ? faArrowTrendUp : faArrowTrendDown} className="text-xs" />
            </div>
            <p className="truncate text-xs font-bold text-dark-800 first-letter:uppercase sm:text-sm">
              {cashflow_change.title}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 text-[10px] text-dark-500 sm:text-xs">
            <span className="font-semibold">{start_date}</span>
            <span className="text-dark-300">to</span>
            <span className="font-semibold">{end_date}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${badge_color}`}>
            <span>
              {is_positive ? "+" : ""}
              {cashflow_change.value}
              {cashflow_change.change_type === "p" ? "%" : ""}
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Port of cashflow_change/CashflowChangeCommand.vue */
function CashflowChangeCommand({
  plan,
  cashflow_change,
  cashflow_id,
  mode,
  category,
  onDone,
}: {
  plan: any;
  cashflow_change?: any;
  cashflow_id: string;
  mode: "add" | "edit";
  category: "i" | "e";
  onDone: (result: { action: string }) => void;
}) {
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);
  const storeCurrency = useFiPlanStore((s) => s.currency);
  const common_collection = useFiPlanStore((s) => s.common_collection);
  const currency_symbol = GetCurrencySymbol(storeCurrency || "INR");
  const cashflow_change_type_options = (common_collection as any)?.cashflow_change_type || [];
  const cashflow_change_frequency_options = (common_collection as any)?.cashflow_change_frequency || [];

  const cashflow = (plan?.cashflow_list || []).find((c: any) => c._id === cashflow_id);
  const cashflow_frequency = cashflow?.frequency;

  const change_type = [
    { text: "Step Up (+)", value: 1 },
    { text: "Step Down (-)", value: -1 },
  ];
  const [selected_change_type, setSelectedChangeType] = useState(1);
  const [state, setState] = useState<any>({
    title: "",
    desc: "salary",
    cashflow_id,
    category: "i",
    frequency: "y",
    value: 10,
    start_month: 1,
    end_month: 2,
    change_type: "p",
    active: true,
    loading: false,
    deleting: false,
  });

  const frequency_month_map: Record<string, number> = { m: 0, q: 3, h: 6, y: 12 };
  const validMonths = (start: number, end_month: number, frequency: string | null) => {
    const months: number[] = [];
    let counter = 0;
    for (let m = start; m <= end_month; m++) {
      counter++;
      const freq = frequency_month_map[frequency as string] ?? 0;
      if (freq === 0) {
        months.push(m);
        continue;
      }
      if (counter % freq === 1) months.push(m);
    }
    return months;
  };

  useEffect(() => {
    if (cashflow_change) {
      setState((s: any) => ({
        ...s,
        title: cashflow_change.title,
        desc: cashflow_change.desc,
        cashflow_id: cashflow_change.cashflow_id,
        category: cashflow_change.category,
        frequency: cashflow_change.frequency,
        value: Math.abs(cashflow_change.value),
        start_month: cashflow_change.start_month,
        end_month: cashflow_change.end_month,
        change_type: cashflow_change.change_type,
        active: cashflow_change.active,
        loading: false,
        deleting: false,
      }));
      setSelectedChangeType(cashflow_change.value < 0 ? -1 : 1);
      if (cashflow_change.frequency === "m" && cashflow_change.start_month === cashflow_change.end_month) {
        setState((s: any) => ({ ...s, frequency: "o" }));
      }
    } else {
      setState((s: any) => ({
        ...s,
        title: "",
        desc: "salary",
        cashflow_id,
        category: cashflow?.category || category,
        frequency: cashflow_frequency === "m" ? "y" : cashflow_frequency,
        value: 10,
        change_type: "p",
        active: true,
        loading: false,
        deleting: false,
        start_month: cashflow?.start_month || 1,
        end_month: (cashflow?.start_month || 1) + 1,
      }));
      setSelectedChangeType(1);
    }
  }, [cashflow_change, cashflow_id]);

  const start_from_options = cashflow
    ? validMonths(cashflow.start_month, cashflow.end_month, cashflow_frequency).map((month) => ({
        text: `${GetMMYYYYNameFromMM(month, plan.timestamp)} `,
        value: month,
      }))
    : [];
  const end_from_options = start_from_options.filter((o) => o.value >= state.start_month);
  const end_month_value =
    end_from_options.length && state.end_month < end_from_options[0].value ? end_from_options[0].value : state.end_month;

  async function SaveChanges() {
    const change_obj: any = {
      _id: mode === "add" ? GetRandomString(6) : cashflow_change?._id,
      title: state.title,
      desc: state.desc,
      cashflow_id: state.cashflow_id || cashflow_id,
      category: state.category,
      frequency: state.frequency,
      value: state.value,
      start_month: state.start_month,
      end_month: state.end_month,
      change_type: state.change_type,
      active: state.active,
    };
    if (change_obj.frequency === "o") {
      change_obj.frequency = "m";
      change_obj.end_month = change_obj.start_month;
    }
    change_obj.value = selected_change_type * change_obj.value;

    const error_messages: string[] = [];
    if (!change_obj.title) error_messages.push("Title is required");
    if (!change_obj.category) error_messages.push("Category is required");
    if (!change_obj.frequency) error_messages.push("Frequency is required");
    if (!change_obj.change_type) error_messages.push("Type is required");
    if (!change_obj.start_month) error_messages.push("Start month is required");
    if (error_messages.length) {
      alert(error_messages.join("\n"));
      return;
    }

    setState((s: any) => ({ ...s, loading: true }));
    const change_list = [...(plan.cashflow_change_list || [])];
    if (mode === "add") change_list.push(change_obj);
    else {
      const idx = change_list.findIndex((c: any) => c._id === change_obj._id);
      if (idx >= 0) change_list[idx] = change_obj;
    }
    update_plan_local({ ...plan, cashflow_change_list: change_list });
    setState((s: any) => ({ ...s, loading: false }));
    onDone({ action: "added" });
  }

  async function DeleteChange() {
    const result = confirm(`Are you sure you want to delete "${state.title}" ?`);
    if (result !== true) return;
    setState((s: any) => ({ ...s, deleting: true }));
    const change_list = (plan.cashflow_change_list || []).filter((c: any) => c._id !== cashflow_change?._id);
    update_plan_local({ ...plan, cashflow_change_list: change_list });
    setState((s: any) => ({ ...s, deleting: false }));
    onDone({ action: "deleted" });
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-3.5 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-2.5 border-b border-dark-100 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <FontAwesomeIcon icon={faShuffle} className="text-sm" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-dark-800">
              {mode === "add" ? "Simulate Growth / Variation" : `Edit ${state.title}`}
            </h3>
            <p className="text-xs text-dark-400">Add periodic salary increments, inflation, or lifestyle changes</p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>Event Title</span>
          <input
            type="text"
            value={state.title}
            onChange={(e) => setState((s: any) => ({ ...s, title: e.target.value }))}
            placeholder="e.g. Annual Promotion 15%"
            required
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Direction</span>
            <div className="flex gap-1.5">
              {change_type.map((option, index) => {
                const active = selected_change_type === option.value;
                return (
                  <button
                    key={index}
                    type="button"
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? "bg-primary-500 text-white shadow-xs"
                        : "bg-dark-50 text-dark-600 border border-dark-200 hover:bg-dark-100"
                    }`}
                    onClick={() => setSelectedChangeType(option.value)}
                  >
                    {option.text}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Unit</span>
            <div className="flex gap-1.5">
              {(cashflow_change_type_options as any[]).map((option, index) => {
                const active = state.change_type === option.value;
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={mode === "edit"}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? "bg-primary-500 text-white shadow-xs"
                        : "bg-dark-50 text-dark-600 border border-dark-200 hover:bg-dark-100 disabled:opacity-50"
                    }`}
                    onClick={() => setState((s: any) => ({ ...s, change_type: option.value }))}
                  >
                    {option.value === "f" ? `${currency_symbol} Value` : "% Percentage"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Rate / Value ({state.change_type === "f" ? currency_symbol : "%"})</span>
            <input
              type="number"
              min={0}
              value={state.value}
              onChange={(e) => setState((s: any) => ({ ...s, value: Number(e.target.value) }))}
              required
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className={labelClass}>Frequency</span>
            <select
              value={state.frequency}
              onChange={(e) => setState((s: any) => ({ ...s, frequency: e.target.value }))}
              className={inputClass}
            >
              {(cashflow_change_frequency_options as any[]).map((option, index) => (
                <option key={index} value={option.value}>
                  {option.text}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Start Month</span>
            <select
              className={inputClass}
              value={state.start_month}
              onChange={(e) => setState((s: any) => ({ ...s, start_month: Number(e.target.value) }))}
            >
              {start_from_options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.text}
                </option>
              ))}
            </select>
          </div>

          {state.frequency !== "o" && (
            <div className="flex flex-col gap-1">
              <span className={labelClass}>End Month</span>
              <select
                className={inputClass}
                value={end_month_value}
                onChange={(e) => setState((s: any) => ({ ...s, end_month: Number(e.target.value) }))}
              >
                {end_from_options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.text}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center gap-3 pt-1">
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
          <span>{mode === "add" ? "Add Variation" : "Save Changes"}</span>
        </Button>

        {mode === "edit" && (
          <Button
            variant="danger"
            sub_variant="outline"
            size="lg"
            className="px-4 py-2.5 font-bold text-danger-600 hover:bg-danger-50"
            onClick={DeleteChange}
            title="Delete Variation"
          >
            <FontAwesomeIcon icon={faTrashCan} />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Port of income_and_expense_editor/IncomeAndExpenseEditor.vue */
function IncomeAndExpenseEditor({ plan_id, cashflow_category }: { plan_id: string; cashflow_category: "income" | "expense" }) {
  const router = useRouter();
  const plans = useFiPlanStore((s) => s.plans);
  const plan_synced_map = useFiPlanStore((s) => s.plan_synced_map);
  const sync_plan = useFiPlanStore((s) => s.sync_plan);
  const currency = useFiPlanStore((s) => s.currency);

  const plan = plans.find((p) => p._id === plan_id);
  const cashflow_category_id = cashflow_category === "income" ? "i" : "e";

  const [stack, setStack] = useState<string[]>(["cashflow_list"]);
  const [stage, setStage] = useState("cashflow_list");
  const [selected_cashflow_id, setSelectedCashflowId] = useState("");
  const [selected_cashflow_change_id, setSelectedCashflowChangeId] = useState("");
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [cashflow_change_mode, setCashflowChangeMode] = useState<"add" | "edit">("add");
  const [current_hover_month, setCurrentHoverMonth] = useState(1);
  const [duration, setDuration] = useState(120);
  const [plan_sync_inprogress, setPlanSyncInprogress] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [change_text_counter, setChangeTextCounter] = useState(0);
  const [show_change_text, setShowChangeText] = useState(true);

  // projection statement from the engine snapshot (recomputed on local plan edits)
  useEffect(() => {
    let cancelled = false;
    if (plan) {
      api.PlanSnapshot(plan, Math.max(duration, 120)).then((s) => {
        if (!cancelled) setSnapshot(s);
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [plan, duration]);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowChangeText(false);
      setChangeTextCounter((c) => c + 1);
      setTimeout(() => setShowChangeText(true), 500);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const change_types =
    cashflow_category_id === "i" ? ["hike", "bonus", "salary cut"] : ["inflation", "life style upgrade", "drop in expenses"];
  const change_text = change_types[change_text_counter % change_types.length];

  const cashflow_list = useMemo(() => {
    if (!plan) return [];
    return (plan.cashflow_list || [])
      .filter((c: any) => c.category === cashflow_category_id)
      .sort((a: any, b: any) => a.start_month - b.start_month);
  }, [plan, cashflow_category_id]);

  const selected_cashflow = cashflow_list.find((c: any) => c._id === selected_cashflow_id);
  const cashflow_change_list = (plan?.cashflow_change_list || [])
    .filter((c: any) => c.cashflow_id === selected_cashflow_id && c.category === cashflow_category_id)
    .sort((a: any, b: any) => a.start_month - b.start_month);
  const selected_cashflow_change = cashflow_change_list.find((c: any) => c._id === selected_cashflow_change_id);

  const is_plan_synced = plan_synced_map[plan_id] !== false;
  const show_cashflow_list = stage === "cashflow_list";
  const show_cashflow_meta_dark =
    ["view_cashflow_and_cashflow_change_list", "edit_cashflow", "edit_cashflow_change", "add_cashflow_change"].includes(stage) && !!selected_cashflow;
  const show_cashflow_command = ["add_cashflow", "edit_cashflow"].includes(stage);
  const show_cashflow_change_command = ["edit_cashflow_change", "add_cashflow_change"].includes(stage);
  const show_cashflow_change_list =
    ["view_cashflow_and_cashflow_change_list", "add_cashflow_change", "edit_cashflow_change", "edit_cashflow"].includes(stage) && selected_cashflow?.type !== "o";
  const cashflow_change_possible = selected_cashflow ? !(selected_cashflow.start_month === selected_cashflow.end_month && selected_cashflow.frequency === null) : false;

  // projection chart data from snapshot breakdown
  const balance_chart_data = useMemo(() => {
    const datasets: any[] = [];
    const labels: string[] = [];
    if (!plan || !snapshot) return { labels, datasets };
    const statement = snapshot.income_expense_and_net_cashflow || [];
    const breakdown_field = cashflow_category_id === "i" ? "income_breakdown" : "expense_breakdown";
    let list = cashflow_list;
    if (selected_cashflow_id) list = list.filter((c: any) => c._id === selected_cashflow_id);

    const projection_map: Record<string, any> = {};
    for (const c of list) {
      projection_map[c._id] = {
        data: [] as (number | null)[],
        label: (c.desc || "").toLocaleUpperCase(),
        backgroundColor:
          typeof document !== "undefined"
            ? getComputedStyle(document.body).getPropertyValue(cashflow_category_id === "i" ? "--color-primary-300" : "--color-danger-300")
            : "",
        borderColor:
          typeof document !== "undefined"
            ? getComputedStyle(document.body).getPropertyValue(cashflow_category_id === "i" ? "--color-primary-300" : "--color-danger-300")
            : "",
        pointStyle: "circle",
        pointRadius: 0,
        pointHoverRadius: 5,
        borderRadius: { topLeft: 3, topRight: 3 },
        type: c.frequency === "m" ? "line" : "bar",
      };
    }
    const months_count = Math.min(duration, statement.length);
    for (let month = 1; month <= months_count; month++) {
      const statement_object = statement[month - 1];
      if (!statement_object) continue;
      labels.push(GetMMYYYYNameFromMM(month, plan.timestamp));
      // snapshot shape: { month, net_cashflow, income: { income_breakdown }, expense: { expense_breakdown } }
      const breakdown_list = statement_object[cashflow_category_id === "i" ? "income" : "expense"]?.[breakdown_field] || [];
      for (const cashflow_id of Object.keys(projection_map)) {
        const found = breakdown_list.find((b: any) => b.id === cashflow_id);
        projection_map[cashflow_id].data.push(found ? found.amount : null);
      }
    }
    for (const cashflow_id of Object.keys(projection_map)) datasets.push(projection_map[cashflow_id]);
    return { labels, datasets };
  }, [plan, snapshot, cashflow_category_id, cashflow_list, selected_cashflow_id, duration]);

  const cashflow_for_current_month = useMemo(() => {
    if (!snapshot) return [];
    const statement = snapshot.income_expense_and_net_cashflow || [];
    const breakdown_field = cashflow_category_id === "i" ? "income_breakdown" : "expense_breakdown";
    const month_obj = statement[current_hover_month - 1];
    if (!month_obj) return [];
    // snapshot shape: { month, net_cashflow, income: { income_breakdown }, expense: { expense_breakdown } }
    let breakdown = month_obj[cashflow_category_id === "i" ? "income" : "expense"]?.[breakdown_field] || [];
    if (selected_cashflow_id) breakdown = breakdown.filter((b: any) => b.id === selected_cashflow_id);
    return breakdown;
  }, [snapshot, cashflow_category_id, current_hover_month, selected_cashflow_id]);

  const total_cashflow_for_current_month = cashflow_for_current_month.reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
  const total_cashflow_change_for_current_month = cashflow_for_current_month.reduce((sum: number, c: any) => sum + (c.change || 0), 0);

  const money_local =
    (typeof window !== "undefined" && window.navigator?.language) || useFiPlanStore.getState().local || "en-IN";
  const ToDisplayableMoney = (value: any) =>
    Intl.NumberFormat(money_local, {
      style: "currency",
      notation: value < 100000 ? "standard" : "compact",
      currency: currency || "INR",
      maximumSignificantDigits: 3,
    }).format(value);

  const annotation = balance_chart_data.labels.length
    ? [
        {
          value: balance_chart_data.labels[current_hover_month - 1],
          content: [`Total: ${ToDisplayableMoney(total_cashflow_for_current_month)}`],
        },
      ]
    : [];

  const PANEL_STAGES_LABELS: Record<string, string> = {
    cashflow_list: `${cashflow_category} list `,
    view_cashflow_and_cashflow_change_list: selected_cashflow ? selected_cashflow.desc : "",
    add_cashflow: `Add `,
    edit_cashflow: `Edit`,
    edit_cashflow_change: `Edit - ${selected_cashflow_change ? selected_cashflow_change.title : ""}`,
    add_cashflow_change: `Add a Change`,
  };
  const breadcrumb_data = stack.map((s) => PANEL_STAGES_LABELS[s] || s);

  const duration_view_list = [
    { text: "1 yr", value: 12 },
    { text: "3 yrs", value: 36 },
    { text: "5 yrs", value: 60 },
    { text: "10 yrs", value: 120 },
    { text: "20 yrs", value: 240 },
    { text: "Max", value: 600 },
  ];

  function SetState(current_state: string, action: string, cashflow_id = "", cashflow_change_id = "") {
    if (current_state === "cashflow_list" && action === "back") {
      router.back();
    }
    if (current_state === "cashflow_list" && action === "add") {
      setStage("add_cashflow");
      setMode("add");
      setSelectedCashflowId("");
      setStack((s) => [...s, "add_cashflow"]);
    }
    if (current_state === "cashflow_list" && action === "view") {
      setStage("view_cashflow_and_cashflow_change_list");
      setMode("add");
      setSelectedCashflowId(cashflow_id);
      setStack((s) => [...s, "view_cashflow_and_cashflow_change_list"]);
    }
    if (current_state === "view_cashflow_and_cashflow_change_list" && action === "edit") {
      setStage("edit_cashflow");
      setMode("edit");
      setSelectedCashflowId(cashflow_id);
      setStack((s) => [...s, "edit_cashflow"]);
    }
    if (current_state === "view_cashflow_and_cashflow_change_list" && action === "back") {
      setStage("cashflow_list");
      setMode("edit");
      setSelectedCashflowId("");
      setStack((s) => s.slice(0, -1));
    }
    if (current_state === "add_cashflow" && action === "back") {
      setStage("cashflow_list");
      setMode("edit");
      setStack((s) => s.slice(0, -1));
      setSelectedCashflowChangeId("");
    }
    if (current_state === "edit_cashflow" && action === "back") {
      setStage("view_cashflow_and_cashflow_change_list");
      setMode("add");
      setStack((s) => s.slice(0, -1));
      setSelectedCashflowChangeId("");
    }
    if (current_state === "edit_cashflow" && action === "deleted") {
      setStage("cashflow_list");
      setMode("edit");
      setSelectedCashflowChangeId("");
      setStack(["cashflow_list"]);
    }
    if (current_state === "view_cashflow_and_cashflow_change_list" && action === "edit_cashflow_change") {
      setStage("edit_cashflow_change");
      setCashflowChangeMode("edit");
      setSelectedCashflowChangeId(cashflow_change_id);
      setStack((s) => [...s, "edit_cashflow_change"]);
    }
    if (current_state === "view_cashflow_and_cashflow_change_list" && action === "add_cashflow_change") {
      setStage("add_cashflow_change");
      setCashflowChangeMode("add");
      setSelectedCashflowChangeId("");
      setStack((s) => [...s, "add_cashflow_change"]);
    }
    if (current_state === "add_cashflow_change" && action === "back") {
      setStage("view_cashflow_and_cashflow_change_list");
      setMode("edit");
      setSelectedCashflowChangeId("");
      setStack((s) => s.slice(0, -1));
    }
    if (current_state === "edit_cashflow_change" && action === "back") {
      setStage("view_cashflow_and_cashflow_change_list");
      setMode("edit");
      setSelectedCashflowChangeId("");
      setStack((s) => s.slice(0, -1));
    }
  }

  function OnCashflowOperationCompleted({ action, cashflow_id }: { action: string; cashflow_id?: string }) {
    if (action === "deleted") {
      SetState(stage, "deleted");
      return;
    }
    if (action === "added") {
      SetState(stage, "back");
      setTimeout(() => {
        setStage("view_cashflow_and_cashflow_change_list");
        setSelectedCashflowId(cashflow_id || "");
        setStack((s) => [...s, "view_cashflow_and_cashflow_change_list"]);
      }, 1000);
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

  const backBtn = (
    <button
      type="button"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50"
      onClick={() => SetState(stage, "back")}
      title="Back"
    >
      <FontAwesomeIcon className="text-base font-bold" icon={faArrowLeft} />
    </button>
  );

  const statementRow = (b: any, i: number) => (
    <div key={i} className="flex">
      <div className="self-center truncate text-lg font-medium text-dark-500 first-letter:uppercase font-montserrat">{b.cashflow_title || b.title}</div>
      <div className="ml-auto flex justify-end gap-1">
        <DisplayAmount className="text-xl" amount={b.amount} />
        {b.change > 0 && <FontAwesomeIcon className="self-center text-xs text-success-400" icon={faArrowTrendUp} />}
        {b.change < 0 && <FontAwesomeIcon className="self-center text-xs text-danger-400" icon={faArrowTrendDown} />}
        {b.change === 0 && <FontAwesomeIcon className="self-center text-xs text-transparent" icon={faArrowTrendDown} />}
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
          <div className="mb-1 flex gap-1 self-end text-[10px] font-bold md:w-[3.4rem]"></div>
        )}
      </div>
    </div>
  );

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col justify-between gap-3 md:min-h-[570px] md:w-[99vw]">
      {/* Breadcrumb Bar (Styled identically to LoanEditor & AssetEditor) */}
      <div className="fixed bottom-0 z-20 flex w-full items-center gap-2 border-b border-t bg-white px-3 py-2 shadow-xs md:relative md:z-0 md:mt-0 md:border-b md:border-t-0 md:bg-transparent md:px-0 md:py-1 md:shadow-none">
        {backBtn}
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
        {/* Left Column: Cashflow List */}
        {show_cashflow_list && (
          <div
            className={`flex w-full flex-col md:w-[380px] lg:w-[420px] md:shrink-0 ${
              stage !== "cashflow_list" ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="flex flex-col gap-3 overflow-x-hidden overflow-y-auto px-0 md:pl-2 md:pr-2 max-h-[calc(100vh-140px)] md:max-h-[640px]">
              {cashflow_list.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-dark-300 bg-white p-6 text-center shadow-2xs">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dark-100 text-dark-400 mb-2">
                    <FontAwesomeIcon icon={faMoneyCheckDollar} className="text-xl" />
                  </div>
                  <h4 className="text-sm font-bold text-dark-700">No {cashflow_category}s Added</h4>
                  <p className="mt-1 text-xs text-dark-400 max-w-[240px]">
                    Add your first {cashflow_category.toLowerCase()} to project cashflows.
                  </p>
                </div>
              )}

              {cashflow_list.map((entity: any) => (
                <CashflowCard
                  key={entity._id}
                  plan={plan}
                  cashflow={entity}
                  selected={selected_cashflow_id === entity._id}
                  onClick={() => SetState(stage, "view", entity._id)}
                >
                  <button
                    type="button"
                    className="p-1 text-dark-400 hover:text-primary-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      SetState(stage, "view", entity._id);
                    }}
                    title="View Details"
                  >
                    <FontAwesomeIcon
                      className={selected_cashflow_id === entity._id ? "text-primary-500" : "text-dark-400"}
                      icon={faChevronRight}
                    />
                  </button>
                </CashflowCard>
              ))}

              <div className="pt-1 pb-4">
                <Button
                  variant="neutral"
                  sub_variant="outline"
                  size="lg"
                  className={`w-full justify-center gap-2 py-2 font-semibold ${
                    cashflow_category_id === "i"
                      ? "text-primary-600 hover:border-primary-500 hover:bg-primary-50/50"
                      : "text-danger-600 hover:border-danger-500 hover:bg-danger-50/50"
                  }`}
                  onClick={() => SetState(stage, "add")}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span>Add {cashflow_category}</span>
                </Button>
              </div>
              <hr className="md:max-w-[450px] md:min-w-[440px]" />
              {!is_plan_synced && (
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

        {/* selected cashflow + changes timeline */}
        {show_cashflow_meta_dark && selected_cashflow && (
          <div className={`w-full flex-col gap-2 rounded-md border-dashed md:w-[470px] md:px-2 ${show_cashflow_command || show_cashflow_change_command ? "hidden md:flex" : "flex"}`}>
            <div className="flex h-full flex-col">
              <CashflowCard plan={plan} cashflow={selected_cashflow}>
                <button
                  disabled={stage !== "view_cashflow_and_cashflow_change_list"}
                  className="ml-auto self-center pl-3 text-dark-300 disabled:opacity-0"
                  onClick={() => SetState(stage, "edit", selected_cashflow_id)}
                >
                  <FontAwesomeIcon icon={faPen} className="self-center text-sm" />
                </button>
              </CashflowCard>
              <div>
                {cashflow_change_list.map((changes: any) => (
                  <div key={changes._id} className="relative ml-10 flex flex-col md:ml-20">
                    <div className="absolute -left-[2rem] -top-[2.5rem] h-[5.8rem] w-[2rem] rounded-bl-lg border-b-4 border-l-4 md:-left-[3.5rem] md:w-[3.5rem]"></div>
                    <CashflowChangeCard plan={plan} cashflow_change={changes}>
                      <div className="flex w-fit justify-end sm:w-[2rem] md:w-[2.5rem]">
                        <div
                          className="flex w-fit cursor-pointer self-center px-0 text-dark-300 sm:px-3"
                          onClick={() => SetState(stage, "edit_cashflow_change", "", changes._id)}
                        >
                          <FontAwesomeIcon
                            className={`self-center ${selected_cashflow_change_id === changes._id ? "text-primary-300" : ""}`}
                            icon={faChevronRight}
                          />
                        </div>
                      </div>
                    </CashflowChangeCard>
                  </div>
                ))}
                {stage === "view_cashflow_and_cashflow_change_list" && cashflow_change_possible && (
                  <div className="relative ml-10 mt-4 flex flex-col place-content-end gap-2 md:ml-20">
                    <div className="absolute -left-[2rem] -top-[3.5rem] h-[5rem] w-[2rem] rounded-bl-lg border-b-4 border-l-4 md:-left-[3.5rem] md:w-[3.5rem]"></div>
                    <Button variant="neutral" className="w-[100%] py-1 text-dark-300 shadow-sm" onClick={() => SetState(stage, "add_cashflow_change")}>
                      <FontAwesomeIcon icon={faShuffle} className="self-center" /> Add
                      {show_change_text && (
                        <span className={`font-bold capitalize ${cashflow_category_id === "i" ? "text-primary-500" : "text-danger-500"}`}>{change_text}</span>
                      )}
                    </Button>
                    <span className="flex text-warning-300">
                      <div className="mr-2">
                        <FontAwesomeIcon icon={faLightbulb} />
                      </div>
                      <span className="text-xs text-warning-200">
                        {cashflow_category_id === "i"
                          ? `Add rise/fall variations such as periodic hike due to a promotion, one time bonus or profit, loss of income to simulate real life scenarios.`
                          : `Add rise/fall variations such as inflation, change of lifestyle to simulate real life scenarios.`}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <hr className="mt-3 md:max-w-[450px] md:min-w-[440px]" />
              {!is_plan_synced && (
                <div className="flex flex-col justify-between gap-3 rounded-b-md py-3 md:max-w-[450px] md:min-w-[440px]">
                  <div className="flex justify-between">
                    <Button variant="neutral" sub_variant="outline" size="lg" className="flex w-fit gap-2 px-3 py-1 text-success-400 hover:border-success-400" onClick={() => router.back()}>
                      View changes
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="self-center" />
                    </Button>
                    <Button variant="primary" sub_variant="solid" size="lg" className="flex w-fit gap-2 px-3 py-1 text-success-400 hover:border-success-400" onClick={SavePlan}>
                      Save changes
                      <FontAwesomeIcon icon={faCloudArrowUp} className={`self-center font-bold md:text-lg ${!is_plan_synced ? "animate-pulse" : ""}`} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* divider */}
        {show_cashflow_command && (
          <div className="mx-4 hidden md:flex md:shrink-0">
            <FontAwesomeIcon className="mt-5 self-center text-3xl text-primary-300" icon={faChevronRight} />
          </div>
        )}

        {/* command column */}
        {(show_cashflow_command || show_cashflow_change_command) && (
          <div className="flex h-full w-full flex-col md:h-[580px] md:w-[470px] md:min-w-0">
            {show_cashflow_command && (
              <div className="flex flex-col">
                <CashflowCommand
                  plan={plan}
                  cashflow={mode === "edit" ? selected_cashflow : undefined}
                  category={cashflow_category_id as "i" | "e"}
                  mode={mode}
                  onDone={OnCashflowOperationCompleted}
                />
              </div>
            )}
            {show_cashflow_change_command && (
              <div className="flex w-full flex-col">
                <CashflowChangeCommand
                  plan={plan}
                  cashflow_change={cashflow_change_mode === "edit" ? selected_cashflow_change : undefined}
                  cashflow_id={selected_cashflow_id}
                  mode={cashflow_change_mode}
                  category={cashflow_category_id as "i" | "e"}
                  onDone={(r) => {
                    if (r.action === "deleted") SetState(stage, "back");
                    if (r.action === "added") SetState(stage, "back");
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* projection chart column */}
        <div
          className={`flex h-full flex-col gap-3 transition-all duration-300 md:ml-auto md:pl-3 md:shrink-0 ${
            show_cashflow_command || show_cashflow_change_command ? "md:w-1/3" : "md:w-2/3"
          }`}
        >
          <div className="flex h-[38vh] flex-col justify-end rounded-xl border-2 bg-dark-800 pb-3 md:h-[420px]">
            <div className="h-full w-full px-1 opacity-70 md:h-[400px]">
              <MyChart
                labels={balance_chart_data.labels}
                dataset={balance_chart_data.datasets}
                chart_type="bar"
                stacked={false}
                height={400}
                formatter={ToDisplayableMoney}
                annotation={annotation}
              />
            </div>
          </div>
          <div className="flex justify-end rounded-0 pb-2">
            <div className="mr-auto flex flex-col gap-1 md:flex-row">
              <div className="w-[4rem] self-center rounded-md text-xs font-bold text-primary-500 sm:text-[14px] md:w-[5.8rem] md:text-lg">
                {current_hover_month <= balance_chart_data.labels.length
                  ? balance_chart_data.labels[current_hover_month - 1]
                  : GetMMYYYYNameFromMM(current_hover_month, plan.timestamp)}
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

          {/* desktop breakdown */}
          <div className="hidden flex-col py-2 md:flex md:w-full">
            <div>
              <div className="flex justify-between gap-3 pb-2">
                <div className="flex gap-1">
                  <span className="ml-auto mr-3 text-lg font-bold"> Total {cashflow_category}</span>
                </div>
                <div className="flex flex-col self-center">
                  <div className="ml-auto flex justify-end gap-1 pr-1">
                    <DisplayAmount className="text-xl" amount={total_cashflow_for_current_month} />
                    {total_cashflow_change_for_current_month > 0 && (
                      <FontAwesomeIcon className="self-center text-xs text-success-400" icon={faArrowTrendUp} />
                    )}
                    {total_cashflow_change_for_current_month < 0 && (
                      <FontAwesomeIcon className="self-center text-xs text-danger-400" icon={faArrowTrendDown} />
                    )}
                    {total_cashflow_change_for_current_month === 0 && (
                      <FontAwesomeIcon className="self-center text-xs text-transparent" icon={faArrowTrendDown} />
                    )}
                    {total_cashflow_change_for_current_month ? (
                      <div className="mb-1 flex gap-1 self-end text-[10px] font-bold md:w-[3.4rem]">
                        (
                        <div className="flex">
                          {total_cashflow_change_for_current_month > 0 && <div>+</div>}
                          <DisplayAmount notation="compact" amount={total_cashflow_change_for_current_month} />
                        </div>
                        )
                      </div>
                    ) : (
                      <div className="mb-1 flex gap-1 self-end text-[10px] font-bold md:w-[3.4rem]"></div>
                    )}
                  </div>
                  <div className="flex"></div>
                </div>
              </div>

              <hr className="mb-3 border-dark-600" />
              <div className="flex max-h-[140px] flex-col gap-1 overflow-y-scroll md:h-[140px]">
                {cashflow_for_current_month.map(statementRow)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Port of god_plan_entity/GodPlanEntity.vue — the global "edit entity" host. */
export default function EditPage() {
  const router = useRouter();
  const god_plan_entity = useFiPlanStore((s) => s.god_plan_entity);
  const plans = useFiPlanStore((s) => s.plans);

  const plan = useMemo(
    () => plans.find((p) => p._id === god_plan_entity.plan_id) || plans[0],
    [plans, god_plan_entity.plan_id]
  );

  const entity_type = god_plan_entity.entity_type || "cashflow";
  const sub_entity_type = god_plan_entity.sub_entity_type || "income";

  const cashflow_related_entities = [
    { entity_type: "cashflow", sub_entity_type: "income" },
    { entity_type: "cashflow", sub_entity_type: "expense" },
    { entity_type: "loan", sub_entity_type: "" },
  ];

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  const is_cashflow_related = ["cashflow", "cashflow_change", "loan"].includes(entity_type);
  const selected_tab_index = cashflow_related_entities.findIndex(
    (e) => entity_type === e.entity_type && sub_entity_type === e.sub_entity_type
  );

  // Money Manager (fdp) and Loan Manager editors
  if (entity_type === "fdp") {
    return (
      <div className="mt-16 md:mt-0">
        <div className="w-full overflow-y-scroll px-3 py-4 md:h-fit md:overflow-y-hidden md:px-0">
          <div className="flex flex-col justify-between gap-5 md:flex-row">
            <FDPEditor plan_id={plan._id} />
          </div>
        </div>
      </div>
    );
  }
  if (entity_type === "loan") {
    return (
      <div className="mt-16 md:mt-0">
        <div className="w-full overflow-y-scroll px-3 py-4 md:h-fit md:overflow-y-hidden md:px-0">
          <div className="flex justify-between gap-5">
            <LoanEditor plan_id={plan._id} />
          </div>
        </div>
      </div>
    );
  }

  // Account editor (Emergency/Savings/Investment cards edit button)
  if (entity_type === "account") {
    return (
      <div className="mt-16 md:mt-0">
        <div className="w-full overflow-y-scroll px-3 py-4 md:h-fit md:overflow-y-hidden md:px-0">
          <div className="flex justify-between gap-5">
            <AccountEditor plan_id={plan._id} selected_account_id={god_plan_entity.entity_id} />
          </div>
        </div>
      </div>
    );
  }

  // Asset editor (FD/bonds/gold/PPF/equity/real-estate/crypto holdings)
  if (entity_type === "asset") {
    return (
      <div className="mt-16 md:mt-0">
        <div className="w-full overflow-y-scroll px-3 py-4 md:h-fit md:overflow-y-hidden md:px-0">
          <div className="flex justify-between gap-5">
            <AssetEditor plan_id={plan._id} />
          </div>
        </div>
      </div>
    );
  }

  // Tax Manager (regime, auto income tax, salary negotiation)
  if (entity_type === "tax") {
    return (
      <div className="mt-16 md:mt-0">
        <div className="w-full overflow-y-scroll px-3 py-4 md:h-fit md:overflow-y-hidden md:px-0">
          <div className="flex justify-between gap-5">
            <TaxManager plan_id={plan._id} />
          </div>
        </div>
      </div>
    );
  }

  // Withdraw Order (plan-level outflow sequence for SIPs, expenses, prepayments)
  if (entity_type === "withdraw") {
    return (
      <div className="mt-16 md:mt-0">
        <div className="w-full overflow-y-scroll px-3 py-4 md:h-fit md:overflow-y-hidden md:px-0">
          <div className="flex flex-col justify-between gap-5 md:flex-row">
            <WithdrawalOrderEditor plan_id={plan._id} />
          </div>
        </div>
      </div>
    );
  }

  if (!is_cashflow_related) {
    // unknown entity types — simple fallback
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  return (
    <div className="mt-16 md:mt-0">
      <div className="w-full overflow-y-scroll px-3 py-4 md:h-fit md:overflow-y-hidden md:px-0">
        <div className="flex justify-between gap-5">
          <div className="w-full px-0 sm:px-0">
            <Tab.Group
              selectedIndex={Math.max(0, selected_tab_index)}
              onChange={(index) => {
                const entity = cashflow_related_entities[index];
                if (entity && entity.sub_entity_type) {
                  // switch category by updating the god entity + URL refresh
                  useFiPlanStore.getState().set_god_plan_entity({
                    ...god_plan_entity,
                    entity_type: entity.entity_type,
                    sub_entity_type: entity.sub_entity_type,
                  });
                }
              }}
            >
              <Tab.List className="mb-3 hidden w-1/3 space-x-1 rounded-lg border bg-dark-50 p-1 shadow-sm">
                {cashflow_related_entities.map(({ entity_type: et, sub_entity_type: st }) => (
                  <Tab key={`${et}-${st}`} className="hidden" />
                ))}
              </Tab.List>
              <Tab.Panels>
                {cashflow_related_entities.map(({ entity_type: et, sub_entity_type: st }) => (
                  <Tab.Panel
                    key={`${et}-${st}`}
                    className={`w-full rounded-xl bg-transparent transition-all duration-1000 ring-0 ${
                      st === "income" ? "border-dark-900" : "border-dark-300"
                    }`}
                  >
                    {et === "cashflow" && st === "income" && (
                      <div className="flex flex-col justify-between gap-3 md:flex-row">
                        <IncomeAndExpenseEditor plan_id={plan._id} cashflow_category="income" />
                      </div>
                    )}
                    {et === "cashflow" && st === "expense" && (
                      <div className="flex flex-col justify-between gap-4 md:flex-row">
                        <IncomeAndExpenseEditor plan_id={plan._id} cashflow_category="expense" />
                      </div>
                    )}
                  </Tab.Panel>
                ))}
              </Tab.Panels>
            </Tab.Group>
          </div>
        </div>
      </div>
    </div>
  );
}

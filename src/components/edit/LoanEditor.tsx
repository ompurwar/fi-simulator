"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { MyChart } from "@/components/ui/MyChart";
import { MonthPicker } from "@/components/edit/MonthPicker";
import { LoanAmortizationTable } from "@/components/edit/LoanAmortizationTable";
import { GetRandomString } from "@/lib/utils";
import { FireNotification } from "@/store/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faXmark,
  faPlus,
  faArrowUpRightFromSquare,
  faCloudArrowUp,
  faPenToSquare,
  faChevronRight,
  faChevronLeft,
  faLandmarkFlag,
  faTrashCan,
  faCar,
  faCreditCard,
  faUserTie,
  faHouse,
  faArrowsRotate,
  faHandHoldingDollar,
  faChartPie,
} from "@fortawesome/free-solid-svg-icons";
import { faLightbulb, faFileLines } from "@fortawesome/free-regular-svg-icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function GetMMYYYY(month: number, plan_timestamp?: string | number) {
  const start = new Date(plan_timestamp || Date.now());
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** EMI formula (port of LoanEngine.ComputeLoanEMI): P*r*(1+r)^n / ((1+r)^n - 1), r = rate/1200 */
function ComputeLoanEMI(principal: number, interest_rate: number, tenure_months: number): number {
  const r = interest_rate / 1200;
  const n = tenure_months;
  if (r === 0) return principal / n;
  const factor = Math.pow(1 + r, n);
  return (principal * r * factor) / (factor - 1);
}

/** Port of LoanEngine.ComputeRefinanceAnalysis — what-if the loan closes at refinance_month. */
function ComputeRefinanceAnalysis(loan: any, opts: { new_rate: number; new_tenure: number; refinance_month: number; foreclosure_charge: number }) {
  const tenure = Math.max(1, loan.end_month - loan.start_month + 1);
  const r = loan.interest_rate / 1200;
  const emi = ComputeLoanEMI(loan.principal_amount, loan.interest_rate, tenure);
  const schedule: any[] = [];
  let balance = loan.principal_amount;
  for (let i = 0; i < tenure; i++) {
    const interest_amount = balance * r;
    balance -= emi - interest_amount;
    schedule.push({ emi, interest_amount, closing_balance: balance });
  }
  const idx = Math.max(0, Math.min(Math.floor(opts.refinance_month) - 1, schedule.length));
  const outstanding = idx === 0 ? loan.principal_amount : schedule[idx - 1].closing_balance;
  const old_emi = idx === 0 ? emi : schedule[idx - 1].emi;
  const old_remaining_interest = schedule.slice(idx).reduce((sum: number, x: any) => sum + x.interest_amount, 0);
  const new_emi = ComputeLoanEMI(outstanding, opts.new_rate, opts.new_tenure);
  const new_total_interest = new_emi * opts.new_tenure - outstanding;
  const emi_diff = old_emi - new_emi;
  return {
    refinance_month: idx + 1,
    outstanding_balance: outstanding,
    old_emi,
    old_remaining_interest,
    new_emi,
    new_total_interest,
    interest_saved: old_remaining_interest - new_total_interest,
    net_savings: old_remaining_interest - new_total_interest - opts.foreclosure_charge,
    breakeven_months: emi_diff > 0 ? Math.ceil(opts.foreclosure_charge / emi_diff) : null,
  };
}

/** Port of loan_account/LoanCard.vue */
function LoanCard({
  plan,
  loan,
  children,
  selected = false,
  onClick,
}: {
  plan: any;
  loan: any;
  children?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  const loan_type_options = (useFiPlanStore((s) => s.common_collection) as any)?.loan_type || [];
  const start_date = GetMMYYYY(loan.start_month, plan?.timestamp);
  const end_date = GetMMYYYY(loan.end_month, plan?.timestamp);
  const duration = loan.end_month - loan.start_month + 1;
  const emi = ComputeLoanEMI(loan.principal_amount, loan.interest_rate, duration);
  const loan_type = loan_type_options.find((o: any) => o.value === loan.type)?.text || "Loan";

  return (
    <div
      onClick={onClick}
      className={`flex flex-col rounded-xl border bg-white p-3 text-dark-700 shadow-xs transition-all duration-200 hover:shadow-md ${
        selected
          ? "border-primary-400 border-l-4 border-l-primary-500 ring-2 ring-primary-400/20"
          : "border-dark-200 border-l-4 border-l-primary-400"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-sm font-bold text-dark-800 first-letter:uppercase sm:text-base">
            {loan.title}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-dark-500 sm:text-sm font-medium">
            <span className="rounded-md bg-dark-100/70 px-1.5 py-0.5 text-[11px] font-semibold text-dark-700">
              {loan_type}
            </span>
            <span className="text-dark-300">·</span>
            <DisplayAmount className="self-center font-bold text-dark-800" amount={loan.principal_amount} />
            <span className="text-dark-300">·</span>
            <span className="text-dark-500 font-normal">@ {loan.interest_rate}% p.a.</span>
          </div>
          <div className="flex w-fit items-center gap-1 rounded-md py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dark-500 sm:text-xs">
            <span className="font-bold text-dark-700">{start_date}</span>
            <span className="text-dark-400 lowercase">to</span>
            <span className="font-bold text-dark-700">{end_date}</span>
            <span className="ml-1 text-dark-400 lowercase">({duration} mo)</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1.5 rounded-lg bg-dark-50 px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-dark-400">EMI</span>
            <DisplayAmount className="font-bold text-dark-800 text-xs sm:text-sm" amount={emi} />
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
  "relative border border-dark-200 rounded-lg px-3 py-2 w-full shadow-xs placeholder-dark-400 text-dark-800 text-left focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 bg-white transition-all duration-200 text-base appearance-none";

/** Port of loan_account/LoanAccountCommand.vue */
function LoanAccountCommand({
  plan,
  loan,
  mode,
  default_loan_title,
  default_loan_type,
  onChange,
  onDone,
}: {
  plan: any;
  loan?: any;
  mode: "add" | "edit";
  default_loan_title?: string;
  default_loan_type?: number;
  onChange?: (draft: any) => void;
  onDone: (result: { action: string; loan_id?: string }) => void;
}) {
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);
  const sync_plan = useFiPlanStore((s) => s.sync_plan);
  const common_collection = useFiPlanStore((s) => s.common_collection);
  const loan_type_options = (common_collection as any)?.loan_type || [];

  const [state, setState] = useState<any>({
    title: default_loan_title || "loan",
    principal_amount: 0,
    start_month: 1,
    end_month: 1,
    interest_rate: 0,
    ref_id: undefined,
    type: default_loan_type ?? 4,
    loading: false,
    deleting: false,
    deposit_to_bank: true,
    prepayments: [],
    prepay_draft: { start_month: 13, amount: 0, frequency: "y", step_pct: null, step_frequency: null },
  });
  const [duration_in_month, setDurationInMonth] = useState(1);

  useEffect(() => {
    if (loan) {
      setState((s: any) => ({
        ...s,
        title: loan.title,
        principal_amount: loan.principal_amount,
        start_month: loan.start_month,
        end_month: loan.end_month,
        interest_rate: loan.interest_rate,
        type: loan.type,
        deposit_to_bank: loan.deposit_to_bank === true,
        prepayments: [...(loan.prepayments || [])],
        prepay_draft: { start_month: (loan.start_month || 1) + 12, amount: 0, frequency: "y", step_pct: null, step_frequency: null },
        loading: false,
        deleting: false,
      }));
      setDurationInMonth(loan.end_month - loan.start_month + 1);
    } else {
      setState((s: any) => ({
        ...s,
        title: default_loan_title || "loan",
        principal_amount: 0,
        start_month: 1,
        end_month: 1,
        interest_rate: 0,
        type: default_loan_type ?? 4,
        deposit_to_bank: true,
        prepayments: [],
        prepay_draft: { start_month: 13, amount: 0, frequency: "y", step_pct: null, step_frequency: null },
        loading: false,
        deleting: false,
      }));
      setDurationInMonth(1);
    }
  }, [loan, default_loan_title, default_loan_type]);

  useEffect(() => {
    if (onChange) {
      onChange({
        title: state.title,
        principal_amount: state.principal_amount,
        start_month: state.start_month,
        end_month: state.end_month,
        interest_rate: state.interest_rate,
        type: state.type,
        deposit_to_bank: state.deposit_to_bank,
        prepayments: state.prepayments,
      });
    }
  }, [state.title, state.principal_amount, state.start_month, state.end_month, state.interest_rate, state.type, state.deposit_to_bank, state.prepayments]);

  function updateDuration(n: number) {
    setDurationInMonth(n);
    setState((s: any) => ({ ...s, end_month: n + s.start_month - 1 }));
  }
  function updateStartMonth(m: number) {
    setState((s: any) => ({ ...s, start_month: m, end_month: duration_in_month + m - 1 }));
  }

  async function SaveChanges() {
    const error_messages: string[] = [];
    if (!state.title?.trim()) error_messages.push("Description / title is required");
    if (!state.principal_amount || state.principal_amount <= 0) error_messages.push("Principal amount is required");
    if (!state.interest_rate || state.interest_rate <= 0) error_messages.push("Interest rate is required");
    if (!(state.end_month >= state.start_month)) error_messages.push("End month should be >= start month");
    if (error_messages.length) {
      alert(error_messages.join("\n"));
      return;
    }
    const loan_obj: any = {
      _id: mode === "add" ? GetRandomString(6) : loan?._id,
      title: state.title.trim(),
      principal_amount: state.principal_amount,
      start_month: state.start_month,
      end_month: state.end_month,
      interest_rate: state.interest_rate,
      type: state.type,
      ref_id: state.ref_id,
      deposit_to_bank: state.deposit_to_bank === true,
      prepayments: state.prepayments || [],
    };
    setState((s: any) => ({ ...s, loading: true }));
    const loan_accounts = [...(plan.loan_accounts || [])];
    if (mode === "add") loan_accounts.push(loan_obj);
    else {
      const idx = loan_accounts.findIndex((l: any) => l._id === loan_obj._id);
      if (idx >= 0) loan_accounts[idx] = loan_obj;
    }
    update_plan_local({ ...plan, loan_accounts });
    try {
      await sync_plan(plan._id);
    } catch (e: any) {
      alert(`Saved locally but could not sync to the server: ${e?.message || e}`);
    }
    setState((s: any) => ({ ...s, loading: false }));
    onDone({ action: "added", loan_id: loan_obj._id });
  }

  async function DeleteLoan() {
    const ok = confirm(`Are you sure you want to delete "${loan?.title || "this loan"}"?`);
    if (!ok) return;
    setState((s: any) => ({ ...s, deleting: true }));
    const loan_accounts = (plan.loan_accounts || []).filter((l: any) => l._id !== loan?._id);
    update_plan_local({ ...plan, loan_accounts });
    try {
      await sync_plan(plan._id);
    } catch (e: any) {
      alert(`Deleted locally but could not sync to the server: ${e?.message || e}`);
    }
    setState((s: any) => ({ ...s, deleting: false }));
    onDone({ action: "deleted" });
  }

  return (
    <div className="flex w-full flex-col gap-3.5 rounded-xl border border-dark-200 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-dark-100 pb-3">
        <div className="flex items-center gap-2.5 font-semibold text-dark-800">
          <FontAwesomeIcon icon={faLandmarkFlag} className="text-xl text-primary-500" />
          <span className="text-base">{mode === "add" ? "Add New Loan" : "Configure Loan"}</span>
        </div>
        {mode === "edit" && (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-danger-500 transition-colors hover:bg-danger-50 hover:text-danger-600"
            onClick={DeleteLoan}
            disabled={state.deleting}
          >
            {state.deleting ? (
              <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <FontAwesomeIcon icon={faTrashCan} />
            )}
            <span>Delete</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="loan_description" className="text-xs font-semibold uppercase tracking-wider text-dark-500">
          Description / Name
        </label>
        <input
          type="text"
          id="loan_description"
          value={state.title}
          onChange={(e) => setState((s: any) => ({ ...s, title: e.target.value }))}
          placeholder="e.g. Home Loan, Car Loan"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-dark-500">Loan Type</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 rounded-lg border border-dark-200 bg-dark-50 p-1.5">
          {(loan_type_options as any[]).map((option, index) => {
            const isSelected = state.type === option.value;
            return (
              <button
                key={index}
                type="button"
                className={`rounded-md px-2 py-2 text-xs font-semibold text-center transition-all duration-150 ${
                  isSelected
                    ? "bg-primary-500 text-white shadow-xs"
                    : "text-dark-600 hover:bg-dark-100 hover:text-dark-800"
                } ${index === 4 ? "col-span-2 sm:col-span-1" : ""}`}
                onClick={() => setState((s: any) => ({ ...s, type: option.value }))}
              >
                {option.text}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg bg-dark-50 p-2.5 border border-dark-100">
        <div className="flex items-center">
          <input
            id="deposit_to_bank"
            type="checkbox"
            checked={state.deposit_to_bank}
            onChange={(e) => setState((s: any) => ({ ...s, deposit_to_bank: e.target.checked }))}
            className="h-4 w-4 rounded border-dark-300 accent-primary-500 cursor-pointer"
          />
          <label htmlFor="deposit_to_bank" className="ml-2.5 select-none text-xs font-medium text-dark-700 cursor-pointer">
            Direct deposit to savings account
          </label>
        </div>
        <p className="mt-1 text-[11px] text-dark-400 pl-6.5">
          Credits principal into your savings balance right before EMI schedule starts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold uppercase tracking-wider text-dark-500">Principal</label>
            <DisplayAmount className="text-xs font-bold text-dark-700" amount={state.principal_amount} />
          </div>
          <input
            type="number"
            value={state.principal_amount || ""}
            onChange={(e) => setState((s: any) => ({ ...s, principal_amount: Number(e.target.value) }))}
            required
            min={1}
            placeholder="0"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-dark-500">Interest Rate %</label>
          <input
            type="number"
            step="0.01"
            min={0.1}
            max={100}
            value={state.interest_rate || ""}
            placeholder="e.g. 8.5"
            onChange={(e) => setState((s: any) => ({ ...s, interest_rate: Number(e.target.value) }))}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-dark-500">EMI Starts From</label>
          <MonthPicker
            plan_timestamp={plan.timestamp}
            duration={plan?.duration || 600}
            month={state.start_month}
            onChange={updateStartMonth}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-dark-500">Tenure (Months)</label>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={duration_in_month || ""}
            placeholder="Months"
            onChange={(e) => updateDuration(Number(e.target.value))}
          />
        </div>
      </div>

      {mode === "edit" && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-primary-400/40 bg-primary-50/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <FontAwesomeIcon icon={faHandHoldingDollar} className="text-base text-primary-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-dark-700">Prepayments</span>
            <span className="text-[11px] text-dark-400">
              (Optional: extra payments to shorten tenure)
            </span>
          </div>

          {state.prepayments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {state.prepayments.map((p: any, i: number) => (
                <div key={p._id || i} className="flex items-center gap-2 rounded-lg border border-dark-200 bg-white px-2.5 py-1.5 text-xs text-dark-700 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase text-dark-400">From</span>
                  <span className="font-bold text-dark-800">{GetMMYYYY(p.start_month, plan.timestamp)}</span>
                  <span className="text-dark-300">·</span>
                  <DisplayAmount className="font-bold text-success-600" amount={p.amount} />
                  <span className="text-dark-500 font-medium">
                    ({p.frequency === "q" ? "quarterly" : p.frequency === "y" ? "yearly" : p.frequency === "m" ? "monthly" : "one-time"}
                    {p.step_pct ? ` · +${p.step_pct}% step-up` : ""})
                  </span>
                  <button
                    type="button"
                    className="ml-auto text-dark-400 hover:text-danger-500 transition-colors p-1"
                    onClick={() =>
                      setState((s: any) => ({
                        ...s,
                        prepayments: s.prepayments.filter((x: any) => (p._id ? x._id !== p._id : true)),
                      }))
                    }
                  >
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2.5 pt-1">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-dark-600">Start Month</span>
                <MonthPicker
                  plan_timestamp={plan.timestamp}
                  duration={plan?.duration || 600}
                  month={state.prepay_draft.start_month}
                  onChange={(m: number) => setState((s: any) => ({ ...s, prepay_draft: { ...s.prepay_draft, start_month: m } }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-dark-600">Amount ₹</span>
                <input
                  type="number"
                  min={1}
                  className={`${inputClass} !py-1.5 !text-sm`}
                  value={state.prepay_draft.amount || ""}
                  placeholder="e.g. 50000"
                  onChange={(e) => setState((s: any) => ({ ...s, prepay_draft: { ...s.prepay_draft, amount: Number(e.target.value) } }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex rounded-md border border-dark-200 bg-white p-0.5">
                {[
                  { label: "One-time", value: null },
                  { label: "Monthly", value: "m" },
                  { label: "Quarterly", value: "q" },
                  { label: "Yearly", value: "y" },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    className={`rounded px-2 py-1 text-[11px] font-semibold transition-all ${
                      state.prepay_draft.frequency === option.value
                        ? "bg-primary-500 text-white shadow-2xs"
                        : "text-dark-600 hover:bg-dark-50"
                    }`}
                    onClick={() => setState((s: any) => ({ ...s, prepay_draft: { ...s.prepay_draft, frequency: option.value } }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Button
                variant="neutral"
                sub_variant="outline"
                size="sm"
                className="px-3 py-1 text-xs font-semibold text-success-600 hover:border-success-500"
                onClick={() => {
                  const draft = state.prepay_draft;
                  if (!draft.amount || draft.amount <= 0) {
                    alert("Prepayment amount is required");
                    return;
                  }
                  setState((s: any) => ({
                    ...s,
                    prepayments: [...(s.prepayments || []), { _id: GetRandomString(6), ...draft }],
                    prepay_draft: { ...draft, amount: 0, step_pct: null },
                  }));
                }}
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1" />
                Add Prepay
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-2 flex gap-3 pt-2">
        <Button variant="primary" sub_variant="solid" className="flex flex-1 justify-center gap-2 py-2.5 font-bold capitalize shadow-xs" onClick={SaveChanges}>
          {state.loading ? (
            <svg className="h-5 w-5 animate-spin self-center" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <FontAwesomeIcon icon={faFileLines} className="self-center text-lg" />
          )}
          <span>{mode === "add" ? "Add Loan" : "Update Loan"}</span>
        </Button>
      </div>
    </div>
  );
}

/** Port of loan_editor/LoanEditor.vue — the Loan Manager editor. */
export function LoanEditor({ plan_id }: { plan_id: string }) {
  const router = useRouter();
  const plans = useFiPlanStore((s) => s.plans);
  const plan_synced_map = useFiPlanStore((s) => s.plan_synced_map);
  const sync_plan = useFiPlanStore((s) => s.sync_plan);
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);

  const plan = plans.find((p) => p._id === plan_id);

  const [stack, setStack] = useState<string[]>(["loan_list"]);
  const [stage, setStage] = useState("loan_list");
  const [selected_loan_id, setSelectedLoanId] = useState("");
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [default_loan_title, setDefaultLoanTitle] = useState("Home Loan");
  const [default_loan_type, setDefaultLoanType] = useState(1);
  const [plan_sync_inprogress, setPlanSyncInprogress] = useState(false);
  const [show_refinance, setShowRefinance] = useState(false);
  const [refi, setRefi] = useState<any>({ new_rate: 8, new_tenure: 240, refinance_month: 13, foreclosure_charge: 0 });
  const [live_draft, setLiveDraft] = useState<any>(null);

  const loan_list = useMemo(() => {
    if (!plan) return [];
    return [...(plan.loan_accounts || [])].sort((a: any, b: any) => a.start_month - b.start_month);
  }, [plan]);

  const selected_loan = loan_list.find((l: any) => l._id === selected_loan_id);
  const show_loan_command = ["add_loan", "edit_loan"].includes(stage);

  const loan_being_edited = useMemo(() => {
    if (show_loan_command && live_draft) {
      return live_draft;
    }
    return (
      selected_loan || {
        title: default_loan_title,
        principal_amount: 0,
        start_month: 1,
        end_month: 1,
        interest_rate: 0,
        type: default_loan_type,
      }
    );
  }, [show_loan_command, live_draft, selected_loan, default_loan_title, default_loan_type]);

  useEffect(() => {
    if (selected_loan) {
      setRefi({
        new_rate: selected_loan.interest_rate,
        new_tenure: Math.min(240, Math.max(12, selected_loan.end_month - selected_loan.start_month)),
        refinance_month: Math.max(selected_loan.start_month, Math.min(selected_loan.start_month + 12, selected_loan.end_month)),
        foreclosure_charge: 0,
      });
      setShowRefinance(false);
    }
  }, [selected_loan_id, selected_loan]);

  const is_plan_synced = plan_synced_map[plan_id] !== false;
  const show_loan_list = ["loan_list", "add_loan"].includes(stage);
  const show_loan_meta_card = ["view_loan", "edit_loan"].includes(stage) && !!selected_loan;
  const show_loan_command = ["add_loan", "edit_loan"].includes(stage);

  // EMI figures (port of LoanEngine amortization + EmiScheduleTOChartData)
  const emi_figures = useMemo(() => {
    const loan_obj: any = loan_being_edited;
    const tenure = Math.max(1, loan_obj.end_month - loan_obj.start_month + 1);
    const emi = ComputeLoanEMI(loan_obj.principal_amount || 0, loan_obj.interest_rate || 0, tenure);
    const total_interest_paid = (loan_obj.principal_amount || 0) > 0 ? Math.max(0, emi * tenure - (loan_obj.principal_amount || 0)) : 0;
    return { monthly_emi: emi, total_interest_paid, total_payable: (loan_obj.principal_amount || 0) + total_interest_paid };
  }, [loan_being_edited]);

  const type_of_loan_being_edited =
    (useFiPlanStore((s) => s.common_collection) as any)?.loan_type?.find(
      (o: any) => o.value === loan_being_edited.type
    )?.text || "Loan";

  const emi_chart_data = useMemo(() => {
    const labels = ["Principal Amount", "Total Interest"];
    const datasets: any[] = [];
    if (loan_being_edited.principal_amount && loan_being_edited.principal_amount > 0) {
      datasets.push({
        data: [loan_being_edited.principal_amount, emi_figures.total_interest_paid],
        type: "doughnut",
        label: "Breakup",
        backgroundColor: [
          (typeof document !== "undefined" && getComputedStyle(document.body).getPropertyValue("--color-primary-400").trim()) || "#34d399",
          (typeof document !== "undefined" && getComputedStyle(document.body).getPropertyValue("--color-warning-500").trim()) || "#d97706",
        ],
        borderColor: ["#ffffff", "#ffffff"],
        borderWidth: 2,
        pointStyle: "circle",
        pointRadius: 0,
        pointHoverRadius: 5,
      });
    }
    return { labels, datasets };
  }, [loan_being_edited, emi_figures]);

  function SetState(current_state: string, action: string, loan_id = "") {
    if (current_state === "loan_list" && action === "back") router.back();
    if (current_state === "loan_list" && action === "add") {
      setStage("add_loan");
      setMode("add");
      setSelectedLoanId("");
      setStack((s) => [...s, "add_loan"]);
    }
    if (current_state === "loan_list" && action === "view") {
      setStage("view_loan");
      setSelectedLoanId(loan_id);
      setStack((s) => [...s, "view_loan"]);
    }
    if (current_state === "view_loan" && action === "edit") {
      setStage("edit_loan");
      setMode("edit");
      setStack((s) => [...s, "edit_loan"]);
    }
    if (current_state === "view_loan" && action === "back") {
      setStage("loan_list");
      setSelectedLoanId("");
      setStack((s) => s.slice(0, -1));
    }
    if (current_state === "add_loan" && action === "back") {
      setStage("loan_list");
      setStack((s) => s.slice(0, -1));
    }
    if (current_state === "edit_loan" && action === "back") {
      setStage("view_loan");
      setStack((s) => s.slice(0, -1));
    }
    if (current_state === "edit_loan" && action === "deleted") {
      setStage("loan_list");
      setSelectedLoanId("");
      setStack(["loan_list"]);
    }
  }

  function SetLoanDefaults(template_id: string) {
    if (template_id === "home") {
      setDefaultLoanTitle("Home Loan");
      setDefaultLoanType(1);
    }
    if (template_id === "car") {
      setDefaultLoanTitle("Car Loan");
      setDefaultLoanType(2);
    }
    if (template_id === "personal") {
      setDefaultLoanTitle("Personal Loan");
      setDefaultLoanType(3);
    }
    if (template_id === "credit") {
      setDefaultLoanTitle("Credit Card");
      setDefaultLoanType(4);
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
    loan_list: "Loan List",
    view_loan: selected_loan ? selected_loan.title : "Loan Details",
    add_loan: "Add Loan",
    edit_loan: "Edit Loan",
  };
  const breadcrumb_data = stack.map((s) => PANEL_STAGES_LABELS[s] || s);

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  const templates = [
    { id: "home", icon: faHouse, label: "Home Loan" },
    { id: "car", icon: faCar, label: "Car Loan" },
    { id: "personal", icon: faUserTie, label: "Personal Loan" },
    { id: "credit", icon: faCreditCard, label: "Credit Card" },
  ];

  return (
    <div className="flex w-full flex-col justify-between gap-3 md:min-h-[570px] md:w-[99vw]">
      {/* breadcrumb bar */}
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

      <div className="mb-16 flex h-full flex-col gap-4 md:mb-0 md:mt-0 md:flex-row md:gap-0">
        {/* loan list column */}
        {show_loan_list && (
          <div className={`flex w-full flex-col md:h-[580px] md:w-1/3 md:shrink-0 ${stage !== "loan_list" ? "hidden md:flex" : "flex"}`}>
            {loan_list.length > 0 && (
              <div className="flex flex-col gap-3 overflow-x-hidden overflow-y-auto px-0 md:pl-2 md:pr-2">
                {loan_list.map((loan_account: any) => (
                  <LoanCard
                    key={loan_account._id}
                    plan={plan}
                    loan={loan_account}
                    selected={selected_loan_id === loan_account._id}
                    onClick={() => SetState(stage, "view", loan_account._id)}
                  >
                    <button
                      type="button"
                      className="p-1 text-dark-400 hover:text-primary-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        SetState(stage, "view", loan_account._id);
                      }}
                      title="View Details"
                    >
                      <FontAwesomeIcon
                        className={selected_loan_id === loan_account._id ? "text-primary-500" : "text-dark-400"}
                        icon={faChevronRight}
                      />
                    </button>
                  </LoanCard>
                ))}

                {loan_list.length <= 4 && (
                  <div className="mt-2 flex justify-center pb-2">
                    <Button
                      variant="neutral"
                      sub_variant="outline"
                      size="lg"
                      className="w-full justify-center gap-2 py-2 font-semibold text-success-600 hover:border-success-500 hover:bg-success-50/50"
                      onClick={() => SetState(stage, "add")}
                    >
                      <FontAwesomeIcon icon={faPlus} />
                      <span>Add a loan</span>
                    </Button>
                  </div>
                )}

                {!is_plan_synced && (
                  <div className="mt-auto flex flex-col gap-2.5 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                    <div className="flex items-start gap-2">
                      <FontAwesomeIcon icon={faLightbulb} className="text-amber-500 mt-0.5" />
                      <span className="text-xs text-dark-600 font-medium">
                        Changes are saved locally. Click save to sync with cloud.
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="neutral" sub_variant="outline" size="sm" className="flex-1 justify-center gap-1.5 text-dark-600 hover:border-dark-300" onClick={() => router.back()}>
                        <span>Preview</span>
                        <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
                      </Button>
                      <Button variant="primary" sub_variant="solid" size="sm" className="flex-1 justify-center gap-1.5 font-semibold shadow-xs" onClick={SavePlan}>
                        <span>Sync</span>
                        <FontAwesomeIcon icon={faCloudArrowUp} className={`text-xs ${!is_plan_synced ? "animate-pulse" : ""}`} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* empty state: loan templates */}
            {loan_list.length === 0 && stage === "loan_list" && (
              <div className="flex w-full flex-col gap-3 p-2 md:pr-3">
                <div className="rounded-xl border border-dashed border-dark-300 bg-dark-50/50 p-4 text-center">
                  <FontAwesomeIcon icon={faLandmarkFlag} className="text-3xl text-dark-400 mb-2" />
                  <h3 className="text-sm font-bold text-dark-700">No Loans Added Yet</h3>
                  <p className="text-xs text-dark-400 mt-1">Start by choosing a loan type or creating a custom one:</p>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-xl border border-dark-200 bg-white p-3 shadow-2xs transition-all duration-200 hover:border-primary-400 hover:shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                          <FontAwesomeIcon className="text-base" icon={t.icon} />
                        </div>
                        <div className="font-semibold text-dark-700 text-sm">{t.label}</div>
                      </div>
                      <Button
                        variant="neutral"
                        sub_variant="outline"
                        size="sm"
                        className="gap-1.5 px-3 py-1 font-semibold text-success-600 hover:border-success-500 hover:bg-success-50/40"
                        onClick={() => {
                          SetLoanDefaults(t.id);
                          SetState(stage, "add");
                        }}
                      >
                        <span>Create</span>
                        <FontAwesomeIcon className="text-xs" icon={faChevronRight} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* selected loan card in view / edit stage */}
        {show_loan_meta_card && selected_loan && (
          <div className={`flex flex-col gap-3 px-2 md:shrink-0 ${show_loan_command ? "w-full md:w-[360px]" : "w-full md:w-[420px]"}`}>
            <LoanCard plan={plan} loan={selected_loan} selected={true}>
              {stage === "view_loan" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold transition-colors ${
                      show_refinance ? "bg-primary-500 text-white" : "bg-dark-100 text-dark-600 hover:bg-dark-200"
                    }`}
                    onClick={() => setShowRefinance((v) => !v)}
                    title="Refinance Simulation"
                  >
                    <FontAwesomeIcon icon={faArrowsRotate} />
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-md bg-primary-50 border border-primary-200 px-2.5 py-1 text-xs font-bold text-primary-700 transition-colors hover:bg-primary-100"
                    onClick={() => SetState(stage, "edit", selected_loan_id)}
                    title="Edit Loan"
                  >
                    <FontAwesomeIcon icon={faPenToSquare} />
                    <span>Edit</span>
                  </button>
                </div>
              )}
            </LoanCard>

            {show_refinance && stage === "view_loan" && (() => {
              const analysis = ComputeRefinanceAnalysis(selected_loan, refi);
              const is_worth_it = analysis.net_savings > 0;
              return (
                <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-primary-400/40 bg-primary-50/40 p-3.5 shadow-2xs">
                  <div className="flex items-center gap-2 border-b border-primary-200/60 pb-2">
                    <FontAwesomeIcon icon={faArrowsRotate} className="text-base text-primary-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-dark-800">Refinance Simulator</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-dark-600">New Rate %</span>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        className={`${inputClass} !py-1.5 !text-sm`}
                        value={refi.new_rate}
                        onChange={(e) => setRefi((r: any) => ({ ...r, new_rate: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-dark-600">Tenure (Mo)</span>
                      <input
                        type="number"
                        min={1}
                        className={`${inputClass} !py-1.5 !text-sm`}
                        value={refi.new_tenure}
                        onChange={(e) => setRefi((r: any) => ({ ...r, new_tenure: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-dark-600">From Month</span>
                      <MonthPicker
                        plan_timestamp={plan.timestamp}
                        duration={plan?.duration || 600}
                        month={refi.refinance_month}
                        onChange={(m: number) => setRefi((r: any) => ({ ...r, refinance_month: m }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-dark-600">Charge ₹</span>
                      <input
                        type="number"
                        min={0}
                        className={`${inputClass} !py-1.5 !text-sm`}
                        value={refi.foreclosure_charge}
                        onChange={(e) => setRefi((r: any) => ({ ...r, foreclosure_charge: Number(e.target.value) }))}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 rounded-lg border border-dark-200 bg-white p-2.5 text-xs text-dark-700">
                    <div className="flex justify-between">
                      <span className="text-dark-500">Outstanding:</span>
                      <DisplayAmount className="font-bold text-dark-800" amount={analysis.outstanding_balance} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-500">EMI Change:</span>
                      <span className="font-semibold">
                        <DisplayAmount amount={analysis.old_emi} /> →{" "}
                        <DisplayAmount className="font-bold text-primary-600" amount={analysis.new_emi} />
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-dark-100 pt-1">
                      <span className="font-semibold text-dark-600">Net Savings:</span>
                      <span className={`font-bold ${is_worth_it ? "text-success-600" : "text-danger-500"}`}>
                        {is_worth_it ? "" : "−"}
                        <DisplayAmount amount={Math.abs(analysis.net_savings)} />
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="primary"
                      sub_variant="solid"
                      className="flex flex-1 justify-center gap-1.5 py-1.5 text-xs font-bold capitalize shadow-xs"
                      onClick={async () => {
                        if (analysis.refinance_month > selected_loan.end_month) {
                          alert("Refinance month should be within the loan tenure");
                          return;
                        }
                        const new_loan_id = GetRandomString(6);
                        const loan_accounts = (plan.loan_accounts || []).map((l: any) =>
                          l._id === selected_loan._id ? { ...l, end_month: analysis.refinance_month } : l
                        );
                        loan_accounts.push({
                          _id: new_loan_id,
                          title: `${selected_loan.title} (Refinanced)`,
                          principal_amount: Math.round(analysis.outstanding_balance),
                          interest_rate: refi.new_rate,
                          start_month: analysis.refinance_month + 1,
                          end_month: analysis.refinance_month + refi.new_tenure,
                          type: selected_loan.type,
                          ref_id: null,
                          deposit_to_bank: false,
                          prepayments: [],
                        });
                        update_plan_local({ ...plan, loan_accounts });
                        try {
                          await sync_plan(plan._id);
                        } catch (e: any) {
                          alert(`Saved locally but could not sync to the server: ${e?.message || e}`);
                        }
                        setShowRefinance(false);
                        setSelectedLoanId(new_loan_id);
                      }}
                    >
                      <FontAwesomeIcon icon={faArrowsRotate} />
                      Apply Refinance
                    </Button>
                    <Button variant="neutral" sub_variant="outline" size="sm" className="px-3 text-xs" onClick={() => setShowRefinance(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* desktop visual divider arrow */}
        {show_loan_command && (
          <div className="mx-2 hidden md:flex md:shrink-0 self-center">
            <FontAwesomeIcon className="text-2xl text-primary-300" icon={faChevronRight} />
          </div>
        )}

        {/* command column (add / edit form) */}
        {show_loan_command && (
          <div className="mb-10 flex h-full w-full flex-col md:mb-0 md:h-[580px] md:w-[380px] md:min-w-0 md:shrink-0 overflow-y-auto px-1 pb-24 md:pb-0">
            <LoanAccountCommand
              plan={plan}
              loan={mode === "edit" ? selected_loan : undefined}
              mode={mode}
              default_loan_title={default_loan_title}
              default_loan_type={default_loan_type}
              onChange={setLiveDraft}
              onDone={(r) => {
                if (r.action === "deleted") SetState(stage, "deleted");
                if (r.action === "added") {
                  if (mode === "add") {
                    SetState(stage, "back");
                    setTimeout(() => {
                      setStage("view_loan");
                      setSelectedLoanId(r.loan_id || "");
                      setStack((s) => [...s, "view_loan"]);
                    }, 500);
                  } else {
                    setSelectedLoanId(r.loan_id || "");
                  }
                }
              }}
            />
          </div>
        )}

        {/* right analytics & chart column */}
        <div className={`h-full flex-1 flex-col gap-3 transition-all duration-300 md:ml-auto md:border-l md:border-dark-100 md:pl-4 md:h-[580px] md:overflow-y-auto ${
          show_loan_command ? "hidden md:flex" : "flex"
        }`}>
          {/* loan list illustration state */}
          {stage === "loan_list" && (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <img
                src="/loan_graphics_bg_removed.png"
                alt="Loan Management illustration"
                className="max-h-[340px] w-auto object-contain drop-shadow-xs"
              />
              <h3 className="mt-4 text-base font-bold text-dark-700 sm:text-lg">Smart Loan & Debt Planner</h3>
              <p className="max-w-md text-xs text-dark-400 sm:text-sm mt-1">
                Configure amortizations, simulate prepayments and compare refinancing options to become debt-free faster.
              </p>
            </div>
          )}

          {/* view loan state: KPI metrics + Doughnut Chart + Amortization table */}
          {stage === "view_loan" && selected_loan && (
            <div className="flex w-full flex-col gap-4">
              {/* top KPI summary & doughnut */}
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <div className="flex flex-col justify-center rounded-xl border border-dark-200 bg-white p-2.5 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Loan Type</span>
                  <span className="mt-0.5 text-xs font-extrabold text-dark-800 sm:text-sm truncate" title={type_of_loan_being_edited}>{type_of_loan_being_edited}</span>
                </div>
                <div className="flex flex-col justify-center rounded-xl border border-dark-200 bg-white p-2.5 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Monthly EMI</span>
                  <DisplayAmount className="mt-0.5 text-xs font-extrabold text-primary-600 sm:text-sm md:text-base truncate" amount={emi_figures.monthly_emi} />
                </div>
                <div className="flex flex-col justify-center rounded-xl border border-dark-200 bg-white p-2.5 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Interest Payable</span>
                  <DisplayAmount className="mt-0.5 text-xs font-extrabold text-amber-600 sm:text-sm md:text-base truncate" amount={emi_figures.total_interest_paid} />
                </div>
                <div className="flex flex-col justify-center rounded-xl border border-dark-200 bg-white p-2.5 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Total Payable</span>
                  <DisplayAmount className="mt-0.5 text-xs font-extrabold text-dark-800 sm:text-sm md:text-base truncate" amount={emi_figures.total_payable} />
                </div>
              </div>

              {/* amortization schedule table */}
              <LoanAmortizationTable plan={plan} loan={selected_loan} />
            </div>
          )}

          {/* add / edit loan state: live metrics & doughnut chart preview */}
          {["add_loan", "edit_loan"].includes(stage) && (
            <div className="flex w-full flex-col gap-3.5 rounded-xl border border-dark-200 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-2 border-b border-dark-100 pb-2.5">
                <FontAwesomeIcon icon={faChartPie} className="text-base text-primary-500" />
                <span className="text-sm font-bold text-dark-800">Live Repayment Breakdown</span>
              </div>

              {emi_chart_data.datasets.length > 0 ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: 3 metric rows */}
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between rounded-lg border border-dark-100 bg-dark-50 p-2.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-dark-500">Monthly EMI</span>
                      <DisplayAmount className="text-sm font-bold text-primary-600 sm:text-base" amount={emi_figures.monthly_emi} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-dark-100 bg-dark-50 p-2.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-dark-500">Total Interest</span>
                      <DisplayAmount className="text-sm font-bold text-amber-600 sm:text-base" amount={emi_figures.total_interest_paid} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-dark-100 bg-dark-50 p-2.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-dark-500">Total (P + I)</span>
                      <DisplayAmount className="text-sm font-bold text-dark-800 sm:text-base" amount={emi_figures.total_payable} />
                    </div>
                  </div>

                  {/* Right: Doughnut Chart & Legend */}
                  <div className="flex flex-col items-center justify-center shrink-0 sm:pl-2">
                    <MyChart chart_type="doughnut" labels={emi_chart_data.labels} dataset={emi_chart_data.datasets} height={150} width={150} />
                    <div className="mt-2 flex flex-col gap-1 text-xs font-medium text-dark-600">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-primary-400"></span>
                        <span>Principal:</span>
                        <DisplayAmount className="font-bold text-dark-800" amount={loan_being_edited.principal_amount || 0} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                        <span>Interest:</span>
                        <DisplayAmount className="font-bold text-amber-700" amount={emi_figures.total_interest_paid} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-dark-400">
                  Enter principal amount and interest rate to see breakdown
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

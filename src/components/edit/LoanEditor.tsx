"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { MyChart } from "@/components/ui/MyChart";
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

/** Port of loan_account/LoanCard.vue */
function LoanCard({ plan, loan, children }: { plan: any; loan: any; children?: React.ReactNode }) {
  const loan_type_options = (useFiPlanStore((s) => s.common_collection) as any)?.loan_type || [];
  const start_date = GetMMYYYY(loan.start_month, plan?.timestamp);
  const end_date = GetMMYYYY(loan.end_month, plan?.timestamp);
  const duration = loan.end_month - loan.start_month + 1;
  const emi = ComputeLoanEMI(loan.principal_amount, loan.interest_rate, duration);
  const loan_type = loan_type_options.find((o: any) => o.value === loan.type)?.text;
  return (
    <div className="flex flex-col rounded-lg border border-l-2 border-l-primary-300 bg-dark-50 bg-gradient-to-t p-2 text-dark-200 shadow-sm hover:shadow-md">
      <div className="flex justify-between">
        <div className="mt-1 flex flex-col justify-between">
          <p className="w-full truncate text-[12px] text-dark-200 first-letter:uppercase sm:text-base md:w-[15rem]">
            {loan.title}
          </p>
          <div className="flex gap-1 text-xs text-dark-500 sm:text-sm">
            <div>{loan_type}</div>
            <DisplayAmount className="self-center font-medium" amount={loan.principal_amount} />
            <div className="lowercase">@ {loan.interest_rate}% p.a.</div>
          </div>
          <div className="flex w-fit gap-1 rounded-md py-1 text-[9px] uppercase text-dark-100 sm:text-sm">
            <div className="font-bold">{start_date}</div>
            <span> to </span>
            <div className="font-bold">{end_date}</div>
          </div>
        </div>
        <div className="ml-auto text-[10px] text-dark-500 sm:text-xs">
          <div className="flex w-fit content-center gap-1 self-center rounded-md">
            <span className="self-center text-dark-500"> EMI </span>
            <DisplayAmount className="self-center" amount={emi} />
            <span className="flex w-[2em] justify-center self-center text-lg text-danger-300">{children}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Port of loan_account/LoanAccountCommand.vue */
function LoanAccountCommand({
  plan,
  loan,
  mode,
  default_loan_title,
  default_loan_type,
  onDone,
}: {
  plan: any;
  loan?: any;
  mode: "add" | "edit";
  default_loan_title?: string;
  default_loan_type?: number;
  onDone: (result: { action: string; loan_id?: string }) => void;
}) {
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);
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
        deposit_to_bank: loan.deposit_to_bank || false,
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
        loading: false,
        deleting: false,
      }));
      setDurationInMonth(1);
    }
  }, [loan, default_loan_title, default_loan_type]);

  function updateDuration(n: number) {
    setDurationInMonth(n);
    setState((s: any) => ({ ...s, end_month: n + s.start_month - 1 }));
  }
  function updateStartMonth(m: number) {
    setState((s: any) => ({ ...s, start_month: m, end_month: duration_in_month + m - 1 }));
  }

  async function SaveChanges() {
    const error_messages: string[] = [];
    if (!state.title) error_messages.push("title is required");
    if (!state.principal_amount) error_messages.push("principal amount is required");
    if (!state.interest_rate) error_messages.push("interest rate is required");
    if (!(state.end_month >= state.start_month)) error_messages.push("end month should be >= start month");
    if (error_messages.length) {
      alert(error_messages.join("\n"));
      return;
    }
    const loan_obj: any = {
      _id: mode === "add" ? GetRandomString(6) : loan?._id,
      title: state.title,
      principal_amount: state.principal_amount,
      start_month: state.start_month,
      end_month: state.end_month,
      interest_rate: state.interest_rate,
      type: state.type,
      ref_id: state.ref_id,
      deposit_to_bank: state.deposit_to_bank,
    };
    setState((s: any) => ({ ...s, loading: true }));
    const loan_accounts = [...(plan.loan_accounts || [])];
    if (mode === "add") loan_accounts.push(loan_obj);
    else {
      const idx = loan_accounts.findIndex((l: any) => l._id === loan_obj._id);
      if (idx >= 0) loan_accounts[idx] = loan_obj;
    }
    update_plan_local({ ...plan, loan_accounts });
    setState((s: any) => ({ ...s, loading: false }));
    onDone({ action: "added", loan_id: loan_obj._id });
  }

  async function DeleteLoan() {
    setState((s: any) => ({ ...s, deleting: true }));
    const loan_accounts = (plan.loan_accounts || []).filter((l: any) => l._id !== loan?._id);
    update_plan_local({ ...plan, loan_accounts });
    setState((s: any) => ({ ...s, deleting: false }));
    onDone({ action: "deleted" });
  }

  const inputClass =
    "relative border-[1.6px] rounded-[.5rem] px-3 py-[.25rem] w-full shadow-sm placeholder-dark-500 text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-300 focus:shadow-primary-500 bg-dark-50 flex justify-between transition-all duration-200 text-[1.25rem] appearance-none";

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex gap-3 font-medium text-dark-600">
        <div className="flex gap-3 self-center">
          <FontAwesomeIcon icon={faLandmarkFlag} className="self-center text-2xl text-primary-500" />
          <span className="self-center">Configure Loan parameters </span>
        </div>
        {mode === "edit" && (
          <div className="ml-auto flex px-2 py-1 text-danger-500" onClick={DeleteLoan}>
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
      <div className="flex">
        <div className="w-full">
          <span className="text-sm text-dark-300">Description</span>
          <input
            type="text"
            name="Description"
            id="description"
            value={state.title}
            onChange={(e) => setState((s: any) => ({ ...s, title: e.target.value }))}
            style={{ fontSize: "1.25rem" }}
            className={`${inputClass} mt-1`}
          />
        </div>
      </div>
      <div className="flex justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-dark-300">Loan type</span>
          <div className="flex">
            {(loan_type_options as any[]).map((option, index) => (
              <button
                key={index}
                className={`border-b-2 border-t-2 border-dark-300 bg-dark-50 p-1 text-xs text-dark-400 first:rounded-l-md first:border-l-2 first:border-r-0 last:rounded-r-md last:border-r-2 ${
                  state.type === option.value ? "bg-dark-200 text-dark-50" : ""
                }`}
                onClick={() => setState((s: any) => ({ ...s, type: option.value }))}
              >
                {option.text}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-between">
        <div className="flex flex-col gap-1 py-2">
          <div className="flex">
            <input
              id="disabled-checked-checkbox"
              type="checkbox"
              checked={state.deposit_to_bank}
              onChange={(e) => setState((s: any) => ({ ...s, deposit_to_bank: e.target.checked }))}
              className="h-4 w-4 self-center rounded border-gray-300 bg-gray-100 accent-primary-400"
            />
            <label htmlFor="disabled-checked-checkbox" className="ml-2 self-center text-sm text-dark-300">
              Direct deposit to savings account
            </label>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-row gap-3">
        <div className="w-full">
          <div className="flex justify-between">
            <span className="self-center text-sm text-dark-300">Principal Amount</span>
            <DisplayAmount className="self-center text-xs" amount={state.principal_amount} />
          </div>
          <input
            type="number"
            value={state.principal_amount}
            onChange={(e) => setState((s: any) => ({ ...s, principal_amount: Number(e.target.value) }))}
            required
            min={1}
            style={{ fontSize: "1.25rem" }}
            className={`${inputClass} mt-1`}
          />
        </div>
      </div>
      <div className="flex w-full flex-row gap-3">
        <div className="w-full">
          <span className="text-sm text-dark-300">Interest Rate %</span>
          <input
            style={{ fontSize: "1.1rem" }}
            className={inputClass}
            type="number"
            min={1}
            max={100}
            name="Interest rates"
            value={state.interest_rate}
            onChange={(e) => setState((s: any) => ({ ...s, interest_rate: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="flex grow flex-col gap-1 transition-all duration-200">
        <span className="text-sm text-dark-300">Starting from</span>
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <FontAwesomeIcon icon={faFileLines} className="self-center text-sm text-dark-400" />
          </div>
          <input type="text" readOnly className="w-full rounded border border-[#dddddd] bg-white py-1.5 pl-[35px] pr-3 text-base text-[#212121]" value={GetMMYYYY(state.start_month, plan.timestamp)} />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="w-full">
          <span className="text-sm text-dark-300">Tenure (Months)</span>
          <input
            style={{ fontSize: "1.25rem" }}
            type="number"
            min={1}
            className={inputClass}
            name="Start Month"
            value={duration_in_month}
            onChange={(e) => updateDuration(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="mt-3 flex gap-3">
        <Button variant="primary" sub_variant="solid" className="flex grow py-2 capitalize" onClick={SaveChanges}>
          {state.loading ? (
            <svg className="-ml-1 h-[20px] w-[20px] animate-spin self-center text-primary-50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
  );
}

/** Port of loan_editor/LoanEditor.vue — the Loan Manager editor. */
export function LoanEditor({ plan_id }: { plan_id: string }) {
  const router = useRouter();
  const plans = useFiPlanStore((s) => s.plans);
  const plan_synced_map = useFiPlanStore((s) => s.plan_synced_map);
  const sync_plan = useFiPlanStore((s) => s.sync_plan);

  const plan = plans.find((p) => p._id === plan_id);

  const [stack, setStack] = useState<string[]>(["loan_list"]);
  const [stage, setStage] = useState("loan_list");
  const [selected_loan_id, setSelectedLoanId] = useState("");
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [default_loan_title, setDefaultLoanTitle] = useState("loan");
  const [default_loan_type, setDefaultLoanType] = useState(4);
  const [plan_sync_inprogress, setPlanSyncInprogress] = useState(false);

  const loan_list = useMemo(() => {
    if (!plan) return [];
    return [...(plan.loan_accounts || [])].sort((a: any, b: any) => a.start_month - b.start_month);
  }, [plan]);

  const selected_loan = loan_list.find((l: any) => l._id === selected_loan_id);
  const loan_being_edited = selected_loan || {
    title: default_loan_title,
    principal_amount: 0,
    start_month: 1,
    end_month: 1,
    interest_rate: 0,
    type: default_loan_type,
  };

  const is_plan_synced = plan_synced_map[plan_id] !== false;
  const show_loan_list = ["loan_list", "add_loan"].includes(stage);
  const show_loan_meta_card = ["view_loan", "edit_loan"].includes(stage) && !!selected_loan;
  const show_loan_command = ["add_loan", "edit_loan"].includes(stage);

  // EMI figures (port of LoanEngine amortization + EmiScheduleTOChartData)
  const emi_figures = useMemo(() => {
    const loan_obj: any = loan_being_edited;
    const tenure = Math.max(1, loan_obj.end_month - loan_obj.start_month + 1);
    const emi = ComputeLoanEMI(loan_obj.principal_amount || 0, loan_obj.interest_rate || 0, tenure);
    const total_interest_paid = (loan_obj.principal_amount || 0) > 0 ? emi * tenure - (loan_obj.principal_amount || 0) : 0;
    return { monthly_emi: emi, total_interest_paid, total_payable: (loan_obj.principal_amount || 0) + total_interest_paid };
  }, [loan_being_edited]);

  const type_of_loan_being_edited = (useFiPlanStore((s) => s.common_collection) as any)?.loan_type?.find(
    (o: any) => o.value === loan_being_edited.type
  )?.text || "";

  const emi_chart_data = useMemo(() => {
    const labels = ["Principal AMount", "Total Interest"];
    const datasets: any[] = [];
    if (loan_being_edited.principal_amount) {
      datasets.push({
        data: [loan_being_edited.principal_amount, emi_figures.total_interest_paid],
        type: "doughnut",
        label: "Breakup",
        backgroundColor: [
          typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue("--color-primary-300") : "",
          typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue("--color-warning-600") : "",
        ],
        pointStyle: "circle",
        pointRadius: 0,
        pointHoverRadius: 5,
        borderRadius: { topLeft: 3, topRight: 3 },
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

  // LOAN_CONSTANTS.TYPE: home=1, car=2, personal=3, credit=4
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
    loan_list: "loan list ",
    view_loan: selected_loan ? selected_loan.title : "",
    add_loan: "Add ",
    edit_loan: "Edit",
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
    { id: "car", icon: faCar, label: "Car Loan" },
    { id: "credit", icon: faCreditCard, label: "Credit Card" },
    { id: "personal", icon: faUserTie, label: "Personal Loan" },
    { id: "home", icon: faHouse, label: "Home Loan" },
  ];

  return (
    <div className="flex w-full flex-col justify-between gap-3 md:min-h-[570px]">
      {/* breadcrumb bar */}
      <div className="fixed bottom-0 z-20 flex w-full gap-2 border-b-2 border-t-2 bg-dark-50 p-1 pb-2 pt-2 md:relative md:z-0 md:mt-0 md:border-t-0 md:bg-transparent md:pb-2 md:pt-0">
        <div className="flex w-fit cursor-pointer gap-2 px-3 py-1 text-primary-600" onClick={() => SetState(stage, "back")}>
          <FontAwesomeIcon className="self-center text-xl font-bold" icon={faArrowLeft} />
        </div>
        <div className="h-full self-center rounded-md border-2 bg-primary-300" />
        {breadcrumb_data.map((btext: string, index: number) => (
          <div
            key={index}
            className="self-center font-medium text-dark-400 first-letter:uppercase after:ml-2 after:font-medium after:text-dark-200 after:content-['/'] last:after:content-[''] sm:text-xl"
          >
            {btext.substring(0, 20)} {btext?.length > 20 ? "..." : ""}
          </div>
        ))}
        <div className="ml-auto flex w-fit cursor-pointer gap-2 px-3 py-1 text-dark-600" onClick={() => router.back()}>
          <FontAwesomeIcon className="self-center text-xl font-bold" icon={faXmark} />
        </div>
      </div>

      <div className={`flex h-full gap-6 md:mt-0 md:flex-row md:gap-0 ${stage === "loan_list" ? "flex-col" : "flex-col-reverse"}`}>
        {/* loan list */}
        {show_loan_list && (
          <div className={`flex-col snap-y md:w-1/3 md:shrink-0 ${stage !== "loan_list" ? "hidden md:flex" : "flex"}`}>
            {loan_list.length > 0 && (
              <div className="overflow-x-hidden overflow-y-scroll pl-2 pr-1 md:h-[480px]">
                {loan_list.map((loan_account: any) => (
                  <div key={loan_account._id} className="mb-3 snap-start rounded-md capitalize shadow-sm transition-all duration-200">
                    <div className={`flex justify-between gap-3 rounded-t-md ${selected_loan_id === loan_account._id ? "shadow-md" : ""}`}>
                      <div className="flex w-full flex-col">
                        <LoanCard plan={plan} loan={loan_account}>
                          <div className="ml-auto self-center px-3 text-dark-300" onClick={() => SetState(stage, "view", loan_account._id)}>
                            <FontAwesomeIcon className={`self-center ${selected_loan_id === loan_account._id ? "text-primary-300" : "text-dark-300"}`} icon={faChevronRight} />
                          </div>
                        </LoanCard>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {loan_list.length <= 4 && loan_list.length !== 0 && (
              <div className="mt-auto flex justify-center rounded-b-md py-3">
                <Button variant="neutral" sub_variant="outline" size="lg" className="w-full px-3 py-1 text-success-400 hover:border-success-400" onClick={() => SetState(stage, "add")}>
                  <FontAwesomeIcon className="self-center" icon={faPlus} />
                  Add a loan
                </Button>
              </div>
            )}
            <hr className="w-full" />
            {loan_list.length < 3 && loan_list.length > 0 && !is_plan_synced && (
              <div className="mt-auto flex w-full flex-col justify-between gap-3 rounded-b-md py-3">
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
                    <FontAwesomeIcon icon={faCloudArrowUp} className={`self-center font-bold md:text-lg ${!is_plan_synced ? "animate-pulse" : ""}`} />
                  </Button>
                </div>
              </div>
            )}
            {/* empty state: loan templates */}
            {loan_list.length === 0 && stage === "loan_list" && (
              <div className="mt-auto flex flex-col justify-center gap-3 self-center rounded-b-md px-3 py-3">
                {templates.map((t) => (
                  <div key={t.id} className="flex grow gap-3 rounded-lg border p-2 px-3 py-5 shadow-sm">
                    <FontAwesomeIcon className="self-center text-xl text-dark-500" icon={t.icon} />
                    <div className="flex self-center justify-between text-dark-500">{t.label}</div>
                    <Button
                      variant="neutral"
                      sub_variant="outline"
                      size="sm"
                      className="ml-auto w-fit self-center px-3 py-1 text-success-400 hover:border-success-400"
                      onClick={() => {
                        SetLoanDefaults(t.id);
                        SetState(stage, "add");
                      }}
                    >
                      Create
                      <FontAwesomeIcon className="self-center" icon={faChevronRight} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* selected loan meta card */}
        {show_loan_meta_card && selected_loan && (
          <div className="flex flex-col gap-2 rounded-md border-dashed px-2 md:w-[470px]">
            <LoanCard plan={plan} loan={selected_loan}>
              <div className="ml-auto self-center px-3 text-dark-300" onClick={() => SetState(stage, "edit", selected_loan_id)}>
                <FontAwesomeIcon icon={faPenToSquare} className="self-center" />
              </div>
              {stage === "edit_loan" && (
                <div className="self-center px-3 text-dark-300" onClick={() => SetState(stage, "back")}>
                  <FontAwesomeIcon className="self-center" icon={faChevronLeft} />
                  back
                </div>
              )}
            </LoanCard>
          </div>
        )}

        {/* command column */}
        {show_loan_command && (
          <div className="mb-12 flex h-full w-full flex-col md:mb-0 md:h-[580px] md:w-[370px] md:min-w-0">
            <LoanAccountCommand
              plan={plan}
              loan={mode === "edit" ? selected_loan : undefined}
              mode={mode}
              default_loan_title={default_loan_title}
              default_loan_type={default_loan_type}
              onDone={(r) => {
                if (r.action === "deleted") SetState(stage, "deleted");
                if (r.action === "added") {
                  SetState(stage, "back");
                  setTimeout(() => {
                    setStage("view_loan");
                    setSelectedLoanId(r.loan_id || "");
                    setStack((s) => [...s, "view_loan"]);
                  }, 1000);
                }
              }}
            />
          </div>
        )}

        {/* chart column */}
        <div className="ml-3 flex h-full gap-2 md:border-l-2">
          {/* loan graphics in list stage (matches original show_loan_graphics) */}
          {stage === "loan_list" && (
            <div className="flex grow">
              <img src="/loan_graphics_bg_removed.png" alt="" className="ml-auto aspect-auto w-auto" />
            </div>
          )}
          {["add_loan", "edit_loan"].includes(stage) && (
            <div className="flex w-full flex-col gap-3 rounded-lg p-6 px-0 md:px-3 md:p-3">
              <div className="flex flex-col-reverse self-center md:flex-row">
                <div className="flex w-full flex-row justify-between gap-3 md:w-[200px] md:flex-col md:justify-center">
                  <div className="grid h-[80px] place-content-center rounded-md border bg-dark-50 mb-auto w-full">
                    <span className="self-center text-sm font-bold text-dark-300 sm:text-2xl">{type_of_loan_being_edited}</span>
                  </div>
                  <div className="grid h-[80px] place-content-start rounded-md border bg-dark-50 md:place-content-center w-full">
                    <div className="flex flex-col-reverse justify-center md:flex-col">
                      <span className="self-center text-center text-xs font-semibold text-dark-200">Loan EMI</span>
                      <DisplayAmount className="self-center text-lg font-bold text-dark-500" amount={emi_figures.monthly_emi} />
                    </div>
                  </div>
                  <div className="grid h-[80px] place-content-start rounded-md border bg-dark-50 md:place-content-center w-full">
                    <div className="flex flex-col-reverse justify-center md:flex-col">
                      <span className="self-center text-center text-xs font-semibold text-dark-200">Total Interest Payable</span>
                      <DisplayAmount className="self-center text-lg font-bold text-dark-500" amount={emi_figures.total_interest_paid} />
                    </div>
                  </div>
                  <div className="grid h-[80px] place-content-start rounded-md border bg-dark-50 md:place-content-center w-full">
                    <div className="flex flex-col-reverse justify-center md:flex-col">
                      <span className="self-center text-center text-xs font-semibold text-dark-200">Total Payable</span>
                      <span className="self-center text-center text-xs font-semibold text-dark-200">(Principal + Interest)</span>
                      <DisplayAmount className="self-center text-lg font-bold text-dark-500" amount={emi_figures.total_payable} />
                    </div>
                  </div>
                </div>
                {emi_chart_data.datasets.length > 0 && (
                  <div className="self-center px-3 opacity-70">
                    <MyChart chart_type="doughnut" labels={emi_chart_data.labels} dataset={emi_chart_data.datasets} height={150} width={150} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

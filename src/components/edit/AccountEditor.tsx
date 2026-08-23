"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { GetRandomString } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faXmark,
  faChevronRight,
  faLandmarkFlag,
  faTrashCan,
  faPlus,
  faVault,
  faPiggyBank,
  faChartLine,
  faCheck,
  faArrowsRotate,
} from "@fortawesome/free-solid-svg-icons";

const CATEGORY_META: Record<string, { label: string; icon: any; color: string; borderClass: string; badgeClass: string }> = {
  e: {
    label: "Emergency Bucket",
    icon: faVault,
    color: "text-primary-600",
    borderClass: "border-l-primary-400",
    badgeClass: "bg-primary-50 text-primary-700",
  },
  s: {
    label: "Savings Bucket",
    icon: faPiggyBank,
    color: "text-amber-600",
    borderClass: "border-l-amber-400",
    badgeClass: "bg-amber-50 text-amber-700",
  },
  i: {
    label: "Investment Bucket",
    icon: faChartLine,
    color: "text-emerald-600",
    borderClass: "border-l-emerald-400",
    badgeClass: "bg-emerald-50 text-emerald-700",
  },
};

/** Lucid Account Card styled identically to LoanCard and AssetCard */
function AccountCard({
  account,
  selected = false,
  onClick,
  children,
}: {
  account: any;
  selected?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const meta = CATEGORY_META[account.category] || CATEGORY_META.e;

  return (
    <div
      onClick={onClick}
      className={`flex flex-col rounded-xl border bg-white p-3.5 text-dark-700 shadow-xs transition-all duration-200 hover:shadow-md ${
        selected
          ? "border-primary-400 border-l-4 border-l-primary-500 ring-2 ring-primary-400/20"
          : `border-dark-200 border-l-4 ${meta.borderClass}`
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <FontAwesomeIcon icon={meta.icon} className="text-xs" />
            </div>
            <p className="truncate text-sm font-bold text-dark-800 first-letter:uppercase sm:text-base">
              {account.title}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-dark-500 sm:text-sm font-medium">
            <span className="rounded-md bg-dark-100/70 px-1.5 py-0.5 text-[11px] font-semibold text-dark-700">
              {meta.label}
            </span>
            <span className="text-dark-300">·</span>
            <DisplayAmount className="self-center font-bold text-dark-800" amount={account.init_balance} />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            <span>+{account.roi}%</span>
            <span className="text-[9px] font-normal uppercase text-emerald-600">ROI</span>
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

function AccountCommand({
  plan,
  account,
  mode,
  onDone,
}: {
  plan: any;
  account?: any;
  mode: "add" | "edit";
  onDone: (result: { action: string; account_id?: string }) => void;
}) {
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);
  const [state, setState] = useState<any>({
    title: "Emergency Runway",
    init_balance: 0,
    category: "e",
    default_investment_priority: 1,
    parent_id: null,
    type: "a",
    active: true,
    loading: false,
    deleting: false,
    roi: 3,
  });

  useEffect(() => {
    if (account) {
      setState({
        title: account.title,
        init_balance: account.init_balance,
        category: account.category,
        default_investment_priority: account.default_investment_priority || 1,
        parent_id: account.parent_id || null,
        type: account.type || "a",
        active: account.active ?? true,
        roi: account.roi || 0,
        loading: false,
        deleting: false,
      });
    } else {
      setState({
        title: "Liquid Account",
        init_balance: 0,
        category: "e",
        default_investment_priority: 1,
        parent_id: null,
        type: "a",
        active: true,
        roi: 3,
        loading: false,
        deleting: false,
      });
    }
  }, [account]);

  async function SaveChanges() {
    const account_obj: any = {
      _id: mode === "add" ? GetRandomString(6) : account?._id,
      title: state.title,
      init_balance: state.init_balance,
      category: state.category,
      default_investment_priority: state.default_investment_priority,
      parent_id: state.parent_id,
      type: state.type,
      roi: state.roi,
      active: state.active,
    };
    setState((s: any) => ({ ...s, loading: true }));
    const account_list = [...(plan.account_list || [])];
    if (mode === "add") account_list.push(account_obj);
    else {
      const idx = account_list.findIndex((a: any) => a._id === account_obj._id);
      if (idx >= 0) account_list[idx] = account_obj;
    }
    update_plan_local({ ...plan, account_list });
    setState((s: any) => ({ ...s, loading: false }));
    onDone({ action: "edited", account_id: account_obj._id });
  }

  async function DeleteAccount() {
    if (!window.confirm(`Are you sure you want to delete "${state.title}"?`)) return;
    setState((s: any) => ({ ...s, deleting: true }));
    const account_list = (plan.account_list || []).filter((a: any) => a._id !== account?._id);
    update_plan_local({ ...plan, account_list });
    setState((s: any) => ({ ...s, deleting: false }));
    onDone({ action: "deleted" });
  }

  const meta = CATEGORY_META[state.category] || CATEGORY_META.e;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-3.5 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-2.5 border-b border-dark-100 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <FontAwesomeIcon icon={meta.icon || faLandmarkFlag} className="text-sm" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-dark-800">
              {mode === "add" ? "Add Money Account" : `Configure ${state.title}`}
            </h3>
            <p className="text-xs text-dark-400">Set account balance and interest returns</p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>Account Title</span>
          <input
            type="text"
            value={state.title}
            onChange={(e) => setState((s: any) => ({ ...s, title: e.target.value }))}
            placeholder="e.g. HDFC Savings A/C"
            required
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Initial Balance (₹)</span>
            <input
              type="number"
              min={0}
              value={state.init_balance}
              onChange={(e) => setState((s: any) => ({ ...s, init_balance: Number(e.target.value) }))}
              required
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Annual ROI (%/yr)</span>
            <input
              type="number"
              step="0.1"
              min={0}
              value={state.roi}
              onChange={(e) => setState((s: any) => ({ ...s, roi: Number(e.target.value) }))}
              required
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>Allocation Category</span>
          <select
            value={state.category}
            onChange={(e) => setState((s: any) => ({ ...s, category: e.target.value }))}
            className={inputClass}
          >
            <option value="e">Emergency Bucket (Liquid Safety Net)</option>
            <option value="s">Savings Bucket (Short-term Goals)</option>
            <option value="i">Investment Bucket (Growth / Capital)</option>
          </select>
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
          <span>{mode === "add" ? "Add Account" : "Save Changes"}</span>
        </Button>

        {mode === "edit" && (
          <Button
            variant="danger"
            sub_variant="outline"
            size="lg"
            className="px-4 py-2.5 font-bold text-danger-600 hover:bg-danger-50"
            onClick={DeleteAccount}
            title="Delete Account"
          >
            <FontAwesomeIcon icon={faTrashCan} />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Port of account_editor/AccountEditor.vue */
export function AccountEditor({ plan_id, selected_account_id }: { plan_id: string; selected_account_id?: string }) {
  const router = useRouter();
  const plans = useFiPlanStore((s) => s.plans);
  const plan = plans.find((p) => p._id === plan_id);

  const [stack, setStack] = useState<string[]>(["account_list"]);
  const [stage, setStage] = useState("account_list");
  const [account_editor_mode, setAccountEditorMode] = useState<"add" | "edit">("add");
  const [selected_id, setSelectedId] = useState("");
  const [account_being_edited, setAccountBeingEdited] = useState<any>(null);

  const seq_map = { e: 1, s: 2, i: 3 } as Record<string, number>;
  const account_list = useMemo(() => {
    if (!plan) return [];
    return [...(plan.account_list || [])].sort((a: any, b: any) => (seq_map[a.category] || 9) - (seq_map[b.category] || 9));
  }, [plan]);

  const selected_account = account_list.find((a: any) => a._id === selected_id);

  useEffect(() => {
    if (selected_account_id) {
      setStage("edit_account");
      setAccountEditorMode("edit");
      setSelectedId(selected_account_id);
      setStack(["account_list", "edit_account"]);
      setAccountBeingEdited(account_list.find((a: any) => a._id === selected_account_id) || null);
    }
  }, [selected_account_id, account_list]);

  function SetState(current_state: string, action: string, account_id = "") {
    if (current_state === "account_list" && action === "back") router.back();
    if (current_state === "account_list" && action === "add") {
      setStage("add_account");
      setAccountEditorMode("add");
      setSelectedId("");
      setStack((s) => [...s, "add_account"]);
      setAccountBeingEdited(null);
    }
    if (current_state === "account_list" && action === "edit") {
      setStage("edit_account");
      setAccountEditorMode("edit");
      setSelectedId(account_id);
      setStack((s) => [...s, "edit_account"]);
      setAccountBeingEdited(account_list.find((a: any) => a._id === account_id) || null);
    }
    if ((current_state === "edit_account" || current_state === "add_account") && action === "back") {
      setStage("account_list");
      setSelectedId("");
      setStack(["account_list"]);
      setAccountBeingEdited(null);
    }
    if (action === "deleted") {
      setStage("account_list");
      setSelectedId("");
      setStack(["account_list"]);
      setAccountBeingEdited(null);
    }
  }

  const PANEL_STAGES_LABELS: Record<string, string> = {
    account_list: "Account List",
    add_account: "Add Account",
    edit_account: account_being_edited ? account_being_edited.title : "Edit Account",
  };
  const breadcrumb_data = stack.map((s) => PANEL_STAGES_LABELS[s] || s);

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  const show_account_list = stage === "account_list" || stage === "add_account" || stage === "edit_account";
  const show_account_command = stage === "add_account" || stage === "edit_account";

  return (
    <div className="flex w-full flex-col justify-between gap-3 md:min-h-[570px] md:w-[99vw]">
      {/* Breadcrumb Bar (Styled identically to LoanEditor & AssetEditor) */}
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
        {/* Left Column: Account List */}
        {show_account_list && (
          <div
            className={`flex w-full flex-col md:w-[380px] lg:w-[420px] md:shrink-0 ${
              stage !== "account_list" ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="flex flex-col gap-3 overflow-x-hidden overflow-y-auto px-0 md:pl-2 md:pr-2 max-h-[calc(100vh-140px)] md:max-h-[640px]">
              {account_list.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-dark-300 bg-white p-6 text-center shadow-2xs">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dark-100 text-dark-400 mb-2">
                    <FontAwesomeIcon icon={faVault} className="text-xl" />
                  </div>
                  <h4 className="text-sm font-bold text-dark-700">No Accounts Added</h4>
                  <p className="mt-1 text-xs text-dark-400 max-w-[240px]">
                    Create a savings or liquid cash bucket to manage your money flow.
                  </p>
                </div>
              )}

              {account_list.map((account: any) => (
                <AccountCard
                  key={account._id}
                  account={account}
                  selected={selected_id === account._id}
                  onClick={() => SetState(stage, "edit", account._id)}
                >
                  <button
                    type="button"
                    className="p-1 text-dark-400 hover:text-primary-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      SetState(stage, "edit", account._id);
                    }}
                    title="Edit Account"
                  >
                    <FontAwesomeIcon
                      className={selected_id === account._id ? "text-primary-500" : "text-dark-400"}
                      icon={faChevronRight}
                    />
                  </button>
                </AccountCard>
              ))}

              <div className="pt-1 pb-4">
                <Button
                  variant="neutral"
                  sub_variant="outline"
                  size="lg"
                  className="w-full justify-center gap-2 py-2 font-semibold text-primary-600 hover:border-primary-500 hover:bg-primary-50/50"
                  onClick={() => SetState(stage, "add")}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span>Add an account</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Right Column: Account Command Form */}
        {show_account_command && (
          <div className="flex w-full flex-1 max-w-xl flex-col overflow-y-auto px-1 md:px-0 max-h-[calc(100vh-140px)] md:max-h-[640px] pb-12">
            <AccountCommand
              plan={plan}
              account={account_editor_mode === "edit" ? selected_account : undefined}
              mode={account_editor_mode}
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


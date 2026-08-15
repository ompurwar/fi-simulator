"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { GetRandomString } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faXmark, faPenToSquare, faChevronRight, faChevronLeft, faLandmarkFlag, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { faFileLines } from "@fortawesome/free-regular-svg-icons";

/** Port of account/AccountCard.vue */
function AccountCard({ account, children, selected }: { account: any; children?: React.ReactNode; selected?: boolean }) {
  return (
    <div
      className={`flex flex-col rounded-lg border border-l-2 border-l-primary-300 bg-dark-50 bg-gradient-to-t p-2 text-dark-200 shadow-sm hover:shadow-md ${
        selected ? "shadow-md" : ""
      }`}
    >
      <div className="flex justify-between">
        <div className="mt-1 flex flex-col justify-between">
          <p className="w-full truncate text-[12px] text-dark-200 first-letter:uppercase sm:text-base md:w-[15rem]">{account.title}</p>
          <DisplayAmount className="w-fit self-center- font-medium sm:text-xl" notation="standard" amount={account.init_balance} />
          <div className="flex w-fit gap-1 rounded-md py-1 text-[9px] uppercase text-dark-100 sm:text-sm"></div>
        </div>
        <div className="ml-auto text-[10px] text-dark-500 sm:text-xs">
          <div className="flex w-fit content-center gap-1 self-center rounded-md">
            <div className="self-center text-xs lowercase">
              {account.roi}% <span className="uppercase">ROI</span>
            </div>
            <span className={`flex w-[2em] justify-center self-center text-lg ${account.category === "i" ? "text-success-300" : "text-danger-300"}`}>
              {children}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Port of account/AccountCommand.vue (category/type selects are commented out in the original) */
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
    roi: 3,
  });

  useEffect(() => {
    if (account) {
      setState((s: any) => ({
        ...s,
        title: account.title,
        init_balance: account.init_balance,
        category: account.category,
        default_investment_priority: account.default_investment_priority,
        parent_id: account.parent_id,
        type: account.type,
        active: account.active,
        roi: account.roi,
        loading: false,
      }));
    } else {
      setState((s: any) => ({
        ...s,
        title: "Emergency Runway",
        init_balance: 0,
        category: "e",
        default_investment_priority: 1,
        parent_id: null,
        type: "a",
        active: true,
        roi: 3,
        loading: false,
      }));
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

  const inputClass =
    "relative border-[1.6px] rounded-[.5rem] px-3 py-[.25rem] w-full shadow-sm placeholder-dark-500 text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-300 focus:shadow-primary-500 bg-dark-50 flex justify-between transition-all duration-200 text-[1.25rem] appearance-none";

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg">
      <div className="flex gap-3">
        <FontAwesomeIcon icon={faLandmarkFlag} className="self-center text-2xl text-primary-500" />
        <span className="self-center">Configure {state.title} Account</span>
      </div>
      <div className="mb-2 flex w-full">
        <div className="w-full">
          <span className="text-sm text-dark-300">ROI </span>
          <input
            type="number"
            value={state.roi}
            onChange={(e) => setState((s: any) => ({ ...s, roi: Number(e.target.value) }))}
            required
            style={{ fontSize: "1.25rem" }}
            className={inputClass}
          />
        </div>
      </div>
      <div className="mb-3 flex w-full flex-row gap-3">
        <div className="w-full">
          <span className="text-sm text-dark-300">Initial Balance </span>
          <input
            type="number"
            value={state.init_balance}
            onChange={(e) => setState((s: any) => ({ ...s, init_balance: Number(e.target.value) }))}
            required
            style={{ fontSize: "1.25rem" }}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-3 flex">
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
            <div className="self-center">Update</div>
          </Button>
        </div>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const selected_account = account_list.find((a: any) => a._id === selected_id);

  // open the editor directly when an account id is provided (from the plan page edit button)
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
    if (current_state === "account_list" && action === "edit") {
      setStage("edit_account");
      setAccountEditorMode("edit");
      setSelectedId(account_id);
      setStack((s) => [...s, "edit_account"]);
      setAccountBeingEdited(account_list.find((a: any) => a._id === account_id) || null);
    }
    if (current_state === "edit_account" && action === "back") {
      setStage("account_list");
      setAccountEditorMode("edit");
      setSelectedId("");
      setStack((s) => s.slice(0, -1));
    }
  }

  const PANEL_STAGES_LABELS: Record<string, string> = {
    account_list: "Account List ",
    add_account: `Add ${account_being_edited?.title || ""}`,
    edit_account: `Edit ${account_being_edited?.title || ""}`,
  };
  const breadcrumb_data = stack.map((s) => PANEL_STAGES_LABELS[s] || s);

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  const show_account_list = ["account_list", "add_account", "edit_account"].includes(stage);
  const show_account_command = ["add_account", "edit_account"].includes(stage);

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
            className="self-center font-medium text-dark-400 first-letter:uppercase after:ml-2 after:font-medium after:text-dark-200 after:content-['/'] last:after:content-[''] text-base md:text-xl"
          >
            {btext}
          </div>
        ))}
        <div className="ml-auto flex w-fit cursor-pointer gap-2 px-3 py-1 text-dark-600" onClick={() => router.back()}>
          <FontAwesomeIcon className="self-center text-xl font-bold" icon={faXmark} />
        </div>
      </div>

      <div className={`flex h-full gap-6 md:mt-0 md:flex-row md:gap-0 ${stage === "account_list" ? "flex-col" : "flex-col-reverse"}`}>
        {/* account list */}
        {show_account_list && (
          <div className={`flex-col snap-y md:h-[580px] md:w-1/3 md:shrink-0 ${stage !== "account_list" ? "hidden md:flex" : "flex"}`}>
            <div className="overflow-y-scroll pl-2 pr-1">
              {account_list.map((account: any) => (
                <div key={account._id} className="mb-3 snap-start rounded-md capitalize shadow-sm transition-all duration-200">
                  <div className="flex justify-between gap-3 rounded-t-md">
                    <div className="flex w-full flex-col">
                      <AccountCard account={account} selected={selected_id === account._id}>
                        <div className="ml-auto self-center px-3 text-dark-300" onClick={() => SetState(stage, "edit", account._id)}>
                          <FontAwesomeIcon
                            className={`self-center ${
                              stage !== "account_list" && selected_id === account._id ? "text-primary-300" : stage !== "account_list" ? "opacity-0" : ""
                            }`}
                            icon={faChevronRight}
                          />
                        </div>
                      </AccountCard>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* command column */}
        {show_account_command && (
          <div className="mb-12 flex h-full w-full flex-col md:mb-0 md:h-[580px] md:w-[370px] md:min-w-0">
            <AccountCommand
              plan={plan}
              account={account_editor_mode === "edit" ? selected_account : undefined}
              mode={account_editor_mode}
              onDone={(r) => {
                if (r.action === "edited") SetState(stage, "back");
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

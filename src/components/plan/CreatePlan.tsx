"use client";

import { useEffect, useState } from "react";
import { Listbox } from "@headlessui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCirclePlus,
  faCodeBranch,
  faChevronLeft,
  faChevronRight,
  faHandPointer,
  faSort,
  faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";
import { ModalUi } from "@/components/ui/ModalUi";
import { Button } from "@/components/ui/Button";
import { useFiPlanStore } from "@/store";
import { GetCurrencySymbol } from "@/lib/country";

const PLAN_CREATION_MODES = { NEW: "new", CLONE: "clone" };
const PANEL_VIEW_OPTIONS = {
  MODE_SELECTION: "mode-selection",
  ONBOARDING: "ob",
  PLAN_SELECTION: "plan-selection",
};

interface InputStage {
  description: React.ReactNode;
  filed_name: string;
  value: string | number;
  type: "textarea" | "number";
}

/** Port of plan/CreatePlan.vue — Create/Copy plan wizard modal. */
export function CreatePlan() {
  const plan_component_state = useFiPlanStore((s) => s.plan_component_state);
  const setPlanComponentState = useFiPlanStore((s) => s.set_plan_component_state);
  const create_plan = useFiPlanStore((s) => s.create_plan);
  const fork_plan = useFiPlanStore((s) => s.fork_plan);
  const plans = useFiPlanStore((s) => s.plans);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);
  const storeCurrency = useFiPlanStore((s) => s.currency);
  const currency_symbol = GetCurrencySymbol(storeCurrency || "INR");

  const [mode, setMode] = useState("");
  const [panel_view, setPanelView] = useState(PANEL_VIEW_OPTIONS.MODE_SELECTION);
  const [current_stage_index, setCurrentStageIndex] = useState(0);
  const [inputs_by_stage, setInputsByStage] = useState<InputStage[]>([]);
  const [selected_plan, setSelectedPlan] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [error_message, setErrorMessage] = useState("");

  const show_create_button = current_stage_index + 1 === inputs_by_stage.length && !loading;
  // Back is available between stages AND on the first stage (returns to mode selection)
  const show_next_button = current_stage_index + 1 < inputs_by_stage.length;
  const show_previous_button = current_stage_index > 0 || panel_view === PANEL_VIEW_OPTIONS.ONBOARDING;

  useEffect(() => {
    if (mode === PLAN_CREATION_MODES.NEW) {
      setInputsByStage([
        { description: "What would you name this plan", filed_name: "title", value: "", type: "textarea" },
        { description: "Describe your plan a little bit.", filed_name: "description", value: "", type: "textarea" },
        {
          description: (
            <>
              What is your monthly income? <span className="font-bold text-dark-400">{currency_symbol}</span>
            </>
          ),
          filed_name: "monthly_income",
          value: 0,
          type: "number",
        },
        {
          description: (
            <>
              What is your monthly expense? <span className="font-bold text-dark-400">{currency_symbol}</span>
            </>
          ),
          filed_name: "monthly_expense",
          value: 0,
          type: "number",
        },
        {
          description: (
            <>
              How many months can you survive without any income?{" "}
              <span className="font-bold text-dark-400">{currency_symbol}</span>
            </>
          ),
          filed_name: "runway",
          value: 0,
          type: "number",
        },
      ]);
    }
    if (mode === PLAN_CREATION_MODES.CLONE) {
      setInputsByStage([
        { description: "What would you name this plan", filed_name: "title", value: selected_plan?.title || "", type: "textarea" },
        { description: "Describe your plan a little bit.", filed_name: "description", value: selected_plan?.description || "", type: "textarea" },
      ]);
    }
  }, [mode, selected_plan, currency_symbol]);

  function SetMode(value: string) {
    setMode(value);
    if (value === PLAN_CREATION_MODES.NEW) setPanelView(PANEL_VIEW_OPTIONS.ONBOARDING);
    if (value === PLAN_CREATION_MODES.CLONE) setPanelView(PANEL_VIEW_OPTIONS.PLAN_SELECTION);
  }

  function SetErrorMessage(message: string) {
    setErrorMessage(message);
    setTimeout(() => {
      setErrorMessage("");
    }, 2000);
  }

  function ValidateInput({ filed_name = "", value }: { filed_name?: string; value: any }) {
    let valid = true;
    let message = "";
    switch (filed_name) {
      case "title":
        if (!value || typeof value !== "string") {
          message = message + "Please name you plan!\n";
          valid = false;
        }
        break;
      case "monthly_income":
        if (value < 0) {
          message = message + "Please enter a valid monthly income";
          valid = false;
        }
        break;
      case "monthly_expense":
        if (value < 0) {
          message = message + "Please enter a valid monthly expense";
          valid = false;
        }
        break;
      case "runway":
        if (value < 0) {
          message = message + "Please enter a valid monthly runway";
          valid = false;
        }
        break;
      default:
        break;
    }
    return { valid, message };
  }

  function SetCurrentStage(index: number) {
    setCurrentStageIndex(index);
  }

  function Next() {
    const current_index = current_stage_index;
    const validation_check = ValidateInput(inputs_by_stage[current_index]);
    if (validation_check.valid) {
      if (current_index + 1 < inputs_by_stage.length) setCurrentStageIndex(current_index + 1);
    } else {
      SetErrorMessage(validation_check.message);
    }
  }

  function Previous() {
    if (current_stage_index - 1 >= 0) {
      setCurrentStageIndex(current_stage_index - 1);
    } else if (panel_view === PANEL_VIEW_OPTIONS.ONBOARDING) {
      // first stage → back to mode selection
      setCurrentStageIndex(0);
      setMode("");
      setSelectedPlan(undefined);
      setPanelView(PANEL_VIEW_OPTIONS.MODE_SELECTION);
    }
  }

  function BackToModeSelection() {
    setCurrentStageIndex(0);
    setMode("");
    setSelectedPlan(undefined);
    setPanelView(PANEL_VIEW_OPTIONS.MODE_SELECTION);
  }

  function GoToOnboarding() {
    setPanelView(PANEL_VIEW_OPTIONS.ONBOARDING);
  }

  function Close() {
    setCurrentStageIndex(0);
    setMode("");
    setSelectedPlan(undefined);
    setPanelView(PANEL_VIEW_OPTIONS.MODE_SELECTION);
    setInputsByStage((stages) =>
      stages.map((s) => ({ ...s, value: typeof s.value === "number" ? 0 : "" }))
    );
    setErrorMessage("");
    setPlanComponentState("closed");
  }

  async function OnCreatePlanClicked() {
    if (!show_create_button) return;
    const current_index = current_stage_index;
    const validation_check = ValidateInput(inputs_by_stage[current_index]);
    const plan_parameter: Record<string, any> = {};
    inputs_by_stage.forEach((s) => (plan_parameter[s.filed_name] = s.value));
    if (mode === PLAN_CREATION_MODES.CLONE) plan_parameter.plan_id = selected_plan?._id;
    if (validation_check.valid) {
      setLoading(true);
      let plan: any;
      if (mode === PLAN_CREATION_MODES.NEW) plan = await create_plan(plan_parameter);
      if (mode === PLAN_CREATION_MODES.CLONE) plan = await fork_plan(plan_parameter);
      setLoading(false);
      setSelectedPlanId(plan._id);
      Close();
    } else {
      SetErrorMessage(validation_check.message);
    }
  }

  const inputClass =
    "px-3 py-[.25rem] border-[1.6px] rounded-[.5rem] shadow-sm w-full placeholder-dark-500 text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-dark-400 focus:border-dark-300 focus:shadow-dark-500 bg-dark-50 flex justify-between transition-all duration-200 text-[1rem] resize-none appearance-none";
  const numberClass =
    "my-3 font-mono appearance-none relative px-3 py-2 w-full shadow-sm border-[1.6px] border-gray-600 placeholder-gray-500 text-gray-300 rounded-[.5rem] focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-dark-700 focus:shadow-dark-500 bg-dark-700 focus:z-10 sm:text-sm";
  const navBtnClass =
    "bg-dark-100 p-1 px-2 flex grow-0 rounded-lg border-2 border-dark-300 py-2 text-sm w-fit disabled:opacity-25 hover:bg-dark-900 cursor-pointer gap-3 text-dark-500 font-bold";

  return (
    <ModalUi
      show={plan_component_state === "open"}
      custom_class="bg-white w-[100vw] md:w-[40vw] h-fit rounded-lg"
      onClose={Close}
      header={
        <div className="flex flex-col">
          <div className="flex text-xl font-bold text-dark-600">Let's make an exciting plan!</div>
        </div>
      }
    >
      <div className="flex flex-col gap-2 bg-dark-50">
        {panel_view === PANEL_VIEW_OPTIONS.ONBOARDING && (
          <>
            <div className="flex h-[11rem] place-content-center">
              <div className="flex w-full gap-4">
                <div className="flex w-full grow flex-col gap-2 self-center">
                  <div className="px-0.5">{inputs_by_stage[current_stage_index]?.description}</div>
                  <div className="px-0.5">
                    {inputs_by_stage[current_stage_index]?.type === "number" && (
                      <input
                        type="number"
                        required
                        style={{ fontSize: "1.25rem" }}
                        min={0}
                        className={numberClass}
                        value={Number(inputs_by_stage[current_stage_index]?.value || 0)}
                        onChange={(e) =>
                          setInputsByStage((stages) =>
                            stages.map((s, i) => (i === current_stage_index ? { ...s, value: Number(e.target.value) } : s))
                          )
                        }
                      />
                    )}
                    {inputs_by_stage[current_stage_index]?.type === "textarea" && (
                      <textarea
                        rows={3}
                        required
                        style={{ fontSize: "1.25rem" }}
                        className={inputClass}
                        value={String(inputs_by_stage[current_stage_index]?.value || "")}
                        onChange={(e) =>
                          setInputsByStage((stages) =>
                            stages.map((s, i) => (i === current_stage_index ? { ...s, value: e.target.value } : s))
                          )
                        }
                      />
                    )}
                    <div className="flex justify-center gap-2">
                      <div className="font-mono text-xs text-red-600">{error_message}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <div className="flex gap-2">
                <button className={navBtnClass} disabled={!show_previous_button} onClick={Previous}>
                  <FontAwesomeIcon className="self-center text-lg font-bold" icon={faChevronLeft} />
                  <span className="self-center"> Back </span>
                </button>
                <button className={navBtnClass} disabled={!show_next_button} onClick={Next}>
                  <span className="self-center"> Next </span>
                  <FontAwesomeIcon className="self-center text-lg font-bold" icon={faChevronRight} />
                </button>
              </div>
              <Button
                variant="primary"
                sub_variant="outline"
                disabled={!show_create_button}
                onClick={OnCreatePlanClicked}
                className="cursor-pointer gap-3 rounded-lg border-2 p-1 px-2 py-2 text-sm font-bold w-fit"
              >
                {!loading && <FontAwesomeIcon className="self-center text-lg font-bold" icon={faHandPointer} />}
                {loading && (
                  <svg className="h-[20px] w-[20px] -ml-1 self-center animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                <span className="self-center"> Create</span>
              </Button>
            </div>
            <div className="flex justify-center gap-2">
              {inputs_by_stage.map((_inputs, index) => (
                <div key={index}>
                  <div
                    className={`h-[8px] w-[8px] cursor-pointer rounded-full border border-indigo-400 ${
                      current_stage_index === index ? "bg-indigo-900" : ""
                    }`}
                    onClick={() => SetCurrentStage(index)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {panel_view === PANEL_VIEW_OPTIONS.MODE_SELECTION && (
          <div className="flex h-[15rem] w-full">
            <div className="grid w-full place-content-center">
              <div className="flex justify-between">
                <Button
                  variant="primary"
                  sub_variant="solid"
                  className="w-[10rem] py-2"
                  onClick={() => SetMode(PLAN_CREATION_MODES.NEW)}
                >
                  <FontAwesomeIcon className="self-center text-lg font-bold" icon={faCirclePlus} />
                  <span className="self-center"> Create new</span>
                </Button>
                <div className="grid place-content-center px-3 font-extrabold text-slate-500">Or</div>
                <Button
                  variant="primary"
                  sub_variant="solid"
                  className="w-[10rem] py-2"
                  onClick={() => SetMode(PLAN_CREATION_MODES.CLONE)}
                >
                  <FontAwesomeIcon className="self-center text-lg font-bold" icon={faCodeBranch} />
                  <span className="self-center"> Copy </span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {panel_view === PANEL_VIEW_OPTIONS.PLAN_SELECTION && (
          <div className="flex h-[15rem]">
            <div className="flex w-full flex-col gap-3 self-center">
              <div className="font-montserrat">
                Please select the <strong>Plan</strong> you want to copy and{" "}
                <u className="text-primary-400">click next</u>
              </div>
              <div className="flex">
                <Listbox value={selected_plan} onChange={setSelectedPlan}>
                  <div className="relative w-[75%]">
                    <Listbox.Button className="relative h-[3rem] w-full cursor-default rounded-l-lg border-2 border-dark-100 bg-dark-50 py-2 pl-3 pr-10 text-left font-montserrat hover:border-dark-200 focus:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm">
                      <span className="block truncate font-mono text-primary-600 first-letter:uppercase font-bold">
                        {selected_plan ? selected_plan.title : "Select A Plan ..."}
                      </span>
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <FontAwesomeIcon icon={faSort} />
                      </span>
                    </Listbox.Button>
                    <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                      {plans.map((plan) => (
                        <Listbox.Option
                          key={plan._id}
                          value={plan}
                          className={({ active }) =>
                            `${
                              active ? "bg-amber-100 text-amber-900" : "text-gray-900"
                            } relative flex cursor-default select-none justify-between py-2 px-4`
                          }
                        >
                          <span
                            className={`${
                              plan === selected_plan ? "font-medium" : "font-normal"
                            } block truncate text-left`}
                          >
                            {plan.title}
                          </span>
                          {plan.parent_id && (
                            <span className="relative inset-y-0 left-0 flex items-center pl-3 text-amber-600">
                              <FontAwesomeIcon className="self-center text-lg font-bold" icon={faCodeBranch} />
                            </span>
                          )}
                          {plan === selected_plan && (
                            <span className="relative inset-y-0 left-0 flex items-center pl-3 text-amber-600">
                              <FontAwesomeIcon icon={faCircleCheck} />
                            </span>
                          )}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </div>
                </Listbox>
                <Button
                  disabled={!selected_plan}
                  onClick={GoToOnboarding}
                  className="h-[3rem] rounded-l-none px-3"
                  variant="primary"
                  sub_variant="solid"
                >
                  <FontAwesomeIcon className="self-center text-lg font-bold" icon={faCodeBranch} />
                  <span className="self-center"> Next </span>
                </Button>
              </div>
              <div className="flex">
                <button className={navBtnClass} onClick={BackToModeSelection}>
                  <FontAwesomeIcon className="self-center text-lg font-bold" icon={faChevronLeft} />
                  <span className="self-center"> Back </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalUi>
  );
}

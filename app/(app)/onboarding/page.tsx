"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore, SetDataToLocalStorage } from "@/store";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { Combobox } from "@headlessui/react";
import { Track, EVENT_TYPES } from "@/lib/tracker";
import { currency_list, available_currency_priority_map } from "@/lib/country";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronLeft, faChevronRight, faCoins, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { faCircleCheck as faCircleCheckRegular } from "@fortawesome/free-regular-svg-icons";

const FIELD_TYPE = {
  DATA_ENTRY_NUM: "de-num",
  DATA_ENTRY_NUM_INC: "de-num-inc",
  MCQ: "mcq",
  SELECT: "select",
};

interface Stage {
  type: string;
  required: boolean;
  data_point: string;
  title: string;
  description: string;
  options?: any[];
  value?: number;
}

// Port of BuildOnboardingStage() from core/business_logic/process/onboarding.js
const STAGES: Stage[] = [
  {
    type: FIELD_TYPE.SELECT,
    required: true,
    data_point: "currency",
    title: "Which currency do you use to manage your finances?",
    description:
      "Fi-Plan's advance planning engine operates on a currency independent algorithm to <strong class='text-primary-300'>simulate real life scenarios</strong> such as financial growth, inflation etc. <span class='capitalize'>adding</span> primary currency provides clarity and uniformity in visualizing, computing and simulating income and expenses thus enabling <strong class='text-primary-300'>realistic financial planning</strong>.",
    // original renders the priority currencies only, in the observed order (buggy sort output)
    options: ["INR", "USD", "EUR", "JPY", "SGD", "CNY", "AUD", "KRW", "NZD", "RUB", "ZAR", "GBP"]
      .map((code) => currency_list.find((c) => c.currency_code === code))
      .filter(Boolean)
      .map((c: any) => ({
        text: `${c.currency_code}, ${c.currency_name}`,
        value: c.currency_code,
        currency_symbol: c.currency_symbol,
        currency_name: c.currency_name,
      })),
  },
  {
    type: FIELD_TYPE.MCQ,
    required: true,
    data_point: "objective",
    title: "What's your primary objective of creating a financial plan?",
    description:
      "Financial planning must be done with a clear long term objective in mind, by setting a long term plan it becomes easier to complete short term goals. <span class='font-bold text-primary-300'>Fi-Plan</span> is the only platform that creates a <strong class='text-primary-300'>comprehensive plan that simulates</strong> practical scenarios, while comparing and adjusting them as you move along with the plan keeping the long term objective in sight.",
    options: [
      { text: "Wealth Creation", value: 1 },
      { text: "Debt Management", value: 2 },
      { text: "Expense Management", value: 3 },
      { text: "Financial Independence/Early Retirement", value: 4 },
    ],
  },
  {
    type: FIELD_TYPE.DATA_ENTRY_NUM,
    required: true,
    data_point: "income",
    title: "What is your monthly income?",
    description:
      "Fi-Plan creates a <strong class='text-primary-300'>long term plan</strong> by grouping cash flows for each month. <span class='capitalize'>In</span> case you are paid by week/hour or have multiple income streams, provide an estimated average monthly income. You can <strong class='text-primary-300'>add and edit</strong> various income streams along with <strong class='text-primary-300'>smart future projections</strong> later on in your plan.",
    value: 0,
  },
  {
    type: FIELD_TYPE.DATA_ENTRY_NUM,
    required: true,
    data_point: "monthly_expense",
    title: "What is your monthly expense?",
    description:
      "The <strong class='text-primary-300'>relative income and expenses</strong> on a month to month basis forms the core of Fi-Plan's first of its kind real life simulations. Similar to income, add an estimated average monthly expenses, you can add, edit, break-down and create <strong class='text-primary-300'>smart projections</strong> for <strong class='text-primary-300'>individual expenses</strong> later on in your plan.",
    value: 0,
  },
  {
    type: FIELD_TYPE.MCQ,
    required: true,
    data_point: "runway",
    title: "How many months can you survive without any income?",
    description:
      "In case you lose all your income streams, how long can your <strong class='text-primary-300'>liquid savings</strong> sustain your current expenses? This metric serves as the cornerstone for one's financial independence and determines key <strong class='text-primary-300'>money management strategies</strong> as well as one's sense of control, ability to take risks and mental well being in personal life.",
    options: [
      { text: "Less than a month", value: 1 },
      { text: "2 Months", value: 2 },
      { text: "3 Months", value: 3 },
      { text: "6 Months", value: 6 },
      { text: "12 months or more", value: 12 },
    ],
  },
  {
    type: FIELD_TYPE.MCQ,
    required: true,
    data_point: "spender_type",
    title: "What kind of spender are you?",
    description:
      "How do you go about buying a new gadget or an expensive dress? One's <strong class='text-primary-300'>core spending habits</strong> shapes the way expenses are incurred and are often overlooked when creating a <strong class='text-primary-300'>long term financial plan</strong>, understanding our spending habits is the first step towards attaining financial independence.",
    options: [
      { text: "Frugal", value: 1 },
      { text: "Planned", value: 2 },
      { text: "Impulsive", value: 3 },
    ],
  },
  {
    type: FIELD_TYPE.MCQ,
    required: true,
    data_point: "emi_dependency",
    title: "How frequently do you finance your big purchases through EMI's/credit?",
    description:
      "Buying stuff on credit and paying them later on in installments is a great tool however if used recklessly can often lead to <strong class='text-primary-300'>debt trap</strong> which hampers financial independence as well as prevents one from using credit when its really needed, one must take into account the <strong class='text-primary-300'>actual frequency and need of credit</strong> for various expenses to create a long term plan.",
    options: [
      { text: "Never", value: 1 },
      { text: "Sometimes", value: 2 },
      { text: "Regularly", value: 3 },
    ],
  },
  {
    type: FIELD_TYPE.MCQ,
    required: true,
    data_point: "beta_opt_in",
    title: "Ready to join Fi-Plan's beta program?",
    description:
      "As part of Fi-Plan's beta program, you have an early access to all the premium features. Feel free to try them out and share your feedback on <strong>support@fi-plan.com</strong>. Early bird access to premium features is for a limited period applicable only in beta phase. Please provide your confirmation and proceed ahead.",
    options: [{ text: "Yes I'am In 👍", value: 1 }],
  },
];

/** Port of onboarding/onboardingPanel.vue + inputField.vue. */
export default function OnboardingPage() {
  const router = useRouter();
  const setProfile = useFiPlanStore((s) => s.set_profile);
  const setPlans = useFiPlanStore((s) => s.set_plans);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);
  const profile = useFiPlanStore((s) => s.profile);
  const storeCurrency = useFiPlanStore((s) => s.currency);

  // original onboardingPanel.vue beforeMount: already onboarded -> OpenPage("/plan")
  useEffect(() => {
    if (profile?.ob_params) router.replace("/plan");
  }, [profile, router]);

  const [stage_number, setStageNumber] = useState(1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [value_changed, setValueChanged] = useState(false);

  const stage = STAGES[stage_number - 1];
  const progress = (stage_number / STAGES.length) * 100; // original: current_stage_number / stages.length
  const show_currency = ["income", "monthly_expense"].includes(stage?.data_point);
  const currency = answers["currency"] || storeCurrency || "INR";
  const currency_symbol = currency_list.find((c) => c.currency_code === currency)?.currency_symbol || "₹";

  function setAnswer(value: any) {
    setAnswers((a) => ({ ...a, [stage.data_point]: value }));
    setValueChanged(true);
    setError("");
  }

  function validateStage(): { is_valid: boolean; msg: string } {
    // matches onboardingPanel.vue ValidateStage()
    const val = answers[stage.data_point];
    if (stage.type === FIELD_TYPE.DATA_ENTRY_NUM || stage.type === FIELD_TYPE.DATA_ENTRY_NUM_INC) {
      if (val === undefined || val < 0 || val === "") return { is_valid: false, msg: "Values can't be negative or empty" };
    }
    if (stage.type === FIELD_TYPE.MCQ) {
      const found = (stage.options || []).findIndex((_) => _.value === val);
      if (found < 0 || isNaN(val)) return { is_valid: false, msg: isNaN(val) ? "Please select an option" : "Please select a valid value" };
    }
    if (stage.type === FIELD_TYPE.SELECT) {
      const found = (stage.options || []).findIndex((_) => _.value === val);
      if (found < 0 || !val) return { is_valid: false, msg: "Please select a valid value" };
    }
    return { is_valid: true, msg: "" };
  }

  function next() {
    const v = validateStage();
    if (!v.is_valid) {
      setError(v.msg);
      return;
    }
    if (stage_number < STAGES.length) {
      setStageNumber((s) => s + 1);
      setValueChanged(false);
    } else {
      complete();
    }
  }

  function previous() {
    setStageNumber((s) => Math.max(1, s - 1));
    setValueChanged(false);
  }

  async function complete() {
    setBusy(true);
    try {
      const result = await api.OnboardUser(answers);
      setProfile(result.user);
      setPlans(result.plan ? [result.plan] : []);
      if (result.plan?._id) setSelectedPlanId(result.plan._id);
      SetDataToLocalStorage("ob-data", answers);
      Track(EVENT_TYPES.COMPLETED_ONBOARDING.id, { currency: answers.currency || "" }, { currency: answers.currency || "" });
      router.push("/plan");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const filtered_currency =
    query === ""
      ? stage?.options || []
      : (stage?.options || []).filter((o: any) =>
          (o.text || "").toLowerCase().replace(/\s+/g, "").includes(query.toLowerCase().replace(/\s+/g, ""))
        );

  const validation_msg = value_changed ? validateStage().msg : error;

  return (
    <div>
      <div className="flex justify-center">
        <div className="p-4 absolute md:top-4 -w-full flex flex-col justify-between md:justify-center h-full w-[100vw] md:w-[70%]">
          <div>
            <div>
              {/* header: logo + step + progress */}
              <div className="flex flex-col justify-between w-full gap-4 px-3 md:flex-row md:mb-2 md:px-0">
                <div className="flex md:self-center">
                  <div className="flex -ml-4 overflow-hidden text-dark-400 btn-sm rounded-5">
                    <Logo className="self-center text-3xl text-primary-400! bg-dark-50" />
                    <div className="self-center mr-3 h-[80%] bg-dark-200 w-[2px] md:hidden" />
                    <span className="self-center text-2xl md:hidden">
                      Step:
                      <span className="font-bold text-success-300" style={{ fontSize: "2.25rem" }}>
                        {stage_number}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="h-[6px] md:h-[10px] md:self-center flex w-[100%] md:w-[60%] border border-primary-400 rounded-md overflow-hidden p-[2px]">
                  <div
                    className="relative self-center bg-primary-100 border-primary-100 h-[6px] rounded-md transition-all duration-500 ease-in"
                    style={{ width: `${progress}%` }}
                  >
                    <div className="rounded-full w-[3rem] h-full float-right animate-pulse bg-gradient-to-r from-primary-100 to-primary-400" />
                  </div>
                </div>
              </div>

              {/* main row */}
              <div className="flex flex-col md:flex-row w-full md:gap-5 mb-5 md:h-[32rem] h-[77vh]">
                <div className="flex md:flex md:flex-col md:justify-center pt-6 w-full md:w-[50%] md:min-h-[320px] md:pr-12">
                  <div className="self-center w-full mb-3">
                    <div className="flex gap-3 px-3 text-dark-600 md:px-0">
                      <div className="self-start hidden text-4xl md:inline">{stage_number}</div>
                      <FontAwesomeIcon icon={faArrowRight} className="self-start hidden text-4xl md:inline" />
                      <div className="w-full">
                        <p
                          className="self-start mb-3 text-2xl font-bold text-dark-500 first-letter:uppercase md:text-3xl"
                          dangerouslySetInnerHTML={{ __html: stage.title }}
                        />
                        <p
                          className="hidden md:block mb-3 text-dark-300 font-medium text-[.85rem] md:leading-relaxed md:text-lg"
                          dangerouslySetInnerHTML={{ __html: stage.description }}
                        />
                        {!validateStage().is_valid && value_changed && (
                          <span className="hidden text-xs font-normal text-red-400 md:block">{validateStage().msg}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden mx-2 md:inline bg-dark-100 w-[2px]" />

                <div className="h-full w-full md:w-[50%] md:flex md:flex-col justify-center px-3">
                  <p
                    className="md:hidden mb-3 text-dark-300 font-medium text-[.85rem] md:leading-relaxed md:text-lg"
                    dangerouslySetInnerHTML={{ __html: stage.description }}
                  />
                  {!validateStage().is_valid && value_changed && (
                    <span className="visible text-xs font-normal text-red-400 md:hidden">{validateStage().msg}</span>
                  )}
                  <div className="flex flex-col w-full mt-5">
                    {show_currency && (
                      <div className="z-10 mb-2 text-2xl font-bold rounded-r-lg bg-dark-50 text-dark-400">
                        Amount in <span className="text-primary-400">{currency_symbol}</span>
                      </div>
                    )}

                    {/* field renderer (port of inputField.vue) */}
                    {stage.type === FIELD_TYPE.DATA_ENTRY_NUM && (
                      <input
                        type="number"
                        min={0}
                        style={{ fontSize: "1.5rem", lineHeight: "normal" }}
                        className="appearance-none relative block w-full px-3 py-2 shadow-sm border-[1.6px] placeholder-dark-500 text-dark-300 rounded-[.5rem] focus:outline-none focus:ring-1 focus:ring-primary-300 focus:border-primary-400 focus:shadow-primary-200 bg-dark-50 focus:z-10 sm:text-sm border-primary-300"
                        value={answers[stage.data_point] ?? ""}
                        onChange={(e) => setAnswer(Number(e.target.value))}
                        placeholder="0"
                      />
                    )}

                    {stage.type === FIELD_TYPE.MCQ && (
                      <div>
                        {stage.options?.map((opt: any) => (
                          <div key={opt.value} className="mt-3 row">
                            <button
                              onClick={() => setAnswer(opt.value)}
                              className={`px-3 py-[.8ch] border-[1.6px] rounded-[.5rem] shadow-sm w-full text-dark-300 text-left flex justify-between bg-dark-50 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-300 focus:shadow-primary-500 ${
                                answers[stage.data_point] === opt.value ? "border-primary-400 text-primary-400" : "border-dark-100"
                              }`}
                            >
                              <div>{opt.text}</div>
                              {answers[stage.data_point] === opt.value && (
                                <FontAwesomeIcon icon={faCircleCheckRegular} className="self-center text-xl animate-pulse" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {stage.type === FIELD_TYPE.SELECT && (
                      <div className="grid w-full border shadow-sm p-3 rounded-lg grid-cols-2 sm:grid-cols-3 md:grid-cols-3 bg-white gap-3">
                        {(stage.options || []).map((opt: any, index: number) => (
                          <div key={`${opt.value}-${index}`} onClick={() => setAnswer(opt.value)}>
                            <div
                              className={`border rounded-md p-2 flex flex-col gap-1 bg-dark-50 ${
                                answers[stage.data_point] === opt.value ? "bg-primary-100 text-primary-400 rounded-md" : ""
                              }`}
                            >
                              <li className="relative select-none flex cursor-pointer">
                                <span>{opt.currency_symbol}</span>
                                <span
                                  className={`block truncate px-2 ${
                                    answers[stage.data_point] === opt.value ? "font-medium" : "font-normal"
                                  }`}
                                >
                                  {opt.value}
                                </span>
                                {answers[stage.data_point] === opt.value && (
                                  <span className="inset-y-0 left-0 flex items-center pl-3 ml-auto text-primary-300">
                                    <FontAwesomeIcon icon={faCircleCheckRegular} />
                                  </span>
                                )}
                              </li>
                              <div
                                className={`text-xs truncate opacity-70 ${
                                  answers[stage.data_point] === opt.value ? "text-primary-400" : ""
                                }`}
                              >
                                {opt.currency_name}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* buttons */}
          <div className="flex gap-2 md:mt-7 md:ml-20 bg-dark-50 md:gap-0">
            <button
              disabled={stage_number === 1}
              onClick={previous}
              className="md:w-[10%] w-[49%] rounded-l-[.6rem] disabled:opacity-50 flex md:flex-none justify-start md:justify-center text-primary-400 px-3 md:py-[1ch] py-[.7ch] md:border-2 hover:shadow-md border-primary-400 text-xl gap-3"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="self-center text-3xl" />
              <span className="self-center font-bold md:hidden"> Previous </span>
            </button>
            <button
              onClick={next}
              className="bg-primary-400 md:bg-primary-50 md:w-[10%] w-[49%] rounded-[.6rem] md:rounded-l-none text-dark-50 disabled:opacity-50 flex md:flex-none md:text-primary-500 justify-center px-3 md:py-[1ch] py-[.7ch] md:border-2 md:border-l-0 hover:shadow-md border-primary-400 text-xl gap-3"
            >
              <span className="self-center font-bold md:hidden"> Next </span>
              {busy ? (
                <svg className="self-center w-6 h-6 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <FontAwesomeIcon icon={faChevronRight} className="self-center text-2xl md:text-3xl" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

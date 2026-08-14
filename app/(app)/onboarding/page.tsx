"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore, SetDataToLocalStorage } from "@/store";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@headlessui/react";
import { Track, EVENT_TYPES } from "@/lib/tracker";
import { currency_list } from "@/lib/country";

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

const STAGES: Stage[] = [
  {
    type: FIELD_TYPE.SELECT,
    required: true,
    data_point: "currency",
    title: "Which currency do you use to manage your finances?",
    description: "Adding a primary currency provides clarity in visualizing, computing and simulating income and expenses.",
    options: currency_list.map((c) => ({ text: `${c.currency_code}`, value: c.currency_code, currency_symbol: c.currency_symbol })),
  },
  {
    type: FIELD_TYPE.MCQ,
    required: true,
    data_point: "objective",
    title: "What's your primary objective of creating a financial plan?",
    description: "Financial planning must be done with a clear long term objective in mind.",
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
    description: "Provide an estimated average monthly income.",
    value: 0,
  },
  {
    type: FIELD_TYPE.DATA_ENTRY_NUM,
    required: true,
    data_point: "monthly_expense",
    title: "What is your monthly expense?",
    description: "Add an estimated average monthly expense.",
    value: 0,
  },
  {
    type: FIELD_TYPE.MCQ,
    required: true,
    data_point: "runway",
    title: "How many months can you survive without any income?",
    description: "This metric determines key money management strategies.",
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
    description: "Understanding our spending habits is the first step towards attaining financial independence.",
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
    description: "One must take into account the actual frequency and need of credit for various expenses.",
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
    description: "Early bird access to premium features is for a limited period applicable only in beta phase.",
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

  // original onboardingPanel.vue beforeMount: already onboarded -> OpenPage("/plan")
  useEffect(() => {
    if (profile?.ob_params) router.replace("/plan");
  }, [profile, router]);

  const [stage_number, setStageNumber] = useState(1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const stage = STAGES[stage_number - 1];
  const progress = ((stage_number - 1) / STAGES.length) * 100;

  function setAnswer(value: any) {
    setAnswers((a) => ({ ...a, [stage.data_point]: value }));
    setError("");
  }

  function validateStage(): boolean {
    if (!stage.required) return true;
    const val = answers[stage.data_point];
    if (val === undefined || val === null || val === "") return false;
    if (stage.type === FIELD_TYPE.DATA_ENTRY_NUM && Number(val) === 0) return false;
    return true;
  }

  function next() {
    if (!validateStage()) {
      setError("Please provide an answer to continue");
      return;
    }
    if (stage_number < STAGES.length) setStageNumber((s) => s + 1);
    else complete();
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
      : (stage?.options || []).filter((o) => o.text.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-50 px-4">
      <Logo className="mb-6 text-4xl" />
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-xl">
        {/* progress */}
        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-dark-100">
          <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
        </div>

        <h1 className="text-xl font-bold text-dark-800">{stage.title}</h1>
        <p className="mt-2 text-sm text-dark-500" dangerouslySetInnerHTML={{ __html: stage.description }} />

        <div className="mt-6">
          {stage.type === FIELD_TYPE.MCQ && (
            <div className="grid gap-2">
              {stage.options?.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAnswer(opt.value)}
                  className={`rounded-xl border p-4 text-left text-sm font-medium transition-colors ${
                    answers[stage.data_point] === opt.value
                      ? "border-primary-400 bg-primary-50 text-primary-700"
                      : "border-dark-200 hover:border-primary-200"
                  }`}
                >
                  {opt.text}
                </button>
              ))}
            </div>
          )}

          {stage.type === FIELD_TYPE.DATA_ENTRY_NUM && (
            <input
              type="number"
              className="input-filed text-lg"
              value={answers[stage.data_point] ?? ""}
              onChange={(e) => setAnswer(Number(e.target.value))}
              placeholder="0"
            />
          )}

          {stage.type === FIELD_TYPE.SELECT && (
            <Combobox value={answers[stage.data_point] || ""} onChange={setAnswer}>
              <div className="relative">
                <Combobox.Input
                  className="input-filed"
                  displayValue={(val: any) => (stage.options || []).find((o) => o.value === val)?.text || ""}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search currency..."
                />
                <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white py-1 shadow-xl ring-1 ring-dark-100">
                  {filtered_currency.map((opt) => (
                    <Combobox.Option key={opt.value} value={opt.value} className="cursor-pointer px-3 py-2 text-sm hover:bg-dark-50">
                      {opt.text} {opt.currency_symbol}
                    </Combobox.Option>
                  ))}
                </Combobox.Options>
              </div>
            </Combobox>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-danger-500">{error}</p>}

        <div className="mt-6 flex justify-between">
          <Button variant="neutral" onClick={() => setStageNumber((s) => Math.max(1, s - 1))} disabled={stage_number === 1}>
            Prev
          </Button>
          <Button onClick={next} disabled={busy}>
            {busy ? "Saving..." : stage_number === STAGES.length ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

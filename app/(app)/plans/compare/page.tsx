"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { usePlanEngine } from "@/hooks/usePlanEngine";
import { useRunway } from "@/hooks/useRunway";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { MyChart } from "@/components/ui/MyChart";
import { MonthSlider } from "@/components/plan/MonthSlider";
import { Track, EVENT_TYPES } from "@/lib/tracker";
import { Listbox } from "@headlessui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faPenToSquare, faEye } from "@fortawesome/free-solid-svg-icons";

const MAX_PLAN_LIMIT = 3;

function ComparablePlanWidget({
  current_plan_id,
  current_month,
  plan_number,
  onEdit,
  onView,
  onRemove,
}: {
  current_plan_id: string;
  current_month: number;
  plan_number: number;
  onEdit: () => void;
  onView: () => void;
  onRemove: () => void;
}) {
  const plan = useFiPlanStore((s) => s.plans.find((p) => p._id === current_plan_id));
  const plan_duration = useFiPlanStore((s) => s.plan_duration);
  const engine = usePlanEngine(plan || null, plan_duration);
  const { runway } = useRunway(engine.cashflow.expense_statement, engine.account_balances_and_transactions.account_balances, current_month);

  const labels = Array.from({ length: Math.min(20, plan_duration) }, (_, i) => `M${i + 1}`);
  const datasets = ["e", "s", "i"].map((cat, idx) => ({
    label: cat === "e" ? "Emergency" : cat === "s" ? "Savings" : "Investment",
    data: Array.from({ length: Math.min(20, plan_duration) }, (_, i) =>
      engine.account_balances_and_transactions.account_balances.find((b: any) => b.month === i + 1 && b.category === cat)?.balance || 0
    ),
    backgroundColor: ["rgba(244,63,94,0.7)", "rgba(16,185,129,0.7)", "rgba(6,182,212,0.7)"][idx],
  }));

  const net_worth = engine.account_balances_and_transactions.account_balances.reduce(
    (acc: number, b: any) => (b.month <= current_month ? acc + (b.balance || 0) : acc),
    0
  );

  return (
    <div className="w-[320px] shrink-0 rounded-2xl bg-white p-5 shadow-xl">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="font-bold text-dark-800">#{plan_number} {plan?.title}</h3>
          {plan?.description && <p className="text-xs text-dark-400">{plan.description}</p>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded p-1 text-dark-400 hover:bg-dark-50 hover:text-primary-500">
            <FontAwesomeIcon icon={faPenToSquare} className="h-3 w-3" />
          </button>
          <button onClick={onView} className="rounded p-1 text-dark-400 hover:bg-dark-50 hover:text-primary-500">
            <FontAwesomeIcon icon={faEye} className="h-3 w-3" />
          </button>
          <button onClick={onRemove} className="rounded p-1 text-dark-400 hover:bg-dark-50 hover:text-danger-500">
            <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="h-48">
        <MyChart labels={labels} dataset={datasets} stacked chart_type="bar" show_legend={false} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-dark-50 p-2">
          <p className="text-xs text-dark-400">Net Worth</p>
          <p className="font-bold text-dark-800"><DisplayAmount amount={net_worth} /></p>
        </div>
        <div className="rounded-lg bg-dark-50 p-2">
          <p className="text-xs text-dark-400">Runway</p>
          <p className="font-bold text-primary-600">{runway ? runway.toFixed(1) : "—"} mo</p>
        </div>
      </div>
    </div>
  );
}

/** Port of compare_plan.page.vue — side-by-side plan comparison. */
function ComparePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plans = useFiPlanStore((s) => s.plans);
  const plan_duration = useFiPlanStore((s) => s.plan_duration);
  const setPlanDuration = useFiPlanStore((s) => s.set_plan_duration) as any;
  const setGodPlanEntity = useFiPlanStore((s) => s.set_god_plan_entity);
  const setShareData = useFiPlanStore((s) => s.set_share_data);

  const [current_month, setCurrentMonth] = useState(1);
  const [local_duration, setLocalDuration] = useState(plan_duration);

  const plan_ids = useMemo(
    () => (searchParams.get("p_ids") || "").split(",").filter(Boolean).slice(0, MAX_PLAN_LIMIT),
    [searchParams]
  );
  const available_plans = plans.filter((p) => !plan_ids.includes(p._id));

  function updateQuery(ids: string[]) {
    router.push(`/plans/compare?p_ids=${ids.join(",")}`);
  }
  function removePlan(id: string) {
    updateQuery(plan_ids.filter((x) => x !== id));
  }
  function addPlan(id: string) {
    if (plan_ids.length >= MAX_PLAN_LIMIT) return;
    updateQuery([...plan_ids, id]);
    Track(EVENT_TYPES.ADD_PLAN_TO_COMPARE.id, {}, {});
  }
  function OnEdit(entity_type: string, entity_id = "") {
    setGodPlanEntity({ active: true, plan_id: plan_ids[0], entity_type, entity_id });
    router.push("/edit");
  }

  return (
    <div className="flex h-screen flex-col">
      {/* top control bar */}
      <div className="flex items-center justify-between border-b border-dark-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/plan")}
            className="rounded-lg p-2 text-dark-400 hover:bg-dark-50 hover:text-danger-500"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
          <h1 className="text-lg font-bold text-dark-800">Compare plans</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-dark-500">
          <span>Duration:</span>
          <select
            value={local_duration}
            onChange={(e) => {
              const d = Number(e.target.value);
              setLocalDuration(d);
              setPlanDuration?.(d);
            }}
            className="rounded-lg border border-dark-200 px-2 py-1 text-sm"
          >
            {[12, 24, 60, 120, 240, 600].map((d) => (
              <option key={d} value={d}>{d === 600 ? "Max" : `${d / 12}y`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* plan columns */}
      <div className="flex flex-1 gap-4 overflow-x-auto p-4">
        {plan_ids.map((id, i) => (
          <ComparablePlanWidget
            key={id}
            current_plan_id={id}
            current_month={current_month}
            plan_number={i + 1}
            onEdit={() => OnEdit("cashflow", "")}
            onView={() => router.push(`/plan?p_id=${id}`)}
            onRemove={() => removePlan(id)}
          />
        ))}

        {plan_ids.length < MAX_PLAN_LIMIT && (
          <div className="flex w-[320px] shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-dark-200 p-6">
            <Listbox value={available_plans[0]?._id} onChange={addPlan}>
              <div className="w-full">
                <Listbox.Button className="input-filed">{available_plans[0]?.title || "No more plans"}</Listbox.Button>
                <Listbox.Options className="mt-1 rounded-xl bg-white py-1 shadow-xl ring-1 ring-dark-100">
                  {available_plans.map((p) => (
                    <Listbox.Option key={p._id} value={p._id} className="cursor-pointer px-3 py-2 text-sm hover:bg-dark-50">
                      {p.title}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </div>
            </Listbox>
            <Button className="mt-3" disabled={!available_plans.length} onClick={() => addPlan(available_plans[0]?._id)}>
              Add Plan
            </Button>
          </div>
        )}
      </div>

      {/* bottom month control */}
      <div className="border-t border-dark-100 bg-white p-4">
        <MonthSlider value={current_month} max={Math.min(120, plan_duration)} onChange={setCurrentMonth} />
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-50" />}>
      <ComparePageInner />
    </Suspense>
  );
}

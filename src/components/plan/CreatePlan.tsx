"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalUi } from "@/components/ui/ModalUi";
import { Button } from "@/components/ui/Button";
import { useFiPlanStore } from "@/store";
import { Track, EVENT_TYPES } from "@/lib/tracker";
import { FireNotification } from "@/store/notifications";

/** Port of plan/CreatePlan.vue — Create/Copy plan modal. */
export function CreatePlan() {
  const router = useRouter();
  const setPlanComponentState = useFiPlanStore((s) => s.set_plan_component_state);
  const create_plan = useFiPlanStore((s) => s.create_plan);
  const fork_plan = useFiPlanStore((s) => s.fork_plan);
  const plans = useFiPlanStore((s) => s.plans);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);

  const [mode, setMode] = useState<"new" | "copy">("new");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [monthly_income, setMonthlyIncome] = useState("");
  const [monthly_expense, setMonthlyExpense] = useState("");
  const [runway, setRunway] = useState("");
  const [sourcePlanId, setSourcePlanId] = useState(plans[0]?._id || "");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "new") {
        const plan = await create_plan({
          title,
          description,
          monthly_income: Number(monthly_income) || 0,
          monthly_expense: Number(monthly_expense) || 0,
          runway: Number(runway) || 0,
        });
        Track(EVENT_TYPES.PLAN_CREATED.id, { plan_title: plan.title, mode: "new" }, { inc: { plan_count: 1 } });
        setSelectedPlanId(plan._id);
        setPlanComponentState("closed");
        router.push(`/plan?p_id=${plan._id}`);
      } else {
        const plan = await fork_plan({ plan_id: sourcePlanId, title, description });
        Track(EVENT_TYPES.PLAN_CREATED.id, { plan_title: plan.title, mode: "copy" }, { inc: { plan_count: 1 } });
        setSelectedPlanId(plan._id);
        setPlanComponentState("closed");
        router.push(`/plan?p_id=${plan._id}`);
      }
    } catch (e: any) {
      FireNotification({ title: "Create plan failed", desc: e.message, variant: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalUi show title="Create a plan" onClose={() => setPlanComponentState("closed")}>
      <div className="flex gap-2">
        <Button variant={mode === "new" ? "primary" : "neutral"} size="sm" onClick={() => setMode("new")}>
          New Plan
        </Button>
        <Button variant={mode === "copy" ? "primary" : "neutral"} size="sm" onClick={() => setMode("copy")}>
          Copy Plan
        </Button>
      </div>

      {mode === "copy" && (
        <select
          value={sourcePlanId}
          onChange={(e) => setSourcePlanId(e.target.value)}
          className="input-filed mt-4"
        >
          {plans.map((p) => (
            <option key={p._id} value={p._id}>
              {p.title}
            </option>
          ))}
        </select>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <input className="input-filed" placeholder="Plan title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          className="input-filed"
          placeholder="Description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {mode === "new" && (
          <>
            <input
              className="input-filed"
              placeholder="Monthly income"
              type="number"
              value={monthly_income}
              onChange={(e) => setMonthlyIncome(e.target.value)}
            />
            <input
              className="input-filed"
              placeholder="Monthly expense"
              type="number"
              value={monthly_expense}
              onChange={(e) => setMonthlyExpense(e.target.value)}
            />
            <input
              className="input-filed"
              placeholder="Runway (months)"
              type="number"
              value={runway}
              onChange={(e) => setRunway(e.target.value)}
            />
          </>
        )}
        <Button onClick={handleCreate} disabled={busy || !title}>
          {busy ? "Creating..." : mode === "new" ? "Create Plan" : "Copy Plan"}
        </Button>
      </div>
    </ModalUi>
  );
}

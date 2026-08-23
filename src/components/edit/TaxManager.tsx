"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faXmark, faScaleBalanced } from "@fortawesome/free-solid-svg-icons";

const inputClass =
  "relative border-[1.6px] rounded-[.5rem] px-3 py-[.25rem] w-full shadow-sm placeholder-dark-500 text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-300 focus:shadow-primary-500 bg-dark-50 flex justify-between transition-all duration-200 text-base appearance-none";

function currentAnnualSalary(plan: any): number {
  const income = (plan.cashflow_list || []).find((c: any) => c.category === "i");
  return income ? (income.amount || 0) * 12 : 0;
}

export function TaxManager({ plan_id }: { plan_id: string }) {
  const router = useRouter();
  const plans = useFiPlanStore((s) => s.plans);
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);
  const plan = plans.find((p) => p._id === plan_id);

  const [regime, setRegime] = useState<"new" | "old">("new");
  const [income_tax_enabled, setIncomeTaxEnabled] = useState(false);
  const [age_group, setAgeGroup] = useState<"below60" | "senior" | "super_senior">("below60");
  const [saving, setSaving] = useState(false);

  const [negotiation, setNegotiation] = useState<any>(null);
  const [loading_negotiation, setLoadingNegotiation] = useState(false);
  const [negotiation_error, setNegotiationError] = useState("");

  useEffect(() => {
    if (plan) {
      const t = plan.tax_settings || {};
      setRegime(t.regime === "old" ? "old" : "new");
      setIncomeTaxEnabled(!!t.income_tax_enabled);
      setAgeGroup(t.age_group || "below60");
    }
  }, [plan]);

  async function SaveSettings() {
    if (!plan) return;
    setSaving(true);
    const tax_settings = {
      regime,
      income_tax_enabled,
      age_group,
      ...(plan.tax_settings?.deductions ? { deductions: plan.tax_settings.deductions } : {}),
      ...(plan.tax_settings?.salary_structure ? { salary_structure: plan.tax_settings.salary_structure } : {}),
    };
    update_plan_local({ ...plan, tax_settings });
    // persist to the server like other editors do
    if (plan._id) {
      try {
        await api.UpdatePlan({ ...plan, tax_settings });
      } catch {
        /* local copy stays; sync will retry */
      }
    }
    setSaving(false);
  }

  async function RunNegotiation() {
    if (!plan) return;
    const current = currentAnnualSalary(plan);
    if (current <= 0) {
      setNegotiationError("Add an income line first — negotiation needs a current salary.");
      return;
    }
    setLoadingNegotiation(true);
    setNegotiationError("");
    try {
      const res = await fetch("/api/tax/negotiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          current_gross: current,
          regime,
          age_group,
          scenarios: [
            { label: "Current +10%", new_gross: Math.round(current * 1.1) },
            { label: "Current +20%", new_gross: Math.round(current * 1.2) },
            { label: "Current +30%", new_gross: Math.round(current * 1.3) },
            { label: "Current +50%", new_gross: Math.round(current * 1.5) },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNegotiationError(json?.error?.message || "negotiation failed");
      } else {
        setNegotiation(json.data);
      }
    } catch (e: any) {
      setNegotiationError(e?.message || "negotiation failed");
    }
    setLoadingNegotiation(false);
  }

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  const current = currentAnnualSalary(plan);

  return (
    <div className="flex w-full flex-col gap-4 md:min-h-[570px]">
      {/* breadcrumb bar */}
      <div className="fixed bottom-0 z-20 flex w-full gap-2 border-b-2 border-t-2 bg-dark-50 p-1 pb-2 pt-2 md:relative md:z-0 md:mt-0 md:border-t-0 md:bg-transparent md:pb-2 md:pt-0">
        <div className="flex w-fit cursor-pointer gap-2 px-3 py-1 text-primary-600" onClick={() => router.back()}>
          <FontAwesomeIcon className="self-center text-xl font-bold" icon={faArrowLeft} />
        </div>
        <div className="self-center font-medium text-dark-400 first-letter:uppercase text-base md:text-xl">Tax Manager</div>
        <div className="ml-auto flex w-fit cursor-pointer gap-2 px-3 py-1 text-dark-600" onClick={() => router.back()}>
          <FontAwesomeIcon className="self-center text-xl font-bold" icon={faXmark} />
        </div>
      </div>

      <div className="mb-10 flex w-full flex-col gap-4 md:mb-0 md:flex-row">
        {/* settings column */}
        <div className="flex w-full flex-col gap-3 rounded-lg border bg-dark-50 p-3 md:w-[380px]">
          <div className="flex gap-3">
            <FontAwesomeIcon icon={faScaleBalanced} className="self-center text-2xl text-primary-500" />
            <span className="self-center font-medium">Tax Settings</span>
          </div>

          <div className="flex w-full gap-3">
            <div className="w-full">
              <span className="text-sm text-dark-300">Regime</span>
              <select value={regime} onChange={(e) => setRegime(e.target.value as any)} className={inputClass}>
                <option value="new">New Regime (default)</option>
                <option value="old">Old Regime</option>
              </select>
            </div>
            <div className="w-full">
              <span className="text-sm text-dark-300">Age Group</span>
              <select value={age_group} onChange={(e) => setAgeGroup(e.target.value as any)} className={inputClass}>
                <option value="below60">Below 60</option>
                <option value="senior">60-80 (Senior)</option>
                <option value="super_senior">80+ (Super Senior)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md bg-dark-100 p-2">
            <span className="text-sm text-dark-300">Auto Income Tax expense</span>
            <input
              type="checkbox"
              checked={income_tax_enabled}
              onChange={(e) => setIncomeTaxEnabled(e.target.checked)}
              className="h-5 w-5 accent-primary-400"
            />
          </div>
          <div className="rounded-md bg-warning-100 p-2 text-xs text-dark-400">
            When enabled, the engine deducts a monthly "Income Tax" expense from net cashflow using the slab rules for
            each assessment year — a salary hike automatically flows through the slabs.
          </div>

          <Button variant="primary" sub_variant="solid" className="w-full p-2" onClick={SaveSettings}>
            {saving ? <span className="animate-pulse">Saving…</span> : "Save Settings"}
          </Button>
        </div>

        {/* salary negotiation column */}
        <div className="flex w-full flex-col gap-3 rounded-lg border bg-dark-50 p-3 md:w-[520px]">
          <div className="flex gap-3">
            <span className="self-center font-medium">Salary Negotiation</span>
          </div>

          <div className="flex w-full items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase text-dark-300">Current gross (annual)</div>
              <DisplayAmount className="text-xl font-medium text-dark-600" notation="standard" amount={current} />
            </div>
            <Button variant="neutral" sub_variant="outline" size="md" className="px-3 py-1" onClick={RunNegotiation}>
              {loading_negotiation ? "…" : "Compare offers"}
            </Button>
          </div>

          {negotiation_error && <div className="rounded-md bg-danger-100 p-2 text-xs text-danger-500">{negotiation_error}</div>}

          {negotiation && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-dark-200 text-dark-300">
                    <th className="py-1 pr-2">Offer</th>
                    <th className="py-1 pr-2">Gross</th>
                    <th className="py-1 pr-2">Tax</th>
                    <th className="py-1 pr-2">Take-home</th>
                    <th className="py-1 pr-2">Marginal rate</th>
                    <th className="py-1">Δ Take-home</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-dark-100 text-dark-400">
                    <td className="py-1 pr-2">Current</td>
                    <td className="py-1 pr-2"><DisplayAmount notation="compact" amount={negotiation.current.gross} /></td>
                    <td className="py-1 pr-2"><DisplayAmount notation="compact" amount={negotiation.current.tax} /></td>
                    <td className="py-1 pr-2"><DisplayAmount notation="compact" amount={negotiation.current.take_home} /></td>
                    <td className="py-1 pr-2">—</td>
                    <td className="py-1">—</td>
                  </tr>
                  {negotiation.scenarios.map((s: any) => (
                    <tr key={s.label} className="border-b border-dark-100 text-dark-400">
                      <td className="py-1 pr-2">{s.label}</td>
                      <td className="py-1 pr-2"><DisplayAmount notation="compact" amount={s.gross} /></td>
                      <td className="py-1 pr-2"><DisplayAmount notation="compact" amount={s.tax} /></td>
                      <td className="py-1 pr-2"><DisplayAmount notation="compact" amount={s.take_home} /></td>
                      <td className="py-1 pr-2 font-medium text-danger-400">{s.marginal_tax_rate_on_hike}%</td>
                      <td className="py-1 font-medium text-success-400"><DisplayAmount notation="compact" amount={s.take_home_delta} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 rounded-md bg-dark-100 p-2 text-[11px] text-dark-400">
                Marginal rate = % of the raise you lose to tax. After-tax hike % shown per offer.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

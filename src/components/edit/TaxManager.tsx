"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faXmark,
  faScaleBalanced,
  faBriefcase,
  faCalendarDays,
  faCheck,
  faArrowsRotate,
  faBuildingColumns,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { faLightbulb } from "@fortawesome/free-regular-svg-icons";

const inputClass =
  "relative border border-dark-200 rounded-lg px-3 py-2 w-full shadow-xs placeholder-dark-400 text-dark-800 text-left focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 bg-white transition-all duration-200 text-sm appearance-none";
const labelClass = "text-xs font-semibold text-dark-600 uppercase tracking-wider";

function currentAnnualSalary(plan: any): number {
  const income = (plan.cashflow_list || []).find((c: any) => c.category === "i");
  return income ? (income.amount || 0) * 12 : 0;
}

const DEDUCTION_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "c80", label: "80C (PPF / ELSS / EPF)", hint: "max ₹1.5L" },
  { key: "d80", label: "80D Health Insurance (Self)", hint: "max ₹25k" },
  { key: "d80_senior_parents", label: "80D Parents (Senior)", hint: "max ₹50k" },
  { key: "tta", label: "80TTA Savings Interest", hint: "max ₹10k" },
  { key: "ttb", label: "80TTB Senior Deposits", hint: "max ₹50k" },
  { key: "b24", label: "24(b) Home Loan Interest", hint: "max ₹2L" },
  { key: "nps_1b", label: "80CCD(1B) NPS Tier 1", hint: "extra ₹50k" },
];

export function TaxManager({ plan_id }: { plan_id: string }) {
  const router = useRouter();
  const plans = useFiPlanStore((s) => s.plans);
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);
  const plan = plans.find((p) => p._id === plan_id);

  const [regime, setRegime] = useState<"new" | "old">("new");
  const [income_tax_enabled, setIncomeTaxEnabled] = useState(false);
  const [age_group, setAgeGroup] = useState<"below60" | "senior" | "super_senior">("below60");
  const [deductions, setDeductions] = useState<Record<string, number>>({});
  const [salary_structure, setSalaryStructure] = useState<{
    basic_annual: number;
    hra_annual: number;
    rent_annual: number;
    metro: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const [negotiation, setNegotiation] = useState<any>(null);
  const [loading_negotiation, setLoadingNegotiation] = useState(false);
  const [negotiation_error, setNegotiationError] = useState("");
  const [custom_offer, setCustomOffer] = useState<number | "">("");

  const [tax_summary, setTaxSummary] = useState<Record<string, any> | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (plan) {
      const t = plan.tax_settings || {};
      setRegime(t.regime === "old" ? "old" : "new");
      setIncomeTaxEnabled(!!t.income_tax_enabled);
      setAgeGroup(t.age_group || "below60");
      setDeductions(t.deductions || {});
      setSalaryStructure(t.salary_structure || null);
    }
  }, [plan]);

  // Live per-year tax projection from the engine
  useEffect(() => {
    let cancelled = false;
    if (plan && (plan.asset_list?.length > 0 || plan.tax_settings?.income_tax_enabled)) {
      setFetching(true);
      api
        .PlanSnapshot(plan, plan.duration || 600)
        .then((s: any) => {
          if (!cancelled) {
            setTaxSummary(s?.tax_summary || null);
            setFetching(false);
          }
        })
        .catch(() => {
          if (!cancelled) setFetching(false);
        });
    } else {
      setTaxSummary(null);
    }
    return () => {
      cancelled = true;
    };
  }, [plan]);

  async function SaveSettings() {
    if (!plan) return;
    setSaving(true);
    const tax_settings: any = {
      regime,
      income_tax_enabled,
      age_group,
    };
    const clean_deductions = Object.fromEntries(
      Object.entries(deductions).filter(([, v]) => typeof v === "number" && v > 0)
    );
    if (Object.keys(clean_deductions).length > 0) tax_settings.deductions = clean_deductions;
    if (salary_structure && (salary_structure.hra_annual > 0 || salary_structure.rent_annual > 0)) {
      tax_settings.salary_structure = salary_structure;
    }
    update_plan_local({ ...plan, tax_settings });
    try {
      await api.UpdatePlan({ ...plan, tax_settings });
    } catch {
      /* local copy stays */
    }
    setSaving(false);
  }

  async function RunNegotiation() {
    setLoadingNegotiation(true);
    setNegotiationError("");
    try {
      const current = currentAnnualSalary(plan);
      if (current <= 0) {
        setNegotiationError("Add an income line first — negotiation needs a current salary.");
        setLoadingNegotiation(false);
        return;
      }
      const scenarios =
        custom_offer && typeof custom_offer === "number" && custom_offer > 0
          ? [{ label: "Custom offer", new_gross: custom_offer }]
          : [
              { label: "+10%", new_gross: Math.round(current * 1.1) },
              { label: "+20%", new_gross: Math.round(current * 1.2) },
              { label: "+30%", new_gross: Math.round(current * 1.3) },
              { label: "+50%", new_gross: Math.round(current * 1.5) },
            ];
      const payload: any = {
        current_gross: current,
        scenarios,
        regime,
        age_group,
        deductions: Object.fromEntries(Object.entries(deductions).filter(([, v]) => Number(v) > 0)),
        ...(salary_structure ? { salary_structure } : {}),
      };
      const res = await fetch("/api/tax/negotiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) setNegotiationError(json?.error?.message || "Negotiation analysis failed");
      else setNegotiation(json.data);
    } catch (e: any) {
      setNegotiationError(e?.message || "Negotiation analysis failed");
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
  const tax_years = tax_summary ? Object.keys(tax_summary).sort() : [];

  return (
    <div className="flex w-full flex-col justify-between gap-3 md:min-h-[570px] md:w-[99vw]">
      {/* Breadcrumb Bar (Styled identically to LoanEditor & AssetEditor) */}
      <div className="fixed bottom-0 z-20 flex w-full items-center gap-2 border-b border-t bg-white px-3 py-2 shadow-xs md:relative md:z-0 md:mt-0 md:border-b md:border-t-0 md:bg-transparent md:px-0 md:py-1 md:shadow-none">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50"
          onClick={() => router.back()}
          title="Back"
        >
          <FontAwesomeIcon className="text-base font-bold" icon={faArrowLeft} />
        </button>
        <div className="h-5 w-[2px] rounded-full bg-primary-400" />
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-dark-700 sm:text-sm md:text-lg">Tax Manager</span>
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

      <div className="mb-16 flex h-full flex-col gap-5 md:mb-0 md:mt-0 md:flex-row md:items-start">
        {/* Column 1: Tax Settings & Regime */}
        <div className="flex w-full flex-col gap-4 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs md:w-[380px] lg:w-[400px] shrink-0">
          <div className="flex items-center gap-2.5 border-b border-dark-100 pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <FontAwesomeIcon icon={faScaleBalanced} className="text-sm" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-dark-800">Tax Settings</h3>
              <p className="text-xs text-dark-400">Configure income tax regime & deductions</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Tax Regime</span>
              <select
                value={regime}
                onChange={(e) => setRegime(e.target.value as any)}
                className={inputClass}
              >
                <option value="new">New Regime (Default)</option>
                <option value="old">Old Regime</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Age Group</span>
              <select
                value={age_group}
                onChange={(e) => setAgeGroup(e.target.value as any)}
                className={inputClass}
              >
                <option value="below60">&lt; 60 Years</option>
                <option value="senior">60 - 80 (Senior)</option>
                <option value="super_senior">80+ (Super Senior)</option>
              </select>
            </div>
          </div>

          {/* Auto Income Tax Toggle Card */}
          <div className="flex flex-col gap-2 rounded-lg border border-primary-200/80 bg-primary-50/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faShieldHalved} className="text-primary-600 text-sm" />
                <span className="text-xs font-bold text-dark-800">Auto Income Tax Deductions</span>
              </div>
              <input
                type="checkbox"
                checked={income_tax_enabled}
                onChange={(e) => setIncomeTaxEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
              />
            </div>
            <p className="text-[11px] text-dark-500 leading-tight">
              Automatically applies tax slabs to your monthly income and flows hikes into your net cashflow.
            </p>
          </div>

          {/* Deductions (Old Regime only) */}
          {regime === "old" && (
            <div className="flex flex-col gap-3 rounded-lg border border-dark-200 bg-dark-50/50 p-3">
              <div className="border-b border-dark-200/60 pb-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-dark-700">Deductions (Old Regime)</h4>
              </div>
              <div className="flex flex-col gap-2.5 max-h-56 overflow-y-auto pr-1">
                {DEDUCTION_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-medium text-dark-700">{f.label}</span>
                      <span className="text-[10px] text-dark-400 font-normal">{f.hint}</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={deductions[f.key] || ""}
                      placeholder="0"
                      onChange={(e) => setDeductions((d) => ({ ...d, [f.key]: Number(e.target.value) }))}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HRA Exemption (Old Regime only) */}
          {regime === "old" && (
            <div className="flex flex-col gap-3 rounded-lg border border-dark-200 bg-dark-50/50 p-3">
              <div className="border-b border-dark-200/60 pb-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-dark-700">HRA Structure</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-dark-600">Basic Annual (₹)</span>
                  <input
                    type="number"
                    min={0}
                    value={salary_structure?.basic_annual || ""}
                    placeholder="0"
                    onChange={(e) =>
                      setSalaryStructure((s) => ({
                        ...(s || { basic_annual: 0, hra_annual: 0, rent_annual: 0, metro: true }),
                        basic_annual: Number(e.target.value),
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-dark-600">HRA Annual (₹)</span>
                  <input
                    type="number"
                    min={0}
                    value={salary_structure?.hra_annual || ""}
                    placeholder="0"
                    onChange={(e) =>
                      setSalaryStructure((s) => ({
                        ...(s || { basic_annual: 0, hra_annual: 0, rent_annual: 0, metro: true }),
                        hra_annual: Number(e.target.value),
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-dark-600">Rent Paid (₹/yr)</span>
                  <input
                    type="number"
                    min={0}
                    value={salary_structure?.rent_annual || ""}
                    placeholder="0"
                    onChange={(e) =>
                      setSalaryStructure((s) => ({
                        ...(s || { basic_annual: 0, hra_annual: 0, rent_annual: 0, metro: true }),
                        rent_annual: Number(e.target.value),
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <label className="flex items-center gap-1.5 pt-4 text-xs font-medium text-dark-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={salary_structure?.metro ?? true}
                    onChange={(e) =>
                      setSalaryStructure((s) => ({
                        ...(s || { basic_annual: 0, hra_annual: 0, rent_annual: 0, metro: true }),
                        metro: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
                  />
                  Metro City
                </label>
              </div>
            </div>
          )}

          <Button
            variant="primary"
            sub_variant="solid"
            size="lg"
            className="w-full justify-center gap-2 py-2.5 font-bold shadow-xs"
            onClick={SaveSettings}
          >
            {saving ? (
              <FontAwesomeIcon icon={faArrowsRotate} className="animate-spin text-sm" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="text-sm" />
            )}
            <span>{saving ? "Saving Changes…" : "Save Tax Settings"}</span>
          </Button>
        </div>

        {/* Column 2: Salary Negotiation Tool */}
        <div className="flex w-full flex-col gap-4 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs md:w-[440px] lg:w-[460px] shrink-0">
          <div className="flex items-center gap-2.5 border-b border-dark-100 pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <FontAwesomeIcon icon={faBriefcase} className="text-sm" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-dark-800">Salary Negotiation Analysis</h3>
              <p className="text-xs text-dark-400">Evaluate offer increments against marginal tax brackets</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-2.5 rounded-lg border border-dark-200 bg-dark-50/50 p-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Current Gross</span>
              <DisplayAmount className="text-lg font-bold text-dark-800 block" notation="standard" amount={current} />
            </div>

            <div className="w-[120px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Custom Offer (₹)</span>
              <input
                type="number"
                min={0}
                value={custom_offer}
                placeholder="e.g. 2400000"
                onChange={(e) => setCustomOffer(e.target.value ? Number(e.target.value) : "")}
                className="relative border border-dark-200 rounded-lg px-2.5 py-1.5 w-full text-xs shadow-xs text-dark-800 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400"
              />
            </div>

            <Button
              variant="neutral"
              sub_variant="outline"
              size="md"
              className="px-3.5 py-1.5 font-semibold text-xs text-primary-700 border-primary-300 hover:bg-primary-50"
              onClick={RunNegotiation}
            >
              {loading_negotiation ? <FontAwesomeIcon icon={faArrowsRotate} className="animate-spin text-xs" /> : "Compare"}
            </Button>
          </div>

          {negotiation_error && (
            <div className="rounded-lg bg-danger-50 border border-danger-200 p-2.5 text-xs text-danger-700 font-medium">
              {negotiation_error}
            </div>
          )}

          {negotiation && (
            <div className="flex flex-col gap-2">
              <div className="overflow-x-auto rounded-lg border border-dark-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-dark-50 text-dark-500 font-semibold border-b border-dark-200">
                    <tr>
                      <th className="py-2 px-2.5">Offer</th>
                      <th className="py-2 px-2">Gross</th>
                      <th className="py-2 px-2">Tax</th>
                      <th className="py-2 px-2">Take-home</th>
                      <th className="py-2 px-2 text-right">Marginal</th>
                      <th className="py-2 px-2.5 text-right">Δ Take-home</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-100">
                    <tr className="text-dark-700 bg-dark-50/30 font-medium">
                      <td className="py-2 px-2.5 font-bold">Current</td>
                      <td className="py-2 px-2"><DisplayAmount notation="compact" amount={negotiation.current.gross} /></td>
                      <td className="py-2 px-2"><DisplayAmount notation="compact" amount={negotiation.current.tax} /></td>
                      <td className="py-2 px-2 font-bold"><DisplayAmount notation="compact" amount={negotiation.current.take_home} /></td>
                      <td className="py-2 px-2 text-right text-dark-400">—</td>
                      <td className="py-2 px-2.5 text-right text-dark-400">—</td>
                    </tr>
                    {negotiation.scenarios.map((s: any) => (
                      <tr key={s.label} className="text-dark-700 hover:bg-dark-50/50 transition-colors">
                        <td className="py-2 px-2.5 font-semibold text-primary-700">{s.label}</td>
                        <td className="py-2 px-2"><DisplayAmount notation="compact" amount={s.gross} /></td>
                        <td className="py-2 px-2 text-dark-500"><DisplayAmount notation="compact" amount={s.tax} /></td>
                        <td className="py-2 px-2 font-bold text-dark-800"><DisplayAmount notation="compact" amount={s.take_home} /></td>
                        <td className="py-2 px-2 text-right font-bold text-danger-600">{s.marginal_tax_rate_on_hike}%</td>
                        <td className="py-2 px-2.5 text-right font-bold text-emerald-600">
                          +<DisplayAmount notation="compact" amount={s.take_home_delta} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-start gap-1.5 rounded-lg bg-dark-50 p-2 text-[11px] text-dark-500">
                <FontAwesomeIcon icon={faLightbulb} className="text-amber-500 text-xs mt-0.5" />
                <span><strong>Marginal rate:</strong> The percentage of every additional rupee lost to income tax brackets.</span>
              </div>
            </div>
          )}
        </div>

        {/* Column 3: Multi-Year Tax Projection Breakdown */}
        <div className="flex w-full flex-1 flex-col gap-4 rounded-xl border border-dark-200 bg-white p-4 shadow-2xs min-w-0">
          <div className="flex items-center gap-2.5 border-b border-dark-100 pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FontAwesomeIcon icon={faCalendarDays} className="text-sm" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-dark-800">Multi-Year Tax Projections</h3>
              <p className="text-xs text-dark-400">Projected TDS, capital gains, and annual liability timeline</p>
            </div>
          </div>

          {tax_years.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-dark-200 bg-dark-50/50 p-8 text-center">
              <FontAwesomeIcon icon={faBuildingColumns} className="text-2xl text-dark-400 mb-2" />
              <h4 className="text-xs font-bold text-dark-700">No Tax Data Available</h4>
              <p className="text-xs text-dark-400 mt-1 max-w-sm">
                {income_tax_enabled || plan.asset_list?.length > 0
                  ? "Calculating the projected tax timeline…"
                  : "Enable Auto Income Tax or add assets to compute the year-wise tax trajectory."}
              </p>
            </div>
          )}

          {tax_years.length > 0 && (
            <div className={`flex flex-col gap-3 transition-opacity duration-300 ${fetching ? "opacity-50" : "opacity-100"}`}>
              <div className="overflow-x-auto rounded-lg border border-dark-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-dark-50 text-dark-500 font-semibold border-b border-dark-200">
                    <tr>
                      <th className="py-2 px-2.5">FY</th>
                      <th className="py-2 px-2 text-right">Interest</th>
                      <th className="py-2 px-2 text-right">Rent</th>
                      <th className="py-2 px-2 text-right">Div.</th>
                      <th className="py-2 px-2 text-right">Slab Gains</th>
                      <th className="py-2 px-2 text-right">LTCG</th>
                      <th className="py-2 px-2 text-right">STCG</th>
                      <th className="py-2 px-2 text-right">TDS Paid</th>
                      <th className="py-2 px-2.5 text-right">TDS Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-100">
                    {tax_years.map((fy) => {
                      const t = tax_summary![fy];
                      return (
                        <tr key={fy} className="text-dark-700 hover:bg-dark-50/50 transition-colors">
                          <td className="py-2 px-2.5 font-bold text-dark-800">{fy}</td>
                          <td className="py-2 px-2 text-right"><DisplayAmount notation="compact" amount={t.interest_income || 0} /></td>
                          <td className="py-2 px-2 text-right"><DisplayAmount notation="compact" amount={t.rent_income || 0} /></td>
                          <td className="py-2 px-2 text-right"><DisplayAmount notation="compact" amount={t.dividends || 0} /></td>
                          <td className="py-2 px-2 text-right"><DisplayAmount notation="compact" amount={t.slab_taxable_gains || 0} /></td>
                          <td className="py-2 px-2 text-right font-medium text-dark-800"><DisplayAmount notation="compact" amount={t.ltcg_realized || 0} /></td>
                          <td className="py-2 px-2 text-right font-medium text-dark-800"><DisplayAmount notation="compact" amount={t.stcg_realized || 0} /></td>
                          <td className="py-2 px-2 text-right text-dark-500"><DisplayAmount notation="compact" amount={t.tds_paid || 0} /></td>
                          <td className="py-2 px-2.5 text-right font-bold text-emerald-600">
                            <DisplayAmount notation="compact" amount={t.tds_credit_used || 0} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-dark-50 p-2.5 text-[11px] text-dark-500">
                <FontAwesomeIcon icon={faLightbulb} className="text-amber-500 text-xs mt-0.5" />
                <div>
                  <strong>Tax Offsetting:</strong> LTCG / STCG are taxed upon asset disposal. TDS paid on interest is automatically applied as a credit offset against your total annual liability.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

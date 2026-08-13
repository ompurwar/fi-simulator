"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { usePlanEngine } from "@/hooks/usePlanEngine";
import { useRunway } from "@/hooks/useRunway";
import { useBalanceSeq } from "@/hooks/useBalanceSeq";
import { useWalkThrough } from "@/hooks/useWalkThrough";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { MyChart } from "@/components/ui/MyChart";
import { MonthSlider } from "@/components/plan/MonthSlider";
import { Disclosure, Popover } from "@headlessui/react";
import { FireNotification } from "@/store/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWallet, faArrowRightArrowLeft, faSackDollar, faCoins, faShareNodes } from "@fortawesome/free-solid-svg-icons";

/** Port of pages/plan.page.vue — the main financial dashboard. */
function PlanPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan_id = searchParams.get("p_id") || "";

  const plans = useFiPlanStore((s) => s.plans);
  const selected_plan_id = useFiPlanStore((s) => s.selected_plan_id);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);
  const plan_duration = useFiPlanStore((s) => s.plan_duration);
  const setGodPlanEntity = useFiPlanStore((s) => s.set_god_plan_entity);
  const setShareData = useFiPlanStore((s) => s.set_share_data);
  const sync_plan = useFiPlanStore((s) => s.sync_plan);
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);

  const [current_month, setCurrentMonth] = useState(1);
  const [show_simulation_modal, setShowSimulationModal] = useState(false);

  const plan = useMemo(
    () => plans.find((p) => p._id === (plan_id || selected_plan_id)) || plans[0],
    [plans, plan_id, selected_plan_id]
  );

  const engine = usePlanEngine(plan, plan_duration);
  const { cashflow, balance_and_transaction_by_month, net_cashflow, account_balances_and_transactions } = engine;
  const { runway } = useRunway(cashflow.expense_statement, account_balances_and_transactions.account_balances, current_month);
  const sorted_balances = useBalanceSeq(account_balances_and_transactions.account_balances);
  const startWalkThrough = useWalkThrough(plan);

  useEffect(() => {
    if (plan_id && plan_id !== selected_plan_id) setSelectedPlanId(plan_id);
  }, [plan_id, selected_plan_id, setSelectedPlanId]);

  // simulation modal on mount for unsynced plans
  useEffect(() => {
    if (plan && !plan.modified_at) {
      setShowSimulationModal(true);
      const t = setTimeout(() => setShowSimulationModal(false), 2500);
      return () => clearTimeout(t);
    }
  }, [plan]);

  function HandleEdit(entity_type: string, entity_id = "", meta_data = {}) {
    setGodPlanEntity({ active: true, plan_id: plan?._id, entity_type, entity_id, meta_data });
    router.push("/edit");
  }

  function OnCompare() {
    router.push(`/plans/compare?p_ids=${plan?._id}`);
  }

  function OnShare() {
    setShareData({ modal_state: "open", type: "template", ids: [plan?._id], category: "t-i" });
  }

  async function Save() {
    if (!plan) return;
    try {
      await sync_plan(plan._id);
      FireNotification({ title: "Plan saved", variant: "success" });
    } catch (e: any) {
      FireNotification({ title: "Save failed", desc: e.message, variant: "danger" });
    }
  }

  if (!plan) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-dark-500">No plan yet.</p>
        <Button onClick={() => useFiPlanStore.getState().set_plan_component_state("open")}>Create your first plan</Button>
      </div>
    );
  }

  const month_balances = balance_and_transaction_by_month.find((b: any) => b.month === current_month);
  const chart_months = Math.min(20, plan_duration);
  const chart_labels = Array.from({ length: chart_months }, (_, i) => `M${i + 1}`);
  const chart_datasets = [
    {
      label: "Emergency",
      data: Array.from({ length: chart_months }, (_, i) =>
        account_balances_and_transactions.account_balances.find((b: any) => b.month === i + 1 && b.category === "e")?.balance || 0
      ),
      backgroundColor: "rgba(244,63,94,0.7)",
    },
    {
      label: "Savings",
      data: Array.from({ length: chart_months }, (_, i) =>
        account_balances_and_transactions.account_balances.find((b: any) => b.month === i + 1 && b.category === "s")?.balance || 0
      ),
      backgroundColor: "rgba(16,185,129,0.7)",
    },
    {
      label: "Investment",
      data: Array.from({ length: chart_months }, (_, i) =>
        account_balances_and_transactions.account_balances.find((b: any) => b.month === i + 1 && b.category === "i")?.balance || 0
      ),
      backgroundColor: "rgba(6,182,212,0.7)",
    },
  ];

  const income_obj = cashflow.income_statement[current_month - 1];
  const expense_obj = cashflow.expense_statement[current_month - 1];
  const prev_income = cashflow.income_statement[current_month - 2];
  const prev_expense = cashflow.expense_statement[current_month - 2];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* header */}
      <div className="plan-header mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-800">{plan.title}</h1>
          {plan.description && <p className="text-sm text-dark-500">{plan.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="neutral" size="sm" onClick={OnCompare}>
            <FontAwesomeIcon icon={faArrowRightArrowLeft} className="mr-1 h-3 w-3" /> Compare
          </Button>
          <Button size="sm" onClick={Save}>Save</Button>
          <Button variant="accent" size="sm" onClick={OnShare}>
            <FontAwesomeIcon icon={faShareNodes} className="mr-1 h-3 w-3" /> Share
          </Button>
          <Button variant="neutral" size="sm" onClick={startWalkThrough}>Tour</Button>
        </div>
      </div>

      {/* manager tiles (left sidebar on md+) */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          className="income-manager card flex cursor-pointer items-center gap-3 hover:shadow-lg"
          onClick={() => HandleEdit("cashflow", "", { category: "i" })}
        >
          <FontAwesomeIcon icon={faWallet} className="text-primary-500" />
          <div>
            <p className="text-sm font-semibold">Income Manager</p>
            <p className="text-xs text-dark-400">{engine.income_list.length} streams</p>
          </div>
        </div>
        <div
          className="expense-manager card flex cursor-pointer items-center gap-3 hover:shadow-lg"
          onClick={() => HandleEdit("cashflow", "", { category: "e" })}
        >
          <FontAwesomeIcon icon={faCoins} className="text-danger-500" />
          <div>
            <p className="text-sm font-semibold">Expense Manager</p>
            <p className="text-xs text-dark-400">{engine.expense_list.length} streams</p>
          </div>
        </div>
        <div
          className="loan-manager card flex cursor-pointer items-center gap-3 hover:shadow-lg"
          onClick={() => HandleEdit("loan", "")}
        >
          <FontAwesomeIcon icon={faSackDollar} className="text-warning-500" />
          <div>
            <p className="text-sm font-semibold">Loan Manager</p>
            <p className="text-xs text-dark-400">{plan.loan_accounts?.length || 0} loans</p>
          </div>
        </div>
        <div
          className="money-manager card flex cursor-pointer items-center gap-3 hover:shadow-lg"
          onClick={() => HandleEdit("account", "")}
        >
          <FontAwesomeIcon icon={faCoins} className="text-accent-500" />
          <div>
            <p className="text-sm font-semibold">Money Manager</p>
            <p className="text-xs text-dark-400">{plan.account_list?.length || 0} accounts</p>
          </div>
        </div>
      </div>

      {/* wealth chart */}
      <div className="card mb-6">
        <h2 className="mb-3 text-lg font-semibold text-dark-700">Wealth projection</h2>
        <div className="h-64">
          <MyChart labels={chart_labels} dataset={chart_datasets} stacked chart_type="bar" />
        </div>
      </div>

      {/* income / expense cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-dark-700">Income</h3>
            <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-600">
              {prev_income && income_obj && prev_income.total_income
                ? `${(((income_obj.total_income - prev_income.total_income) / prev_income.total_income) * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-success-600">
            <DisplayAmount amount={income_obj?.total_income || 0} />
          </p>
          <Disclosure>
            {({ open }) => (
              <>
                <Disclosure.Button className="mt-2 text-xs text-primary-500 underline">
                  {open ? "Hide" : "Show"} breakdown
                </Disclosure.Button>
                <Disclosure.Panel className="mt-2">
                  {income_obj?.income_breakdown?.map((b: any) => (
                    <div key={b.id} className="flex justify-between py-1 text-sm">
                      <span className="text-dark-500">{b.cashflow_title}</span>
                      <span className="text-dark-700"><DisplayAmount amount={b.amount} /></span>
                    </div>
                  ))}
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-dark-700">Expense</h3>
            <span className="rounded-full bg-danger-50 px-2 py-0.5 text-xs text-danger-600">
              {prev_expense && expense_obj && prev_expense.total_expense
                ? `${(((expense_obj.total_expense - prev_expense.total_expense) / prev_expense.total_expense) * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-danger-600">
            <DisplayAmount amount={expense_obj?.total_expense || 0} />
          </p>
          <Disclosure>
            {({ open }) => (
              <>
                <Disclosure.Button className="mt-2 text-xs text-primary-500 underline">
                  {open ? "Hide" : "Show"} breakdown
                </Disclosure.Button>
                <Disclosure.Panel className="mt-2">
                  {expense_obj?.expense_breakdown?.map((b: any) => (
                    <div key={b.id} className="flex justify-between py-1 text-sm">
                      <span className="text-dark-500">{b.cashflow_title}</span>
                      <span className="text-dark-700"><DisplayAmount amount={b.amount} /></span>
                    </div>
                  ))}
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
        </div>
      </div>

      {/* net cashflow + runway */}
      <div className="balance-card mb-6 grid gap-4 md:grid-cols-3">
        <div className="card">
          <h3 className="text-sm font-semibold text-dark-500">Net Cashflow</h3>
          <p className="mt-1 text-xl font-bold text-dark-800">
            <DisplayAmount amount={net_cashflow[current_month - 1]?.total || 0} />
          </p>
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-dark-500">Runway</h3>
          <Popover className="relative">
            <Popover.Button className="text-xl font-bold text-primary-600 underline-dotted">
              {runway ? runway.toFixed(1) : "—"} months
            </Popover.Button>
            <Popover.Panel className="absolute z-10 mt-1 rounded-lg bg-dark-800 p-3 text-xs text-white shadow-xl">
              Your savings could sustain current expenses for {runway ? runway.toFixed(1) : 0} months.
            </Popover.Panel>
          </Popover>
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-dark-500">Net Worth</h3>
          <p className="mt-1 text-xl font-bold text-dark-800">
            <DisplayAmount amount={sorted_balances.reduce((acc, b: any) => acc + (b.balance || 0), 0)} />
          </p>
        </div>
      </div>

      {/* month slider */}
      <MonthSlider value={current_month} max={plan_duration} onChange={setCurrentMonth} />

      {/* transactions for current month */}
      <div className="card mt-4">
        <h3 className="mb-3 font-semibold text-dark-700">Transactions — Month {current_month}</h3>
        {month_balances?.data?.length ? (
          <div className="space-y-2">
            {month_balances.data.map((acc: any) => (
              <div key={acc.account_id} className="rounded-lg bg-dark-50 p-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{acc.acc_name}</span>
                  <span><DisplayAmount amount={acc.balance?.[0]?.balance || 0} /></span>
                </div>
                {acc.txn?.map((t: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs text-dark-500">
                    <span>{t.tran_desc}</span>
                    <span className={t.tran_type === "cr" ? "text-success-600" : "text-danger-600"}>
                      {t.tran_type === "cr" ? "+" : "-"}<DisplayAmount amount={Math.abs(t.amount)} />
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-dark-400">No transactions this month.</p>
        )}
      </div>

      {/* simulation modal */}
      {show_simulation_modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-900/60">
          <div className="rounded-2xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
            <p className="font-semibold text-dark-800">Setting up plan...</p>
            <p className="text-sm text-dark-400">Simulating your financial future</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-50" />}>
      <PlanPageInner />
    </Suspense>
  );
}

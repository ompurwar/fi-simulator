"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faXmark,
  faArrowRightArrowLeft,
  faChevronUp,
  faChevronDown,
  faArrowsRotate,
  faCloudArrowUp,
  faCheck,
  faVault,
  faPiggyBank,
  faChartLine,
  faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";
import { faLightbulb } from "@fortawesome/free-regular-svg-icons";
import { FireNotification } from "@/store/notifications";

const CATEGORY_META: Record<string, { label: string; icon: any; color: string }> = {
  s: { label: "Savings", icon: faPiggyBank, color: "text-amber-600" },
  e: { label: "Emergency", icon: faVault, color: "text-blue-600" },
  i: { label: "Investment", icon: faChartLine, color: "text-emerald-600" },
};

const CATEGORY_RANK: Record<string, number> = { s: 0, e: 1, i: 2 };

/**
 * Plan-level withdrawal order — the sequence money flows OUT when funding an
 * outflow: SIP instalments (funding account first, then the ladder; skipped
 * when the ladder cannot cover them) and expense/EMI/prepayment drawdowns.
 */
export function WithdrawalOrderEditor({ plan_id }: { plan_id: string }) {
  const router = useRouter();
  const plans = useFiPlanStore((s) => s.plans);
  const plan_synced_map = useFiPlanStore((s) => s.plan_synced_map);
  const sync_plan = useFiPlanStore((s) => s.sync_plan);

  const plan = plans.find((p) => p._id === plan_id);

  const all_accounts = useMemo(() => (plan?.account_list || []).filter((a: any) => a.type === "a"), [plan]);
  const asset_accounts = useMemo(() => all_accounts.filter((a: any) => a.category === "s" || a.category === "e" || a.category === "i"), [all_accounts]);

  const [custom_order, setCustomOrder] = useState<boolean>(!!(plan && plan.withdrawal_order && plan.withdrawal_order.length));
  const [protect, setProtect] = useState<boolean>(plan?.withdrawal_settings?.protect_emergency_for_sip !== false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const default_order = useMemo(() => {
    return [...all_accounts].sort((a: any, b: any) => {
      const rank = (CATEGORY_RANK[a.category] ?? 3) - (CATEGORY_RANK[b.category] ?? 3);
      return rank !== 0 ? rank : String(a._id).localeCompare(String(b._id));
    });
  }, [all_accounts]);

  const withdrawal_order = plan?.withdrawal_order;

  const ordered_accounts = useMemo(() => {
    if (!custom_order || !withdrawal_order?.length) return default_order;
    const by_id = new Map(all_accounts.map((a: any) => [String(a._id), a]));
    const ordered: any[] = [];
    for (const id of withdrawal_order) {
      const acc = by_id.get(String(id));
      if (acc) ordered.push(acc);
    }
    return ordered;
  }, [custom_order, withdrawal_order, all_accounts, default_order]);

  const ordered_ids = new Set(ordered_accounts.map((a: any) => String(a._id)));
  const missing = custom_order && asset_accounts.some((a: any) => !ordered_ids.has(String(a._id)));

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...ordered_accounts];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const ids = next.map((a: any) => String(a._id));
    if (!custom_order) setCustomOrder(true);
    useFiPlanStore.getState().update_plan_local({
      ...plan!,
      withdrawal_order: ids,
      withdrawal_settings: { ...(plan!.withdrawal_settings || {}), protect_emergency_for_sip: protect },
    });
    setDirty(true);
  }

  async function SavePlan() {
    setSaving(true);
    try {
      const ids = ordered_accounts.map((a: any) => String(a._id));
      useFiPlanStore.getState().update_plan_local({
        ...plan!,
        withdrawal_order: ids,
        withdrawal_settings: { ...(plan!.withdrawal_settings || {}), protect_emergency_for_sip: protect },
      });
      if (plan_synced_map[plan_id] !== false) {
        await sync_plan(plan_id);
      }
      FireNotification({ title: "Success", desc: "Withdrawal order saved!", variant: "success", active: true, dismissal: "true", time_based: true, duration: 6000, buttons: [] });
      setDirty(false);
    } catch (e: any) {
      FireNotification({ title: "Save failed", desc: e.message, variant: "danger", active: true, dismissal: "true", time_based: true, duration: 6000, buttons: [] });
    } finally {
      setSaving(false);
    }
  }

  async function ResetDefault() {
    useFiPlanStore.getState().update_plan_local({
      ...plan!,
      withdrawal_order: undefined,
      withdrawal_settings: { ...(plan!.withdrawal_settings || {}), protect_emergency_for_sip: protect },
    });
    setCustomOrder(false);
    setDirty(true);
  }

  const is_synced = plan_synced_map[plan_id] !== false;

  return (
    <div className="flex w-full flex-col justify-between gap-4 md:min-h-[570px] md:w-[99vw]">
      {/* Breadcrumb Navigation Bar */}
      <div className="flex items-center gap-2 rounded-2xl border border-dark-200 bg-white px-4 py-2.5 shadow-xs">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark-100 text-dark-600 hover:bg-dark-200 transition-colors"
          onClick={() => router.back()}
        >
          <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
        </button>
        <div className="h-4 w-px bg-dark-200 mx-1" />
        <div className="flex items-center gap-1.5 overflow-hidden text-xs font-bold text-dark-700">
          <span className="text-dark-500">Withdraw Order</span>
          <span className="text-dark-300">/</span>
          <span className="text-primary-600">Outflow Sequence</span>
        </div>
        <button
          type="button"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-dark-100 text-dark-600 hover:bg-dark-200 transition-colors"
          onClick={() => router.back()}
        >
          <FontAwesomeIcon icon={faXmark} className="text-xs" />
        </button>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        {/* Ordering panel */}
        <div className="flex w-full flex-col gap-3 md:w-2/3">
          <div className="rounded-2xl border border-dark-200 bg-white p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between border-b border-dark-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                  <FontAwesomeIcon icon={faArrowRightArrowLeft} className="text-sm" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-dark-800">Withdrawal Priority</h3>
                  <p className="text-[11px] font-medium text-dark-400">
                    First account in the list is drained first
                  </p>
                </div>
              </div>
              <span className={`rounded-md px-2 py-1 text-[11px] font-extrabold ${custom_order ? "bg-primary-50 text-primary-700" : "bg-dark-100 text-dark-600"}`}>
                {custom_order ? "Custom" : "Default"}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {ordered_accounts.map((account: any, index: number) => {
                const meta = CATEGORY_META[account.category] || CATEGORY_META.e;
                return (
                  <div key={String(account._id)} className="flex items-center gap-2.5 rounded-xl border border-dark-100 bg-dark-50/50 px-3 py-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-dark-600 border border-dark-100 font-extrabold text-xs">
                      {index + 1}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold text-dark-800">{account.title}</span>
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-dark-500">
                        <FontAwesomeIcon icon={meta.icon} className={`text-[10px] ${meta.color}`} />
                        {meta.label} Bucket
                        {typeof account.roi === "number" ? ` · ${account.roi}% ROI` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-dark-200 text-dark-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-30 transition-colors"
                      >
                        <FontAwesomeIcon icon={faChevronUp} className="text-xs" />
                      </button>
                      <button
                        type="button"
                        disabled={index === ordered_accounts.length - 1}
                        onClick={() => move(index, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-dark-200 text-dark-600 hover:border-primary-400 hover:text-primary-600 disabled:opacity-30 transition-colors"
                      >
                        <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {asset_accounts.length === 0 && (
                <div className="rounded-xl border border-dashed border-dark-200 p-4 text-center text-xs font-semibold text-dark-500">
                  No accounts yet — add accounts in the Money Manager first.
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-dark-100 pt-3">
              <button
                type="button"
                onClick={ResetDefault}
                className="flex items-center gap-1.5 rounded-lg border border-dark-200 bg-white px-3 py-1.5 text-xs font-bold text-dark-600 hover:bg-dark-50 transition-colors"
              >
                <FontAwesomeIcon icon={faArrowsRotate} className="text-[10px]" />
                <span>Reset to default</span>
              </button>
              <span className="text-[10px] font-semibold text-dark-400">
                Default: Savings → Emergency → Investment
              </span>
            </div>
          </div>

          {missing && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs font-medium text-amber-800">
              Some accounts are missing from the order — reorder at least once to include all accounts.
            </div>
          )}
        </div>

        {/* Policy panel */}
        <div className="flex w-full flex-col gap-3 md:w-1/3">
          <div className="rounded-2xl border border-dark-200 bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-dark-800">SIP Funding</h3>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-dark-500">
              An SIP is paid from its funding account first, then each following
              account in the withdrawal list. A payment is skipped entirely when
              the list cannot cover the instalment — balances never go negative.
            </p>
          </div>

          <div className="rounded-2xl border border-dark-200 bg-white p-5 shadow-xs">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={!protect}
                onChange={(e) => {
                  setProtect(!e.target.checked);
                  useFiPlanStore.getState().update_plan_local({
                    ...plan,
                    withdrawal_settings: { ...(plan?.withdrawal_settings || {}), protect_emergency_for_sip: !e.target.checked },
                  });
                  setDirty(true);
                }}
                className="mt-0.5 h-4 w-4 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="flex flex-col">
                <span className="text-xs font-bold text-dark-800">Use emergency money for SIPs</span>
                <span className="text-[11px] font-medium text-dark-500">
                  Off by default — the emergency bucket is a safety net and is
                  not auto-raided to fund investments.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-2.5 rounded-xl border border-dark-100 bg-dark-50/60 p-3.5 text-xs text-dark-600">
            <div className="flex items-start gap-2">
              <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 text-amber-600" />
              <span className="font-medium text-dark-700">
                This order also drives expense/EMI shortfall drawdowns and loan prepayments.
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={SavePlan}
              disabled={saving || !dirty}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-bold text-white shadow-xs transition-all hover:bg-primary-600 active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? (
                <FontAwesomeIcon icon={faArrowsRotate} className="animate-spin text-sm" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-sm" />
              )}
              <span>Save Withdraw Order</span>
            </button>

            {!dirty && (
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                <FontAwesomeIcon icon={faCircleCheck} className="text-[10px]" />
                <span>Saved</span>
              </div>
            )}

            {!is_synced && (
              <div className="flex flex-col gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 text-amber-600" />
                  <span className="font-medium text-amber-800">
                    Changes are not synced automatically — save them now so the simulation picks them up.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={SavePlan}
                  disabled={saving}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faCloudArrowUp} className="text-xs" />
                  <span>Save changes</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

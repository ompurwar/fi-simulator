"use client";

import { Listbox, Popover } from "@headlessui/react";
import { useRouter, usePathname } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faChevronDown, faRightFromBracket, faLayerGroup } from "@fortawesome/free-solid-svg-icons";

/** Port of the App.vue top navigation bar. */
export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const profile = useFiPlanStore((s) => s.profile);
  const plans = useFiPlanStore((s) => s.plans);
  const selected_plan_id = useFiPlanStore((s) => s.selected_plan_id);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);
  const setDefaultPlanId = useFiPlanStore((s) => s.set_default_plan_id);
  const setPlanComponentState = useFiPlanStore((s) => s.set_plan_component_state);

  const selected_plan = plans.find((p) => p._id === selected_plan_id) || plans[0];
  const username = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || profile?.email;
  const show_create = pathname.startsWith("/plan");

  async function handlePlanSwitch(id: string) {
    setSelectedPlanId(id);
    setDefaultPlanId(id);
    try {
      await api.SetDefaultPlan(id);
    } catch {
      /* noop */
    }
    router.push(`/plan?p_id=${id}`);
  }

  async function handleLogout() {
    try {
      await api.Logout();
    } catch {
      /* noop */
    }
    localStorage.clear();
    router.push("/login");
  }

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-dark-100 bg-white px-4 shadow-sm">
      <div className="flex items-center gap-4">
        <Logo />
        {show_create && (
          <button
            onClick={() => setPlanComponentState("open")}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
          >
            + Create Plan
          </button>
        )}
        {/* teleport target used by plan/compare pages to inject the Share button */}
        <div id="share-button" />
      </div>

      <div className="flex items-center gap-3">
        {/* Plan switcher (desktop) */}
        {plans.length > 0 && (
          <Listbox value={selected_plan?._id} onChange={handlePlanSwitch}>
            <div className="relative hidden md:block">
              <Listbox.Button className="flex items-center gap-2 rounded-lg border border-dark-200 bg-white px-3 py-1.5 text-sm text-dark-700 hover:bg-dark-50">
                <FontAwesomeIcon icon={faLayerGroup} className="text-dark-400" />
                <span className="max-w-[12rem] truncate">{selected_plan?.title || "Select plan"}</span>
                <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3 text-dark-400" />
              </Listbox.Button>
              <Listbox.Options className="absolute right-0 z-50 mt-1 max-h-60 w-64 overflow-auto rounded-xl bg-white py-1 shadow-xl ring-1 ring-dark-100">
                {plans.map((plan) => (
                  <Listbox.Option
                    key={plan._id}
                    value={plan._id}
                    className="cursor-pointer px-3 py-2 text-sm text-dark-700 hover:bg-dark-50"
                  >
                    {plan.title}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </div>
          </Listbox>
        )}

        {/* Profile menu */}
        <Popover className="relative">
          <Popover.Button className="flex items-center gap-2 rounded-lg border border-dark-200 bg-white px-3 py-1.5 text-sm text-dark-700 hover:bg-dark-50">
            {profile?.photos?.length ? (
              <img src={profile.photos[profile.photos.length - 1]} className="h-6 w-6 rounded-full object-cover" alt="" />
            ) : (
              <FontAwesomeIcon icon={faUser} className="text-dark-400" />
            )}
            <span className="max-w-[10rem] truncate">{username}</span>
            <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3 text-dark-400" />
          </Popover.Button>
          <Popover.Panel className="absolute right-0 z-50 mt-1 w-56 rounded-xl bg-white py-1 shadow-xl ring-1 ring-dark-100">
            {/* mobile plan switcher */}
            {plans.length > 0 && (
              <div className="border-b border-dark-100 px-3 py-2 md:hidden">
                <select
                  value={selected_plan?._id}
                  onChange={(e) => handlePlanSwitch(e.target.value)}
                  className="w-full rounded-lg border border-dark-200 px-2 py-1 text-sm"
                >
                  {plans.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => router.push("/shared_templates")}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-dark-700 hover:bg-dark-50"
            >
              My Templates
            </button>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger-500 hover:bg-danger-50"
            >
              <FontAwesomeIcon icon={faRightFromBracket} className="h-3 w-3" />
              Log Out
            </button>
          </Popover.Panel>
        </Popover>
      </div>
    </header>
  );
}

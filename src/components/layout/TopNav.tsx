"use client";

import { Listbox, Popover } from "@headlessui/react";
import { useRouter, usePathname } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFire,
  faPlus,
  faSort,
  faEllipsisVertical,
  faChevronRight,
  faSwatchbook,
  faArrowRightToBracket,
  faCodeBranch,
  faCircleCheck,
  faWallet,
  faHouse,
  faRobot,
  faSun,
  faMoon,
  faCircleHalfStroke,
} from "@fortawesome/free-solid-svg-icons";
import { OpenAssistant } from "@/components/assistant/ChatPanel";
import { useTheme } from "@/lib/theme";

/** Port of the App.vue top navigation bar (fixed, bg-dark-50, px-2 py-3). */
export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, resolvedTheme, setTheme, toggleTheme, mounted } = useTheme();
  const profile = useFiPlanStore((s) => s.profile);
  const plans = useFiPlanStore((s) => s.plans);
  const selected_plan_id = useFiPlanStore((s) => s.selected_plan_id);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);
  const setDefaultPlanId = useFiPlanStore((s) => s.set_default_plan_id);
  const setPlanComponentState = useFiPlanStore((s) => s.set_plan_component_state);

  const selected_plan = plans.find((p) => p._id === selected_plan_id) || plans[0];
  const username = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || profile?.email || "";
  const email = profile?.email || "";
  const show_create = /\/plan/.test(pathname); // original: show_create_button = /\/plan/.test(path)

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

  const btnClass =
    "gap-2 rounded-[.5rem] grid place-content-center disabled:opacity-50 text-md hover:opacity-75 font-medium border-2 hover:shadow-sm";

  return (
    <header className="fixed z-20 flex justify-between items-center w-full gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2.5 shadow-sm bg-dark-50 dark:bg-slate-900 border-b border-dark-100 dark:border-slate-800">
      <div className="flex items-center gap-2 shrink-0 min-w-0">
        <Logo className="text-xl md:text-3xl" badge={false} />
      </div>

      <div className="flex items-center justify-end gap-1 sm:gap-2 ml-auto h-fit shrink-0">
        {show_create && (
          <button
            type="button"
            onClick={() => setPlanComponentState("open")}
            className="hidden md:flex items-center justify-center gap-1.5 h-7 md:h-9 md:px-3.5 self-center rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs border border-emerald-500/40 transition-all shrink-0"
            title="Create Plan"
          >
            <span className="font-bold leading-none">Create Plan</span>
            <FontAwesomeIcon icon={faFire} className="text-amber-300 text-xs" />
          </button>
        )}

        {/* teleport target used by plan/compare pages to inject the Share button */}
        <div id="share-button" />

        {/* Plan switcher (desktop) */}
        {plans.length > 0 && show_create && (
          <Listbox value={selected_plan?._id} onChange={handlePlanSwitch}>
            <div className="hidden md:inline-flex w-[16rem] lg:w-[18.5rem]">
              <div className="relative w-full">
                <Listbox.Button className="w-full relative h-9 cursor-default rounded-lg bg-white dark:bg-slate-800 py-1.5 pl-3 pr-8 text-left shadow-2xs border border-dark-200 dark:border-slate-700 hover:border-dark-300 focus:outline-none sm:text-xs">
                  <span className="block truncate font-inter font-semibold text-dark-800 dark:text-slate-100 first-letter:uppercase">
                    {selected_plan?.title || "Select..."}
                  </span>
                  <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-dark-400">
                    <FontAwesomeIcon icon={faSort} className="text-xs" />
                  </span>
                </Listbox.Button>
                <Listbox.Options className="absolute z-50 w-full py-1 overflow-auto text-xs rounded-xl shadow-xl mt-1.5 bg-white dark:bg-slate-800 border border-dark-200 dark:border-slate-700 max-h-60 focus:outline-none">
                  {plans.map((plan) => (
                    <Listbox.Option
                      key={plan._id}
                      value={plan._id}
                      className={({ active }) =>
                        `${
                          plan._id === selected_plan?._id || active ? "bg-dark-100/80 dark:bg-slate-700 text-dark-900 dark:text-white" : "text-dark-600 dark:text-slate-300"
                        } relative flex justify-between items-center cursor-pointer select-none py-2 px-3`
                      }
                    >
                      <span
                        className={`${
                          plan._id === selected_plan?._id ? "font-bold text-primary-600 dark:text-primary-400" : "font-medium"
                        } block truncate text-left`}
                      >
                        {plan.title}
                      </span>
                      {plan.parent_id && (
                        <span className="relative flex items-center pl-2 text-dark-400">
                          <FontAwesomeIcon className="text-xs" icon={faCodeBranch} />
                        </span>
                      )}
                      {plan._id === selected_plan?._id && (
                        <span className="relative flex items-center pl-2 text-primary-600 dark:text-primary-400">
                          <FontAwesomeIcon icon={faCircleCheck} className="text-xs" />
                        </span>
                      )}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </div>
            </div>
          </Listbox>
        )}

        {/* Assistant launcher — always reachable on mobile (the floating FAB is desktop-only) */}
        <button
          type="button"
          aria-label="Open Fi-Plan Assistant"
          title="Fi-Plan Assistant"
          onClick={OpenAssistant}
          className="flex h-7 w-7 md:h-9 md:w-9 md:hidden shrink-0 items-center justify-center rounded-lg border border-dark-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 hover:text-primary-700 hover:border-primary-300 dark:hover:border-primary-400 shadow-2xs transition-all active:scale-95"
        >
          <FontAwesomeIcon icon={faRobot} className="text-xs sm:text-sm" />
        </button>

        {/* Quick Theme Toggle Button */}
        <button
          type="button"
          aria-label="Toggle dark/light theme"
          title={`Theme: ${theme} (Click to toggle)`}
          onClick={toggleTheme}
          className="flex h-7 w-7 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-lg border border-dark-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-dark-600 dark:text-slate-200 hover:text-primary-600 hover:border-primary-300 dark:hover:border-primary-400 shadow-2xs transition-all active:scale-95"
        >
          {mounted && resolvedTheme === "dark" ? (
            <FontAwesomeIcon icon={faSun} className="text-amber-400 text-xs sm:text-base" />
          ) : (
            <FontAwesomeIcon icon={faMoon} className="text-slate-600 dark:text-slate-300 text-xs sm:text-base" />
          )}
        </button>

        {/* Profile menu */}
        <Popover className="relative flex shrink-0">
          <Popover.Button className="box-border inline-flex items-center gap-1 rounded-lg text-dark-500 hover:text-dark-800 focus:outline-none">
            <div className="flex h-7 w-7 md:h-9 md:w-9 overflow-hidden rounded-lg border border-dark-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5 items-center justify-center shadow-2xs">
              {profile?.photos?.length ? (
                <img
                  src={profile.photos[profile.photos.length - 1]}
                  alt=""
                  className="h-full w-full object-cover rounded-md"
                />
              ) : (
                <div className="font-bold uppercase text-xs sm:text-sm font-exo2 text-dark-700 dark:text-slate-200">{username[0] || "?"}</div>
              )}
            </div>
            <FontAwesomeIcon
              icon={faEllipsisVertical}
              className="hidden md:inline text-xs text-dark-400 group-hover:text-dark-600 transition-colors"
            />
          </Popover.Button>

          <Popover.Panel className="absolute z-10 w-screen max-w-sm px-4 mt-3 top-11 transform -translate-x-[84%] sm:-translate-x-[88%] md:-translate-x-[92%]">
            <div className="border border-dark-100 rounded-xl shadow-xl bg-dark-50 overflow-hidden">
              <div className="relative flex flex-col gap-1 bg-dark-50 cursor-pointer">
                <div className="flex gap-2 p-4 pt-5 bg-dark-100/50 hover:bg-dark-100 transition-colors rounded-t-xl" onClick={() => router.push("/profile")}>
                  <div className="flex">
                    <div className="w-[40px] self-center h-[40px] overflow-hidden rounded-full border-2 border-dark-200 bg-dark-50">
                      {profile?.photos?.length ? (
                        <img
                          src={profile.photos[profile.photos.length - 1]}
                          alt=""
                          className="h-full aspect-square"
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex self-center justify-between mr-auto w-fit overflow-clip grow">
                    <div className="flex flex-col">
                      <div className="font-semibold text-left text-dark-800">{username}</div>
                      <div className="font-normal truncate text-dark-400 text-xs w-[15ch] sm:w-[25ch] mr-auto text-left">
                        {email}
                      </div>
                    </div>
                    <FontAwesomeIcon className="self-center text-dark-400" icon={faChevronRight} />
                  </div>
                </div>

                {/* Theme Switcher Options in Profile Dropdown */}
                <div className="flex flex-col gap-1.5 p-3 border-t border-b border-dark-100">
                  <div className="flex items-center justify-between text-[11px] font-bold text-dark-400 px-1 uppercase tracking-wider">
                    <span>Appearance</span>
                    <span className="text-primary-600 font-semibold lowercase">
                      {theme} mode
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-dark-100/60 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        theme === "light"
                          ? "bg-white text-primary-700 shadow-2xs"
                          : "text-dark-400 hover:text-dark-700"
                      }`}
                    >
                      <FontAwesomeIcon icon={faSun} className="text-xs text-amber-500" />
                      <span>Light</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        theme === "dark"
                          ? "bg-dark-200 text-primary-400 shadow-2xs"
                          : "text-dark-400 hover:text-dark-700"
                      }`}
                    >
                      <FontAwesomeIcon icon={faMoon} className="text-xs text-indigo-400" />
                      <span>Dark</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("system")}
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        theme === "system"
                          ? "bg-white text-primary-700 shadow-2xs"
                          : "text-dark-400 hover:text-dark-700"
                      }`}
                    >
                      <FontAwesomeIcon icon={faCircleHalfStroke} className="text-xs text-slate-400" />
                      <span>Auto</span>
                    </button>
                  </div>
                </div>

                {/* mobile plan switcher (md:hidden) */}
                {plans.length > 0 && show_create && (
                  <div className="flex justify-between w-full gap-2 p-2 px-3 grow md:hidden bg-dark-50">
                    <select
                      value={selected_plan?._id}
                      onChange={(e) => handlePlanSwitch(e.target.value)}
                      className="w-full rounded-md bg-dark-50 py-2 pl-3 pr-10 text-left shadow-sm border-2 border-dark-100 sm:text-sm"
                    >
                      {plans.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex p-1.5 px-2 bg-dark-50 md:hidden">
                  <button
                    onClick={() => router.push("/")}
                    className={`${btnClass} h-[2.2rem] px-2 border-0 w-full justify-start border-dark-100 text-dark-500 bg-dark-50 hover:bg-dark-100 rounded-lg`}
                  >
                    <div className="flex gap-2.5 items-center">
                      <FontAwesomeIcon icon={faHouse} className="text-sm" />
                      <span>Home</span>
                    </div>
                  </button>
                </div>
                <div className="flex p-1.5 px-2 bg-dark-50 md:hidden">
                  <button
                    onClick={() => router.push("/networth")}
                    className={`${btnClass} h-[2.2rem] px-2 border-0 w-full justify-start border-dark-100 text-dark-500 bg-dark-50 hover:bg-dark-100 rounded-lg`}
                  >
                    <div className="flex gap-2.5 items-center">
                      <FontAwesomeIcon icon={faWallet} className="text-sm" />
                      <span>Net Worth</span>
                    </div>
                  </button>
                </div>
                <div className="flex p-1.5 px-2 bg-dark-50">
                  <button
                    onClick={() => router.push("/shared_templates")}
                    className={`${btnClass} h-[2.2rem] px-2 border-0 w-full justify-start border-dark-100 text-dark-500 bg-dark-50 hover:bg-dark-100 rounded-lg`}
                  >
                    <div className="flex gap-2.5 items-center">
                      <FontAwesomeIcon icon={faSwatchbook} className="text-sm" />
                      <span>My Templates</span>
                    </div>
                  </button>
                </div>
                <div className="flex p-1.5 px-2 bg-dark-50">
                  <button
                    onClick={() => router.push("/assistants")}
                    className={`${btnClass} h-[2.2rem] px-2 border-0 w-full justify-start border-dark-100 text-dark-500 bg-dark-50 hover:bg-dark-100 rounded-lg`}
                  >
                    <div className="flex gap-2.5 items-center">
                      <FontAwesomeIcon icon={faRobot} className="text-sm" />
                      <span>AI Assistants</span>
                    </div>
                  </button>
                </div>
                <div className="flex p-1.5 px-2 bg-dark-50 pb-2">
                  <button
                    onClick={handleLogout}
                    className={`${btnClass} h-[2.2rem] px-2 border-0 w-full justify-start border-dark-100 text-rose-600 bg-dark-50 hover:bg-rose-50 rounded-lg`}
                  >
                    <div className="flex gap-2.5 items-center">
                      <FontAwesomeIcon icon={faArrowRightToBracket} className="text-sm" />
                      <span>Log Out</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </Popover.Panel>
        </Popover>
      </div>
    </header>
  );
}


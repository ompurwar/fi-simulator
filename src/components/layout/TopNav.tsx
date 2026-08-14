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
} from "@fortawesome/free-solid-svg-icons";

/** Port of the App.vue top navigation bar (fixed, bg-dark-50, px-2 py-3). */
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
    <header className="fixed z-20 flex justify-between w-full gap-2 px-2 py-3 text-right shadow-sm bg-dark-50">
      <div className="flex gap-3">
        <Logo className="text-3xl sm:text-4xl" />
      </div>

      <div className="flex self-center justify-end gap-1.5 md:gap-2 ml-auto h-fit grow">
        {show_create && (
          <button
            onClick={() => setPlanComponentState("open")}
            className={`${btnClass} h-[2.5rem] px-2 md:px-3 ml-auto self-center border-primary-500 border-[2px] text-primary-50 bg-primary-500`}
          >
            <div className="flex gap-2">
              <div className="text-[10px] sm:text-xs hidden sm:inline">
                Create <span>Plan</span>
              </div>
              <span className="sm:hidden">
                <FontAwesomeIcon icon={faPlus} className="self-center text-warning-50" />
              </span>
              <span className="hidden sm:inline">
                <FontAwesomeIcon icon={faFire} className="self-center text-warning-50" />
              </span>
            </div>
          </button>
        )}

        {/* teleport target used by plan/compare pages to inject the Share button */}
        <div id="share-button" />

        {/* Plan switcher (desktop) */}
        {plans.length > 0 && show_create && (
          <Listbox value={selected_plan?._id} onChange={handlePlanSwitch}>
            <div className="self-center hidden w-full- md:inline-flex w-[18.5rem]">
              <div className="relative w-full">
                <Listbox.Button className="w-full relative h-[2.5rem] cursor-default rounded-md bg-dark-50 py-2 pl-3 pr-10 text-left shadow-sm border-2 border-dark-100 hover:border-dark-200 focus:outline-none focus-visible:border-dark-500 focus-visible:ring-2 focus-visible:ring-dark-50 focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm">
                  <span className="block truncate font-inter text-dark-500 first-letter:uppercase">
                    {selected_plan?.title || "Select..."}
                  </span>
                  <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-dark-500">
                    <FontAwesomeIcon icon={faSort} />
                  </span>
                </Listbox.Button>
                <Listbox.Options className="absolute z-50 w-full py-1 overflow-auto text-base rounded-md shadow-lg mt-11 bg-dark-50 max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                  {plans.map((plan) => (
                    <Listbox.Option
                      key={plan._id}
                      value={plan._id}
                      className={({ active }) =>
                        `${
                          plan._id === selected_plan?._id || active ? "bg-dark-100 text-dark-600" : "text-dark-500"
                        } relative flex justify-between cursor-default select-none py-2 px-4`
                      }
                    >
                      <span
                        className={`${
                          plan._id === selected_plan?._id ? "font-medium" : "font-normal"
                        } block truncate text-left`}
                      >
                        {plan.title}
                      </span>
                      {plan.parent_id && (
                        <span className="relative inset-y-0 left-0 flex items-center pl-3 text-dark-500">
                          <FontAwesomeIcon className="self-center text-lg" icon={faCodeBranch} />
                        </span>
                      )}
                      {plan._id === selected_plan?._id && (
                        <span className="relative inset-y-0 left-0 flex items-center pl-3 text-amber-600">
                          <FontAwesomeIcon icon={faCircleCheck} />
                        </span>
                      )}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </div>
            </div>
          </Listbox>
        )}

        {/* Profile menu */}
        <Popover className="relative flex">
          <Popover.Button className="box-border inline-flex items-center self-center gap-1 text-lg font-medium rounded-md text-dark-400 group hover:text-opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75">
            <div className="w-[40px] h-[40px] overflow-hidden rounded-md p-1 bg-dark-50">
              {profile?.photos?.length ? (
                <img
                  src={profile.photos[profile.photos.length - 1]}
                  alt=""
                  className="h-full aspect-square"
                />
              ) : (
                <div className="font-bold uppercase font-exo2">{username[0] || "?"}</div>
              )}
            </div>
            <FontAwesomeIcon
              icon={faEllipsisVertical}
              className="ml-1 transition duration-150 ease-in-out text-dark-400 group-hover:text-opacity-80"
            />
          </Popover.Button>

          <Popover.Panel className="absolute z-10 w-screen max-w-sm px-4 mt-3 top-11 transform -translate-x-[84%] sm:-translate-x-[88%] md:-translate-x-[92%]">
            <div className="border rounded-md shadow-lg bg-dark-50">
              <div className="relative flex flex-col gap-2 rounded-md bg-slate-200 cursor-pointer">
                <div className="flex gap-2 p-4 pt-5 rounded-t-md grow" onClick={() => router.push("/profile")}>
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
                      <div className="font-medium text-left">{username}</div>
                      <div className="font-normal truncate text-dark-500 w-[15ch] sm:w-[25ch] mr-auto text-left">
                        {email}
                      </div>
                    </div>
                    <FontAwesomeIcon className="self-center" icon={faChevronRight} />
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

                <div className="flex p-2 px-3 bg-dark-50">
                  <button
                    onClick={() => router.push("/shared_templates")}
                    className={`${btnClass} h-[2.2rem] px-2 border-0 w-full justify-start border-dark-100 text-dark-400 bg-dark-50`}
                  >
                    <div className="flex gap-2">
                      <FontAwesomeIcon icon={faSwatchbook} />
                      My Templates
                    </div>
                  </button>
                </div>
                <div className="flex p-2 px-3 bg-dark-50 rounded-b-md">
                  <button
                    onClick={handleLogout}
                    className={`${btnClass} h-[2.2rem] px-2 border-0 w-full justify-start border-dark-100 text-dark-400 bg-dark-50`}
                  >
                    <div className="flex gap-2">
                      <FontAwesomeIcon icon={faArrowRightToBracket} className="self-center" />
                      Log Out
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

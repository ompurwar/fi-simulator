"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Disclosure, RadioGroup } from "@headlessui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey, faChevronDown, faChevronRight, faCodeBranch, faCompassDrafting, faSwatchbook } from "@fortawesome/free-solid-svg-icons";
import { faClock } from "@fortawesome/free-regular-svg-icons";
import { currency_list } from "@/lib/country";

/** moment(timestamp).calendar() equivalent, matching the original FormatTime. */
function FormatTime(timestamp: string) {
  const d = new Date(timestamp);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = (date: Date) =>
    date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, " ");
  if (d.toDateString() === now.toDateString()) return `Today at ${hm(d)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${hm(d)}`;
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}

/** Port of profile.page.vue — profile header, password update, my plans. */
export default function ProfilePage() {
  const router = useRouter();
  const profile = useFiPlanStore((s) => s.profile);
  const plans = useFiPlanStore((s) => s.plans);
  const selected_plan_id = useFiPlanStore((s) => s.selected_plan_id);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);
  const setDefaultPlanId = useFiPlanStore((s) => s.set_default_plan_id);
  const setPublishedTemplates = useFiPlanStore((s) => s.set_published_templates);
  const published_templates = useFiPlanStore((s) => s.published_templates);

  const [current_password, setCurrentPassword] = useState("");
  const [new_password, setNewPassword] = useState("");
  const [pw_update_inprogress, setPwUpdateInprogress] = useState(false);
  const [plan_being_synced, setPlanBeingSynced] = useState("");
  const [active_plan_id, setActivePlanId] = useState(profile?.default_plan_id || "");

  useEffect(() => {
    api
      .GetMyShareObjects()
      .then((templates) => setPublishedTemplates(templates))
      .catch(() => {});
    setActivePlanId(profile?.default_plan_id || "");
  }, [setPublishedTemplates, profile?.default_plan_id]);

  async function UpdatePassword() {
    setPwUpdateInprogress(true);
    try {
      await api.UpdatePassword(current_password, new_password);
      router.push("/login");
      alert("password updated successfully");
    } catch (e: any) {
      alert(e.message || "Failed to update password");
      setPwUpdateInprogress(false);
    }
  }

  async function SetDefaultPlan(plan_id: string) {
    setPlanBeingSynced(plan_id);
    if (plan_id !== profile?.default_plan_id) {
      try {
        await api.SetDefaultPlan(plan_id);
      } catch {
        /* noop */
      }
    }
    setSelectedPlanId(plan_id);
    setDefaultPlanId(plan_id);
    setPlanBeingSynced("");
  }

  const username = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || profile?.email || "";
  const email = profile?.email || "";
  const signup_src = profile?.src;
  const show_password_panel = ["std"].includes(signup_src);
  const currency_code = profile?.ob_params?.currency || "INR";
  const currency = currency_list.find((c) => c.currency_code === currency_code);
  const currency_symbol = currency?.currency_symbol || "₹";
  const currency_name = currency?.currency_name || currency_code;
  const stats = { plans: plans.length, published_templates: published_templates.length };
  const is_update_pw_btn_enabled = current_password.length >= 8 && new_password.length >= 8;

  const inputClass = `px-3 py-[.25rem] border-[1.6px] rounded-[.5rem] shadow-sm w-full placeholder-dark-500 text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-300 focus:shadow-primary-500 bg-dark-50 flex justify-between transition-all duration-200 text-[1.25rem] appearance-none`;

  return (
    <div className="mx-auto mt-14 flex flex-col md:mt-0 md:w-[70%]">
      {/* header */}
      <div className="ms:justify-between flex flex-col justify-center gap-2 bg-slate-200 py-5 md:flex-row md:bg-dark-50">
        <div className="flex gap-3 px-4 md:px-0">
          <div className="grid h-[100px] w-[100px] place-content-center overflow-hidden rounded-full border-2 box-border bg-dark-50">
            {profile?.photos?.length ? (
              <img src={profile.photos[profile.photos.length - 1]} alt="" className="h-full aspect-square" />
            ) : (
              <div className="text-7xl font-bold uppercase">{username[0]}</div>
            )}
          </div>
          <div className="mr-auto flex w-fit self-center justify-between overflow-clip text-center">
            <div className="flex flex-col text-dark-500">
              <div className="text-left text-lg font-bold">{username}</div>
              <div className="flex flex-col text-xs text-dark-300">
                <div className="truncate">{email}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex w-fit justify-between overflow-clip px-2 md:ml-auto md:flex-col- md:self-center md:px-0">
          <div className="flex flex-col text-base md:border-l-2">
            <div className="flex w-fit gap-2 rounded-md px-2">
              <span className="self-center rounded-md text-xl font-bold text-dark-400">{currency_symbol}</span>
              <span className="self-center text-dark-500">{currency_name}</span>
            </div>
            <div className="flex gap-1">
              <FontAwesomeIcon icon={faCompassDrafting} className="self-center pl-2 font-normal text-dark-400" />
              <div className="flex self-center font-bold">
                <div className="w-[3ch] text-center">{stats.plans}</div>
                <div className="self-center"> . </div>
              </div>
              <div className="self-center font-normal"> Plans </div>
            </div>
            <div className="flex gap-1">
              <FontAwesomeIcon icon={faSwatchbook} className="self-center pl-2 font-normal text-dark-400" />
              <div className="flex self-center font-bold">
                <div className="w-[3ch] truncate text-center text-dark-500">{stats.published_templates}</div>
                <div className="self-center"> . </div>
              </div>
              <div className="self-center font-normal">Templates Published </div>
            </div>
          </div>
        </div>
      </div>

      <hr className="mb-3" />

      <div className="flex flex-col px-3 md:px-0">
        <div className="flex flex-col gap-2">
          {show_password_panel && (
            <Disclosure as="div" className="w-full">
              {({ open }) => (
                <>
                  <Disclosure.Button
                    className={`flex w-full justify-between rounded-lg bg-dark-100 px-4 py-4 text-left text-sm font-semibold text-dark-500 shadow-sm hover:bg-dark-200 md:py-2 ${open ? "mb-2" : "mb-3"}`}
                  >
                    <div className="flex gap-2 text-xl self-center">
                      <FontAwesomeIcon icon={faKey} className="mr-1 self-center" />
                      <div className="self-center">Update Password</div>
                    </div>
                    <FontAwesomeIcon icon={faChevronDown} className={`h-4 w-4 self-center text-dark-400 ${open ? "rotate-180 transform" : ""}`} />
                  </Disclosure.Button>
                  <Disclosure.Panel className="mb-3 rounded-b-xl rounded-t-md border p-4 text-sm text-gray-500 transition-all duration-150">
                    <form autoComplete="on">
                      <div className="flex flex-col gap-3 px-3 md:w-1/2 md:px-0">
                        <div className="mb-2 flex text-xl font-medium">
                          <div>Create new password</div>
                        </div>
                        <div className="w-full">
                          <span className="text-sm text-dark-300">Current password </span>
                          <input
                            type="password"
                            placeholder=""
                            name="current_password"
                            style={{ fontSize: "1.25rem" }}
                            className={inputClass}
                            value={current_password}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                          />
                        </div>
                        <div className="w-full">
                          <span className="text-sm text-dark-300">New password </span>
                          <input
                            type="password"
                            placeholder=""
                            autoComplete="current-password"
                            name="new_password"
                            style={{ fontSize: "1.25rem" }}
                            className={inputClass}
                            value={new_password}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                        </div>
                        <hr className="my-2" />
                        <Button type="submit" className="w-fit px-4 py-1" variant="primary" sub_variant="solid" onClick={UpdatePassword} disabled={!is_update_pw_btn_enabled}>
                          Update
                          {pw_update_inprogress && (
                            <svg className="mr-3 -ml-1 h-5 w-5 animate-spin self-center text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          )}
                        </Button>
                      </div>
                    </form>
                  </Disclosure.Panel>
                </>
              )}
            </Disclosure>
          )}
        </div>

        <hr className="mb-3" />

        <div className="mb-8 flex grow flex-col">
          <RadioGroup value={active_plan_id} onChange={SetDefaultPlan} className="flex flex-col gap-2">
            <RadioGroup.Label className="text-xl font-bold">My Plans</RadioGroup.Label>
            <div className="flex flex-row flex-wrap gap-2">
              {plans.map((plan: any) => (
                <div className="basis-[100%] md:basis-[24%]" key={plan._id}>
                  <RadioGroup.Option value={plan._id}>
                    {({ checked }) => (
                      <div className={`flex h-[150px] grow rounded-lg border p-2 ${checked ? "m-0.5 bg-primary-200 ring-1 ring-primary-400" : ""}`}>
                        <div className="flex h-full w-full flex-col justify-between gap-2">
                          <div className="first-letter:uppercase">{plan.title}</div>
                          <div className="text-xs opacity-70"> {plan.description || ""} </div>
                          <div className="mt-auto text-[10px] opacity-70">
                            <div className="flex gap-1">
                              <FontAwesomeIcon icon={faClock} className="self-center" />
                              <span className="self-center">{FormatTime(plan.timestamp)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col justify-between">
                          <div>
                            {plan.parent_id && (
                              <div className="hint--top" aria-label="This is a clone plan">
                                <FontAwesomeIcon className="self-center text-lg text-primary-400" icon={faCodeBranch} />
                              </div>
                            )}
                          </div>
                          <div className="mt-auto self-center text-xs opacity-70">
                            {plan._id === plan_being_synced ? (
                              <svg className="-ml-1 h-[20px] w-[20px] animate-spin self-center text-dark-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <Button className="self-center p-0.5 px-2" variant="primary" sub_variant="solid" size="sm" onClick={() => router.push(`/plan?p_id=${plan._id}`)}>
                                <FontAwesomeIcon className="self-center" icon={faChevronRight} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </RadioGroup.Option>
                </div>
              ))}
            </div>
          </RadioGroup>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Disclosure, RadioGroup } from "@headlessui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faUser } from "@fortawesome/free-solid-svg-icons";
import { GetCurrencySymbol } from "@/lib/country";

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
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api
      .GetMyShareObjects()
      .then((templates) => setPublishedTemplates(templates))
      .catch(() => {});
  }, [setPublishedTemplates]);

  async function handleUpdatePassword() {
    setMsg("");
    try {
      await api.UpdatePassword(current_password, new_password);
      router.push("/login");
    } catch (e: any) {
      setMsg(e.message || "Failed to update password");
    }
  }

  async function handleSetDefault(plan_id: string) {
    setSelectedPlanId(plan_id);
    setDefaultPlanId(plan_id);
    try {
      await api.SetDefaultPlan(plan_id);
    } catch {
      /* noop */
    }
  }

  const username = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || profile?.email;
  const currency = profile?.ob_params?.currency || "INR";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* header */}
      <div className="card flex items-center gap-4">
        {profile?.photos?.length ? (
          <img src={profile.photos[profile.photos.length - 1]} className="h-16 w-16 rounded-full object-cover" alt="" />
        ) : (
          <div className="grid h-16 w-16 place-content-center rounded-full bg-primary-100 text-2xl font-bold text-primary-600">
            <FontAwesomeIcon icon={faUser} />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold capitalize text-dark-800">{username}</h1>
          <p className="text-sm text-dark-400">{profile?.email}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-dark-400">Currency</p>
          <p className="font-bold text-dark-700">{GetCurrencySymbol(currency)} {currency}</p>
        </div>
      </div>

      {/* stats */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-600">{plans.length}</p>
          <p className="text-sm text-dark-400">Plans</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-accent-600">{published_templates.length}</p>
          <p className="text-sm text-dark-400">Templates published</p>
        </div>
      </div>

      {/* update password */}
      {profile?.src === "std" && (
        <div className="card mt-4">
          <Disclosure>
            {({ open }) => (
              <>
                <Disclosure.Button className="flex w-full items-center justify-between font-semibold text-dark-800">
                  Update Password
                  <FontAwesomeIcon icon={faChevronRight} className={`transition-transform ${open ? "rotate-90" : ""}`} />
                </Disclosure.Button>
                <Disclosure.Panel className="mt-4 flex flex-col gap-3">
                  <input className="input-filed" type="password" placeholder="Current password" value={current_password} onChange={(e) => setCurrentPassword(e.target.value)} />
                  <input className="input-filed" type="password" placeholder="New password" value={new_password} onChange={(e) => setNewPassword(e.target.value)} />
                  {msg && <p className="text-xs text-danger-500">{msg}</p>}
                  <Button onClick={handleUpdatePassword} disabled={!current_password || new_password.length < 8}>
                    Update Password
                  </Button>
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
        </div>
      )}

      {/* my plans */}
      <div className="card mt-4">
        <h2 className="mb-3 font-semibold text-dark-800">My Plans</h2>
        <RadioGroup value={selected_plan_id} onChange={handleSetDefault}>
          <div className="space-y-2">
            {plans.map((plan) => (
              <RadioGroup.Option key={plan._id} value={plan._id} className="cursor-pointer">
                {({ checked }) => (
                  <div className={`flex items-center justify-between rounded-xl border p-4 ${checked ? "border-primary-400 bg-primary-50" : "border-dark-200"}`}>
                    <div>
                      <p className="font-semibold text-dark-800">{plan.title}</p>
                      {plan.description && <p className="text-xs text-dark-400">{plan.description}</p>}
                      <p className="mt-1 text-xs text-dark-300">
                        {plan.parent_id ? "Cloned template" : "Created"} · {plan.timestamp ? new Date(plan.timestamp).toLocaleDateString() : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroup.Label className="sr-only">Set default</RadioGroup.Label>
                      <button onClick={() => router.push(`/plan?p_id=${plan._id}`)} className="rounded-lg p-2 text-dark-400 hover:text-primary-500">
                        <FontAwesomeIcon icon={faChevronRight} />
                      </button>
                    </div>
                  </div>
                )}
              </RadioGroup.Option>
            ))}
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}

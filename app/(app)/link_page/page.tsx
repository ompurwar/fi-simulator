"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useFiPlanStore } from "@/store";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Track, EVENT_TYPES } from "@/lib/tracker";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserTie, faSwatchbook, faCoins, faCodeBranch, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { faLightbulb } from "@fortawesome/free-regular-svg-icons";
import { currency_list } from "@/lib/country";

/** Port of share_object/ViewShareObject.vue — public template preview. */
function LinkPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const share_id = searchParams.get("sid") || "";

  const [is_404, setIs404] = useState(false);
  const [share_object, setShareObject] = useState<any>(null);
  const [in_progress, setInProgress] = useState(false);
  const [logged_in, setLoggedIn] = useState(true);

  const plans = useFiPlanStore((s) => s.plans);
  const setPlans = useFiPlanStore((s) => s.set_plans);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);
  const storeCurrency = useFiPlanStore((s) => s.currency);

  useEffect(() => {
    async function LoadShareObject() {
      const objs = await api.GetPublicShareObjects([share_id]);
      if (objs && objs.length) {
        setShareObject(objs[0]);
        setIs404(false);
      } else {
        setIs404(true);
      }
      try {
        await api.IsLoggedIn();
        setLoggedIn(true);
      } catch {
        setLoggedIn(false);
      }
    }
    LoadShareObject();
  }, [share_id]);

  const boarded_plan = plans.filter((plan: any) => plan.share_id === share_object?._id);
  const already_boarded = boarded_plan.length > 0;

  const category_text = (() => {
    if (share_object?.category === "t-i") return "Individual plan";
    if (share_object?.category === "t-c") return "Compare";
    return "";
  })();

  const currency_data = currency_list.find((c) => c.currency_code === share_object?.currency);

  const description = (() => {
    const used_count = share_object?.onboard_count;
    const currency = currency_data?.currency_name;
    let text = `Hey there, this ${category_text} supports ${currency} ${used_count ? `and have been used by ${used_count} users so far` : ""}. Go head and start exploring, feel free to edit it further as per your needs.`;
    if (share_object?.description?.length) text = share_object.description;
    return text;
  })();

  const button_text = !logged_in ? "Proceed" : !already_boarded ? "Go" : "Open";

  function OpenTemplate(template_category: string, forked: any[] = []) {
    if (template_category === "t-i") {
      setSelectedPlanId(forked[0]?._id);
      router.push("/plan");
    }
    if (template_category === "t-c") {
      const p_ids = forked.map((p) => p._id).join(",");
      router.push(`/plans/compare?p_ids=${p_ids}`);
    }
  }

  async function OnProceed() {
    const { title, category, _id, currency } = share_object;
    const inc: any = { template_boarded_count: 1 };
    const _logged_in = logged_in;

    if (storeCurrency !== share_object?.currency && _logged_in) {
      const response = confirm(
        `The currency of this plan "${currency_data?.currency_name} | ${currency_data?.currency_symbol}" differs from your currency which is "${storeCurrency}"! `
      );
      if (response === false) return;
    }

    setInProgress(true);

    if (_logged_in) {
      if (already_boarded) {
        OpenTemplate(share_object.category, boarded_plan);
        alert("This template already exists in your Fi-Plan account, please click on OK to access it.");
        setInProgress(false);
        return;
      }
      const optin_result = await api.OptinShareObject(share_object?._id);
      if (optin_result.forked_plans && optin_result.forked_plans.length) {
        inc.plan_count = optin_result.forked_plans.length;
      }
      Track(EVENT_TYPES.TEMPLATE_BOARDED.id, { title, category, share_id: _id, currency }, { inc });
      if (optin_result.forked_plans?.length) {
        setPlans(optin_result.forked_plans, false);
        OpenTemplate(share_object.category, optin_result.forked_plans);
        localStorage.removeItem("sid");
      }
    } else {
      router.push(`/login?sid=${share_object._id}&mode=signup`);
    }
    setInProgress(false);
  }

  return (
    <div className="md:flex md:flex-col gap-5 place-content-center- h-[70vh] md:w-[90vw] p-5 md:p-11">
      {!logged_in && (
        <div className="flex h-fit justify-center px-16 py-3 md:justify-start md:py-1">
          <Logo className="text-3xl md:text-4xl" />
        </div>
      )}

      {!is_404 && (
        <div className="flex-col justify-around gap-4 md:mt-0 md:flex md:flex-row">
          <div className="flex flex-col p-2 py-4 md:p-5 md:border divide-y rounded-lg md:shadow-md md:w-[25ch]">
            <div className="flex flex-col gap-4 py-3">
              <div className="p-5 text-6xl border-2 rounded-full first-letter w-[12vh] h-[12vh] grid place-content-center self-center">
                <FontAwesomeIcon icon={faUserTie} className="text-dark-400" />
              </div>
              <div className="font-bold text-center md:font-normal"> {share_object?.creator_name}</div>
            </div>
            <div className="flex gap-2 py-2 text-sm">
              <FontAwesomeIcon icon={faSwatchbook} className="self-center" />
              <div> {category_text}</div>
            </div>
            <div className="flex gap-2 py-2 text-sm">
              <FontAwesomeIcon icon={faCoins} className="self-center" />
              <div> {currency_data?.currency_name}</div>
            </div>
            {share_object?.onboard_count ? (
              <div className="flex justify-between gap-2 py-2 text-sm">
                <div className="flex gap-2 self-center">
                  <FontAwesomeIcon icon={faCodeBranch} className="self-center" />
                  <div>Users who used this plan </div>
                </div>
                <div className="text-blue-600">{share_object?.onboard_count} </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-24 md:gap-16 bg-transparent border md:border-0 shadow-md md:shadow-none rounded-xl md:w-[50vw] h-fit md:p-5 p-6 justify-center transition-all duration-200">
            <div className="flex flex-col self-center w-full gap-3">
              <div className="flex flex-col-reverse justify-between gap-3 md:flex-row">
                <span
                  className={`text-xl font-medium md:text-3xl md:self-center ${
                    (share_object?.description?.length || 0) < 15 ? "text-dark-700" : "text-dark-500"
                  }`}
                >
                  {share_object?.title}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="order-1 mb-3 flex min-h-[5rem]">
                  <span className="font-montserrat text-sm text-dark-400 md:text-justify md:text-base">{description}</span>
                </div>
                {!logged_in && (
                  <div className="order-3 flex gap-2 rounded-md bg-slate-200 p-2 px-2 md:order-2 md:mb-2 md:mt-5 md:w-full">
                    <div className="self-center text-warning-500">
                      <FontAwesomeIcon icon={faLightbulb} />
                    </div>
                    <span className="self-center font-montserrat text-[10px] text-dark-400 md:text-xs">
                      You must have a Fi-Plan account to access this template. Hit proceed to sign up/sign in to Fi-Plan.
                    </span>
                  </div>
                )}
                <div className="order-2 md:order-3 md:mt-4">
                  <Button
                    onClick={OnProceed}
                    className="w-full px-3 py-2 shadow-none md:w-[12ch] md:py-1.5"
                    size="md"
                    sub_variant="solid"
                    variant="primary"
                  >
                    <div className="self-center">{button_text}</div>
                    {!in_progress && <FontAwesomeIcon className="self-center font-bold text-md" icon={faChevronRight} />}
                    {in_progress && (
                      <svg className="h-4 w-4 animate-spin self-center text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {is_404 && (
        <div className="flex h-[80vh] flex-col justify-center gap-10 border-0 bg-transparent">
          <div className="self-center font-inter">Oops! link on found 404 :(</div>
        </div>
      )}
    </div>
  );
}

export default function LinkPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-50" />}>
      <LinkPageInner />
    </Suspense>
  );
}

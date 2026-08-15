"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faHandPointer,
  faClipboard,
} from "@fortawesome/free-solid-svg-icons";
import { ModalUi } from "@/components/ui/ModalUi";
import { Button } from "@/components/ui/Button";
import { useFiPlanStore } from "@/store";
import { api } from "@/lib/api";
import { Track, EVENT_TYPES } from "@/lib/tracker";

const PANEL_VIEW_OPTIONS = {
  INPUT: "input",
  PREVIEW: "share-preview",
  LINK_DISPLAY: "link-display",
};

/** Port of share_object/ShareObject.vue — create a sharable template link. */
export function ShareObjectModal() {
  const share_data = useFiPlanStore((s) => s.share_data);
  const setShareData = useFiPlanStore((s) => s.set_share_data);
  const setPlans = useFiPlanStore((s) => s.set_plans);
  const plans = useFiPlanStore((s) => s.plans);
  const profile = useFiPlanStore((s) => s.profile);
  const storeCurrency = useFiPlanStore((s) => s.currency);
  const storeLocal = useFiPlanStore((s) => s.local);

  const [panel_view, setPanelView] = useState(PANEL_VIEW_OPTIONS.INPUT);
  const [current_stage_index, setCurrentStageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error_message, setErrorMessage] = useState("");
  const [created_share_object, setCreatedShareObject] = useState<any>();
  const [link_copied, setLinkCopied] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const data_being_shared = useMemo(() => {
    if (share_data.type === "template") {
      return (share_data.ids || [])
        .map((id: string) => plans.find((p) => p._id === id)?.title)
        .filter(Boolean);
    }
    return [];
  }, [share_data, plans]);

  const computed_share_obj_title = useMemo(() => {
    const { category } = share_data;
    if (category === "t-c") return `Comparing - ${data_being_shared.join(", ")}`;
    if (category === "t-i") return ` ${data_being_shared.join(", ")}`;
    return "";
  }, [share_data, data_being_shared]);

  // original watches share_data and re-seeds the title field
  useEffect(() => {
    setTitle(computed_share_obj_title);
  }, [computed_share_obj_title]);

  const inputs_by_stage = useMemo(
    () => [
      { description: "Name it", filed_name: "title", type: "textarea" },
      { description: "Describe this link a little bit. (optional)", filed_name: "description", type: "textarea" },
    ],
    []
  );

  const share_link = created_share_object?._id
    ? `${window.location.origin}/link_page?sid=${created_share_object._id}`
    : "";
  const modal_title = panel_view === PANEL_VIEW_OPTIONS.LINK_DISPLAY ? "Your link is ready to use" : "Create a sharable link";

  const show_create_button = current_stage_index + 1 === inputs_by_stage.length && !loading;
  const show_next_button = current_stage_index + 1 < inputs_by_stage.length;
  const show_previous_button = current_stage_index > 0;

  function SetErrorMessage(message: string) {
    setErrorMessage(message);
    setTimeout(() => {
      setErrorMessage("");
    }, 2000);
  }

  function ValidateInput({ filed_name = "", value }: { filed_name?: string; value: any }) {
    let valid = true;
    let message = "";
    switch (filed_name) {
      case "title":
        if (!value || typeof value !== "string") {
          message = message + "Please name you link!\n";
          valid = false;
        }
        break;
      default:
        break;
    }
    return { valid, message };
  }

  function Next() {
    const current_index = current_stage_index;
    const validation_check = ValidateInput({ filed_name: "title", value: title });
    if (validation_check.valid) {
      if (current_index + 1 < inputs_by_stage.length) setCurrentStageIndex(current_index + 1);
    } else {
      SetErrorMessage(validation_check.message);
    }
  }

  function Previous() {
    if (current_stage_index - 1 >= 0) setCurrentStageIndex(current_stage_index - 1);
  }

  function Preview() {
    setPanelView(PANEL_VIEW_OPTIONS.PREVIEW);
  }

  async function OnGenerateLinkClicked() {
    if (!show_create_button) return;
    const validation_check = ValidateInput({ filed_name: "title", value: title });
    const share_object_parameters: Record<string, any> = {
      type: share_data.type,
      category: share_data.category,
      plan_ids: share_data.ids,
      currency: storeCurrency || "INR",
      local: storeLocal,
      title,
      description,
      promotional_links: [],
      creator_name: `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim(),
    };
    if (validation_check.valid) {
      setLoading(true);
      const share_object_result = await api.CreateShareObject(share_object_parameters);
      setCreatedShareObject(share_object_result.share_object);
      const { type, category, _id, title: share_title, currency } = share_object_result.share_object;
      Track(
        EVENT_TYPES.TEMPLATE_SHARED.id,
        { type, category, share_id: _id, title: share_title, currency },
        { inc: { template_shared_count: 1 } }
      );
      setPlans(share_object_result.forked_plans, false);
      setPanelView(PANEL_VIEW_OPTIONS.LINK_DISPLAY);
      setLoading(false);
      setLinkCopied(false);
    } else {
      SetErrorMessage(validation_check.message);
    }
  }

  async function OnCopy() {
    try {
      await navigator.clipboard.writeText(share_link);
    } catch {
      window.prompt("Copy link:", share_link);
    }
    setLinkCopied(true);
  }

  function Close() {
    setCurrentStageIndex(0);
    setPanelView(PANEL_VIEW_OPTIONS.INPUT);
    setDescription("");
    setShareData({ modal_state: "closed", type: "", ids: [], category: "" });
  }

  const inputClass =
    "px-3 py-[.25rem] border-[1.6px] rounded-[.5rem] shadow-sm w-full placeholder-dark-500 text-dark-400 text-left focus:outline-none focus:ring-1 focus:ring-dark-400 focus:border-dark-300 focus:shadow-dark-500 bg-dark-50 flex justify-between transition-all duration-200 text-[1rem] resize-none appearance-none";
  const navBtnClass =
    "bg-dark-100 p-1 px-2 flex rounded-lg border-2 border-dark-300 py-2 text-sm w-fit disabled:opacity-25 hover:bg-dark-900 cursor-pointer gap-3 text-dark-500 font-bold";

  return (
    <ModalUi
      show={share_data?.modal_state === "open"}
      custom_class="bg-dark-50 w-[100vw] md:w-[40vw] h-fit rounded-lg"
      onClose={Close}
      header={
        <div className="flex flex-col">
          <div className="flex text-xl font-bold text-dark-600">{modal_title}</div>
          {panel_view !== PANEL_VIEW_OPTIONS.LINK_DISPLAY && data_being_shared.length > 0 && (
            <div className="mt-2 flex gap-2">
              {data_being_shared.map((data: string, index: number) => (
                <div key={index} className="rounded-md border border-dark-200 bg-dark-50 p-[.3rem] px-3 text-xs text-dark-300">
                  {data}
                </div>
              ))}
            </div>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-2 bg-dark-50">
        {panel_view === PANEL_VIEW_OPTIONS.INPUT && (
          <>
            <div className="flex h-[11rem] place-content-center">
              <div className="flex w-full gap-4">
                <div className="flex w-full grow flex-col gap-2 self-center">
                  <div className="px-1">{inputs_by_stage[current_stage_index]?.description}</div>
                  <div className="px-0.5">
                    <textarea
                      rows={3}
                      required
                      style={{ fontSize: "1.25rem" }}
                      className={inputClass}
                      value={current_stage_index === 0 ? title : description}
                      onChange={(e) =>
                        current_stage_index === 0 ? setTitle(e.target.value) : setDescription(e.target.value)
                      }
                    />
                    <div className="flex justify-center gap-2">
                      <div className="font-mono text-xs text-red-600">{error_message}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <div className="flex gap-2">
                <button className={navBtnClass} disabled={!show_previous_button} onClick={Previous}>
                  <FontAwesomeIcon className="self-center text-lg font-bold" icon={faChevronLeft} />
                  <span className="self-center"> Back </span>
                </button>
                <button className={navBtnClass} disabled={!show_next_button} onClick={Next}>
                  <span className="self-center"> Next </span>
                  <FontAwesomeIcon className="self-center text-lg font-bold" icon={faChevronRight} />
                </button>
              </div>
              <Button
                variant="primary"
                sub_variant="outline"
                disabled={!show_create_button}
                onClick={Preview}
                className="cursor-pointer gap-3 rounded-lg border-2 p-1 px-2 py-2 text-sm font-bold w-fit"
              >
                {loading && (
                  <svg className="h-[20px] w-[20px] -ml-1 self-center animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                <span className="self-center"> Preview</span>
              </Button>
            </div>
            <div className="flex justify-center gap-2">
              {inputs_by_stage.map((_inputs, index) => (
                <div key={index}>
                  <div
                    className={`h-[8px] w-[8px] cursor-pointer rounded-full border border-primary-400 ${
                      current_stage_index === index ? "bg-primary-900" : ""
                    }`}
                    onClick={() => setCurrentStageIndex(index)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {panel_view === PANEL_VIEW_OPTIONS.PREVIEW && (
          <div className="flex h-[15rem]">
            <div className="flex h-full w-full flex-col justify-between self-center pt-4">
              <div className="flex justify-between">
                <div className="flex flex-col">
                  <div className="mb-3 text-lg font-bold text-dark-300 first-letter:uppercase">{title}</div>
                  <div className="text-sm text-dark-300">{description}</div>
                </div>
                <div className="flex">
                  <img src={undefined} alt="" className="h-[3rem] aspect-auto rounded-md bg-dark-500" />
                </div>
              </div>
              <div className="flex justify-end align-bottom">
                <Button
                  variant="primary"
                  sub_variant="solid"
                  disabled={!show_create_button}
                  onClick={OnGenerateLinkClicked}
                  className="flex rounded-lg border-2 p-2 font-mono"
                >
                  {!loading && <FontAwesomeIcon className="self-center text-lg font-bold" icon={faHandPointer} />}
                  {loading && (
                    <svg className="h-[20px] w-[20px] -ml-1 self-center animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <span className="self-center"> Create</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {panel_view === PANEL_VIEW_OPTIONS.LINK_DISPLAY && (
          <div className="flex h-[15rem]">
            <div className="flex w-full flex-col gap-1 self-center">
              <div className="flex">Please copy the link below and share it with your community</div>
              <div className="flex w-full">
                <div className="flex w-[80%] content-center rounded-l-md border border-primary-300 bg-dark-50 p-2 select-text md:text-xs">
                  <span className="self-center">{share_link}</span>
                </div>
                <button
                  disabled={!show_create_button}
                  onClick={OnCopy}
                  className="flex h-[3rem] w-[20%] cursor-pointer justify-center gap-3 rounded-r-lg border-2 border-primary-300 bg-primary-400 p-1 px-4 text-sm font-bold text-primary-50 hover:bg-primary-400 disabled:bg-primary-300"
                >
                  <FontAwesomeIcon icon={faClipboard} className="self-center text-lg font-bold" />
                  <span className="self-center">{link_copied === true ? "Copied!" : "Copy"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalUi>
  );
}

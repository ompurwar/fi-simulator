"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCodeBranch, faLink, faChevronRight, faMagnifyingGlass, faArrowUpWideShort, faArrowDownWideShort } from "@fortawesome/free-solid-svg-icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** moment(timestamp).format('DD-MMM-YYYY') — matches original GetDate. */
function GetDate(time_stamp?: string) {
  const d = time_stamp ? new Date(time_stamp) : new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** moment(timestamp).calendar() equivalent. */
function MomentCalendar(time_stamp?: string) {
  if (!time_stamp) return "";
  const d = new Date(time_stamp);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = (date: Date) =>
    date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today at ${hm(d)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${hm(d)}`;
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}

function GetCategoryText(category: string) {
  if (category === "t-i") return "Individual ";
  if (category === "t-c") return "Comparison";
  return "";
}

/** Port of shared_template.page.vue — "My shared templates" manager. */
export default function SharedTemplatesPage() {
  const router = useRouter();
  const published_templates = useFiPlanStore((s) => s.published_templates);
  const setPublishedTemplates = useFiPlanStore((s) => s.set_published_templates);

  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [copied_shared_object, setCopiedSharedObject] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort_by, setSortBy] = useState("timestamp");
  const [sort_order, setSortOrder] = useState(-1);

  useEffect(() => {
    setLoading(true);
    api
      .GetMyShareObjects()
      .then((templates) => setPublishedTemplates(templates))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setPublishedTemplates]);

  const sorted = useMemo(() => {
    return [...published_templates].sort((t1: any, t2: any) =>
      sort_order === -1 ? (t2[sort_by] || 0) - (t1[sort_by] || 0) : (t1[sort_by] || 0) - (t2[sort_by] || 0)
    );
  }, [published_templates, sort_by, sort_order]);

  const filtered_templates = useMemo(() => {
    if (!query) return sorted;
    const q = query.toLowerCase();
    return sorted.filter((t: any) => (t.title || "").toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q));
  }, [sorted, query]);

  const stats = useMemo(() => {
    const s = { comparison: 0, individual: 0, total_count: 0, total_onboard: 0 };
    for (const t of published_templates as any[]) {
      if (t.category === "t-i") s.individual++;
      if (t.category === "t-c") s.comparison++;
      s.total_count++;
      s.total_onboard += t.onboard_count || 0;
    }
    return s;
  }, [published_templates]);

  function ToggleSort(_sort_by: string) {
    if (sort_by === _sort_by) setSortOrder((o) => o * -1);
    setSortBy(_sort_by);
  }

  function OpenTemplate(t: any) {
    const { category, plan_ids = [] } = t;
    if (category === "t-i") {
      router.push(`/plan?p_id=${plan_ids.slice(0, 1).join(",")}`);
    }
    if (category === "t-c") {
      router.push(`/plans/compare?p_ids=${plan_ids.slice(0, 3).join(",")}`);
    }
  }

  function Exit() {
    router.push("/");
  }

  async function OnCopy(created_share_object: any) {
    const link = `${window.location.origin}/link_page?sid=${created_share_object._id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* noop */
    }
    setCopied(true);
    setCopiedSharedObject(created_share_object._id);
    setTimeout(() => setCopied(false), 1000);
  }

  return (
    <div>
      {/* header */}
      <div className="mx-5 mt-5 border-b- pb-4 md:mt-5">
        <div className="flex justify-between">
          <div className="flex gap-2">
            <div className="self-center font-bold text-dark-500 sm:text-xl md:text-2xl">My shared templates</div>
            <div className="grid h-[1.8em] w-[1.8em] place-content-center rounded-md bg-dark-100 text-dark-400">{stats.total_count}</div>
          </div>
          <div className="flex gap-2 text-dark-200">
            <FontAwesomeIcon
              icon={faXmark}
              onClick={Exit}
              className="self-center px-1 text-2xl text-dark-700 hover:bg-dark-100"
            />
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="mx-4 flex flex-col justify-between gap-4 md:flex-row md:gap-0">
        <div className="-md:justify-end order-2 flex h-fit w-full gap-2 self-center text-xs md:order-1 md:w-[80%]">
          <div className="flex self-center rounded-md md:flex-row md:divide-x divide-primary-300">
            <div className="flex">
              <div className="flex gap-1 self-center px-2 pl-2 text-dark-300">
                <div className="text-dark-600">{stats.total_onboard}</div>
                Opened
              </div>
            </div>
            <div className="flex">
              <div className="flex gap-1 self-center px-2 pl-2 text-dark-300">
                <div className="text-dark-600">{stats.comparison}</div>
                Comparison
              </div>
              <div className="flex gap-1 self-center px-2 pl-2 text-dark-300">
                <div className="text-dark-600">{stats.individual}</div>
                Individual
              </div>
            </div>
          </div>
        </div>
        <div className="ms:divide-x order-1 flex w-full gap-1 text-dark-300 md:order-2 md:flex-row md:justify-end md:gap-2">
          <div className="relative flex h-fit w-full cursor-default rounded-md border-2 border-dark-100 bg-dark-50 text-left shadow-sm transition-all duration-1000 hover:border-dark-300 md:h-[2.2rem] md:w-[60%]">
            <input
              placeholder="Search.."
              className="relative h-fit w-full cursor-default rounded-md border-0 bg-dark-50 py-2 pl-3 pr-3 text-left text-sm shadow-sm outline-none transition-all duration-1000 md:h-[1.9rem]"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <FontAwesomeIcon className="hint--top hint--rounded self-center px-2" icon={faMagnifyingGlass} />
          </div>
          <div className="h-full border-l-2" />
          <div className="flex justify-end">
            <button
              className={`flex h-[2.5rem] w-fit gap-1 self-center rounded-l-md border border-r p-2 px-3 text-dark-300 md:h-[2.2rem] ${sort_by === "timestamp" ? "border-primary-300" : ""}`}
              onClick={() => ToggleSort("timestamp")}
            >
              <div className="self-center text-xs md:text-md">Date</div>
            </button>
            <button
              className={`flex h-[2.5rem] grow gap-1 self-center rounded-r-md border p-2 px-3 text-dark-300 md:h-[2.2rem] ${sort_by === "modified_at" ? "border-primary-300" : ""}`}
              onClick={() => ToggleSort("modified_at")}
            >
              <div className="self-center text-xs md:text-md">last Modified</div>
            </button>
            {sort_order === -1 && <FontAwesomeIcon className="self-center ml-2.5" icon={faArrowUpWideShort} />}
            {sort_order === 1 && <FontAwesomeIcon className="self-center ml-2.5" icon={faArrowDownWideShort} />}
          </div>
        </div>
      </div>

      {/* grid */}
      {filtered_templates.length ? (
        <div className="relative flex h-screen flex-col gap-5 overflow-y-scroll rounded-md px-3 py-7 shadow-none place-content-start md:mx-4 md:my-7 md:grid md:grid-cols-3 md:gap-10 md:border-t md:shadow-inner">
          {filtered_templates.map((t: any) => (
            <div className="flex h-fit w-full snap-start flex-col gap-2 rounded-xl border-2 p-3" key={t._id}>
              <div className="flex flex-col-reverse justify-between gap-3 md:flex-row">
                <span className="self-center text-sm md:self-center">{t.title}</span>
                <div className="flex gap-2">
                  <div className="flex h-fit w-fit gap-2 self-center rounded-md border border-dark-300 bg-dark-50 p-1 text-xs md:hidden">
                    <span className="max-w-[10ch] truncate self-center text-dark-300 md:max-w-[20ch]"> {t.creator_name}</span>
                  </div>
                  <div className="hint--top hint--rounded flex gap-2" aria-label={`${t.onboard_count} users used this template`}>
                    <div className="flex h-fit gap-1 rounded-md p-1 text-xs text-dark-400">
                      <span className="self-center font-bold">{t.onboard_count} </span>
                      <FontAwesomeIcon className="self-center" icon={faCodeBranch} />
                    </div>
                  </div>
                  <div className={`flex h-fit gap-2 rounded-md border border-dark-300 bg-dark-50 p-1 px-2 pr-2 text-xs text-dark-500 ${t.category === "t-c" ? "pl-1" : ""}`}>
                    <span className="flex max-w-[15ch] gap-1 self-center truncate">
                      {t.category === "t-c" && (
                        <span className="rounded-[4px] bg-dark-300 px-1 text-dark-50">{(t.plan_ids || []).length}</span>
                      )}
                      <div>{GetCategoryText(t.category)}</div>
                    </span>
                  </div>
                </div>
              </div>
              <div className="mb-3 flex min-h-[5rem]">
                <span className="font-montserrat text-xs text-dark-300">{t.description}</span>
              </div>
              <div className="mt-auto flex justify-between gap-2">
                <div className="flex-col text-[11px]">
                  <div className="flex gap-2">
                    <span className="font-montserrat text-dark-300">Created: </span>
                    <span className="font-montserrat text-dark-500">{GetDate(t.timestamp)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-montserrat text-dark-300">Updated: </span>
                    <span className="font-montserrat text-dark-500">{MomentCalendar(t.modified_at)}</span>
                  </div>
                </div>
                <div className="flex gap-1 self-end">
                  <div className="flex gap-2 self-center" onClick={() => OnCopy(t)}>
                    <Button
                      size="sm"
                      className="hint--top hint--rounded flex h-fit cursor-pointer gap-1 p-2 px-3"
                      aria-label={`${copied && copied_shared_object === t._id ? "Copied!" : "Copy"}`}
                    >
                      <FontAwesomeIcon className="self-center text-xs text-blue-600" icon={faLink} />
                    </Button>
                  </div>
                  <Button className="p-1 px-3" variant="primary" sub_variant="solid" size="sm" onClick={() => OpenTemplate(t)}>
                    Open
                    <FontAwesomeIcon icon={faChevronRight} className="self-center text-xs" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="relative mx-5 mt-3 grid h-[70vh] flex-col gap-10 place-content-center rounded-lg border-4 border-dashed px-5">
          {loading ? (
            <svg className="h-10 w-10 animate-spin self-center text-dark-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <div className="font-mono text-4xl text-dark-300">
              {published_templates.length ? "Oops! template not found :(" : "No template published yet!"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

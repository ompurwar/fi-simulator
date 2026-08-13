"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCopy, faFolderOpen, faArrowUp, faArrowDown } from "@fortawesome/free-solid-svg-icons";
import { FireNotification } from "@/store/notifications";

/** Port of shared_template.page.vue — "My shared templates" manager. */
export default function SharedTemplatesPage() {
  const router = useRouter();
  const published_templates = useFiPlanStore((s) => s.published_templates);
  const setPublishedTemplates = useFiPlanStore((s) => s.set_published_templates);

  const [search, setSearch] = useState("");
  const [sort_key, setSortKey] = useState<"date" | "modified">("date");
  const [sort_dir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.GetMyShareObjects(), api.GetTrendingShareObjects()])
      .then(([mine]) => setPublishedTemplates(mine))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setPublishedTemplates]);

  const filtered = useMemo(() => {
    let list = published_templates.filter(
      (t) => t.title.toLowerCase().includes(search.toLowerCase()) || t.description?.toLowerCase().includes(search.toLowerCase())
    );
    list = [...list].sort((a, b) => {
      const av = sort_key === "date" ? a.timestamp || 0 : a.modified_at || 0;
      const bv = sort_key === "date" ? b.timestamp || 0 : b.modified_at || 0;
      return sort_dir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [published_templates, search, sort_key, sort_dir]);

  async function copyLink(t: any) {
    const link = `${window.location.origin}/link_page?sid=${t._id}`;
    try {
      await navigator.clipboard.writeText(link);
      FireNotification({ title: "Link copied!", variant: "success" });
    } catch {
      window.prompt("Copy link:", link);
    }
  }

  function openTemplate(t: any) {
    if (t.category === "t-c") {
      router.push(`/plans/compare?p_ids=${(t.plan_ids || []).slice(0, 3).join(",")}`);
    } else {
      router.push(`/plan?p_id=${t.plan_ids?.[0]}`);
    }
  }

  const total_opened = published_templates.reduce((acc, t) => acc + (t.onboard_count || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-800">My shared templates</h1>
        <button onClick={() => router.push("/")} className="rounded-lg p-2 text-dark-400 hover:text-danger-500">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {/* stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-primary-600">{published_templates.length}</p>
          <p className="text-xs text-dark-400">Templates</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-accent-600">{total_opened}</p>
          <p className="text-xs text-dark-400">Total Opened</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-warning-600">
            {published_templates.filter((t) => t.category === "t-c").length}
          </p>
          <p className="text-xs text-dark-400">Comparison</p>
        </div>
      </div>

      {/* search + sort */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          className="input-filed max-w-xs"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-1">
          <Button size="sm" variant={sort_key === "date" ? "primary" : "neutral"} onClick={() => setSortKey("date")}>
            Date
          </Button>
          <Button size="sm" variant={sort_key === "modified" ? "primary" : "neutral"} onClick={() => setSortKey("modified")}>
            Last Modified
          </Button>
          <Button size="sm" variant="neutral" onClick={() => setSortDir(sort_dir === "asc" ? "desc" : "asc")}>
            <FontAwesomeIcon icon={sort_dir === "asc" ? faArrowUp : faArrowDown} className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          {search ? (
            <p className="text-dark-400">Oops! template not found :(</p>
          ) : (
            <p className="text-dark-400">No template published yet!</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <div key={t._id} className="card flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-dark-800">{t.title}</h3>
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] text-primary-600">
                  {t.category === "t-c" ? `t-c (${t.plan_ids?.length})` : "t-i"}
                </span>
              </div>
              {t.description && <p className="line-clamp-2 text-xs text-dark-500">{t.description}</p>}
              <p className="text-xs text-dark-400">
                by {t.creator_name} · used by {t.onboard_count}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="neutral" onClick={() => copyLink(t)}>
                  <FontAwesomeIcon icon={faCopy} className="mr-1 h-3 w-3" /> Copy link
                </Button>
                <Button size="sm" onClick={() => openTemplate(t)}>
                  <FontAwesomeIcon icon={faFolderOpen} className="mr-1 h-3 w-3" /> Open
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

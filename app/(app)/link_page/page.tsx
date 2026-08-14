"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useFiPlanStore } from "@/store";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Track, EVENT_TYPES } from "@/lib/tracker";

function LinkPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const share_id = searchParams.get("sid") || "";

  const [share_object, setShareObject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [already_logged_in, setAlreadyLoggedIn] = useState(false);

  const setPlans = useFiPlanStore((s) => s.set_plans);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);

  useEffect(() => {
    async function load() {
      if (!share_id) return;
      try {
        const [objs, loggedIn] = await Promise.all([
          api.GetPublicShareObjects([share_id]),
          api.IsLoggedIn().then(() => true).catch(() => false),
        ]);
        setShareObject(objs?.[0]);
        setAlreadyLoggedIn(loggedIn);
      } catch (e: any) {
        setError(e.message || "Template not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [share_id]);

  async function handleOptin() {
    setBusy(true);
    try {
      if (!already_logged_in) {
        router.push(`/login?sid=${share_id}`);
        return;
      }
      const result = await api.OptinShareObject(share_id);
      const forked_plans = result.forked_plans || [];
      setPlans(forked_plans, false);
      Track(
        EVENT_TYPES.TEMPLATE_BOARDED.id,
        { category: share_object?.category, plan_ids: share_object?.plan_ids, share_id, title: share_object?.title, desc: share_object?.description },
        { inc: { template_boarded_count: 1, plan_count: 1 } }
      );
      if (share_object?.category === "t-c") {
        const ids = forked_plans.slice(0, 3).map((p: any) => p._id);
        router.push(`/plans/compare?p_ids=${ids.join(",")}`);
      } else {
        setSelectedPlanId(forked_plans[0]?._id);
        router.push(`/plan?p_id=${forked_plans[0]?._id}`);
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-dark-50">
        <Logo />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !share_object) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-dark-50 px-4">
        <Logo className="mb-6 text-4xl" />
        <h1 className="text-xl font-bold text-dark-800">Oops! template not found :(</h1>
        <p className="mt-2 text-sm text-dark-500">{error}</p>
        <Button className="mt-6" onClick={() => router.push("/login")}>Go to login</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-50 px-4">
      <Logo className="mb-8 text-4xl" />
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-dark-800">{share_object.title}</h1>
        {share_object.description && <p className="mt-2 text-sm text-dark-500">{share_object.description}</p>}
        <div className="mt-4 flex gap-2 text-xs">
          <span className="rounded-full bg-primary-50 px-2 py-1 text-primary-600">
            {share_object.category === "t-c" ? "Comparison template" : "Individual template"}
          </span>
          <span className="rounded-full bg-dark-100 px-2 py-1 text-dark-500">
            Used by {share_object.onboard_count} {share_object.onboard_count === 1 ? "person" : "people"}
          </span>
        </div>
        {share_object.creator_name && (
          <p className="mt-3 text-xs text-dark-400">by {share_object.creator_name}</p>
        )}
        <Button className="mt-6 w-full" onClick={handleOptin} disabled={busy}>
          {busy ? "Loading..." : already_logged_in ? "Add this plan" : "Login to add this plan"}
        </Button>
      </div>
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

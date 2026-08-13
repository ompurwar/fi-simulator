"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";

/** Logo — port of logo/Logo.vue ("Fi-Plan" wordmark with Beta badge). */
export function Logo({ className = "" }: { className?: string }) {
  const router = useRouter();
  const selected_plan_id = useFiPlanStore((s) => s.selected_plan_id);
  return (
    <Link
      href={selected_plan_id ? `/plan?p_id=${selected_plan_id}` : "/plan"}
      className={`inline-flex items-center gap-1 ${className}`}
      onClick={(e) => {
        e.preventDefault();
        router.push(selected_plan_id ? `/plan?p_id=${selected_plan_id}` : "/plan");
      }}
    >
      <span className="font-balsamiq-sans text-2xl font-bold text-primary-500">
        Fi-Plan
      </span>
      <span className="rounded-full bg-warning-300 px-1.5 py-0.5 text-[10px] font-semibold text-dark-800">
        Beta
      </span>
    </Link>
  );
}

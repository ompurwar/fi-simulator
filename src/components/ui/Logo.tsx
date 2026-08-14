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
      className={`grid h-[2.5rem] place-content-center text-primary-500 ${className}`}
      onClick={(e) => {
        e.preventDefault();
        router.push(selected_plan_id ? `/plan?p_id=${selected_plan_id}` : "/plan");
      }}
    >
      <span className="flex place-content-center gap-1 px-4 font-exo2 font-extrabold">
        <span>Fi</span>
        <span>-</span>
        <span>Plan</span>
        <span className="self-center border border-blue-400 rounded-sm px-1 bg-blue-50 text-center text-blue-700 font-normal">
          <span className="text-[0.4ch] font-bold uppercase leading-3">Beta</span>
        </span>
      </span>
    </Link>
  );
}

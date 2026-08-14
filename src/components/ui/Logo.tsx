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
      className={`grid font-exo2 font-extrabold h-[2.5rem] place-content-center text-primary-500 bg-dark-50 cursor-pointer ${className}`}
      onClick={(e) => {
        e.preventDefault();
        router.push(selected_plan_id ? `/plan?p_id=${selected_plan_id}` : "/plan");
      }}
    >
      <span className="flex p-2 px-4 rounded-lg place-content-center relative">
        <span className="flex self-center gap-1">
          <span>Fi</span>
          <span>-</span>
          <span>Plan</span>
        </span>
        <span className="border border-blue-400 box-border rounded-sm px-1 self-center ml-1 font-normal h-fit bg-blue-50 text-center text-blue-700 grid">
          <span className="text-[.4ch] font-bold py-0.5 leading-3 uppercase">Beta</span>
        </span>
      </span>
    </Link>
  );
}

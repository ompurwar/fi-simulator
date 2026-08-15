"use client";

import { useMemo } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthToLabel(month: number, plan_timestamp?: string | number) {
  const start = new Date(plan_timestamp || Date.now());
  const d = new Date(start.getFullYear(), start.getMonth() + (month - 1), 1);
  return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/**
 * Month selector for editors (cashflow / loan / FDP).
 *
 * Rendered as a native <select> — the same working pattern as the cashflow
 * changes editor — so it opens the month dropdown on both mobile and desktop.
 */
export function MonthPicker({
  plan_timestamp,
  duration,
  month,
  min_month = 1,
  max_month,
  onChange,
}: {
  plan_timestamp?: string | number;
  duration?: number;
  month: number;
  min_month?: number;
  max_month?: number;
  onChange: (month: number) => void;
}) {
  const options = useMemo(() => {
    const max = Math.max(min_month, max_month ?? duration ?? min_month);
    const list: { value: number; label: string }[] = [];
    for (let m = min_month; m <= max; m++) {
      list.push({ value: m, label: monthToLabel(m, plan_timestamp) });
    }
    return list;
  }, [plan_timestamp, min_month, max_month, duration]);

  return (
    <select
      value={month}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full cursor-pointer appearance-none rounded border border-[#dddddd] bg-white py-1.5 pl-[35px] pr-3 text-base text-[#212121]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

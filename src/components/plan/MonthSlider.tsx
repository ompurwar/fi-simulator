"use client";

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faAnglesLeft,
  faAnglesRight,
} from "@fortawesome/free-solid-svg-icons";

const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getMonthAndYear(timestamp: number | string, monthNumber: number) {
  const start = new Date(timestamp);
  const d = new Date(start.getFullYear(), start.getMonth() + (monthNumber - 1), 1);
  return { month: months[d.getMonth()], year: d.getFullYear() };
}

export function MonthSlider({
  value,
  max,
  planTimestamp,
  onChange,
}: {
  value: number;
  max: number;
  planTimestamp?: number | string;
  onChange: (month: number) => void;
}) {
  const { month, year } = useMemo(
    () => (planTimestamp ? getMonthAndYear(planTimestamp, value) : { month: "", year: "" }),
    [planTimestamp, value]
  );
  const currentMonthIndex = months.indexOf(month);

  const baseBtn =
    "grid place-content-center self-center rounded-lg p-1 text-xs text-dark-400 dark:text-slate-400 transition-colors duration-150 hover:bg-dark-100 dark:hover:bg-slate-800 hover:text-dark-800 dark:hover:text-slate-100 disabled:opacity-30";
  const iconBtn = "h-[40px] w-[40px] sm:h-[45px] sm:w-[45px] md:h-[26px] md:w-[26px]";
  const yearBtn = "h-[26px] w-[26px]";

  return (
    <div className="flex w-full flex-col justify-between rounded-2xl">
      <div className="flex justify-center gap-2 md:justify-between">
        <div className="flex md:hidden">
          <button
            className={`${baseBtn} ${iconBtn}`}
            disabled={value < 12}
            onClick={() => onChange(Math.max(1, value - 12))}
          >
            <FontAwesomeIcon icon={faAnglesLeft} className="self-center text-lg md:text-xs" />
          </button>
        </div>

        <div className="flex md:ml-0 md:mr-auto">
          <button
            className={`${baseBtn} ${iconBtn}`}
            disabled={value === 1}
            onClick={() => onChange(Math.max(1, value - 1))}
          >
            <FontAwesomeIcon icon={faChevronLeft} className="self-center text-lg md:text-xs" />
          </button>
        </div>

        <input
          type="range"
          min={1}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-auto hidden w-full self-center border-0 py-2 accent-primary-500 cursor-pointer md:flex"
        />

        <div className="flex w-[10ch] justify-center gap-1 self-center text-xs font-bold text-primary-600 dark:text-primary-400 sm:text-lg md:hidden md:w-[5ch]">
          {month}-{year}
        </div>

        <div className="flex">
          <button
            className={`${baseBtn} ${iconBtn}`}
            disabled={value >= max}
            onClick={() => onChange(Math.min(max, value + 1))}
          >
            <FontAwesomeIcon icon={faChevronRight} className="self-center text-lg md:text-xs" />
          </button>
        </div>
        <div className="flex md:hidden">
          <button
            className={`${baseBtn} ${iconBtn}`}
            disabled={value >= max || value + 12 >= max}
            onClick={() => onChange(Math.min(max, value + 12))}
          >
            <FontAwesomeIcon icon={faAnglesRight} className="self-center text-lg md:text-xs" />
          </button>
        </div>
      </div>

      <div className="hidden h-full md:flex">
        <div className="flex pl-2 pr-0 items-center">
          <div className="flex w-[5ch] justify-center self-center px-2 text-lg font-bold text-primary-600 dark:text-primary-400 md:text-xl">
            {year}
          </div>
          <div className="flex gap-0.5">
            <button
              className={yearBtn + " " + baseBtn}
              disabled={value < 12}
              onClick={() => onChange(Math.max(1, value - 12))}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="self-center text-xs" />
            </button>
            <button
              className={yearBtn + " " + baseBtn}
              disabled={value + 12 >= max}
              onClick={() => onChange(Math.min(max, value + 12))}
            >
              <FontAwesomeIcon icon={faChevronRight} className="self-center text-xs" />
            </button>
          </div>
        </div>
        <div className="flex h-full w-full justify-between gap-1 self-center overflow-x-auto border-l border-dark-200 dark:border-slate-800 px-4">
          {months.map((m, idx) => {
            const target = value + idx - currentMonthIndex;
            const disabled = target > max || target < 1;
            const active = m === month;
            return (
              <button
                key={m}
                disabled={disabled}
                onClick={() => onChange(target)}
                className={`flex flex-col justify-between self-center rounded-lg p-1 text-[8px] font-semibold transition-all duration-150 md:px-2.5 md:py-1 md:text-xs ${
                  active
                    ? "bg-primary-600 text-white shadow-xs font-bold"
                    : "bg-transparent text-dark-500 dark:text-slate-400 hover:bg-dark-100 dark:hover:bg-slate-800 hover:text-dark-900 dark:hover:text-white disabled:opacity-20"
                }`}
              >
                <span className="self-center">{m}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

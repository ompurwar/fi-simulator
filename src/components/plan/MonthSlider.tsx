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
    "grid place-content-center self-center rounded-md p-1 text-xs text-dark-300 transition-colors duration-200 hover:bg-dark-700 disabled:opacity-50";
  const iconBtn = "h-[40px] w-[40px] sm:h-[50px] sm:w-[50px] md:h-[25px] md:w-[25px]";
  const yearBtn = "h-[25px] w-[25px]";

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
          className="mt-auto hidden w-full self-center border py-2 accent-primary-300 md:flex"
        />

        <div className="flex w-[10ch] justify-center gap-1 self-center text-xs font-bold text-primary-400 sm:text-lg md:hidden md:w-[5ch]">
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
        <div className="flex pl-2 pr-0">
          <div className="flex w-[5ch] justify-center self-center px-2 text-lg font-bold text-primary-400 md:text-2xl">
            {year}
          </div>
          <div className="flex">
            <button
              className={yearBtn + " " + baseBtn}
              disabled={value < 12}
              onClick={() => onChange(Math.max(1, value - 12))}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="self-center" />
            </button>
            <button
              className={yearBtn + " " + baseBtn}
              disabled={value + 12 >= max}
              onClick={() => onChange(Math.min(max, value + 12))}
            >
              <FontAwesomeIcon icon={faChevronRight} className="self-center" />
            </button>
          </div>
        </div>
        <div className="flex h-full w-full justify-between gap-1 self-center overflow-x-auto border-l border-dark-600 px-5 pt-5-">
          {months.map((m, idx) => {
            const target = value + idx - currentMonthIndex;
            const disabled = target > max || target < 1;
            const active = m === month;
            return (
              <button
                key={m}
                disabled={disabled}
                onClick={() => onChange(target)}
                className={`flex h-[25px]- flex-col justify-between self-center rounded-md p-1 text-[8px] font-medium transition-all duration-200 md:px-2 md:text-xs ${
                  active
                    ? "bg-primary-400 text-primary-50"
                    : "bg-transparent text-dark-300 hover:bg-dark-700 disabled:opacity-20"
                }`}
              >
                <span className="self-center">{m}</span>
                <span className="self-center"> </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

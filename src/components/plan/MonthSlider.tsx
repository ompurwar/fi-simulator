"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faAnglesLeft, faAnglesRight } from "@fortawesome/free-solid-svg-icons";

/** Port of month_slider/MonthSlider.vue — month navigation control. */
export function MonthSlider({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (month: number) => void;
}) {
  function clamp(m: number) {
    return Math.max(1, Math.min(max, m));
  }
  return (
    <div className="card flex flex-col items-center gap-3">
      <div className="flex w-full items-center justify-between gap-2">
        <button onClick={() => onChange(clamp(value - 12))} className="rounded-lg p-2 text-dark-400 hover:bg-dark-50 hover:text-dark-600">
          <FontAwesomeIcon icon={faAnglesLeft} />
        </button>
        <button onClick={() => onChange(clamp(value - 1))} className="rounded-lg p-2 text-dark-400 hover:bg-dark-50 hover:text-dark-600">
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <div className="flex-1 text-center">
          <span className="text-lg font-bold text-dark-800">Month {value}</span>
          <span className="ml-2 text-sm text-dark-400">of {max}</span>
        </div>
        <button onClick={() => onChange(clamp(value + 1))} className="rounded-lg p-2 text-dark-400 hover:bg-dark-50 hover:text-dark-600">
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
        <button onClick={() => onChange(clamp(value + 12))} className="rounded-lg p-2 text-dark-400 hover:bg-dark-50 hover:text-dark-600">
          <FontAwesomeIcon icon={faAnglesRight} />
        </button>
      </div>
      <input
        type="range"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary-500"
      />
    </div>
  );
}

"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";

/** List filter input with the shared editor design language (LoanEditor/AssetEditor inputs). */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <FontAwesomeIcon
        icon={faMagnifyingGlass}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-dark-400"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-dark-200 bg-white py-2 pl-9 pr-8 text-sm text-dark-800 shadow-2xs placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 transition-all duration-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-dark-100 text-dark-500 hover:bg-dark-200 hover:text-dark-700 transition-colors"
        >
          <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

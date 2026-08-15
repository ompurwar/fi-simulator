"use client";

import { useFiPlanStore } from "@/store";
import { GetCurrencySymbol } from "@/lib/country";

// Variant maps mirror the original Button.vue computeds exactly
// (outline: bg-*-50 text-*-500 border-*-400; solid: bg-*-500 text-*-50 border-*-500).
const outlineStyles: Record<string, string> = {
  neutral: "bg-dark-50 text-dark-400 border-dark-100",
  primary: "bg-primary-50 text-primary-500 border-primary-400",
  success: "bg-success-100 text-success-500 border-success-400",
  danger: "bg-danger-50 text-danger-500 border-danger-400",
  warning: "bg-warning-100 text-warning-500 border-warning-400",
  accent: "bg-accent-50 text-accent-500 border-accent-400",
};

const solidStyles: Record<string, string> = {
  neutral: "bg-dark-500 text-dark-50 border-dark-400",
  primary: "bg-primary-500 text-primary-50 border-primary-500",
  success: "bg-success-400 text-success-50 border-success-400",
  danger: "bg-danger-500 text-danger-50 border-danger-400",
  warning: "bg-warning-300 text-warning-50 border-warning-300",
  accent: "bg-accent-300 text-accent-50 border-accent-300",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof outlineStyles;
  sub_variant?: "solid" | "outline";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

/** Port of Button.vue — btn_class + variant computeds (no built-in padding; call sites pass it). */
export function Button({
  variant = "primary",
  sub_variant = "outline",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const text_size = size === "sm" ? "text-xs" : "";
  const styles = sub_variant === "solid" ? solidStyles : outlineStyles;
  const classes = [
    `gap-2 rounded-[.5rem] grid place-content-center disabled:opacity-50 ${text_size} hover:opacity-75 font-medium border-2 hover:shadow-sm`,
    styles[variant] || "",
    className,
  ].join(" ");
  return (
    <button className={classes} {...rest}>
      <div className="flex gap-2">{children}</div>
    </button>
  );
}

/** Money display — port of DisplayAmount.vue (defaults to standard notation). */
export function DisplayAmount({
  amount,
  notation,
  className = "",
}: {
  amount: number;
  notation?: "compact" | "engineering" | "standard";
  className?: string;
}) {
  const currency = useFiPlanStore((s) => s.currency);
  const storeLocal = useFiPlanStore((s) => s.local);
  const symbol = GetCurrencySymbol(currency || "INR");
  // original getters.get_local: window.navigator.language || profile.ob_params.local || state.local
  const local =
    (typeof window !== "undefined" && window.navigator?.language) || storeLocal || "en-IN";

  if (amount === undefined || amount === null || isNaN(amount)) return <span>-</span>;
  const is_negative = amount < 0;
  let formatted: string;
  try {
    const config: Intl.NumberFormatOptions = notation ? { notation } : {};
    formatted = Intl.NumberFormat(local, config).format(Number(Math.abs(amount).toFixed(0)));
  } catch {
    formatted = Math.abs(amount).toFixed(0);
  }
  return (
    <div className={`flex gap-1 ${className}`}>
      <span className="tracking-wide" style={{ display: is_negative ? undefined : "none" }}>
        -
      </span>
      <span className="tracking-wide"> {symbol}</span>
      <span className="tracking-wide"> {formatted}</span>
    </div>
  );
}

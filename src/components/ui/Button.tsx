"use client";

import { useFiPlanStore } from "@/store";
import { GetCurrencySymbol } from "@/lib/country";

const variantStyles: Record<string, string> = {
  neutral: "bg-white text-dark-700 border border-dark-200 hover:bg-dark-50",
  primary: "bg-primary-500 text-white hover:bg-primary-600",
  danger: "bg-danger-500 text-white hover:bg-danger-600",
  warning: "bg-warning-400 text-dark-800 hover:bg-warning-500",
  success: "bg-success-500 text-white hover:bg-success-600",
  accent: "bg-accent-500 text-white hover:bg-accent-600",
};

const subVariantStyles: Record<string, string> = {
  solid: "",
  outline: "bg-transparent border-2",
};

const sizeStyles: Record<string, string> = {
  xs: "px-2 py-1 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
  xl: "px-6 py-3 text-lg",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  sub_variant?: keyof typeof subVariantStyles;
  size?: keyof typeof sizeStyles;
}

export function Button({
  variant = "primary",
  sub_variant = "solid",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    "rounded-lg font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
    variantStyles[variant],
    subVariantStyles[sub_variant],
    sizeStyles[size],
    className,
  ].join(" ");
  return (
    <button className={classes} {...rest}>
      {children}
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

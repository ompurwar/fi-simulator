/**
 * INR compact money formatting — lakhs, crores, arabs (and kharab) the way
 * Indian users read numbers. Non-INR currencies fall back to Intl compact.
 */

const INDIAN_UNITS: { value: number; suffix: string }[] = [
  { value: 1e11, suffix: "Kb" }, // kharab
  { value: 1e9, suffix: "Ar" }, // arab
  { value: 1e7, suffix: "Cr" }, // crore
  { value: 1e5, suffix: "L" }, // lakh
  { value: 1e3, suffix: "K" }, // thousand
];

/** 1,00,000 → "1L" · 4,16,448 → "4.16L" · 12,50,00,000 → "12.5Cr" · 2.1 × 10^9 → "2.1Ar" */
export function FormatIndianCompact(amount: number): string {
  const abs = Math.abs(amount);
  for (const { value, suffix } of INDIAN_UNITS) {
    if (abs >= value) {
      const scaled = abs / value;
      const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      return `${Number(scaled.toFixed(digits)).toLocaleString("en-IN")}${suffix}`;
    }
  }
  return Math.round(abs).toLocaleString("en-IN");
}

/** Compact money with the currency symbol — Indian units for INR, Intl otherwise. */
export function FormatCompactMoney(
  amount: number,
  currency: string,
  symbol: string,
  local: string
): string {
  if ((currency || "INR").toUpperCase() === "INR") {
    return `${symbol}${FormatIndianCompact(amount)}`;
  }
  try {
    return Intl.NumberFormat(local, {
      style: "currency",
      notation: "compact",
      currency,
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${symbol}${Math.abs(amount).toFixed(0)}`;
  }
}

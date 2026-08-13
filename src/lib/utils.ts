/** Shared frontend utilities (subset of utilFunctions.js used by the UI). */

export function GetRandomString(length = 6): string {
  let result = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

export function DeepCopy<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

export function SecondToMMSS(s: number): string {
  return (s - (s %= 60)) / 60 + (9 < s ? ":" : ":0") + s;
}

export function UpperFirst(str: string): string {
  if (typeof str !== "string") return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function CountPropsInObj(obj: Record<string, any> = {}): number {
  let count = 0;
  for (const k in obj) if (Object.hasOwnProperty.call(obj, k)) count++;
  return count;
}

export async function CopyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export function FuzzySearch(list: any[], query: string, keys: string[]): any[] {
  if (!query) return list;
  const q = query.toLowerCase();
  return list.filter((item) => keys.some((k) => String(item[k] || "").toLowerCase().includes(q)));
}

export function GetMonth(start_date: string, no_of_months: number): string {
  const date = new Date(start_date);
  date.setMonth(date.getMonth() + (no_of_months - 1));
  return date.toLocaleString("en-US", { month: "short" });
}

export function GetYear(start_date: string, no_of_months: number): number {
  const date = new Date(start_date);
  date.setMonth(date.getMonth() + (no_of_months - 1));
  return date.getFullYear();
}

export function GetMMYYYYNameFromMM(month_of_balance: number, plan_time_stamp: number): string {
  const d = new Date(plan_time_stamp);
  d.setMonth(d.getMonth() + (month_of_balance - 1));
  return `${d.toLocaleString("en-US", { month: "short" })}-${d.getFullYear()}`;
}

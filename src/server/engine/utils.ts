/** Pure engine utilities (ported from src/utils/utilFunctions.js). */

export function DeepCopy<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

export function GetHashmap<T extends Record<string, any>>(
  list: T[],
  pivot_point: string | ((item: T) => string | number)
): Record<string, T> {
  const hashmap: Record<string, T> = {};
  list.forEach((item) => {
    let pivot_value: any = (item as any)[pivot_point as string];
    if (typeof pivot_point === "function") pivot_value = pivot_point(item);
    if (!hashmap[pivot_value]) hashmap[pivot_value] = item;
  });
  return hashmap;
}

export function GetRandomString(length = 6): string {
  let result = "";
  const chars = "0123456789abcdef".split("");
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function RequiredParam(param_name: string): never {
  throw new Error(`${param_name} is required`);
}

const month_map = new Map<string, string>();
export function GetMonth(start_date: string, no_of_months: number): string {
  const key = `${start_date}-${no_of_months}`;
  if (!month_map.has(key)) {
    const date = new Date(start_date);
    date.setMonth(date.getMonth() + (no_of_months - 1));
    const result = date.toLocaleString("en-US", { month: "short" });
    month_map.set(key, result);
  }
  return month_map.get(key)!;
}

const year_map = new Map<string, string>();
export function GetYear(start_date: string, no_of_months: number): string {
  const key = `${start_date}-${no_of_months}`;
  if (!year_map.has(key)) {
    const date = new Date(start_date);
    date.setMonth(date.getMonth() + (no_of_months - 1));
    const result = date.getFullYear().toString();
    year_map.set(key, result);
  }
  return year_map.get(key)!;
}

export function GetDate(time_stamp?: number): string {
  if (!time_stamp) return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const date = new Date(time_stamp);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function MonthsToYear(months = 0): number {
  return parseFloat((months / 12).toFixed(2));
}

export function StorableMonthToDisplayable(plan_time_stamp: number, storable_month_number: number): number {
  const start_month_name = GetMonth(GetDate(plan_time_stamp), storable_month_number);
  const monthIndex = new Date(`${start_month_name} 1, 2000`).getMonth();
  return monthIndex;
}

export function StorableMonthToDisplayableYear(plan_time_stamp: number, storable_month_number: number): number {
  return parseInt(GetYear(GetDate(plan_time_stamp), storable_month_number));
}

export function GetMMYYYYNameFromMM(month_of_balance: number, plan_time_stamp: number): string {
  return `${GetMonth(GetDate(plan_time_stamp), month_of_balance)}-${GetYear(GetDate(plan_time_stamp), month_of_balance)}`;
}

export function SecondToMMSS(s: number): string {
  return ((s - (s %= 60)) / 60) + (9 < s ? ":" : ":0") + s;
}

export function CountPropsInObj(obj: Record<string, any> = {}): number {
  let prop_count = 0;
  for (const prop in obj) {
    if (Object.hasOwnProperty.call(obj, prop)) prop_count++;
  }
  return prop_count;
}

export function UpperFirst(str: string): string {
  if (typeof str !== "string") return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function ToIndianFormat(number: number): string {
  return new Intl.NumberFormat("en-IN", { maximumSignificantDigits: 20, style: "currency", currency: "INR" }).format(number);
}

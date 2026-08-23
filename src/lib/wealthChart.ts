/**
 * Wealth-chart data builder — the SINGLE source of truth for the net-worth
 * composition used by the plan page, compare page and any future surface.
 *
 * Net worth(t) = bucket balances(t) + asset values(t), per month.
 * The snapshot already carries both: account_balances_and_transactions.
 * account_balances (buckets) and asset_month_map (holdings).
 */

export interface WealthChartWindow {
  window_start: number;
  window_size: number;
}

export interface WealthChartData {
  labels: string[];
  datasets: any[];
  /** bucket + asset total per window month — matches the chart's visible bars + line */
  net_worth_series: number[];
}

/** Per-month bucket totals keyed by category ("e" | "s" | "i"). */
export function BucketsByMonth(
  account_balances: { month: number; category: string; balance: number }[] = []
): Record<number, { e: number; s: number; i: number }> {
  const map: Record<number, { e: number; s: number; i: number }> = {};
  for (const b of account_balances) {
    const month = map[b.month] || { e: 0, s: 0, i: 0 };
    if (b.category === "e") month.e += b.balance || 0;
    else if (b.category === "s") month.s += b.balance || 0;
    else if (b.category === "i") month.i += b.balance || 0;
    map[b.month] = month;
  }
  return map;
}

/** Per-month total asset value (holdings) — from asset_month_map. */
export function AssetsByMonth(asset_month_map: Record<number, any[]> = {}): Record<number, number> {
  const map: Record<number, number> = {};
  for (const [month, rows] of Object.entries(asset_month_map)) {
    map[Number(month)] = rows.reduce((s: number, r: any) => s + (r.value || 0), 0);
  }
  return map;
}

/**
 * Build the windowed chart datasets: stacked e/s/i bars + an ASSETS line.
 * cssVar(name) resolves Tailwind CSS variables at runtime (plan/compare pages
 * both pass the same resolver so colors stay consistent).
 */
export function BuildWealthChartData(
  snapshot: any,
  window: WealthChartWindow,
  cssVar: (name: string) => string,
  labels: string[]
): WealthChartData {
  const { window_start, window_size } = window;
  const buckets = BucketsByMonth(snapshot?.account_balances_and_transactions?.account_balances || []);
  const assets = AssetsByMonth(snapshot?.asset_month_map || {});

  const bar = (category: "e" | "s" | "i", label: string, order: number, colors: { bg: string; border: string; radius?: any }) => ({
    label,
    data: Array.from({ length: window_size }, (_, i) => {
      const m = window_start + i + 1;
      return buckets[m]?.[category] || 0;
    }),
    backgroundColor: colors.bg,
    borderColor: colors.border,
    pointStyle: "circle",
    pointRadius: 0,
    pointHoverRadius: 15,
    ...(colors.radius ? { borderRadius: colors.radius } : {}),
    order,
  });

  const assets_series = Array.from({ length: window_size }, (_, i) => {
    const m = window_start + i + 1;
    return assets[m] || 0;
  });

  const has_assets = assets_series.some((v) => v > 0);
  const datasets: any[] = [
    bar("e", "EMERGENCY", 3, { bg: cssVar("--color-dark-300"), border: cssVar("--color-dark-300"), radius: { topLeft: 3, topRight: 3 } }),
    bar("s", "SAVINGS", 2, { bg: cssVar("--color-accent-600"), border: cssVar("--color-accent-600") }),
    bar("i", "INVESTMENT", 1, { bg: cssVar("--color-primary-400"), border: cssVar("--color-primary-500") }),
  ];
  if (has_assets) {
    // ASSETS is a STACKED segment (top) so the bar top = Net Worth = annotation
    // = the Runway card figure — one consistent number everywhere.
    datasets.push({
      label: "ASSETS (invested)",
      data: assets_series,
      backgroundColor: cssVar("--color-warning-500") || "#f59e0b",
      borderColor: cssVar("--color-warning-600") || "#d97706",
      pointStyle: "circle",
      pointRadius: 0,
      pointHoverRadius: 15,
      order: 0,
    });
  }

  return {
    labels,
    datasets,
    net_worth_series: Array.from({ length: window_size }, (_, i) => {
      const m = window_start + i + 1;
      const b = buckets[m];
      return (b ? b.e + b.s + b.i : 0) + (assets[m] || 0);
    }),
  };
}

/**
 * Conservative/aggressive dashed lines from asset_scenarios.month_map —
 * the ±1σ band over time. Only when the snapshot computed scenarios.
 */
export function BuildScenarioLines(
  snapshot: any,
  window: WealthChartWindow,
  cssVar: (name: string) => string
): any[] {
  const month_map = snapshot?.asset_scenarios?.month_map;
  if (!month_map) return [];
  const { window_start, window_size } = window;
  const series = (key: "conservative" | "aggressive") =>
    Array.from({ length: window_size }, (_, i) => month_map[key]?.[window_start + i + 1] || 0);

  return [
    {
      label: "CONSERVATIVE",
      type: "line",
      data: series("conservative"),
      borderColor: cssVar("--color-danger-400") || "#f87171",
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointStyle: "circle",
      pointRadius: 0,
      pointHoverRadius: 10,
      fill: false,
      order: -1,
    },
    {
      label: "AGGRESSIVE",
      type: "line",
      data: series("aggressive"),
      borderColor: cssVar("--color-success-400") || "#34d399",
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointStyle: "circle",
      pointRadius: 0,
      pointHoverRadius: 10,
      fill: false,
      order: -1,
    },
  ];
}

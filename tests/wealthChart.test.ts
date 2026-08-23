import { describe, expect, it } from "vitest";
import {
  AssetsByMonth,
  BucketsByMonth,
  BuildScenarioLines,
  BuildWealthChartData,
} from "@/lib/wealthChart";

const cssVar = () => "#000";

function snapshot(overrides: Record<string, any> = {}) {
  return {
    account_balances_and_transactions: {
      account_balances: [
        { month: 1, category: "e", balance: 100 },
        { month: 1, category: "s", balance: 200 },
        { month: 1, category: "i", balance: 300 },
        { month: 2, category: "e", balance: 110 },
        { month: 2, category: "s", balance: 210 },
        { month: 2, category: "i", balance: 310 },
      ],
    },
    asset_month_map: {
      1: [{ asset_class: "gold", value: 500 }],
      2: [{ asset_class: "gold", value: 600 }],
    },
    asset_scenarios: {
      month_map: {
        conservative: { 1: 450, 2: 520 },
        expected: { 1: 500, 2: 600 },
        aggressive: { 1: 550, 2: 690 },
      },
    },
    ...overrides,
  };
}

describe("BucketsByMonth / AssetsByMonth", () => {
  it("groups bucket balances per month and totals asset values per month", () => {
    const buckets = BucketsByMonth(snapshot().account_balances_and_transactions.account_balances);
    expect(buckets[1]).toEqual({ e: 100, s: 200, i: 300 });
    expect(buckets[2]).toEqual({ e: 110, s: 210, i: 310 });

    const assets = AssetsByMonth(snapshot().asset_month_map);
    expect(assets[1]).toBe(500);
    expect(assets[2]).toBe(600);
  });
});

describe("BuildWealthChartData", () => {
  it("builds e/s/i bars + an ASSETS stacked segment; net_worth_series = buckets + assets", () => {
    const labels = ["M1", "M2"];
    const data = BuildWealthChartData(snapshot(), { window_start: 0, window_size: 2 }, cssVar, labels);
    expect(data.datasets.map((d) => d.label)).toEqual(["EMERGENCY", "SAVINGS", "INVESTMENT", "ASSETS (invested)"]);
    const assets = data.datasets.find((d) => d.label === "ASSETS (invested)");
    // stacked segment (NOT a line) so the bar top = net worth
    expect(assets.type).toBeUndefined();
    expect(assets.data).toEqual([500, 600]);
    expect(assets.order).toBe(0); // drawn on top
    // net worth series = buckets + assets per month
    expect(data.net_worth_series).toEqual([1100, 1230]); // (100+200+300+500), (110+210+310+600)
  });

  it("emits NO assets line when the plan has no holdings (byte-stable old charts)", () => {
    const s = snapshot({ asset_month_map: {} });
    const data = BuildWealthChartData(s, { window_start: 0, window_size: 2 }, cssVar, ["M1", "M2"]);
    expect(data.datasets.map((d) => d.label)).toEqual(["EMERGENCY", "SAVINGS", "INVESTMENT"]);
    expect(data.net_worth_series).toEqual([600, 630]);
  });

  it("respects the sliding window", () => {
    const data = BuildWealthChartData(snapshot(), { window_start: 1, window_size: 1 }, cssVar, ["M2"]);
    expect(data.datasets[0].data).toEqual([110]); // only month 2
    expect(data.net_worth_series).toEqual([1230]);
  });

  it("keeps the ASSETS segment when holdings exist OUTSIDE the window (no pop-in/out)", () => {
    // assets only start at month 40 — the first window has no asset values yet,
    // but the segment must still exist (zero-height) so it doesn't jump in later
    const s = snapshot({
      asset_month_map: { 40: [{ asset_class: "gold", value: 500 }] },
    });
    const data = BuildWealthChartData(s, { window_start: 0, window_size: 20 }, cssVar, Array(20).fill("M"));
    const assets = data.datasets.find((d) => d.label === "ASSETS (invested)");
    expect(assets).toBeTruthy();
    expect(assets.data).toEqual(Array(20).fill(0));
    // months 1-2 have buckets; months 3-20 have neither buckets nor assets
    expect(data.net_worth_series).toEqual([600, 630, ...Array(18).fill(0)]);
  });
});

describe("BuildScenarioLines", () => {
  it("projects conservative/aggressive dashed lines from the month map", () => {
    const lines = BuildScenarioLines(snapshot(), { window_start: 0, window_size: 2 }, cssVar);
    expect(lines).toHaveLength(2);
    expect(lines[0].label).toBe("CONSERVATIVE");
    expect(lines[0].data).toEqual([450, 520]);
    expect(lines[1].label).toBe("AGGRESSIVE");
    expect(lines[1].data).toEqual([550, 690]);
    expect(lines[0].borderDash).toBeTruthy();
  });

  it("returns nothing without asset_scenarios", () => {
    expect(BuildScenarioLines(snapshot({ asset_scenarios: undefined }), { window_start: 0, window_size: 2 }, cssVar)).toEqual([]);
  });
});

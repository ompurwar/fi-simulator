/** Map a net-worth snapshot's asset classes to plan assets (pure, no I/O). */

import { MakeAsset, type Asset } from "../domain/entities";
import type { AssetPresets } from "../tax/schema";

/** Net worth asset_class labels (IndMoney normalizer) → plan asset class. */
export const NETWORTH_CLASS_MAP: Record<string, { asset_class: string; category: "s" | "e" | "i"; jurisdiction: "in" | "foreign"; title: string }> = {
  "Indian Stocks": { asset_class: "equity", category: "i", jurisdiction: "in", title: "Indian Stocks" },
  "Mutual Funds": { asset_class: "mf", category: "i", jurisdiction: "in", title: "Mutual Funds" },
  "Fixed Deposits": { asset_class: "fd", category: "i", jurisdiction: "in", title: "Fixed Deposits" },
  "Gold": { asset_class: "gold", category: "i", jurisdiction: "in", title: "Gold" },
  "Savings & Liquid": { asset_class: "savings", category: "s", jurisdiction: "in", title: "Savings & Liquid" },
  "US Stocks": { asset_class: "equity_foreign", category: "i", jurisdiction: "foreign", title: "US Stocks" },
  "EPF": { asset_class: "ppf", category: "i", jurisdiction: "in", title: "EPF" },
  "NPS": { asset_class: "ppf", category: "i", jurisdiction: "in", title: "NPS" },
};

/** Build plan assets from a net-worth allocation list (values > 0, mapped classes only). */
export function BuildAssetsFromNetWorth(
  allocation: { asset_class: string; value: number }[],
  presets: AssetPresets
): Asset[] {
  const by_class = new Map<string, number>();
  for (const entry of allocation || []) {
    const mapped = NETWORTH_CLASS_MAP[entry.asset_class];
    if (!mapped) continue;
    const value = Number(entry.value || 0);
    if (value <= 0) continue;
    by_class.set(mapped.asset_class, (by_class.get(mapped.asset_class) || 0) + value);
  }

  const assets: Asset[] = [];
  for (const [asset_class, value] of by_class) {
    const mapped = NETWORTH_CLASS_MAP[Object.keys(NETWORTH_CLASS_MAP).find((k) => NETWORTH_CLASS_MAP[k].asset_class === asset_class)!];
    const preset = presets.asset_classes[asset_class] || {};
    assets.push(
      MakeAsset({
        title: mapped.title,
        asset_class,
        category: mapped.category,
        principal: Math.round(value),
        purchase_month: 1,
        growth_rate: preset.growth_rate ?? 8,
        yield_rate: preset.yield_rate,
        volatility: preset.volatility,
        income_frequency: "y",
        income_mode: "credit",
        compounding: preset.compounding,
        jurisdiction: mapped.jurisdiction,
        listed: true,
        active: true,
      })
    );
  }
  return assets;
}

/**
 * Tolerant normalizers for the IndMoney MCP tool payloads.
 *
 * The exact JSON shapes of the `networth_snapshot` / `networth_holdings` MCP
 * tools are not formally documented, so these normalizers probe common field
 * names (snake_case, camelCase, display names) and degrade gracefully. The
 * raw payload is persisted alongside the normalized data so shapes can be
 * tightened once a real account is connected.
 */

import type {
  NetWorthAllocation,
  NetWorthAnalysisItem,
  NetWorthHolding,
  NetWorthSnapshot,
} from "../types";

function toNum(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v.replace(/[₹,\s]/g, "").replace(/[()]/g, "-");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]/g, "");
}

/** First matching field by normalized name, or undefined. */
function first(v: any, keys: string[]): any {
  if (v === null || v === undefined || typeof v !== "object" || Array.isArray(v)) {
    return v === null || v === undefined ? undefined : v;
  }
  const wanted = keys.map(normalizeKey);
  for (const k of Object.keys(v)) {
    const nk = normalizeKey(k);
    if (wanted.includes(nk)) return v[k];
  }
  return undefined;
}

function finalizeAllocation(a: NetWorthAllocation): NetWorthAllocation {
  if (!a.pnl && a.invested && a.value !== a.invested) {
    a.pnl = a.value - a.invested;
  }
  if (!a.pnl_pct && a.invested > 0) {
    a.pnl_pct = ((a.value - a.invested) / a.invested) * 100;
  }
  return a;
}

/** IndMoney MCP asset_type codes → readable labels. */
export const ASSET_TYPE_LABELS: Record<string, string> = {
  MF: "Mutual Funds",
  US_STOCK: "US Stocks",
  STOCK: "Indian Stocks",
  IND_STOCK: "Indian Stocks",
  SA: "Savings Account",
  PHYSICAL_GOLD: "Gold",
  PPF: "PPF",
  EPF: "EPF",
  US_STOCK_WALLET: "US Stock Wallet",
  CRYPTO: "Crypto",
  FD: "Fixed Deposits",
  NPS: "NPS",
  BOND: "Bonds",
  RD: "Recurring Deposits",
  RE: "Real Estate",
  INSURANCE: "Insurance",
  VEHICLE: "Vehicle",
  AIF: "AIF",
  PMS: "PMS",
};

function normalizeAllocation(raw: any): NetWorthAllocation[] {
  if (Array.isArray(raw)) {
    return raw
      .map((a: any) => {
        const raw_class = String(
          first(a, [
            "asset_type",
            "assetType",
            "asset_class",
            "assetClass",
            "assetclass_l2",
            "category",
            "name",
            "label",
          ]) ?? "Other"
        );
        return finalizeAllocation({
          asset_class: ASSET_TYPE_LABELS[raw_class.toUpperCase()] || raw_class,
          value: toNum(first(a, ["current_value", "currentValue", "value", "amount", "market_value", "marketValue"])),
          invested: toNum(first(a, ["invested_value", "investedValue", "invested", "invested_amount", "investedAmount"])),
          pnl: toNum(first(a, ["return", "returns", "profit_loss", "pnl", "pnl_amount", "unrealized_pnl", "unrealisedPnl", "return_amount"])),
          pnl_pct: toNum(first(a, ["return_percentage", "returnPercentage", "pnl_pct", "pnlPct", "pnl_percent", "returns_pct", "pnlPercentage"])),
        });
      })
      .filter((a) => a.value > 0 || a.asset_class !== "Other");
  }
  if (raw && typeof raw === "object") {
    // map form: { "Indian Stocks": 12345 } or { "Indian Stocks": { value, invested } }
    return Object.entries(raw)
      .map(([asset_class, v]) => {
        const entry = v && typeof v === "object" ? v : { value: v };
        return finalizeAllocation({
          asset_class,
          value: toNum(first(entry, ["current_value", "currentValue", "value", "amount"])),
          invested: toNum(first(entry, ["invested_value", "investedValue", "invested", "invested_amount"])),
          pnl: toNum(first(entry, ["return", "returns", "profit_loss", "pnl", "unrealized_pnl"])),
          pnl_pct: toNum(first(entry, ["return_percentage", "returnPercentage", "pnl_pct", "pnlPct", "returns_pct"])),
        });
      })
      .filter((a) => a.value > 0);
  }
  return [];
}

export function normalizeSnapshot(raw: any): NetWorthSnapshot {
  const root = raw && typeof raw === "object" ? raw : {};
  const total_net_worth = toNum(
    first(root, ["total_net_worth", "totalNetWorth", "net_worth", "netWorth", "total_networth", "networth"])
  );
  const total_current_value = toNum(
    first(root, ["total_current_value", "totalCurrentValue", "total_current", "totalCurrent"])
  );
  const total_assets = toNum(
    first(root, ["total_current_value", "totalCurrentValue", "total_assets", "totalAssets", "assets", "total_asset_value"])
  );
  const total_liabilities = toNum(
    first(root, ["total_liabilities", "totalLiabilities", "liabilities", "total_liability_value"])
  );
  const invested = toNum(
    first(root, ["invested", "total_invested", "totalInvested", "amount_invested", "invested_amount"])
  );
  const unrealized_pnl =
    toNum(
      first(root, [
        "unrealized_pnl",
        "unrealizedPnl",
        "unrealised_pnl",
        "total_pnl",
        "totalPnl",
        "pnl",
        "profit_loss",
        "returns",
      ])
    ) || (total_current_value > 0 ? total_current_value - invested : 0);
  const as_of = String(
    first(root, ["as_of", "asOf", "timestamp", "date", "last_updated", "synced_at"]) ||
      new Date().toISOString()
  );
  // IndMoney exposes the breakdown under `investments` (asset_type) and
  // `assets` (assetclass_l2); `allocation`-style keys are the generic fallback.
  const allocation = normalizeAllocation(
    first(root, [
      "investments",
      "assets",
      "allocation",
      "allocations",
      "asset_allocation",
      "assetAllocation",
      "allocation_breakdown",
      "networth_allocation_breakdown",
      "breakdown",
    ]) ?? []
  );

  return {
    total_net_worth:
      total_net_worth || total_current_value || (total_assets > 0 ? total_assets - total_liabilities : 0),
    total_assets: total_assets || total_net_worth + total_liabilities,
    total_liabilities,
    invested,
    unrealized_pnl,
    as_of,
    allocation,
  };
}

export function normalizeHoldings(raw: any): NetWorthHolding[] {  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.holdings)
      ? raw.holdings
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.items)
          ? raw.items
          : [];
  return arr
    .map((h: any) => {
      const current_value = toNum(
        first(h, ["current_value", "currentValue", "current", "value", "market_value", "marketValue", "ltv"])
      );
      const invested = toNum(
        first(h, ["invested_value", "investedValue", "invested", "invested_amount", "investedAmount", "cost", "buy_value"])
      );
      const pnl = toNum(first(h, ["return", "returns", "pnl", "profit_loss", "pnl_amount", "total_pnl", "totalPnl", "unrealized_pnl", "unrealisedPnl"]));
      const pnl_pct = toNum(
        first(h, ["return_percentage", "returnPercentage", "pnl_per", "pnlPer", "pnl_pct", "pnlPct", "pnl_percent", "returns_pct", "pnlPercentage"])
      );
      const units = toNum(first(h, ["total_units", "totalUnits", "units", "quantity", "qty", "units_held", "total_qty", "unit_qty"]));
      const name = String(
        first(h, [
          "name",
          "investment",
          "scheme_name",
          "schemeName",
          "fund_name",
          "fundName",
          "security_name",
          "securityName",
          "symbol",
          "ticker",
          "display_name",
          "instrument_name",
        ]) ?? "Unknown"
      );
      const raw_class = String(
        first(h, ["asset_class", "assetClass", "asset_type", "assetType", "category", "instrument_type"]) ?? "Other"
      );
      return {
        code: first(h, ["investment_code", "investmentCode", "code", "holding_id"]) !== undefined
          ? String(first(h, ["investment_code", "investmentCode", "code", "holding_id"]))
          : null,
        name,
        asset_class: ASSET_TYPE_LABELS[raw_class.toUpperCase()] || raw_class,
        units: units > 0 ? units : null,
        invested,
        current_value,
        pnl: pnl || (invested ? current_value - invested : 0),
        pnl_pct: pnl_pct || (invested > 0 ? ((current_value - invested) / invested) * 100 : 0),
        xirr: first(h, ["xirr", "xirr_pct", "xirr_percentage", "xirrPercentage", "annualized_returns", "annualised_returns"]) !== undefined
          ? toNum(first(h, ["xirr", "xirr_pct", "xirr_percentage", "xirrPercentage", "annualized_returns", "annualised_returns"]))
          : null,
        broker: first(h, ["broker", "broker_name", "holding_source"]) !== undefined
          ? String(first(h, ["broker", "broker_name", "holding_source"]))
          : null,
      };
    })
    .filter((h: NetWorthHolding) => h.name !== "Unknown");
}

/**
 * Normalizes the `get_us_stocks_details` payload (optionally augmented with
 * analyst/news segments) into analysis rows. Shape is probed tolerantly.
 */
export function normalizeUsAnalysis(raw: any): NetWorthAnalysisItem[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.stocks)
        ? raw.stocks
        : Array.isArray(raw?.details)
          ? raw.details
          : Array.isArray(raw?.items)
            ? raw.items
            : [];
  return arr
    .map((item: any): NetWorthAnalysisItem => {
      const symbol = String(
        first(item, ["symbol", "ticker", "ticker_symbol", "ind_key", "indKey", "security_code", "code"]) ?? ""
      );
      const name = first(item, ["name", "company_name", "security_name", "instrument", "investment"])
        ? String(first(item, ["name", "company_name", "security_name", "instrument", "investment"]))
        : null;
      const price = first(item, ["ltp", "price", "current_price", "currentPrice", "last_price", "close"])
        ? toNum(first(item, ["ltp", "price", "current_price", "currentPrice", "last_price", "close"]))
        : null;
      const day_low = first(item, ["day_low", "dayLow", "low", "intraday_low"])
        ? toNum(first(item, ["day_low", "dayLow", "low", "intraday_low"]))
        : null;
      const day_high = first(item, ["day_high", "dayHigh", "high", "intraday_high"])
        ? toNum(first(item, ["day_high", "dayHigh", "high", "intraday_high"]))
        : null;
      const market_cap = first(item, ["market_cap", "marketCap", "mkt_cap"])
        ? toNum(first(item, ["market_cap", "marketCap", "mkt_cap"]))
        : null;
      const analyst_consensus = first(item, ["analyst_consensus", "analystConsensus", "consensus", "rating", "analyst_rating", "analystSummary", "summary"])
        ? String(first(item, ["analyst_consensus", "analystConsensus", "consensus", "rating", "analyst_rating", "analystSummary", "summary"]))
        : null;
      const target_price = first(item, ["target_price", "targetPrice", "analyst_target", "avg_target_price", "price_target"])
        ? toNum(first(item, ["target_price", "targetPrice", "analyst_target", "avg_target_price", "price_target"]))
        : null;
      const headline = first(item, ["headline", "title", "news_headline"])
        ? String(first(item, ["headline", "title", "news_headline"]))
        : null;
      const sentiment = first(item, ["sentiment", "news_sentiment"])
        ? String(first(item, ["sentiment", "news_sentiment"]))
        : null;
      const upside_pct =
        price && target_price ? ((target_price - price) / price) * 100 : null;
      return {
        symbol,
        name,
        price,
        day_low,
        day_high,
        market_cap,
        analyst_consensus,
        target_price,
        upside_pct,
        sentiment,
        headline,
      };
    })
    .filter((a: NetWorthAnalysisItem) => a.symbol !== "" || a.name !== null);
}

/** Canonical net worth data shapes produced by providers (currently IndMoney via MCP). */

export interface NetWorthAllocation {
  asset_class: string;
  value: number;
  invested: number;
  pnl: number;
  pnl_pct: number;
}

export interface NetWorthSnapshot {
  total_net_worth: number;
  total_assets: number;
  total_liabilities: number;
  invested: number;
  unrealized_pnl: number;
  as_of: string;
  allocation: NetWorthAllocation[];
}

export interface NetWorthHolding {
  /** Provider-side identifier for the holding (e.g. IndMoney investment_code). */
  code: string | null;
  name: string;
  asset_class: string;
  units: number | null;
  invested: number;
  current_value: number;
  pnl: number;
  pnl_pct: number;
  xirr: number | null;
  broker: string | null;
}

export interface NetWorthHistoryPoint {
  month: string;
  value: number;
}

export interface NetWorthAnalysisItem {
  /** Ticker/symbol or instrument name, whatever the provider returned. */
  symbol: string;
  name: string | null;
  price: number | null;
  day_low: number | null;
  day_high: number | null;
  market_cap: number | null;
  analyst_consensus: string | null;
  target_price: number | null;
  upside_pct: number | null;
  sentiment: string | null;
  headline: string | null;
}

/** What the provider returns from a sync — already normalized into canonical shapes. */
export interface ProviderSnapshotPayload {
  snapshot: NetWorthSnapshot;
  holdings: NetWorthHolding[];
  /** Optional per-instrument analysis (e.g. US stocks analyst/price data). */
  analysis?: NetWorthAnalysisItem[];
  /** Raw provider payload, persisted for schema-debugging. */
  raw?: string | null;
}

/**
 * INDstocks read-only integration (https://api-docs.indstocks.com) — INDmoney's
 * Indian trading API. Used ONLY for portfolio reads: holdings (with avg price),
 * positions (with realized_profit) and funds. No order/trade calls are made.
 *
 * Auth: an INDstocks access token from indstocks.com/app/api-trading/access-tokens
 * (24h expiry, single account). Token lives in env INDSTOCKS_API_TOKEN.
 */

const BASE_URL = "https://api.indstocks.com";

export interface IndStocksHolding {
  security_id: string;
  symbol: string;
  isin: string | null;
  total_qty: number;
  avg_price: number;
  /** approx invested = total_qty * avg_price (buy-side only) */
  invested: number;
}

export interface IndStocksPosition {
  security_id: string;
  symbol: string;
  segment: string;
  product: string;
  exchange: string | null;
  net_qty: number;
  avg_price: number;
  buy_qty: number;
  buy_avg: number;
  sell_qty: number;
  sell_avg: number;
  realized_profit: number;
}

export interface IndStocksFunds {
  available: number;
  utilized: number;
}

export interface IndStocksSnapshot {
  as_of: string;
  holdings: IndStocksHolding[];
  positions: IndStocksPosition[];
  realized_profit_total: number;
  funds: IndStocksFunds | null;
}

function toNum(v: any): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

async function getJson(token: string, path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: token, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`indstocks ${path} failed: ${res.status} ${res.statusText}`);
  }
  const body = await res.json().catch(() => null);
  return body?.data ?? body ?? [];
}

/** Fetch holdings + positions (equity + derivative) + funds — read-only. */
export async function fetchIndStocksSnapshot(token: string): Promise<IndStocksSnapshot> {
  if (!token) throw new Error("INDSTOCKS_API_TOKEN is not configured");

  const [holdings, equityPositions, derivativePositions, funds] = await Promise.all([
    getJson(token, "/portfolio/holdings"),
    getJson(token, "/portfolio/positions", { segment: "equity", product: "cnc" }).catch((e) => {
      throw e;
    }),
    getJson(token, "/portfolio/positions", { segment: "derivative", product: "margin" }).catch(() => []),
    getJson(token, "/user/funds").catch(() => null),
  ]);

  const normalizedHoldings: IndStocksHolding[] = (Array.isArray(holdings) ? holdings : []).map(
    (h: any) => ({
      security_id: String(h.security_id ?? ""),
      symbol: String(h.symbol ?? "Unknown"),
      isin: h.isin ? String(h.isin) : null,
      total_qty: toNum(h.total_qty),
      avg_price: toNum(h.avg_price),
      invested: toNum(h.total_qty) * toNum(h.avg_price),
    })
  );

  const positions: IndStocksPosition[] = [
    ...(Array.isArray(equityPositions) ? equityPositions : []),
    ...(Array.isArray(derivativePositions) ? derivativePositions : []),
  ].map((p: any) => ({
    security_id: String(p.security_id ?? ""),
    symbol: String(p.symbol ?? "Unknown"),
    segment: String(p.segment ?? "EQUITY"),
    product: String(p.product ?? ""),
    exchange: p.exchange ? String(p.exchange) : null,
    net_qty: toNum(p.net_qty),
    avg_price: toNum(p.avg_price),
    buy_qty: toNum(p.buy_qty),
    buy_avg: toNum(p.buy_avg),
    sell_qty: toNum(p.sell_qty),
    sell_avg: toNum(p.sell_avg),
    realized_profit: toNum(p.realized_profit),
  }));

  const realized_profit_total = positions.reduce((s, p) => s + p.realized_profit, 0);

  const fundsNormalized: IndStocksFunds | null =
    funds && typeof funds === "object" && Object.keys(funds).length
      ? {
          available: toNum(funds.available_balance ?? funds.available ?? funds.avail),
          utilized: toNum(funds.utilized ?? 0),
        }
      : null;

  return {
    as_of: new Date().toISOString(),
    holdings: normalizedHoldings,
    positions,
    realized_profit_total,
    funds: fundsNormalized,
  };
}

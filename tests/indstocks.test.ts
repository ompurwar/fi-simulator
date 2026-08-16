import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchIndStocksSnapshot } from "@/server/indstocks/service";

afterEach(() => vi.restoreAllMocks());

const HOLDINGS = {
  status: "success",
  data: [
    { security_id: "18520", symbol: "CUPID", isin: "INE509F01029", total_qty: 10, avg_price: 217.3, t1_qty: 10, t1_avg_price: 217.3 },
  ],
};
const EQUITY_POSITIONS = {
  status: "success",
  data: [
    { position_id: "1", symbol: "INDIAGLYCO", segment: "EQUITY", product: "INTRADAY", exchange: "NSE", net_qty: 1, avg_price: 1146.85, buy_qty: 1, buy_avg: 1149.4, sell_qty: 1, sell_avg: 1146.85, realized_profit: -2.55 },
  ],
};
const DERIV_POSITIONS = {
  status: "success",
  data: [
    { position_id: "2", symbol: "SENSEX", segment: "DERIVATIVE", product: "MARGIN", exchange: "", drv_instrument: "OPTIDX", net_qty: 0, avg_price: 1.2, buy_qty: 20, buy_avg: 1.25, sell_qty: 20, sell_avg: 1.2, realized_profit: -1.0 },
  ],
};
const FUNDS = { status: "success", data: { available_balance: 50000, utilized: 12000 } };

describe("INDstocks read-only service", () => {
  it("normalizes holdings, positions, realized P&L and funds", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes("/portfolio/holdings")) return new Response(JSON.stringify(HOLDINGS), { status: 200 });
      if (u.includes("/portfolio/positions") && u.includes("segment=equity")) return new Response(JSON.stringify(EQUITY_POSITIONS), { status: 200 });
      if (u.includes("/portfolio/positions") && u.includes("segment=derivative")) return new Response(JSON.stringify(DERIV_POSITIONS), { status: 200 });
      if (u.includes("/user/funds")) return new Response(JSON.stringify(FUNDS), { status: 200 });
      return new Response("not found", { status: 404 });
    });

    const snap = await fetchIndStocksSnapshot("tok");
    expect(snap.holdings).toHaveLength(1);
    expect(snap.holdings[0]).toMatchObject({ symbol: "CUPID", total_qty: 10, avg_price: 217.3, invested: 2173 });
    expect(snap.positions).toHaveLength(2);
    expect(snap.realized_profit_total).toBeCloseTo(-3.55, 2);
    expect(snap.funds).toMatchObject({ available: 50000, utilized: 12000 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // read-only: no POST to /order anywhere
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/order"))).toBe(false);
  });

  it("tolerates missing derivative positions and funds", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes("/portfolio/holdings")) return new Response(JSON.stringify(HOLDINGS), { status: 200 });
      if (u.includes("/portfolio/positions") && u.includes("segment=equity")) return new Response(JSON.stringify(EQUITY_POSITIONS), { status: 200 });
      return new Response("nope", { status: 500 });
    });

    const snap = await fetchIndStocksSnapshot("tok");
    expect(snap.positions).toHaveLength(1);
    expect(snap.realized_profit_total).toBe(-2.55);
    expect(snap.funds).toBeNull();
  });

  it("rejects missing tokens", async () => {
    await expect(fetchIndStocksSnapshot("")).rejects.toThrow(/not configured/);
  });
});

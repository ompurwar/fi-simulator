import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestApp, post, signupUser, type TestApp } from "./helpers";
import type { NetWorthProvider } from "@/server/networth";
import { normalizeHoldings, normalizeSnapshot, normalizeUsAnalysis } from "@/server/networth/indmoney/normalize";

const SAMPLE_PAYLOAD = {
  snapshot: {
    total_net_worth: 3487800,
    total_assets: 4179800,
    total_liabilities: 692000,
    invested: 3058000,
    unrealized_pnl: 1121800,
    as_of: "2026-08-15T10:00:00.000Z",
    allocation: [
      { asset_class: "Indian Stocks", value: 948900, invested: 820000, pnl: 128900, pnl_pct: 15.72 },
      { asset_class: "Mutual Funds", value: 1386250, invested: 1240000, pnl: 146250, pnl_pct: 11.79 },
    ],
  },
  holdings: [
    {
      name: "Reliance Industries",
      asset_class: "Indian Stocks",
      units: 28,
      invested: 284200,
      current_value: 358400,
      pnl: 74200,
      pnl_pct: 26.1,
      xirr: 22.4,
      broker: "INDmoney",
    },
  ],
  analysis: [
    {
      symbol: "MSFT",
      name: "Microsoft Corporation",
      price: 474.2,
      day_low: 470.1,
      day_high: 479.9,
      market_cap: null,
      analyst_consensus: "Strong Buy",
      target_price: 520.5,
      upside_pct: 9.76,
      sentiment: "Positive",
      headline: "Microsoft raises cloud outlook",
    },
  ],
};

function makeFakeProvider() {
  return {
    name: "indmoney",
    buildAuthorizationUrl: vi.fn(async ({
      user_id,
      redirect_url,
      state,
    }: {
      user_id: string;
      redirect_url: string;
      state: string;
    }) => ({
      state,
      url: `https://indmoney.example/oauth?state=${state}&redirect=${encodeURIComponent(redirect_url)}&uid=${user_id}`,
    })),
    finishAuthorization: vi.fn(async () => {}),
    fetchSnapshot: vi.fn(async () => SAMPLE_PAYLOAD),
    disconnect: vi.fn(async () => {}),
  };
}

let t: TestApp;
let provider: ReturnType<typeof makeFakeProvider>;

beforeAll(async () => {
  provider = makeFakeProvider();
  t = await createTestApp({ networthProvider: provider as unknown as NetWorthProvider });
});

afterAll(async () => {
  await t.stop();
});

describe("net worth provider connection", () => {
  it("reports not connected before any connect attempt", async () => {
    const { session_id } = await signupUser(t.app);
    const res = await post(t.app, "/api/networth/status", { data: {} }, { "auth-token": session_id });
    expect(res.json.status).toBe("success");
    expect(res.json.data.connected).toBe(false);
    expect(res.json.data.snapshot).toBeNull();
  });

  it("starts the oauth flow and returns the provider authorization url", async () => {
    const { session_id } = await signupUser(t.app);
    const redirect_url = "http://localhost:3001/api/networth/oauth/callback";
    const res = await post(
      t.app,
      "/api/networth/connect",
      { data: { redirect_url } },
      { "auth-token": session_id }
    );
    expect(res.json.status).toBe("success");
    expect(res.json.data.url).toContain("indmoney.example");
    expect(res.json.data.state).toMatch(/^[a-f0-9]{16}$/);
    expect(provider.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({ redirect_url, state: res.json.data.state })
    );
    expect(provider.buildAuthorizationUrl.mock.calls[0][0].user_id).toMatch(/^[a-f0-9]+$/);
  });

  it("stays disconnected until the oauth callback completes", async () => {
    const { session_id } = await signupUser(t.app);
    await post(t.app, "/api/networth/connect", { data: { redirect_url: "http://localhost:3001/cb" } }, { "auth-token": session_id });
    const res = await post(t.app, "/api/networth/status", { data: {} }, { "auth-token": session_id });
    expect(res.json.data.connected).toBe(false);
  });

  it("allows re-connecting when a link already exists", async () => {
    const { session_id } = await signupUser(t.app);
    const first = await post(t.app, "/api/networth/connect", { data: { redirect_url: "http://localhost:3001/cb" } }, { "auth-token": session_id });
    const second = await post(t.app, "/api/networth/connect", { data: { redirect_url: "http://localhost:3001/cb" } }, { "auth-token": session_id });
    expect(first.json.status).toBe("success");
    expect(second.json.status).toBe("success");
  });

  it("persists the redirect url with the oauth state for the code exchange", async () => {
    const { session_id } = await signupUser(t.app);
    const connect = await post(t.app, "/api/networth/connect", { data: { redirect_url: "http://localhost:3001/cb" } }, { "auth-token": session_id });
    const stateDoc = await t.container.networth_repo.GetOAuthState(connect.json.data.state);
    expect(stateDoc?.redirect_url).toBe("http://localhost:3001/cb");
    expect(stateDoc?.expires_at).toBeGreaterThan(Date.now());
  });

  it("completes the connection after the oauth callback", async () => {
    const { user, session_id } = await signupUser(t.app);
    const connect = await post(t.app, "/api/networth/connect", { data: { redirect_url: "http://localhost:3001/cb" } }, { "auth-token": session_id });
    await t.container.networth_service.HandleCallback({ state: connect.json.data.state, code: "auth-code" });
    const res = await post(t.app, "/api/networth/status", { data: {} }, { "auth-token": session_id });
    expect(res.json.status).toBe("success");
    expect(res.json.data.connected).toBe(true);
    expect(res.json.data.provider).toBe("indmoney");
    expect(t.container.networth_repo.GetLink(user._id)).not.toBeNull();
  });

  it("rejects a callback with an unknown state", async () => {
    await expect(
      t.container.networth_service.HandleCallback({ state: "forged-state", code: "code" })
    ).rejects.toThrow(/invalid oauth state/);
  });
});

describe("net worth sync", () => {
  async function connectedUser() {
    const u = await signupUser(t.app);
    const connect = await post(t.app, "/api/networth/connect", { data: { redirect_url: "http://localhost:3001/cb" } }, { "auth-token": u.session_id });
    await t.container.networth_service.HandleCallback({ state: connect.json.data.state, code: "auth-code" });
    return u;
  }

  it("rejects sync before connecting", async () => {
    const { session_id } = await signupUser(t.app);
    const res = await post(t.app, "/api/networth/sync", { data: {} }, { "auth-token": session_id });
    expect(res.json.status).toBe("error");
    expect(res.json.error.code).toBe(401);
  });

  it("syncs, persists and surfaces the provider snapshot", async () => {
    const { session_id } = await connectedUser();
    const res = await post(t.app, "/api/networth/sync", { data: {} }, { "auth-token": session_id });
    expect(res.json.status).toBe("success");
    expect(res.json.data.snapshot.total_net_worth).toBe(3487800);
    expect(res.json.data.holdings.length).toBe(1);

    const status = await post(t.app, "/api/networth/status", { data: {} }, { "auth-token": session_id });
    expect(status.json.data.snapshot.total_net_worth).toBe(3487800);
    expect(status.json.data.holdings[0].name).toBe("Reliance Industries");
    expect(status.json.data.analysis[0].symbol).toBe("MSFT");
    expect(status.json.data.history).toHaveLength(1);
    expect(status.json.data.history[0].value).toBe(3487800);
    expect(status.json.data.last_sync_at).toBeTruthy();
  });

  it("history collapses same-day snapshots into one point", async () => {
    const { session_id } = await connectedUser();
    await post(t.app, "/api/networth/sync", { data: {} }, { "auth-token": session_id });
    await post(t.app, "/api/networth/sync", { data: {} }, { "auth-token": session_id });
    const status = await post(t.app, "/api/networth/status", { data: {} }, { "auth-token": session_id });
    // two syncs on the same day → still exactly one history point
    expect(status.json.data.history).toHaveLength(1);
  });

  it("surfaces provider failures as errors", async () => {
    const { session_id } = await connectedUser();
    provider.fetchSnapshot.mockRejectedValueOnce(new Error("indmoney is down"));
    const res = await post(t.app, "/api/networth/sync", { data: {} }, { "auth-token": session_id });
    expect(res.json.status).toBe("error");
    expect(res.json.data).toBeNull();
  });
});

describe("net worth disconnect", () => {
  it("disconnects and reports not connected afterwards", async () => {
    const { session_id } = await signupUser(t.app);
    const connect = await post(t.app, "/api/networth/connect", { data: { redirect_url: "http://localhost:3001/cb" } }, { "auth-token": session_id });
    await t.container.networth_service.HandleCallback({ state: connect.json.data.state, code: "auth-code" });
    const res = await post(t.app, "/api/networth/disconnect", { data: {} }, { "auth-token": session_id });
    expect(res.json.status).toBe("success");
    expect(provider.disconnect).toHaveBeenCalled();
    const status = await post(t.app, "/api/networth/status", { data: {} }, { "auth-token": session_id });
    expect(status.json.data.connected).toBe(false);
  });
});

describe("indmoney payload normalization", () => {
  it("normalizes a snake_case snapshot payload", () => {
    const raw = {
      total_net_worth: 500000,
      total_assets: 600000,
      total_liabilities: 100000,
      invested: 400000,
      unrealized_pnl: 100000,
      as_of: "2026-08-01T00:00:00.000Z",
      asset_allocation: [
        { asset_class: "Equity", current_value: 300000, invested_amount: 200000, pnl_amount: 100000, returns_pct: 50 },
      ],
    };
    const snap = normalizeSnapshot(raw);
    expect(snap.total_net_worth).toBe(500000);
    expect(snap.allocation).toHaveLength(1);
    expect(snap.allocation[0].asset_class).toBe("Equity");
    expect(snap.allocation[0].value).toBe(300000);
    expect(snap.allocation[0].pnl_pct).toBe(50);
  });

  it("normalizes a camelCase holdings payload", () => {
    const raw = {
      data: [
        {
          schemeName: "Parag Parikh Flexi Cap",
          category: "Mutual Funds",
          quantity: 1823.44,
          investedAmount: 480000,
          marketValue: 587300,
          profitLoss: 107300,
          returnsPct: 22.35,
          xirr: 19.6,
          brokerName: "INDmoney",
        },
      ],
    };
    const holds = normalizeHoldings(raw);
    expect(holds).toHaveLength(1);
    expect(holds[0].name).toBe("Parag Parikh Flexi Cap");
    expect(holds[0].asset_class).toBe("Mutual Funds");
    expect(holds[0].current_value).toBe(587300);
    expect(holds[0].pnl).toBe(107300);
    expect(holds[0].xirr).toBe(19.6);
  });

  it("normalizes the real indmoney snapshot shape", () => {
    const raw = {
      total_invested: 2888725.39,
      total_current_value: 3717739.47,
      total_networth: 3717739.47,
      investments: [
        { asset_type: "MF", invested_value: 1535607.65, current_value: 1824829.2, return: 289221.55, return_percentage: 18.83, progress_value_percentage: 49.08 },
        { asset_type: "US_STOCK", invested_value: 810670.68, current_value: 866635.12, return: 55964.44, return_percentage: 6.9, progress_value_percentage: 23.31 },
      ],
      liabilities: { total_loan_balance: 0, total_credit_card_due: 0, total: 0, loans: [], credit_cards: [] },
    };
    const snap = normalizeSnapshot(raw);
    expect(snap.total_net_worth).toBe(3717739.47);
    expect(snap.total_assets).toBe(3717739.47);
    expect(snap.total_liabilities).toBe(0);
    expect(snap.invested).toBe(2888725.39);
    expect(snap.unrealized_pnl).toBeCloseTo(829014.08, 1);
    expect(snap.allocation).toHaveLength(2);
    expect(snap.allocation[0].asset_class).toBe("Mutual Funds");
    expect(snap.allocation[0].value).toBeCloseTo(1824829.2, 1);
    expect(snap.allocation[0].pnl_pct).toBeCloseTo(18.83, 1);
    expect(snap.allocation[1].asset_class).toBe("US Stocks");
  });

  it("normalizes holdings using invested_value / return / return_percentage", () => {
    const raw = {
      holdings: [
        {
          scheme_name: "Parag Parikh Flexi Cap",
          asset_type: "MF",
          invested_value: 480000,
          current_value: 587300,
          return: 107300,
          return_percentage: 22.35,
          xirr_percentage: 19.6,
          broker_name: "INDmoney",
        },
      ],
    };
    const holds = normalizeHoldings(raw);
    expect(holds).toHaveLength(1);
    expect(holds[0].name).toBe("Parag Parikh Flexi Cap");
    expect(holds[0].asset_class).toBe("Mutual Funds");
    expect(holds[0].invested).toBe(480000);
    expect(holds[0].current_value).toBe(587300);
    expect(holds[0].pnl).toBe(107300);
    expect(holds[0].pnl_pct).toBe(22.35);
    expect(holds[0].xirr).toBe(19.6);
  });

  it("normalizes holdings using the real networth_holdings row shape", () => {
    const raw = {
      holdings: [
        {
          investment_code: "3113",
          investment: "Motilal Oswal Midcap Direct Growth",
          asset_type: "MF",
          assetclass_l2: "Equity",
          invested_amount: 108994.62,
          market_value: 117879.49,
          holding_percent: 6.45,
          total_pnl: 8884.87,
          pnl_per: 8.15,
          xirr: 0,
          total_units: 980.07,
          unit_price: 120.27,
          broker: "EOP-0005",
          market_cap: "",
        },
        {
          investment_code: "INDS19683",
          investment: "Nippon India Silver ETF",
          asset_type: "STOCK",
          assetclass_l2: "Silver",
          invested_amount: "unknown",
          market_value: 66808.44,
          total_pnl: 66808.44,
          pnl_per: 0,
          total_units: 302,
          broker: "Groww",
        },
      ],
    };
    const holds = normalizeHoldings(raw);
    expect(holds).toHaveLength(2);
    expect(holds[0].name).toBe("Motilal Oswal Midcap Direct Growth");
    expect(holds[0].asset_class).toBe("Mutual Funds");
    expect(holds[0].units).toBe(980.07);
    expect(holds[0].invested).toBe(108994.62);
    expect(holds[0].current_value).toBe(117879.49);
    expect(holds[0].pnl).toBe(8884.87);
    expect(holds[0].pnl_pct).toBe(8.15);
    // Indian stock row: "unknown" invested → 0, pnl = API's total_pnl
    expect(holds[1].name).toBe("Nippon India Silver ETF");
    expect(holds[1].asset_class).toBe("Indian Stocks");
    expect(holds[1].invested).toBe(0);
    expect(holds[1].current_value).toBe(66808.44);
    expect(holds[1].pnl).toBe(66808.44);
  });

  it("normalizes the us stocks analysis payload", () => {
    const raw = {
      data: [
        {
          symbol: "MSFT",
          name: "Microsoft Corporation",
          ltp: 474.2,
          day_low: 470.1,
          day_high: 479.9,
          market_cap: 3520000000000,
          analyst_consensus: "Strong Buy",
          target_price: 520.5,
          headline: "Microsoft raises cloud outlook",
          sentiment: "Positive",
        },
      ],
    };
    const rows = normalizeUsAnalysis(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe("MSFT");
    expect(rows[0].name).toBe("Microsoft Corporation");
    expect(rows[0].price).toBe(474.2);
    expect(rows[0].day_low).toBe(470.1);
    expect(rows[0].day_high).toBe(479.9);
    expect(rows[0].analyst_consensus).toBe("Strong Buy");
    expect(rows[0].target_price).toBe(520.5);
    expect(rows[0].upside_pct).toBeCloseTo(9.76, 1);
    expect(rows[0].sentiment).toBe("Positive");
  });

  it("derives pnl when only value and invested are provided", () => {
    const holds = normalizeHoldings([
      { name: "Reliance", symbol: "RELIANCE", qty: 10, invested: 10000, value: 12500 },
    ]);
    expect(holds[0].pnl).toBe(2500);
    expect(holds[0].pnl_pct).toBeCloseTo(25, 1);
  });

  it("degrades gracefully on unreadable payloads", () => {
    expect(normalizeSnapshot(null).total_net_worth).toBe(0);
    expect(normalizeSnapshot({}).allocation).toEqual([]);
    expect(normalizeHoldings(null)).toEqual([]);
    expect(normalizeHoldings({ weird: "shape" })).toEqual([]);
  });
});

/**
 * Net worth data layer.
 *
 * Types mirror the shapes returned by the official IndMoney MCP server tools
 * (networth_snapshot / networth_allocation_breakdown / networth_holdings).
 * The getters below return MOCK data so the page can be built end-to-end.
 * TODO(mcp): replace with a server-side sync that calls the IndMoney MCP
 * streamable-HTTP endpoint (https://mcp.indmoney.com/mcp) via OAuth 2.1 PKCE
 * and stores daily snapshots in MongoDB.
 */

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

const MOCK_SNAPSHOT: NetWorthSnapshot = {
  total_net_worth: 3487800,
  total_assets: 4179800,
  total_liabilities: 692000,
  invested: 3058000,
  unrealized_pnl: 1121800,
  as_of: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  allocation: [
    { asset_class: "Indian Stocks", value: 948900, invested: 820000, pnl: 128900, pnl_pct: 15.72 },
    { asset_class: "Mutual Funds", value: 1386250, invested: 1240000, pnl: 146250, pnl_pct: 11.79 },
    { asset_class: "US Stocks", value: 507650, invested: 410000, pnl: 97650, pnl_pct: 23.82 },
    { asset_class: "EPF", value: 485000, invested: 465000, pnl: 20000, pnl_pct: 4.3 },
    { asset_class: "NPS", value: 215000, invested: 200000, pnl: 15000, pnl_pct: 7.5 },
    { asset_class: "Fixed Deposits", value: 300000, invested: 290000, pnl: 10000, pnl_pct: 3.45 },
    { asset_class: "Savings & Liquid", value: 152000, invested: 152000, pnl: 0, pnl_pct: 0 },
    { asset_class: "Gold", value: 185000, invested: 163000, pnl: 22000, pnl_pct: 13.5 },
  ],
};

const MOCK_HOLDINGS: NetWorthHolding[] = [
  { name: "Reliance Industries", asset_class: "Indian Stocks", units: 28, invested: 284200, current_value: 358400, pnl: 74200, pnl_pct: 26.1, xirr: 22.4, broker: "INDmoney" },
  { name: "HDFC Bank", asset_class: "Indian Stocks", units: 95, invested: 264100, current_value: 285950, pnl: 21850, pnl_pct: 8.27, xirr: 12.8, broker: "INDmoney" },
  { name: "Tata Motors", asset_class: "Indian Stocks", units: 210, invested: 223700, current_value: 240450, pnl: 16750, pnl_pct: 7.49, xirr: 15.1, broker: "INDmoney" },
  { name: "Infosys", asset_class: "Indian Stocks", units: 40, invested: 64000, current_value: 64100, pnl: 100, pnl_pct: 0.16, xirr: 5.2, broker: "Zerodha" },
  { name: "Parag Parikh Flexi Cap (Direct-G)", asset_class: "Mutual Funds", units: 1823.44, invested: 480000, current_value: 587300, pnl: 107300, pnl_pct: 22.35, xirr: 19.6, broker: "INDmoney" },
  { name: "HDFC Top 100 (Direct-G)", asset_class: "Mutual Funds", units: 976.2, invested: 310000, current_value: 354250, pnl: 44250, pnl_pct: 14.27, xirr: 16.9, broker: "INDmoney" },
  { name: "Nippon India Small Cap (Direct-G)", asset_class: "Mutual Funds", units: 642.88, invested: 200000, current_value: 244400, pnl: 44400, pnl_pct: 22.2, xirr: 21.3, broker: "INDmoney" },
  { name: "UTI Nifty 200 Momentum 30 Index", asset_class: "Mutual Funds", units: 154.11, invested: 250000, current_value: 200300, pnl: -49700, pnl_pct: -19.88, xirr: -8.4, broker: "INDmoney" },
  { name: "Apple Inc. (AAPL)", asset_class: "US Stocks", units: 2, invested: 166000, current_value: 207600, pnl: 41600, pnl_pct: 25.06, xirr: 24.1, broker: "INDmoney" },
  { name: "NVIDIA Corp. (NVDA)", asset_class: "US Stocks", units: 1.5, invested: 174000, current_value: 215550, pnl: 41550, pnl_pct: 23.88, xirr: 31.7, broker: "INDmoney" },
  { name: "Vanguard Total World (VT)", asset_class: "US Stocks", units: 0.9, invested: 70000, current_value: 84500, pnl: 14500, pnl_pct: 20.71, xirr: 13.2, broker: "INDmoney" },
  { name: "EPF - Employee Provident Fund", asset_class: "EPF", units: null, invested: 465000, current_value: 485000, pnl: 20000, pnl_pct: 4.3, xirr: 8.15, broker: null },
  { name: "NPS - Tier 1 (Aggressive LC:50)", asset_class: "NPS", units: null, invested: 200000, current_value: 215000, pnl: 15000, pnl_pct: 7.5, xirr: 9.8, broker: null },
  { name: "HDFC Bank FD (6.85%, matures Jun 2027)", asset_class: "Fixed Deposits", units: null, invested: 200000, current_value: 205000, pnl: 5000, pnl_pct: 2.5, xirr: 6.85, broker: "Bank" },
  { name: "ICICI Bank FD (7.1%, matures Dec 2026)", asset_class: "Fixed Deposits", units: null, invested: 90000, current_value: 95000, pnl: 5000, pnl_pct: 5.56, xirr: 7.1, broker: "Bank" },
  { name: "Savings Account (HDFC)", asset_class: "Savings & Liquid", units: null, invested: 102000, current_value: 102000, pnl: 0, pnl_pct: 0, xirr: 3.5, broker: "Bank" },
  { name: "Liquid Fund - Parking", asset_class: "Savings & Liquid", units: 500, invested: 50000, current_value: 50000, pnl: 0, pnl_pct: 0, xirr: 6.9, broker: "INDmoney" },
  { name: "Digital Gold", asset_class: "Gold", units: 8.4, invested: 72000, current_value: 84000, pnl: 12000, pnl_pct: 16.67, xirr: 15.2, broker: "INDmoney" },
  { name: "SGB 2025-26 Series", asset_class: "Gold", units: 3.1, invested: 91000, current_value: 101000, pnl: 10000, pnl_pct: 10.99, xirr: 8.4, broker: "INDmoney" },
  { name: "Home Loan (HDFC)", asset_class: "Loan", units: null, invested: -650000, current_value: -650000, pnl: 0, pnl_pct: 0, xirr: 8.4, broker: "Bank" },
  { name: "Credit Card - Outstanding", asset_class: "Credit Card", units: null, invested: -42000, current_value: -42000, pnl: 0, pnl_pct: 0, xirr: 42, broker: "ICICI Bank" },
];

const MOCK_HISTORY: NetWorthHistoryPoint[] = [
  { month: "Sep", value: 2921400 },
  { month: "Oct", value: 2983200 },
  { month: "Nov", value: 2956700 },
  { month: "Dec", value: 3048300 },
  { month: "Jan", value: 3112200 },
  { month: "Feb", value: 3085400 },
  { month: "Mar", value: 3198600 },
  { month: "Apr", value: 3254100 },
  { month: "May", value: 3317800 },
  { month: "Jun", value: 3389200 },
  { month: "Jul", value: 3425600 },
  { month: "Aug", value: 3487800 },
];

const MOCK_DELAY_MS = 450;

function simulate<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY_MS));
}

export function GetNetWorthSnapshot(): Promise<NetWorthSnapshot> {
  return simulate(MOCK_SNAPSHOT);
}

export function GetNetWorthHoldings(): Promise<NetWorthHolding[]> {
  return simulate(MOCK_HOLDINGS);
}

export function GetNetWorthHistory(): Promise<NetWorthHistoryPoint[]> {
  return simulate(MOCK_HISTORY);
}

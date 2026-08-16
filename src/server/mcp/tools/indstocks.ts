/** MCP tool for INDstocks read-only portfolio data (realized P&L). */

import { z } from "zod";
import type { Container } from "../../di/container";
import { callUseCase } from "./envelope";
import { fetchIndStocksSnapshot } from "../../indstocks";
import type { ToolDefinition } from "../types";

export function makeIndStocksTools(container: Container): ToolDefinition[] {
  return [
    {
      name: "indstocks_positions",
      title: "Read INDmoney broking positions (realized P&L)",
      description:
        "Read-only fetch from the INDstocks trading API (Indian equities only): holdings with average price, open positions with realized_profit per position, total realized P&L, and available funds. Requires INDSTOCKS_API_TOKEN to be configured server-side. Does NOT place or modify orders. US stocks / mutual funds are NOT covered — use networth_status for those.",
      inputSchema: {},
      async handler() {
        return callUseCase(() => fetchIndStocksSnapshot(container.env.INDSTOCKS_API_TOKEN || ""));
      },
    },
  ];
}

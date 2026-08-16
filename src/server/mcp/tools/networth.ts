/** MCP tools for net worth (doc §8.5). */

import { z } from "zod";
import type { Container } from "../../di/container";
import { callUseCase, fail, requireFields } from "./envelope";
import type { ToolDefinition } from "../types";

export function makeNetWorthTools(container: Container): ToolDefinition[] {
  const { app } = container;

  return [
    {
      name: "networth_status",
      title: "Get net worth status",
      description:
        "Returns the current user's net worth connection status: latest snapshot, holdings, analysis, SIP commitments and a daily history chart — plus a summary of total_invested (deposited), total_value, net_worth, unrealized_pnl (+pct) and sip_committed_monthly. Realized gains are not exposed by the provider. Read-only.",
      inputSchema: {},
      async handler(ctx) {
        return callUseCase(async () => {
          const status: any = await app.GetNetWorthStatus({ user_id: ctx.user_id });
          const holdings: any[] = status.holdings ?? [];
          const snapshot: any = status.snapshot ?? null;
          const sips: any[] = status.sips ?? [];

          const total_invested = holdings.reduce((s, h) => s + (h.invested || 0), 0);
          const total_value = holdings.reduce((s, h) => s + (h.current_value || 0), 0);
          const unrealized_pnl = holdings.reduce((s, h) => s + (h.pnl || 0), 0);
          const unrealized_pct = total_invested > 0 ? (unrealized_pnl / total_invested) * 100 : 0;
          const sip_committed_monthly = sips
            .filter((s) => !s.frequency || /month/i.test(String(s.frequency)))
            .reduce((sum, s) => sum + (s.amount || 0), 0);
          const savings_balance = holdings
            .filter((h) => /saving/i.test(String(h.asset_class)))
            .reduce((s, h) => s + (h.current_value || 0), 0);

          const per_asset: Record<string, { value: number; invested: number; pnl: number; pnl_pct: number }> = {};
          for (const h of holdings) {
            const key = String(h.asset_class || "Other");
            per_asset[key] = per_asset[key] || { value: 0, invested: 0, pnl: 0, pnl_pct: 0 };
            per_asset[key].value += h.current_value || 0;
            per_asset[key].invested += h.invested || 0;
            per_asset[key].pnl += h.pnl || 0;
          }
          for (const key of Object.keys(per_asset)) {
            per_asset[key].pnl_pct =
              per_asset[key].invested > 0 ? (per_asset[key].pnl / per_asset[key].invested) * 100 : 0;
          }

          return {
            ...status,
            summary: {
              total_invested,
              total_value,
              net_worth: Number(snapshot?.total_net_worth ?? total_value),
              unrealized_pnl,
              unrealized_pct,
              realized_pnl: null, // not exposed by the provider
              sip_committed_monthly,
              savings_balance,
              per_asset,
            },
          };
        });
      },
    },
    {
      name: "networth_sync",
      title: "Sync net worth from the provider",
      description:
        "Pulls a fresh net worth snapshot from the linked provider and stores it for the current user. Fails if the user has not connected the provider yet (see networth_connect_url).",
      inputSchema: {},
      async handler(ctx) {
        return callUseCase(() => app.SyncNetWorth({ user_id: ctx.user_id }));
      },
    },
    {
      name: "networth_connect_url",
      title: "Get the net worth connection URL",
      description:
        "Creates an OAuth connection for the current user and returns the provider authorization URL. The user completes the flow in a browser; redirect_url is where the provider sends them back.",
      inputSchema: { redirect_url: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["redirect_url"]);
        if (missing) return missing;
        return callUseCase(() =>
          app.ConnectNetWorth({ user_id: ctx.user_id, redirect_url: args.redirect_url })
        );
      },
    },
  ];
}

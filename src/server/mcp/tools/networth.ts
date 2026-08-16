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
        "Returns the current user's net worth connection status: whether the provider is linked, the latest snapshot, holdings, analysis and a daily history chart. Read-only.",
      inputSchema: {},
      async handler(ctx) {
        return callUseCase(() => app.GetNetWorthStatus({ user_id: ctx.user_id }));
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

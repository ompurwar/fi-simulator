/**
 * IndMoney net worth provider — implements the NetWorthProvider port by
 * talking to the official IndMoney MCP server (https://mcp.indmoney.com/mcp)
 * over streamable HTTP, using the MCP TypeScript SDK as the client.
 *
 * Auth is OAuth 2.1 + PKCE handled entirely by the MCP SDK via
 * IndMoneyOAuthClientProvider: the user signs in on indmoney.com's own page,
 * approves the consent screen, and we receive a short-lived read-only token.
 */

import {
  Client as McpClient,
  type ClientOptions,
} from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { InvalidOperationError, InvalidPropertyError, StandardHttpError } from "../../domain/errors";
import type { NetWorthProvider, ProviderAuthorization } from "../provider";
import type { NetWorthAnalysisItem, NetWorthHolding, ProviderSnapshotPayload } from "../types";
import type { NetWorthRepository } from "../repository";
import { IndMoneyOAuthClientProvider } from "./oauthProvider";
import {
  ASSET_TYPE_LABELS,
  normalizeHoldings,
  normalizeSips,
  normalizeSnapshot,
  normalizeUsAnalysis,
} from "./normalize";

const MCP_TOOL_SNAPSHOT = "networth_snapshot";
const MCP_TOOL_HOLDINGS = "networth_holdings";

/** snapshot asset_type codes → networth_holdings enum values */
const HOLDINGS_ASSET_MAP: Record<string, string> = {
  MF: "MF",
  US_STOCK: "US_STOCK",
  STOCK: "IND_STOCK",
  SA: "SA",
  PPF: "PPF",
  EPF: "EPF",
  CRYPTO: "CRYPTO",
  BOND: "BOND",
  NPS: "NPS",
  FD: "FD",
  RD: "RD",
  RE: "RE",
  AIF: "AIF",
  PMS: "PMS",
  INSURANCE: "INSURANCE",
  VEHICLE: "VEHICLE",
};

const CLIENT_OPTIONS: ClientOptions = {
  capabilities: {},
};

function extractToolText(result: any): string | null {
  const content = result?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item?.type === "text" && typeof item.text === "string") return item.text;
    }
  }
  if (result?.structuredContent && typeof result.structuredContent === "object") {
    return JSON.stringify(result.structuredContent);
  }
  return null;
}

function parseToolJson(result: any): any {
  const text = extractToolText(result);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function makeIndMoneyNetWorthProvider(deps: {
  repo: NetWorthRepository;
  mcpUrl: string;
}): NetWorthProvider {
  const { repo, mcpUrl } = deps;

  function makeTransport(user_id: string, redirect_url: string, state: string) {
    const authProvider = new IndMoneyOAuthClientProvider(repo, {
      user_id,
      redirect_url,
      state,
    });
    return new StreamableHTTPClientTransport(new URL(mcpUrl), { authProvider });
  }

  return {
    name: "indmoney",

    async buildAuthorizationUrl(input: {
      user_id: string;
      redirect_url: string;
      state: string;
    }): Promise<ProviderAuthorization> {
      const { user_id, redirect_url, state } = input;

      // Link doc is pre-created by the service (upsert) and the OAuth state doc
      // is saved by the service too — here the SDK's saveTokens/verifier calls
      // land into those docs via UpdateLink/UpdateOAuthState.
      const transport = makeTransport(user_id, redirect_url, state);
      const client = new McpClient({ name: "fi-plan-networth", version: "0.1.0" }, CLIENT_OPTIONS);
      try {
        await client.connect(transport);
        // Connect may succeed unauthenticated; force the handshake with a probe.
        await client.callTool({ name: MCP_TOOL_HOLDINGS, arguments: {} });
      } catch (e) {
        if (!(e instanceof UnauthorizedError)) {
          throw e;
        }
      } finally {
        await transport.close();
      }

      const stateDoc = await repo.GetOAuthState(state);
      if (!stateDoc?.authorization_url) {
        await repo.DeleteOAuthState(state);
        throw new StandardHttpError("indmoney authorization could not be started", 500);
      }
      return { state, url: stateDoc.authorization_url };
    },

    async finishAuthorization(input: { state: string; code: string }): Promise<void> {
      const { state, code } = input;
      const stateDoc = await repo.GetOAuthState(state);
      if (!stateDoc) throw new InvalidPropertyError("invalid oauth state");

      // link status/state-doc cleanup is owned by the service
      const transport = makeTransport(
        stateDoc.user_id,
        stateDoc.redirect_url || "",
        state
      );
      try {
        await transport.finishAuth(code);
      } finally {
        await transport.close();
      }
    },

    async fetchSnapshot(input: { user_id: string }): Promise<ProviderSnapshotPayload> {
      const { user_id } = input;
      const link = await repo.GetLink(user_id, "indmoney");
      if (!link?.tokens) {
        throw new InvalidOperationError("indmoney not connected");
      }

      const transport = makeTransport(user_id, "", "");
      const client = new McpClient({ name: "fi-plan-networth", version: "0.1.0" }, CLIENT_OPTIONS);
      try {
        await client.connect(transport);

        // introspect once per sync so schema drift is visible in the raw payload
        let tool_manifest: any[] = [];
        try {
          const tools = await client.listTools();
          tool_manifest = (tools.tools || []).map((t: any) => ({
            name: t.name,
            inputSchema: t.inputSchema,
          }));
        } catch {
          /* listing tools is best-effort */
        }

        const [snapshotRes] = await Promise.all([
          client.callTool({ name: MCP_TOOL_SNAPSHOT, arguments: {} }),
        ]);

        const raw_snapshot_text = extractToolText(snapshotRes);
        const raw_snapshot = parseToolJson(snapshotRes);
        if (!raw_snapshot) {
          throw new StandardHttpError("indmoney returned an unreadable snapshot", 500);
        }

        // networth_holdings is per asset type — call it once per type present
        // in the snapshot, merging the rows.
        const snapshot_asset_types: string[] = Array.isArray(raw_snapshot?.investments)
          ? raw_snapshot.investments
              .map((i: any) => HOLDINGS_ASSET_MAP[i?.asset_type])
              .filter((t: string | undefined): t is string => Boolean(t))
          : [];

        const holdings: NetWorthHolding[] = [];
        const us_holdings: NetWorthHolding[] = [];
        const holdings_raw: Record<string, any> = {};
        const holdings_results = await Promise.allSettled(
          [...new Set(snapshot_asset_types)].map(async (asset_type) => {
            const res = await client.callTool({
              name: MCP_TOOL_HOLDINGS,
              arguments: { asset_type },
            });
            const raw = parseToolJson(res);
            holdings_raw[asset_type] = raw;
            const rows = normalizeHoldings(raw ?? []);
            // rows that don't carry their own asset_class inherit the one requested
            const labeled = rows.map((h) =>
              h.asset_class === "Other"
                ? { ...h, asset_class: ASSET_TYPE_LABELS[asset_type] || asset_type }
                : h
            );
            if (asset_type === "US_STOCK") us_holdings.push(...labeled);
            return labeled;
          })
        );
        for (const result of holdings_results) {
          if (result.status === "fulfilled") holdings.push(...result.value);
          else holdings_raw[result.reason?.message ?? "error"] = String(result.reason);
        }

        // US stocks analysis — live price + analyst consensus + news, best-effort
        const analysis_raw: Record<string, any> = {};
        let analysis: NetWorthAnalysisItem[] = [];
        if (us_holdings.length > 0) {
          try {
            const names = [...new Set(us_holdings.map((h) => h.name).filter(Boolean))].slice(0, 10);
            let symbols: string[] = names;
            try {
              const lookupRes = await client.callTool({
                name: "lookup_ind_keys",
                arguments: { names, filter_type: "US_STOCKS" },
              });
              const lookup = parseToolJson(lookupRes);
              analysis_raw.lookup = lookup;
              // tolerate array-of-{name,ind_key} / map / nested shapes
              const keyed = Array.isArray(lookup)
                ? lookup.map((r: any) => ({ name: r?.name || r?.instrument || r?.security_name, ind_key: r?.ind_key || r?.indKey || r?.key }))
                : typeof lookup === "object" && lookup
                  ? Object.entries(lookup).map(([k, v]: [string, any]) => ({ name: k, ind_key: typeof v === "string" ? v : v?.ind_key || v?.indKey }))
                  : [];
              const found = keyed.filter((r) => r.ind_key);
              if (found.length > 0) symbols = found.map((r) => r.ind_key);
            } catch {
              /* fall back to names */
            }
            const detailsRes = await client.callTool({
              name: "get_us_stocks_details",
              arguments: { symbols, segments: ["analyst", "news"] },
            });
            const details = parseToolJson(detailsRes);
            analysis_raw.details = details;
            analysis = normalizeUsAnalysis(details ?? []);
          } catch {
            /* analysis is best-effort — never fail the sync */
          }
        }

        // Recurring investment commitments — what gets deposited each month
        // (best-effort; missing tools/rows are fine).
        let sips: any[] = [];
        const sips_raw: Record<string, any> = {};
        try {
          const [mf, stock] = await Promise.allSettled([
            client.callTool({ name: "mf_sips", arguments: {} }),
            client.callTool({ name: "indian_stocks_sips", arguments: {} }),
          ]);
          if (mf.status === "fulfilled") {
            const raw = parseToolJson(mf.value);
            sips_raw.mf = raw;
            sips.push(...normalizeSips(raw, "Mutual Fund"));
          }
          if (stock.status === "fulfilled") {
            const raw = parseToolJson(stock.value);
            sips_raw.stocks = raw;
            sips.push(...normalizeSips(raw, "Indian Stocks"));
          }
        } catch {
          /* sips are best-effort — never fail the sync */
        }

        const snapshot = normalizeSnapshot(raw_snapshot);

        return {
          snapshot,
          holdings,
          analysis,
          sips,
          raw: JSON.stringify({
            raw_snapshot,
            raw_holdings: holdings_raw,
            raw_sips: sips_raw,
            analysis_raw,
            raw_snapshot_text,
            tool_manifest,
          }),
        } as ProviderSnapshotPayload;
      } catch (e) {
        if (e instanceof UnauthorizedError) {
          throw new InvalidOperationError("indmoney session expired, please reconnect");
        }
        throw e;
      } finally {
        await transport.close();
      }
    },

    async disconnect(input: { user_id: string }): Promise<void> {
      // token revocation is not exposed by the MCP server; the service
      // soft-deletes the local link + tokens via DeleteLink
    },
  };
}

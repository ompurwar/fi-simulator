/**
 * Net worth service — orchestrates provider connections and snapshot syncs.
 *
 * Depends only on the NetWorthProvider port and the NetWorthRepository, so
 * the service (and everything above it) is provider-agnostic.
 */

import { InvalidOperationError, InvalidPropertyError } from "../domain/errors";
import { GenerateRandomString } from "../domain/entities";
import type { NetWorthProvider } from "./provider";
import type { NetWorthRepository } from "./repository";
import type { NetWorthHistoryPoint, ProviderSnapshotPayload } from "./types";

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

export interface NetWorthStatus {
  connected: boolean;
  provider: string | null;
  last_sync_at: number | null;
  snapshot: Record<string, any> | null;
  holdings: any[];
  analysis: any[];
  history: NetWorthHistoryPoint[];
  /** Portfolio-level approximate annualized return since the first sync.
   *  null when there isn't enough history (or no invested base). */
  approx_annualized_return: number | null;
}

export interface NetWorthService {
  GetStatus(input: { user_id: string }): Promise<NetWorthStatus>;
  Connect(input: { user_id: string; redirect_url: string }): Promise<{ state: string; url: string }>;
  HandleCallback(input: { state: string; code: string }): Promise<{ connected: boolean }>;
  Sync(input: { user_id: string }): Promise<ProviderSnapshotPayload>;
  Disconnect(input: { user_id: string }): Promise<{ disconnected: boolean }>;
}

function ToMonthLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "?";
  return d.toLocaleDateString("en-IN", { month: "short" });
}

export function makeNetWorthService(deps: {
  repo: NetWorthRepository;
  provider: NetWorthProvider;
}): NetWorthService {
  const { repo, provider } = deps;

  return {
    async GetStatus({ user_id }) {
      const link = await repo.GetLink(user_id, provider.name);
      if (!link?.connected_at) {
        return {
          connected: false,
          provider: null,
          last_sync_at: null,
          snapshot: null,
          holdings: [],
          analysis: [],
          history: [],
          approx_annualized_return: null,
        };
      }
      const latest = await repo.GetLatestSnapshot(user_id, provider.name);
      const snapshots = await repo.GetSnapshots(user_id, provider.name, 400);

      // Approx annualized return: earliest recorded invested base vs the latest
      // total net worth, annualized over the elapsed window. It is a blended
      // figure (invested changes with SIPs) — labeled as such, never a per-holding
      // XIRR/CAGR.
      let approx_annualized_return: number | null = null;
      {
        const earliest = snapshots[snapshots.length - 1];
        if (latest && earliest && earliest !== latest) {
          const start_ts =
            new Date(earliest.as_of || new Date(earliest.timestamp).toISOString()).getTime();
          const end_ts =
            new Date(latest.as_of || new Date(latest.timestamp).toISOString()).getTime();
          const years = (end_ts - start_ts) / (365.25 * 24 * 3600 * 1000);
          const base_invested = Number(earliest.snapshot?.invested ?? 0);
          const end_value = Number(latest.snapshot?.total_net_worth ?? 0);
          if (years > 0.25 && base_invested > 0 && end_value > 0) {
            approx_annualized_return = Math.pow(end_value / base_invested, 1 / years) - 1;
          }
        }
      }
      // one point per day (keeps the chart meaningful when syncing multiple
      // times per day), newest first, capped to the last 12 points
      const seen_days = new Set<string>();
      const history: NetWorthHistoryPoint[] = [];
      for (const s of snapshots) {
        const day = new Date(s.as_of || new Date(s.timestamp).toISOString())
          .toISOString()
          .slice(0, 10);
        if (seen_days.has(day)) continue;
        seen_days.add(day);
        history.push({
          month: ToMonthLabel(s.as_of || new Date(s.timestamp).toISOString()),
          value: Number(s.snapshot?.total_net_worth ?? 0),
        });
        if (history.length >= 12) break;
      }
      return {
        connected: true,
        provider: link.provider,
        last_sync_at: link.last_sync_at,
        snapshot: latest?.snapshot ?? null,
        holdings: latest?.holdings ?? [],
        analysis: latest?.analysis ?? [],
        history,
        approx_annualized_return,
        // raw provider payload — kept for schema debugging until the MCP
        // shapes are confirmed stable
        debug_raw: latest?.raw ?? null,
      };
    },

    async Connect({ user_id, redirect_url }) {
      // pre-create the link (upsert) so the provider's token storage has a home
      await repo.AddLink({ user_id, provider: provider.name, connected_at: null });

      // the service owns the CSRF state + its TTL; the provider only uses it
      const state = GenerateRandomString(16);
      await repo.SaveOAuthState({
        state,
        user_id,
        provider: provider.name,
        redirect_url,
        expires_at: Date.now() + OAUTH_STATE_TTL_MS,
      });

      return provider.buildAuthorizationUrl({ user_id, redirect_url, state });
    },

    async HandleCallback({ state, code }) {
      // the state doc is the only trusted link between our app session and the
      // provider's authorization, so the service owns its validation + cleanup
      const stateDoc = await repo.GetOAuthState(state);
      if (!stateDoc) throw new InvalidPropertyError("invalid oauth state");
      if (stateDoc.expires_at < Date.now()) {
        await repo.DeleteOAuthState(state);
        throw new InvalidOperationError("oauth state expired, try connecting again");
      }
      await provider.finishAuthorization({ state, code });
      await repo.UpdateLink(stateDoc.user_id, { connected_at: Date.now() });
      await repo.DeleteOAuthState(state);
      return { connected: true };
    },

    async Sync({ user_id }) {
      const link = await repo.GetLink(user_id, provider.name);
      if (!link?.connected_at) {
        throw new InvalidOperationError("indmoney not connected");
      }
      const payload = await provider.fetchSnapshot({ user_id });
      await repo.AddSnapshot({
        user_id,
        provider: provider.name,
        as_of: payload.snapshot.as_of,
        snapshot: payload.snapshot,
        holdings: payload.holdings,
        analysis: payload.analysis ?? [],
        raw: payload.raw ?? null,
      });
      await repo.UpdateLink(user_id, { last_sync_at: Date.now() });
      return payload;
    },

    async Disconnect({ user_id }) {
      // provider gets a chance to revoke external credentials; the service
      // owns the local link lifecycle
      await provider.disconnect({ user_id });
      await repo.DeleteLink(user_id, provider.name);
      return { disconnected: true };
    },
  };
}

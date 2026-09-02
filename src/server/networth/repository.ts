/**
 * Mongo persistence for net worth provider state.
 *
 * Collections:
 *  - NetWorth_Link_Store   — one doc per user per provider (OAuth tokens, link status)
 *  - NetWorth_Snapshot_Store — one doc per sync (snapshot + holdings history)
 *  - NetWorth_OAuth_State  — in-flight PKCE authorization state (state -> code_verifier)
 */

import type { Database } from "../domain/ports";
import { GenerateRandomString } from "../domain/entities";
import type { DocCryptoCodec } from "../infrastructure/docCrypto";

const linkCollection = "NetWorth_Link_Store";
const snapshotCollection = "NetWorth_Snapshot_Store";
const oauthStateCollection = "NetWorth_OAuth_State";

/** Link allowlist — timestamps stay queryable; tokens/client_info are encrypted. */
const linkAllow = ["_id", "user_id", "provider", "status", "connected_at", "last_sync_at", "timestamp"];
/** Snapshot allowlist — timestamp drives sort-order; all market data encrypted. */
const snapshotAllow = ["_id", "user_id", "provider", "timestamp"];

export interface NetWorthLink {
  _id: string;
  user_id: string;
  provider: string;
  status: "active" | "deleted";
  tokens: Record<string, any> | null;
  client_info: Record<string, any> | null;
  connected_at: number | null;
  last_sync_at: number | null;
  timestamp: number;
}

export interface NetWorthSnapshotDoc {
  _id: string;
  user_id: string;
  provider: string;
  as_of: string;
  snapshot: Record<string, any>;
  holdings: any[];
  analysis: any[];
  sips?: any[];
  raw: string | null;
  timestamp: number;
}

export interface NetWorthOAuthState {
  _id: string;
  state: string;
  user_id: string;
  provider: string;
  code_verifier: string | null;
  authorization_url: string | null;
  redirect_url: string | null;
  created_at: number;
  expires_at: number;
}

export interface NetWorthRepository {
  AddLink(info: Record<string, any>): Promise<{ success: boolean; created: NetWorthLink }>;
  GetLink(user_id: string, provider?: string): Promise<NetWorthLink | null>;
  UpdateLink(
    user_id: string,
    update: Record<string, any>
  ): Promise<{ success: boolean }>;
  DeleteLink(user_id: string, provider?: string): Promise<{ success: boolean }>;
  AddSnapshot(info: Record<string, any>): Promise<{ success: boolean; created: NetWorthSnapshotDoc }>;
  GetLatestSnapshot(user_id: string, provider?: string): Promise<NetWorthSnapshotDoc | null>;
  GetSnapshots(user_id: string, provider?: string, limit?: number): Promise<NetWorthSnapshotDoc[]>;
  SaveOAuthState(info: Record<string, any>): Promise<{ success: boolean; created: NetWorthOAuthState }>;
  GetOAuthState(state: string): Promise<NetWorthOAuthState | null>;
  UpdateOAuthState(state: string, update: Record<string, any>): Promise<{ success: boolean }>;
  DeleteOAuthState(state: string): Promise<{ success: boolean }>;
}

export function makeNetWorthRepository(
  database: Database,
  codec: DocCryptoCodec
): NetWorthRepository {
  const MakeId = database.MakeId.bind(database);
  const Now = database.MakeDate.bind(database);

  async function AddLink(info: Record<string, any>) {
    const _id = GenerateRandomString(12);
    const fields: Record<string, any> = {
      user_id: MakeId(info.user_id),
      provider: info.provider,
      status: "active",
      tokens: info.tokens ?? null,
      client_info: info.client_info ?? null,
      connected_at: info.connected_at ?? null,
      last_sync_at: info.last_sync_at ?? null,
      timestamp: Now(),
    };
    const stored = await codec.encryptDoc(fields, linkAllow);
    // one active link per user+provider — upsert so re-connects don't duplicate;
    // _id must live in $setOnInsert (updating it on an existing doc is illegal)
    await database
      .collection(linkCollection)
      .updateOne(
        { user_id: fields.user_id, provider: fields.provider, status: "active" },
        { $set: stored, $setOnInsert: { _id } },
        { upsert: true }
      );
    return { success: true, created: { _id, ...fields, user_id: info.user_id } as NetWorthLink };
  }

  async function GetLink(user_id: string, provider?: string): Promise<NetWorthLink | null> {
    const query: Record<string, any> = { user_id: MakeId(user_id), status: "active" };
    if (provider) query.provider = provider;
    const raw = await database.collection(linkCollection).findOne(query);
    if (!raw) return null;
    const doc: any = await codec.decryptDoc(raw, linkAllow);
    return { ...doc, _id: doc._id.toString(), user_id: doc.user_id.toString() };
  }

  async function UpdateLink(user_id: string, update: Record<string, any>) {
    const query: Record<string, any> = { user_id: MakeId(user_id), status: "active" };
    const raw = await database.collection(linkCollection).findOne(query);
    if (!raw) return { success: true };
    const current: any = await codec.decryptDoc(raw, linkAllow);
    const merged: Record<string, any> = { ...current, ...update, updated_at: Now() };
    const stored = await codec.encryptDoc(merged, linkAllow);
    // replaceOne (not $set) so any legacy plaintext top-level fields are dropped
    await database.collection(linkCollection).replaceOne(query, stored);
    return { success: true };
  }

  async function DeleteLink(user_id: string, provider?: string) {
    const query: Record<string, any> = { user_id: MakeId(user_id), status: "active" };
    if (provider) query.provider = provider;
    await database
      .collection(linkCollection)
      .updateOne(query, { $set: { status: "deleted", updated_at: Now() } });
    return { success: true };
  }

  async function AddSnapshot(info: Record<string, any>) {
    const _id = GenerateRandomString(12);
    const doc = {
      _id,
      user_id: MakeId(info.user_id),
      provider: info.provider,
      as_of: info.as_of,
      snapshot: info.snapshot ?? {},
      holdings: info.holdings ?? [],
      analysis: info.analysis ?? [],
      sips: info.sips ?? [],
      raw: info.raw ?? null,
      timestamp: Now(),
    };
    const stored = await codec.encryptDoc(doc, snapshotAllow);
    await database.collection(snapshotCollection).insertOne(stored);
    return { success: true, created: { ...doc, _id, user_id: info.user_id } };
  }

  async function GetLatestSnapshot(user_id: string, provider?: string) {
    const query: Record<string, any> = { user_id: MakeId(user_id) };
    if (provider) query.provider = provider;
    const raw = await database
      .collection(snapshotCollection)
      .find(query)
      .sort({ timestamp: -1 })
      .limit(1)
      .next();
    if (!raw) return null;
    const doc: any = await codec.decryptDoc(raw, snapshotAllow);
    return { ...doc, _id: doc._id.toString(), user_id: doc.user_id.toString() };
  }

  async function GetSnapshots(user_id: string, provider?: string, limit = 12) {
    const query: Record<string, any> = { user_id: MakeId(user_id) };
    if (provider) query.provider = provider;
    const raws = await database
      .collection(snapshotCollection)
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    const docs = await Promise.all(
      raws.map(async (raw: any) => {
        const doc: any = await codec.decryptDoc(raw, snapshotAllow);
        return { ...doc, _id: doc._id.toString(), user_id: doc.user_id.toString() };
      })
    );
    return docs;
  }

  async function SaveOAuthState(info: Record<string, any>) {
    const doc = {
      _id: GenerateRandomString(12),
      state: info.state,
      user_id: MakeId(info.user_id),
      provider: info.provider,
      code_verifier: info.code_verifier ?? null,
      authorization_url: info.authorization_url ?? null,
      redirect_url: info.redirect_url ?? null,
      created_at: Now(),
      expires_at: info.expires_at,
    };
    await database.collection(oauthStateCollection).insertOne(doc);
    return { success: true, created: { ...doc, _id: doc._id, user_id: info.user_id } };
  }

  async function GetOAuthState(state: string): Promise<NetWorthOAuthState | null> {
    const doc = await database.collection(oauthStateCollection).findOne({ state });
    if (!doc) return null;
    return { ...doc, _id: doc._id.toString(), user_id: doc.user_id.toString() };
  }

  async function UpdateOAuthState(state: string, update: Record<string, any>) {
    await database
      .collection(oauthStateCollection)
      .updateOne({ state }, { $set: update });
    return { success: true };
  }

  async function DeleteOAuthState(state: string) {
    await database.collection(oauthStateCollection).deleteOne({ state });
    return { success: true };
  }

  return {
    AddLink,
    GetLink,
    UpdateLink,
    DeleteLink,
    AddSnapshot,
    GetLatestSnapshot,
    GetSnapshots,
    SaveOAuthState,
    GetOAuthState,
    UpdateOAuthState,
    DeleteOAuthState,
  };
}

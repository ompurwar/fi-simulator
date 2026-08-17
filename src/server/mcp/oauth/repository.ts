/** OAuth store — single Mongo collection (OAuth_Store) with a `type` discriminator. */

import type { Database } from "../../domain/ports";
import type { OAuthAuthRequest, OAuthClient, OAuthCode, OAuthTokenRecord } from "./types";

const oauthCollection = "OAuth_Store";

export interface OAuthStore {
  AddClient(client: OAuthClient): Promise<OAuthClient>;
  FindClientByClientId(client_id: string): Promise<OAuthClient | null>;
  AddAuthRequest(req: OAuthAuthRequest): Promise<void>;
  FindAuthRequest(oauth_id: string): Promise<OAuthAuthRequest | null>;
  DeleteAuthRequest(oauth_id: string): Promise<void>;
  AddCode(code: OAuthCode): Promise<void>;
  FindCodeByHash(code_hash: string): Promise<OAuthCode | null>;
  DeleteCode(code_hash: string): Promise<void>;
  AddToken(rec: OAuthTokenRecord): Promise<void>;
  FindTokenByHash(kind: "access" | "refresh", token_hash: string): Promise<OAuthTokenRecord | null>;
  DeleteToken(token_hash: string): Promise<void>;
}

export function makeOAuthStore(database: Database): OAuthStore {
  const db = database;
  const col = db.collection(oauthCollection);

  function toClient(doc: Record<string, any>): OAuthClient {
    return {
      _id: doc._id.toString(),
      client_id: doc.client_id,
      client_name: doc.client_name,
      redirect_uris: doc.redirect_uris,
      token_endpoint_auth_method: "none",
      created_at: doc.created_at,
    };
  }

  function toAuthRequest(doc: Record<string, any>): OAuthAuthRequest {
    return {
      _id: doc._id.toString(),
      oauth_id: doc.oauth_id,
      client_id: doc.client_id,
      redirect_uri: doc.redirect_uri,
      code_challenge: doc.code_challenge,
      state: doc.state,
      created_at: doc.created_at,
      expires_at: doc.expires_at,
    };
  }

  function toCode(doc: Record<string, any>): OAuthCode {
    return {
      _id: doc._id.toString(),
      code_hash: doc.code_hash,
      user_id: doc.user_id.toString(),
      client_id: doc.client_id,
      redirect_uri: doc.redirect_uri,
      code_challenge: doc.code_challenge,
      created_at: doc.created_at,
      expires_at: doc.expires_at,
    };
  }

  function toToken(doc: Record<string, any>): OAuthTokenRecord {
    return {
      _id: doc._id.toString(),
      kind: doc.kind,
      token_hash: doc.token_hash,
      user_id: doc.user_id.toString(),
      client_id: doc.client_id,
      scopes: doc.scopes,
      created_at: doc.created_at,
      expires_at: doc.expires_at,
    };
  }

  return {
    async AddClient(client) {
      const doc: Record<string, any> = { ...client };
      delete doc._id;
      doc.type = "client";
      const { insertedId } = await col.insertOne(doc);
      return toClient({ ...doc, _id: insertedId.toString() });
    },
    async FindClientByClientId(client_id) {
      const found = await col.findOne({ type: "client", client_id });
      return found ? toClient(found) : null;
    },
    async AddAuthRequest(req) {
      const doc: Record<string, any> = { ...req };
      delete doc._id;
      doc.type = "auth_request";
      await col.insertOne(doc);
    },
    async FindAuthRequest(oauth_id) {
      const found = await col.findOne({ type: "auth_request", oauth_id });
      return found ? toAuthRequest(found) : null;
    },
    async DeleteAuthRequest(oauth_id) {
      await col.deleteOne({ type: "auth_request", oauth_id });
    },
    async AddCode(code) {
      const doc: Record<string, any> = { ...code };
      delete doc._id;
      doc.type = "code";
      doc.user_id = db.MakeId(doc.user_id);
      await col.insertOne(doc);
    },
    async FindCodeByHash(code_hash) {
      const found = await col.findOne({ type: "code", code_hash });
      return found ? toCode(found) : null;
    },
    async DeleteCode(code_hash) {
      await col.deleteOne({ type: "code", code_hash });
    },
    async AddToken(rec) {
      const doc: Record<string, any> = { ...rec };
      delete doc._id;
      doc.type = "token";
      doc.user_id = db.MakeId(doc.user_id);
      await col.insertOne(doc);
    },
    async FindTokenByHash(kind, token_hash) {
      const found = await col.findOne({ type: "token", kind, token_hash });
      return found ? toToken(found) : null;
    },
    async DeleteToken(token_hash) {
      await col.deleteOne({ type: "token", token_hash });
    },
  };
}

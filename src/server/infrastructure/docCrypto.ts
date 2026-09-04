/**
 * Document-level envelope encryption for user financial stores.
 *
 * A document is split into two parts:
 *  - allowlisted keys (lookup/index fields such as `_id`, `user_id`, `status`)
 *    stay in plaintext so every existing query keeps working unchanged;
 *  - everything else is serialized and AES-256-GCM encrypted, stored under the
 *    reserved `__enc` envelope.
 *
 * Two envelope versions:
 *  - v0 — payload encrypted with a local dev key (development/test only);
 *  - v1 — payload encrypted with a random per-doc data key (DEK) that is itself
 *    wrapped by an external KMS (`KmsAdapter`, e.g. GCP Cloud KMS).
 *
 * Legacy plaintext documents (no `__enc`) pass through untouched on read and
 * are converted on the next write — lazy migration.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { KmsAdapter } from "./kms";

export const ENC_KEY = "__enc";

interface Envelope {
  v: number;
  k?: string; // base64 wrapped DEK (v1 only)
  iv: string;
  ct: string;
  tag: string;
}

export interface DocCryptoCodec {
  /** Split + encrypt a plaintext document, keeping only `allow` keys readable. */
  encryptDoc(doc: Record<string, any>, allow: string[]): Promise<Record<string, any>>;
  /** Decrypt an envelope document back to plaintext. Legacy docs pass through. */
  decryptDoc(stored: Record<string, any>, allow: string[]): Promise<Record<string, any>>;
}

/** Convert BSON-ish values JSON cannot carry into plain representations. */
function toJsonSafe(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object") {
    // mongodb ObjectId
    if (value._bsontype === "ObjectId" && typeof value.toHexString === "function")
      return value.toHexString();
    if (value instanceof Date) return value.getTime();
    if (typeof value.toJSON === "function") return toJsonSafe(value.toJSON());
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

function isEnvelopeDoc(stored: Record<string, any>): boolean {
  return stored[ENC_KEY] && typeof stored[ENC_KEY] === "object";
}

function aesEncrypt(
  key: Buffer,
  plaintext: Buffer
): { iv: Buffer; ct: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ct, tag };
}

function aesDecrypt(key: Buffer, envelope: Envelope): Buffer {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  // Throws on tampered ciphertext or wrong key (fail closed).
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ct, "base64")),
    decipher.final(),
  ]);
}

function serializePayload(doc: Record<string, any>, allow: string[]): Buffer {
  const payload: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === ENC_KEY || allow.includes(k)) continue;
    payload[k] = toJsonSafe(v);
  }
  return Buffer.from(JSON.stringify(payload), "utf8");
}

export function makeDocCrypto(opts: {
  /** External KMS that wraps per-doc DEKs (envelope v1). */
  kms?: KmsAdapter | null;
  /** Local 32-byte key used directly when no KMS is configured (v0, dev/test). */
  localKey: Buffer;
  /** When false, writes stay plaintext (kill-switch). Reads are unaffected. */
  encryptWrites?: boolean;
}): DocCryptoCodec {
  const { kms, localKey, encryptWrites = true } = opts;

  /**
   * Unwrapped-DEK cache: the wrapped DEK blob (`envelope.k`) is stable per
   * document, so within a warm instance each doc hits KMS exactly once.
   * This is what keeps N-doc reads (list_plans, networth history, chat lists)
   * from turning into N KMS round-trips. FIFO-capped to bound memory.
   */
  const DEK_CACHE_MAX = 512;
  const dek_cache = new Map<string, Buffer>();
  async function UnwrappedDek(wrapped_b64: string): Promise<Buffer> {
    const hit = dek_cache.get(wrapped_b64);
    if (hit) return hit;
    if (!kms) throw new Error("encrypted doc v1 requires the KMS adapter");
    const dek = await kms.unwrapKey(Buffer.from(wrapped_b64, "base64"));
    if (dek_cache.size >= DEK_CACHE_MAX) {
      const oldest = dek_cache.keys().next().value;
      if (oldest !== undefined) dek_cache.delete(oldest);
    }
    dek_cache.set(wrapped_b64, dek);
    return dek;
  }

  async function encryptDoc(
    doc: Record<string, any>,
    allow: string[]
  ): Promise<Record<string, any>> {
    if (!encryptWrites) return { ...doc }; // kill-switch: plaintext write path

    const plaintext = serializePayload(doc, allow);
    const envelope: Envelope = { v: 0, iv: "", ct: "", tag: "" };

    if (kms) {
      const dek = randomBytes(32);
      const sealed = aesEncrypt(dek, plaintext);
      const wrapped = await kms.wrapKey(dek);
      envelope.v = 1;
      envelope.k = wrapped.toString("base64");
      envelope.iv = sealed.iv.toString("base64");
      envelope.ct = sealed.ct.toString("base64");
      envelope.tag = sealed.tag.toString("base64");
      const unwrapped = Buffer.from(dek);
      if (dek_cache.size >= DEK_CACHE_MAX) {
        const oldest = dek_cache.keys().next().value;
        if (oldest !== undefined) dek_cache.delete(oldest);
      }
      dek_cache.set(envelope.k, unwrapped);
    } else {
      const sealed = aesEncrypt(localKey, plaintext);
      envelope.iv = sealed.iv.toString("base64");
      envelope.ct = sealed.ct.toString("base64");
      envelope.tag = sealed.tag.toString("base64");
    }

    const stored: Record<string, any> = {};
    for (const k of allow) {
      if (doc[k] !== undefined) stored[k] = doc[k];
    }
    stored[ENC_KEY] = envelope;
    return stored;
  }

  async function decryptDoc(
    stored: Record<string, any>,
    allow: string[]
  ): Promise<Record<string, any>> {
    if (!isEnvelopeDoc(stored)) return stored; // legacy plaintext — lazy migration

    const envelope = stored[ENC_KEY] as Envelope;
    let key: Buffer;
    if (envelope.v === 0) {
      if (kms) throw new Error("encrypted doc v0 found while a KMS is configured");
      key = localKey;
    } else if (envelope.v === 1) {
      if (!kms || !envelope.k)
        throw new Error("encrypted doc v1 requires the KMS adapter (v1.k missing)");
      key = await UnwrappedDek(envelope.k);
    } else {
      throw new Error(`unknown __enc version: ${envelope.v}`);
    }

    let payload: Record<string, any>;
    try {
      const json = aesDecrypt(key, envelope).toString("utf8");
      payload = JSON.parse(json);
    } catch (err: any) {
      throw new Error(`failed to decrypt document: ${err.message}`, { cause: err });
    }

    for (const k of allow) {
      if (stored[k] !== undefined) payload[k] = stored[k];
    }
    return payload;
  }

  return { encryptDoc, decryptDoc };
}

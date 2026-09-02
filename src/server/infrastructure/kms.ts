/**
 * KMS adapter for envelope encryption. The app never holds a master key: each
 * document's data key (DEK) is wrapped via GCP Cloud KMS `encrypt`/`decrypt`
 * over REST, authenticated with a service-account JWT (signed with `jose`).
 * `KmsAdapter` is the seam other providers (Vault, AWS KMS) can implement.
 */
import { SignJWT, importPKCS8 } from "jose";
import type { Env } from "../config/env";

export interface KmsAdapter {
  /** Encrypt (wrap) a raw DEK with the KMS master key. */
  wrapKey(dek: Buffer): Promise<Buffer>;
  /** Decrypt (unwrap) a DEK previously wrapped by `wrapKey`. */
  unwrapKey(blob: Buffer): Promise<Buffer>;
}

const KMS_SCOPE = "https://www.googleapis.com/auth/cloudkms";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

function parseServiceAccount(raw: string): ServiceAccount {
  const parsed: Record<string, unknown> = JSON.parse(raw);
  const { client_email, private_key, token_uri } = parsed as Record<string, string>;
  if (
    typeof client_email !== "string" ||
    client_email.length === 0 ||
    typeof private_key !== "string" ||
    private_key.length === 0 ||
    typeof token_uri !== "string" ||
    token_uri.length === 0
  ) {
    throw new Error("GCP_KMS_SA_KEY must be a service-account JSON key");
  }
  return { client_email, private_key, token_uri };
}

/** Loose 1-hour OAuth access token fetch for a service account (RS256 JWT assertion). */
function makeTokenFetcher(account: ServiceAccount) {
  let cachedToken: { token: string; expires_at: number } | null = null;
  let keyPromise: ReturnType<typeof importPKCS8> | null = null;

  async function getKey() {
    if (!keyPromise) keyPromise = importPKCS8(account.private_key, "RS256");
    return keyPromise;
  }

  async function fetchAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedToken.expires_at > now + 60) return cachedToken.token;

    const assertion = await new SignJWT({ scope: KMS_SCOPE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(account.client_email)
      .setSubject(account.client_email)
      .setAudience(account.token_uri)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(await getKey());

    const res = await fetch(account.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) {
      throw new Error(`KMS token endpoint failed: ${res.status} ${await res.text()}`);
    }
    const body: { access_token?: string; expires_in?: number } = await res.json();
    if (!body.access_token) throw new Error("KMS token endpoint returned no access_token");
    cachedToken = {
      token: body.access_token,
      expires_at: now + (body.expires_in || 3600),
    };
    return cachedToken.token;
  }

  return fetchAccessToken;
}

export function makeGcpKms(env: Env): KmsAdapter {
  const { GCP_KMS_PROJECT, GCP_KMS_LOCATION, GCP_KMS_KEY_RING, GCP_KMS_KEY, GCP_KMS_SA_KEY } = env;
  if (
    !GCP_KMS_PROJECT ||
    !GCP_KMS_LOCATION ||
    !GCP_KMS_KEY_RING ||
    !GCP_KMS_KEY ||
    !GCP_KMS_SA_KEY
  ) {
    throw new Error(
      "GCP Cloud KMS requires GCP_KMS_PROJECT, GCP_KMS_LOCATION, GCP_KMS_KEY_RING, " +
        "GCP_KMS_KEY and GCP_KMS_SA_KEY to be set"
    );
  }
  const account = parseServiceAccount(GCP_KMS_SA_KEY);
  const getAccessToken = makeTokenFetcher(account);
  const baseUrl = [
    "https://cloudkms.googleapis.com/v1/projects",
    encodeURIComponent(GCP_KMS_PROJECT),
    "locations",
    encodeURIComponent(GCP_KMS_LOCATION),
    "keyRings",
    encodeURIComponent(GCP_KMS_KEY_RING),
    "cryptoKeys",
    encodeURIComponent(GCP_KMS_KEY),
  ].join("/");

  async function call(action: "encrypt" | "decrypt", payload: Record<string, string>) {
    const token = await getAccessToken();
    const res = await fetch(`${baseUrl}:${action}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Cloud KMS ${action} failed: ${res.status} ${await res.text()}`);
    }
    const body: { ciphertext?: string; plaintext?: string } = await res.json();
    const value = action === "encrypt" ? body.ciphertext : body.plaintext;
    if (!value) throw new Error(`Cloud KMS ${action} returned no data`);
    return Buffer.from(value, "base64");
  }

  return {
    async wrapKey(dek: Buffer) {
      return call("encrypt", { plaintext: dek.toString("base64") });
    },
    async unwrapKey(blob: Buffer) {
      return call("decrypt", { ciphertext: blob.toString("base64") });
    },
  };
}

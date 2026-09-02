# Data Privacy — Encryption of User Financial Data (Ideation)

> Branch: `feat/simulation-data-privacy` (off `main`) · Status: **P1–P3 implemented (Tasks 4.1–4.3, `tests/encryption-at-rest.test.ts`); P4 backfill pending; KMS configured in GCP `fi-simulater` project**
>
> Goal: keep all current functionality intact while ensuring **no one with DB access**
> (staff creds, cloud provider personnel, backups, dumps) can read users' financial
> simulations or PII.

## 1. Background & threat model

Financial simulations are stored in plaintext today:

- `Plan_Store` — full plan docs: `cashflow_list`, `account_list`, `loan_accounts`,
  `asset_list`, `fund_distribution_percentage`, titles/descriptions
  (`src/server/infrastructure/repositories.ts:40`)
- `Cash_Flow_Store` — income/expense docs (amounts, descriptions)
- `Cash_Flow_Change_Store` — cashflow change docs
- Networth snapshots + links (Indmoney portfolio data) (`src/server/networth/repository.ts`)
- `Chat_Session_Store` — AI chat messages (may embed financial context)
- `User_Profiles` — PII: email, first/last name, `ob_params`

**Threat:** anyone with read access to MongoDB sees all of the above.

**Boundary:** the engine computes simulations server-side on plaintext
(`src/server/engine/*`), so the app server must always be able to decrypt. The achievable
guarantee is therefore: **DB access alone reveals nothing — keys live only in the app
environment, never in the DB.** This is the same boundary used by production password
managers/fintechs. True zero-knowledge (client-side encryption) is S4 below and is
explicitly out of scope.

## 2. Key enabling fact

All existing DB queries filter only on non-sensitive fields:

| Collection | Queried fields (today) |
|---|---|
| `Plan_Store` | `_id`, `user_id`, `status` (+ `parent_id`, `share_id` set) |
| `Cash_Flow_Store` | `status`, `category`, `plan_id`, `user_id`, `_id` |
| `Cash_Flow_Change_Store` | `status`, `category_id`, `cashflow_id`, `user_id`, `_id` |
| `User_Profiles` | `_id`, `email` (equality lookup in `FindByEmail`) |

**No query ever filters on a financial value** (amount, balance, title). Therefore
encryption can be transparently layered at the repository layer with **zero query
rewriting** — only write-encrypt / read-decrypt, keeping the engine and application layer
untouched.

## 3. Solution alternatives

| # | Approach | Protects vs DB access? | Cost | Notes |
|---|---|---|---|---|
| S1 | **App-layer envelope encryption (AES-256-GCM) in repositories** | Yes | Low–Medium | Pure Node `crypto`, works on any MongoDB incl. `mongodb-memory-server` tests. **Recommended.** |
| S2 | MongoDB CSFLE / Queryable Encryption (driver auto-encrypt) | Yes | High | Needs Atlas or Enterprise + KMS + native `libmongocrypt` binary; breaks local/test setups; deterministic mode leaks equality patterns; overkill — no financial-field queries exist. |
| S3 | Provider-side encryption at rest | **No** | Zero | Only guards physical disk theft; DB admins still read plaintext. Fails the requirement. |
| S4 | Zero-knowledge client-side encryption | Yes (strongest) | Very high (rewrite) | Engine, shared templates, AI advisor, MCP tools all need server plaintext; would require porting the engine client-side. Future ideal only. |
| S5 | S1 + per-user password-derived KEK | Yes | Medium | Server needs plaintext anyway; adds password-reset/recovery complexity for marginal gain given threat is DB access, not app-server compromise. |

**Decision: proceed with S1.** (Design detailed in §4.)

## 4. Recommended design (S1) — app-layer envelope encryption

### 4.1 Crypto module

New module `src/server/infrastructure/fieldCrypto.ts` (pure `node:crypto`):

- **AES-256-GCM** with 12-byte random IV, 16-byte auth tag; ciphertext format
  `v1.<base64(iv)>.<base64(ct+tag)>` so key/format version is self-describing.
- **Envelope scheme:** master key from env (`DATA_ENCRYPTION_KEY`, 32 bytes base64)
  wraps a random per-document **data key (DEK)**. Each encrypted doc stores
  `enc: { v: 1, kid: <key-id>, dek: <wrapped-dek> }` and each sensitive field becomes
  the ciphertext string.
  - `kid` maps to a master-key version, enabling **rotation**: rotate the master key and
    lazily re-wrap DEKs on read/write; re-encrypt DEK when writing back.
- Helpers: `encryptField(plain) → string`, `decryptField(cipher, enc) → plain`,
  `encryptSensitiveFields(doc, fieldMap)`, `decryptSensitiveFields(doc)`.
- **Dev/test fallback:** if `DATA_ENCRYPTION_KEY` is unset in non-production, derive a
  fixed dev key so local dev and `mongodb-memory-server` tests run unchanged.

### 4.2 Per-collection field map

| Collection | Encrypted fields | Left plaintext (lookup keys) |
|---|---|---|
| `Plan_Store` | whole doc **except** `_id`, `user_id`, `status`, `timestamp`, `modified_at` | `_id`, `user_id`, `status` |
| `Cash_Flow_Store` | `amount`, `desc`, `title`-like fields | `_id`, `user_id`, `plan_id`, `category`, `status` |
| `Cash_Flow_Change_Store` | `value`, `title`, `desc` | `_id`, `user_id`, `cashflow_id`, `category_id`, `status` |
| Networth `snapshots`/`links` | portfolio payload + link `tokens`/`client_info` | `_id`, `user_id`, `provider`, `status`, `connected_at`, `last_sync_at`, `timestamp` |
| `Chat_Session_Store` | `title`, `messages` | `_id`, `user_id`, `status`, `created_at`, `updated_at` |
| `User_Profiles` | `email`, `first_name`, `last_name`, `ob_params`, `credentials` | `_id`, `email_token` (HMAC lookup index), `role`, `status`, `timestamp` |

`Share_Object_Store` (public templates), `Tax_Rule_Store`, `Common_Collection` stay
unencrypted — public/global data.

### 4.3 Email lookup (PII) — HMAC tokenization

`FindByEmail(email)` needs an equality lookup. Since email is encrypted with random IV,
store an additional plaintext **HMAC-SHA256 token** `email_token = HMAC(key, email)` for
lookup. `FindByEmail` filters on `email_token` instead of `email`. (Alternative: AES-SIV /
deterministic encryption, but HMAC tokenization avoids ciphertext-equality leakage of
email structure.)

### 4.4 Repository integration points

- `makePlanTemplateRepository` (`repositories.ts:173`):
  - `Add`/`Update`: encrypt before write. **`Update` currently spreads partial updates —
    must decrypt-then-merge-then-encrypt (read-modify-write).**
  - `UpdateAccount` (`:212`): positional `arrayFilters` on `account_list` cannot run
    against an encrypted field → fetch, decrypt, mutate in memory, re-encrypt, write back.
  - `RemoveCashflowAndAccount` (`:235`): same read-modify-write for the `$pull`.
  - `FindById`/`FindByUserId`: decrypt results.
- `makeCashFlowRepository`, `makeCashFlowChangeRepository`: encrypt/decrypt around
  existing operations (queries untouched).
- Networth repository (`src/server/networth/repository.ts`): encrypt snapshot payloads
  and link payloads; `user_id`-based queries unchanged.
- Chat sessions: encrypt `messages` on `Add`/`Update`; decrypt on read. Messages are only
  ever read back whole (no query on message content).
- `makeUserRepository`: encrypt PII fields; `FindByEmail` switches to `email_token`.

Application layer (`src/server/application/useCases.ts`) and engine
(`src/server/engine/*`) need **no changes** — they keep seeing plaintext through the
repository boundary.

### 4.5 Key management — GCP Cloud KMS (chosen)

Per-doc DEKs are wrapped via **GCP Cloud KMS symmetric `encrypt`/`decrypt`** instead of a
locally-held env key. Keys live in Google's managed KMS: never exported, versioned,
rotatable, 30-day destroy window, IAM-scoped, audited.

| Item | Value (created) |
|---|---|
| Key | `data-key` — purpose `encryption`, in keyring `fiplan-keys`, `us-central1` |
| Rotation | 90 days, auto (`--rotation-period 90d --next-rotation-time ...`) |
| IAM | service account `fiplan-kms@fi-simulater.iam.gserviceaccount.com`, role `roles/cloudkms.cryptoKeyEncrypterDecrypter` scoped to the key |
| App credential | JSON key (`sa.json`) stored as Vercel secret `GCP_KMS_SA_KEY` (hardening later: Workload Identity Federation) |
| Cost | ~$0.06/key version/month + $0.03 per 10k crypto ops → roughly $1–2/year |

KMS adapter interface (behind this any provider — Vault, AWS KMS — can swap in):

```ts
export interface KmsAdapter {
  wrapKey(dek: Buffer): Promise<Buffer>;   // Cloud KMS encrypt (raw)
  unwrapKey(blob: Buffer): Promise<Buffer>; // Cloud KMS decrypt
}
```

Envelope flow:

1. Per doc, generate random 32-byte DEK; AES-256-GCM encrypt sensitive fields locally.
2. `enc: { v: 1, dek: base64(wrapKey(dek)) }` stored in the doc — **one KMS call per doc**.
3. On read: `unwrapKey` + local decrypt. Lazy legacy read (no `enc` header) unchanged.
4. **Rotation is free:** Cloud KMS keeps old key versions readable forever, `encrypt` uses
   the newest — no `kid` bookkeeping, no DEK re-wrap required (unlike Vault/Vercel keys).

Env vars to add: `GCP_KMS_SA_KEY` (JSON), `GCP_KMS_PROJECT=fi-simulater`,
`GCP_KMS_LOCATION=us-central1`, `GCP_KMS_KEY_RING=fiplan-keys`, `GCP_KMS_KEY=data-key`.
Dev/test fallback: fixed dev key when KMS config absent (mongodb-memory-server tests).

Alternatives considered: **HCP Vault Dedicated** (~$100–300/mo, self-managed cluster —
chosen against); **Vercel Secure Compute** (secret store only — no versioning/rotation/
audit; still useful for holding `GCP_KMS_SA_KEY`); **AWS KMS** (equivalent, if AWS were
the cloud of choice).

### 4.6 Migration & backfill

- **Lazy read path:** `decryptSensitiveFields` is a no-op when `enc` header is absent
  (legacy plaintext docs) → old data keeps working immediately after deploy.
- **Write path:** every write re-encrypts → docs converge over time.
- **Backfill script:** `standalone/encrypt-backfill.ts` iterates the 4+2 collections and
  re-writes docs with encryption (idempotent: skips docs already carrying `enc`). Run
  once after deploy; progress is safe to restart.

### 4.7 Test strategy

- Unit: field crypto round-trip, tamper detection (auth tag), version parsing, HMAC token.
- Integration: existing vitest suites (mongodb-memory-server) must pass unmodified with
  the dev fallback key; add tests asserting **raw DB reads show no plaintext financial
  values** and that repos still return plaintext to callers.
- E2E (Cypress) unchanged.

## 5. Feature impact (why functionality stays intact)

| Feature | Impact |
|---|---|
| Engine simulation | None — repos decrypt before returning |
| Save/load/fork plans | None — transparent at repo layer |
| Shared templates | None — public `Share_Object_Store` untouched |
| AI advisor / chat | None — messages decrypt on read |
| MCP tools | None — they call the same application layer |
| Networth (Indmoney) | None — snapshot payload encrypted, queries on `user_id` unchanged |
| Admin/bug reports | Bug reports remain readable by staff by design (support feature) |

## 6. Rollout phases

1. **P1 — core stores:** crypto module + `Plan_Store` + `Cash_Flow_Store` +
   `Cash_Flow_Change_Store` + lazy read + backfill script + tests.
2. **P2 — financial-adjacent:** networth snapshots/links + chat messages.
3. **P3 — PII:** `User_Profiles` field encryption + `email_token` lookup (requires
   `FindByEmail` switch + backfill of `email_token` for existing users).
4. **P4 (optional):** key rotation tooling + KMS integration.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Master key loss → data unrecoverable | GCP KMS: keys never exported, auto-rotation keeps old versions, destroy requires 30-day window; optional Shamir-split escrow of a secondary master DEK for vendor-exit insurance |
| KMS outage → encrypt/decrypt unavailable | App touches KMS once per doc (not per field); per-req recoverable failures (retry, then 5xx); no caching of plaintext needed |
| Read-modify-write race on plan updates | Preserve current last-write-wins semantics (already the case with `$set`); no new locking introduced |
| Payload size growth (GCM overhead + base64) | ~33% size on encrypted fields; plans are small (<16 MB limit); optional compression for chat messages |
| Legacy plaintext docs linger if backfill not run | Lazy read keeps them functional; backfill script is idempotent and resumable |

## 8. Open questions

1. ~~Master key storage target~~ → **Resolved:** GCP Cloud KMS (`data-key`, configured).
2. Should `Bug_Report_Store` content stay plaintext for support? (Design assumes yes.)
3. Backfill window: acceptable to run once in maintenance mode, or must it be fully
   online (script is online-safe either way, just slower)?
4. Move `GCP_KMS_SA_KEY` storage from Vercel secret → Workload Identity Federation with
   short-lived tokens (hardening, later phase)?

# AI + MCP Auth — Hardening & External-Assistant Plan

> Branch: `feat/ai-mcp-auth` (off `main`) · Status: **Implemented — 2026-08-18**
>
> Scope: verify the merged MCP + API-token layer, fix auth/gate gaps so **GitHub Copilot,
> ChatGPT, Cursor, Windsurf, Claude Code/Desktop** connect reliably over MCP, and document
> each client's connection flow. **Extended** with a full **OAuth 2.1 authorization server**
> (§9) for the IndMoney-style "Sign in with Fi-Plan" experience.

## 1. Background

The MCP capability layer (PR #3, `mcp-implementeation`) is merged into `main`:

- API-token auth (`Api_Token_Store`, `CreateApiToken/ListApiTokens/RevokeApiToken`, profile UI)
- MCP server over the shared tool registry (35 tools, 8 groups: plans, engine, cashflows,
  changes, loans, net worth, indstocks, share)
- Stateless Streamable HTTP endpoint `app/api/mcp/route.ts` + stdio entry `standalone/mcp-stdio.ts`
- Tests (`tests/mcp/*`, `tests/api-token.test.ts`) + design/usage docs

This branch is **not a rebuild** — it verifies the baseline and closes gaps that break real
external MCP clients.

## 2. Gaps found (analysis)

| # | Gap | Impact |
|---|---|---|
| G1 | `MCP_ENABLED` env is defined (`env.ts:27`) but never enforced | Endpoint serves even when configured off |
| G2 | Missing/invalid token → `initialize` succeeds; tools fail with `UNAUTHORIZED` envelope under HTTP 200 | MCP spec says 401 + `WWW-Authenticate: Bearer`; Copilot/ChatGPT/Claude auth UX breaks |
| G3 | No `Origin` validation on `/api/mcp` | DNS-rebinding protection promised in design doc §13.6 is absent |
| G4 | Usage docs cover only Claude Code/Desktop + OpenCode + curl | No Copilot / ChatGPT / Cursor / Windsurf connection guides |
| G5 | Usage docs stale: "30 tools / 7 groups" | Actual: 35 tools / 8 groups (indstocks missing) |
| G6 | `npm run lint` was broken — `eslint.config.mjs` held JSON instead of flat-config JS | Baseline tooling red; 1000+ stale `no-explicit-any` errors on the ported codebase |

## 3. Fix design

### 3.1 `MCP_ENABLED` gate (G1)

`app/api/mcp/route.ts`, first line of GET/POST:

```
if (container.env.MCP_ENABLED !== "true") return 404
```

### 3.2 HTTP 401 auth failures (G2)

`app/api/mcp/route.ts` POST handler:

- No `Authorization: Bearer` header, or `resolveApiToken` throws (garbage/revoked/inactive)
  → `401` with `WWW-Authenticate: Bearer` + JSON-RPC error body
- Valid token → unchanged flow (authInfo via SDK channel)
- GET unchanged (spec handles it)

### 3.3 Origin validation (G3)

POST handler, after auth:

- `Origin` header present AND not in allowlist → `403`
- Allowlist = origin of `CLIENT_APPLICATION` + optional new env `MCP_ALLOWED_ORIGINS`
  (comma-separated); no `Origin` header (server-to-server: Copilot/ChatGPT/curl) → allowed
- `src/server/config/env.ts`: add `MCP_ALLOWED_ORIGINS: z.string().optional()`
- `.env.example`: document it

### 3.4 Lint baseline fix (G6)

- Rewrite `eslint.config.mjs` as a proper flat config (`eslint-config-next/core-web-vitals` +
  `eslint-config-next/typescript` as ESM imports)
- Turn off the noisy v7 react-hooks rules + `no-explicit-any` (repo convention — ported codebase)
- `eslint --fix` for the safe `prefer-const` cleanups; fix `prefer-spread` in tracker.ts

## 4. File changes

| File | Change |
|---|---|
| `app/api/mcp/route.ts` | MCP_ENABLED gate, 401+WWW-Authenticate, Origin allowlist |
| `src/server/config/env.ts` | `MCP_ALLOWED_ORIGINS` optional var |
| `.env.example` | `MCP_ALLOWED_ORIGINS` entry + notes |
| `tests/mcp/http-route.test.ts` | update + new tests (§5) |
| `eslint.config.mjs` | valid flat config (was broken JSON-in-.mjs) |
| `src/lib/tracker.ts` | `prefer-spread` fix (`.apply` → spread) |
| `docs/mcp-usage.md` | Copilot/ChatGPT/Cursor/Windsurf sections; 35 tools / 8 groups; 401 + gate behavior |
| `docs/mcp-implementation-plan.md` | §5/§13 notes: 401 status, origin allowlist, MCP_ENABLED enforced |
| `docs/ai-mcp-auth-fix-plan.md` | this document |

## 5. Tests (`tests/mcp/http-route.test.ts`)

1. Missing token → HTTP 401 + `WWW-Authenticate: Bearer`
2. Garbage / revoked token → HTTP 401
3. `MCP_ENABLED=false` → 404 (fresh import with env override)
4. Disallowed `Origin` → 403; no-Origin request → passes
5. Existing tests updated for the new 401 semantics

## 6. Docs — external assistant connection guides (`docs/mcp-usage.md` §2)

| Client | Config |
|---|---|
| **GitHub Copilot** | `~/.copilot/mcp.json` or VS Code `github.copilot.chat.mcp.servers`: `{ "type": "http", "url": "<base>/api/mcp", "headers": { "Authorization": "Bearer fp_<token>" } }` |
| **ChatGPT** | MCP connector → auth type **API key** → header `Authorization`, prefix `Bearer`, value `fp_<token>` |
| **Cursor** | `.cursor/mcp.json` remote server entry (same http + headers shape) |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` (http + headers) |
| **Claude Code / Desktop** | existing instructions kept (`claude mcp add … --transport http` / stdio `npm run mcp:stdio`) |

## 7. Execution order

1. Baseline verify: `npm test` → `npm run lint` → `npm run build` — all green (lint config fixed, G6)
2. Code fixes (3.1 → 3.2 → 3.3) + env example
3. Tests (§5)
4. Docs (§6 + accuracy fixes)
5. Full re-run: lint + test + build
6. Commit

## 8. Out of scope (v1.1, already documented)

Token TTL · per-token scopes (read/write) · rate limiting · OAuth 2.1 MCP server
(`OAuthServerProvider`) · MCP resources/prompts.

## 9. Extended — OAuth 2.1 authorization server (IndMoney-style sign-in)

> Implemented on this branch: **`OAuth 2.1 MCP authorization server`** — external MCP
> clients (Claude Desktop, ChatGPT, GitHub Copilot, Cursor) now get the same experience
> as IndMoney's MCP: register the server URL → "Sign in with Fi-Plan" → email/password
> login → auto token, nothing to paste.

### 9.1 What was built

| Piece | Location |
|---|---|
| OAuth types + TTLs (code 10m, access 1h, refresh 30d) | `src/server/mcp/oauth/types.ts` |
| Mongo store (`OAuth_Store`, `type` discriminator) | `src/server/mcp/oauth/repository.ts` |
| Service: register / start / issueCode / exchange / refresh / verify / revoke | `src/server/mcp/oauth/service.ts` |
| Fetch-style handlers (framework-agnostic, testable) | `src/server/mcp/oauth/handlers.ts` |
| Routes under `/api/mcp/…` (catch-all) | `app/api/mcp/[...path]/route.ts` |
| MCP transport accepts `fp_oa_…` access tokens | `app/api/mcp/route.ts` |
| Login-page hook (`/login?oauth=<id>` → continue → client redirect) | `app/(app)/login/page.tsx` |
| `npm run mcp:auth` CLI (token mint + auto-signup, prints client configs) | `standalone/mcp-auth.ts` |
| Sociable tests (12) | `tests/mcp/oauth.test.ts` |

### 9.2 Endpoints (discovered from metadata)

```
GET  /api/mcp/.well-known/oauth-authorization-server   metadata (RFC 8414)
POST /api/mcp/oauth/register                            dynamic client registration (RFC 7591)
GET  /api/mcp/oauth/authorize                           start → /login?oauth=<id> (auto-completes when already signed in)
POST /api/mcp/oauth/authorize                           session → authorization code → redirect to client
POST /api/mcp/oauth/token                               authorization_code / refresh_token (PKCE S256)
POST /api/mcp/oauth/revoke                              RFC 7009
```

### 9.3 Security notes

- PKCE **S256 required**; codes single-use (consumed only after successful verification)
- Tokens opaque (`fp_oa_` / `fp_or_`), **stored hashed** with `GenerateHash` + `COOKIE_SECRET` (same as API tokens/passwords)
- Client registration requires absolute `http(s)`/loopback/custom-scheme redirect URIs
- All OAuth routes gated by `MCP_ENABLED` (404 when off); `/api/mcp` Origin allowlist applies to browser requests
- Google sign-in + consent page: v2 (email/password login today)

### 9.4 Usage

`docs/mcp-usage.md` §0.2 — Claude Desktop config, ChatGPT/Copilot/Cursor flows, token-exchange diagram.

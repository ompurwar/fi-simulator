# Tasks

| # | Task | Status | Owner | Notes |
|---|---|---|---|---|
| 1.1 | Net worth provider module (port + service + repo) | DONE | — | `src/server/networth/` — service depends only on the `NetWorthProvider` port |
| 1.2 | IndMoney provider via MCP (OAuth 2.1 + PKCE) | DONE | — | Official `https://mcp.indmoney.com/mcp`, MCP SDK client, `networth_snapshot` / `networth_holdings` with tolerant normalizers |
| 1.3 | Net worth API endpoints + OAuth callback route | DONE | — | `POST /networth/status|connect|sync|disconnect` + `GET /api/networth/oauth/callback` |
| 1.4 | Net Worth page wired to live data + connect flow | DONE | — | Connect → IndMoney consent → callback → sync; sample preview when disconnected |
| 1.5 | Behavioral tests for the net worth flow | DONE | — | `tests/networth.test.ts` — fake provider at the port boundary, real repo/service/HTTP + in-memory Mongo |

Acceptance criteria (feature): a user can connect their IndMoney account via the official MCP OAuth flow, sync a net worth snapshot, view it on `/networth`, and disconnect — all provider logic behind the `NetWorthProvider` interface so new providers can be added without touching the service layer.

---

## Phase 2: AI & MCP — one tool registry, three surfaces (branch `mcp-implementeation`)

Plan: `docs/mcp-implementation-plan.md`.

| # | Task | Status | Owner | Notes |
|---|---|---|---|---|
| 2.1 | ApiToken infra — entity + port + repo + Create/List/Revoke use cases + routes + tests | IN_PROGRESS | — | `Api_Token_Store`; `fp_` + 32 random chars, stored hashed via `GenerateHash(token, COOKIE_SECRET)`; raw token shown once |
| 2.2 | mcp core — types, registry (`makeToolRegistry`), auth, `ApplyScenarioToPlan`, `makeMcpServer` | TODO | — | Single source of tool schemas (zod) + handlers `(ctx, args) → envelope` |
| 2.3 | Tool definitions — plans, engine, cashflows, changes, networth, share + tests | TODO | — | Map 1:1 onto `ApplicationLayer` use cases; `user_id` from context, never an argument |
| 2.4 | API token management UI on profile page | TODO | — | Create (one-time reveal), list, revoke |
| 2.5 | `app/api/mcp/route.ts` — stateless Streamable HTTP (Bearer auth) | TODO | — | `WebStandardStreamableHTTPServerTransport`, `sessionIdGenerator: undefined`, `enableJsonResponse: true` |
| 2.6 | `standalone/mcp-stdio.ts` — stdio transport | TODO | — | `FIPLAN_API_TOKEN` env; `npm run mcp:stdio` |
| 2.7 | ai module — Anthropic provider, agent loop, prompts + tests | TODO | — | LLM via plain `fetch`; tool schemas via SDK `toJsonSchemaCompat` |
| 2.8 | `app/api/assistant/chat/route.ts` — session auth + SSE streaming + tests | TODO | — | Events: text delta, tool_call, tool_result, error, done |
| 2.9 | ChatPanel UI — floating assistant panel | TODO | — | Streaming render, tool-call badges, stop button |
| 2.10 | Agent usage guide + CHANGELOG + TASKS completion | TODO | — | Claude Code / Desktop `mcp add` instructions |

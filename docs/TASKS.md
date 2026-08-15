# Tasks

| # | Task | Status | Owner | Notes |
|---|---|---|---|---|
| 1.1 | Net worth provider module (port + service + repo) | DONE | — | `src/server/networth/` — service depends only on the `NetWorthProvider` port |
| 1.2 | IndMoney provider via MCP (OAuth 2.1 + PKCE) | DONE | — | Official `https://mcp.indmoney.com/mcp`, MCP SDK client, `networth_snapshot` / `networth_holdings` with tolerant normalizers |
| 1.3 | Net worth API endpoints + OAuth callback route | DONE | — | `POST /networth/status|connect|sync|disconnect` + `GET /api/networth/oauth/callback` |
| 1.4 | Net Worth page wired to live data + connect flow | DONE | — | Connect → IndMoney consent → callback → sync; sample preview when disconnected |
| 1.5 | Behavioral tests for the net worth flow | DONE | — | `tests/networth.test.ts` — fake provider at the port boundary, real repo/service/HTTP + in-memory Mongo |

Acceptance criteria (feature): a user can connect their IndMoney account via the official MCP OAuth flow, sync a net worth snapshot, view it on `/networth`, and disconnect — all provider logic behind the `NetWorthProvider` interface so new providers can be added without touching the service layer.

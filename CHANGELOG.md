# Changelog

## [Unreleased]

### Added
- Net worth provider module with a `NetWorthProvider` port interface (Task 1.1) — the service layer depends only on the interface, so providers can be swapped freely.
- IndMoney net worth provider via the official IndMoney MCP server (Task 1.2) — OAuth 2.1 + PKCE through the MCP TypeScript SDK, pulling `networth_snapshot` / `networth_holdings` with tolerant payload normalizers; tokens and daily snapshots persisted in MongoDB.
- Net worth API + connect flow (Task 1.3) — `POST /networth/status|connect|sync|disconnect` endpoints and the browser OAuth callback route at `/api/networth/oauth/callback`.
- Net Worth page now live (Task 1.4) — connects through IndMoney's consent screen, syncs real data, keeps a sample preview when disconnected; `INDMONEY_MCP_URL` env var added.
- Behavioral test suite for the net worth flow (Task 1.5) — `tests/networth.test.ts` exercises connect → callback → sync → status → disconnect through the HTTP surface with a fake provider at the port boundary.

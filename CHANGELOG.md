# Changelog

## [Unreleased]

### Added
- Net worth provider module with a `NetWorthProvider` port interface (Task 1.1) — the service layer depends only on the interface, so providers can be swapped freely.
- IndMoney net worth provider via the official IndMoney MCP server (Task 1.2) — OAuth 2.1 + PKCE through the MCP TypeScript SDK, pulling `networth_snapshot` / `networth_holdings` with tolerant payload normalizers; tokens and daily snapshots persisted in MongoDB.
- Net worth API + connect flow (Task 1.3) — `POST /networth/status|connect|sync|disconnect` endpoints and the browser OAuth callback route at `/api/networth/oauth/callback`.
- Net Worth page now live (Task 1.4) — connects through IndMoney's consent screen, syncs real data, keeps a sample preview when disconnected; `INDMONEY_MCP_URL` env var added.
- Behavioral test suite for the net worth flow (Task 1.5) — `tests/networth.test.ts` exercises connect → callback → sync → status → disconnect through the HTTP surface with a fake provider at the port boundary.
- API tokens for AI agents (Task 2.1) — `fp_` tokens stored hashed in `Api_Token_Store`; `POST /api_token/create|list|revoke` with session auth.
- MCP core (Tasks 2.2–2.3) — one tool registry (`makeToolRegistry`, 26 tools) over the `ApplicationLayer`, `ApplyScenarioToPlan` what-if patches, and `makeMcpServer` (SDK 1.30, `authInfo`-carried `user_id`).
- MCP transports (Tasks 2.5–2.6) — stateless Streamable HTTP endpoint at `/api/mcp` (Bearer auth, single JSON response per POST) and `npm run mcp:stdio` for local agents.
- In-app AI assistant (Tasks 2.7–2.9) — Anthropic provider over plain `fetch`, server-side agent loop (`runAgentLoop`, 8-iteration cap, tool-result streamed as SSE), `/api/assistant/chat` route with session-cookie auth.
- Assistant UI (Task 2.10) — floating ChatPanel in the app shell with streaming render and tool-call badges; API-token manager on the profile page.
- Chat sessions + entity references (Tasks 2.11–2.13) — conversations persist in `Chat_Session_Store`; `/api/chat_session/create|list|get|delete`; the chat route accepts `session_id`, feeds stored history back into the model context, and emits a `session` SSE event; the panel has a session drawer (resume/delete) and clickable reference chips for plan/net-worth/share entities.
- Mobile assistant (Task 2.14) — launcher moves into the top nav on mobile with a full-screen panel; desktop keeps the floating button.
- Markdown replies (Task 2.15) — assistant messages render as GitHub-flavored markdown (tables/lists/code, dark-themed) via react-markdown; plain text while streaming.
- Guardrails (Task 2.16) — deterministic pre-LLM topic gate (`classifyTopic`) blocks coding, other domains and standalone math with a friendly `OFF_TOPIC` decline; system prompt enforces scope + exact cashflow-change frequency semantics (one-time vs yearly vs monthly).
- DeepSeek support + thinking echo (Task 2.17) — `AI_BASE_URL`/`AI_MODEL` env make any Anthropic-format endpoint work (`https://api.deepseek.com/anthropic`); thinking blocks are captured from the stream and echoed back verbatim (required by DeepSeek thinking mode, spec-correct for Anthropic).
- Fixed 5 pre-existing app-layer bugs found during tool wiring (Task 2.3) — `MakeCashFlowChange` empty title/desc, `UpdateIncome/UpdateExpense` dropping active/primary, `MakePlan` rejecting id-strings in cashflow_list, `UpdateCashflowChange` persisting random ObjectIds, share-object auth comparing ObjectId vs string.

### Fixed
- SSE tool-use args were corrupted when `content_block_start` carried an empty `input: {}` placeholder — args now accumulate from `input_json_delta` fragments only (tool calls were silently dropped).

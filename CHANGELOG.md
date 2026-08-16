# Changelog

## [Unreleased]

### Added
- Token-reduction for the assistant (Task 2.21) — `simulate_plan` accepts `plan_id` (server loads the plan; no more pasting `plan_json`), `list_plans` returns compact metadata, `plan_snapshot`/`simulate_plan` support `summary: true`, session replay capped (last 30 messages, 4k-char), tool activity persisted and echoed on resume, and the system prompt now carries worked patch examples + a plan_id-first rule. Combined with Phase A/B/C fixes this cuts typical multi-turn input tokens by an estimated 60–80%.
- Ops scripts (Task 2.22) — `standalone/dedupe-changes.ts` (idempotent, keeps the latest change per line+month) and the existing migration script; Phase A verification confirmed the persisted hikes project exactly (₹2,41,000 → ₹2,89,200 → ₹3,47,040 → ₹4,16,448 → ₹4,58,092.80 at months 24/36/48/60).
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
- Loan tools (Task 2.18) — `list_loans`, `add_loan`, `update_loan`, `delete_loan` persist through `UpdatePlan` with full entity validation; `deposit_to_bank: false` removes a double-counted disbursement credit while keeping EMI + amortization.
- Chat UX (Task 2.19) — copy-message button on assistant bubbles; Claude Code-style thinking indicator (pulsing reasoning bubble with staggered dots → auto-folding "Reasoning" toggle) and a blinking caret on streamed text.
- Fixed 5 pre-existing app-layer bugs found during tool wiring (Task 2.3) — `MakeCashFlowChange` empty title/desc, `UpdateIncome/UpdateExpense` dropping active/primary, `MakePlan` rejecting id-strings in cashflow_list, `UpdateCashflowChange` persisting random ObjectIds, share-object auth comparing ObjectId vs string.

### Fixed
- "Persisted but invisible" add-side bug (Task 2.23) — `AddIncome`/`AddExpense` now embed the **full cashflow object** in `plan.cashflow_list` instead of a bare id string (the projection engine reads objects; strings were silently dropped). Store updates/deletes sync the embedded copy; `simulate_plan` errors carry the schema hint for `add_income`/`add_expense`; a migration (`standalone/embed-cashflows.ts`) hydrates existing bare-id entries.
- The `simulate_plan` "invalid: cashflow should be an object" failure loop — schema hints + a prompt rule ("stop after 2 consecutive same-tool failures") cut the iteration-limit churn.
- Permanent quality gate (`tests/mcp/quality.test.ts`) — add-then-project assertions for expense/income + the funded-purchase (₹T = ₹Y own + ₹Z loan) no-double-count guard; runs on every `npm test`.
- SSE tool-use args were corrupted when `content_block_start` carried an empty `input: {}` placeholder — args now accumulate from `input_json_delta` fragments only (tool calls were silently dropped).
- Loan disbursement now credits the bank account **one month before the first EMI** (`start_month - 1`; month 1 for loans starting in the first month) — the money arrives before the first EMI falls due; Loan Manager labels the field "EMI starts from".
- Loan add/edit/delete in the Loan Manager auto-sync to the server — local-only saves were silently reverted by a refresh (the plan snapshot reads the server copy).
- `deposit_to_bank` is normalized to a real boolean in the Loan Manager so the checkbox and the engine (strict `=== true`) can never disagree.

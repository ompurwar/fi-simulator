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
| 2.1 | ApiToken infra — entity + port + repo + Create/List/Revoke use cases + routes + tests | DONE | — | `Api_Token_Store`; `fp_` + 32 random chars, stored hashed via `GenerateHash(token, COOKIE_SECRET)`; raw token shown once |
| 2.2 | mcp core — types, registry (`makeToolRegistry`), auth, `ApplyScenarioToPlan`, `makeMcpServer` | DONE | — | Single source of tool schemas (zod) + handlers `(ctx, args) → envelope` |
| 2.3 | Tool definitions — plans, engine, cashflows, changes, networth, share + tests | DONE | — | 26 tools; also fixed 5 pre-existing app-layer bugs found during wiring |
| 2.4 | API token management UI on profile page | DONE | — | `src/components/profile/ApiTokens.tsx` — create with one-time reveal, list, revoke |
| 2.5 | `app/api/mcp/route.ts` — stateless Streamable HTTP (Bearer auth) | DONE | — | Per-request transport (SDK forbids reuse/connect); fresh `McpServer` per request over a cached container |
| 2.6 | `standalone/mcp-stdio.ts` — stdio transport | DONE | — | `FIPLAN_API_TOKEN` env via `staticAuth` option; `npm run mcp:stdio` |
| 2.7 | ai module — Anthropic provider, agent loop, prompts + tests | DONE | — | Plain `fetch` + manual SSE parse; `toJsonSchemaCompat` for tool schemas; 8-iteration cap |
| 2.8 | `app/api/assistant/chat/route.ts` — session auth + SSE streaming + tests | DONE | — | Events: text, tool_call, tool_result, error, done + `[DONE]` |
| 2.9 | ChatPanel UI — floating assistant panel | DONE | — | `src/components/assistant/ChatPanel.tsx` mounted in `app/(app)/layout.tsx` |
| 2.10 | Agent usage guide + CHANGELOG + TASKS completion | DONE | — | `docs/mcp-usage.md` |
| 2.11 | Chat sessions backend — entity + repo + `create/list/get/delete` use cases + routes + tests | DONE | — | `Chat_Session_Store`; ownership enforced |
| 2.12 | Chat route persistence — `session_id` support, history into model context, append + `session` SSE event | DONE | — | Title from first user message; updated_at bump |
| 2.13 | ChatPanel sessions + references — session list drawer, resume/delete, entity reference chips | DONE | — | Chips → `/plan?p_id=`, `/networth`, `/shared_templates` |
| 2.14 | Mobile assistant — TopNav launcher (mobile) + full-screen panel | DONE | — | Desktop keeps the floating FAB |
| 2.15 | Markdown rendering — react-markdown + GFM, dark-themed; plain while streaming | DONE | — | |
| 2.16 | Guardrails — pre-LLM topic gate + system-prompt scope rules + tests | DONE | — | `OFF_TOPIC` error event; blocks coding/other domains/standalone math |
| 2.17 | DeepSeek support + thinking echo — `AI_BASE_URL`/`AI_MODEL` env, thinking-block capture/echo + tests | DONE | — | DeepSeek's Anthropic-compatible endpoint works as-is |
| 2.18 | Loan tools — `list/add/update/delete_loan` (persist via `UpdatePlan`, entity-validated) + tests | DONE | — | `deposit_to_bank: false` fixes double-counted disbursement |
| 2.19 | Chat UX polish — copy-message button, Claude Code-style thinking indicator + caret | DONE | — | Pulsing reasoning bubble → collapsible "Reasoning" toggle |
| 2.20 | v1.2 fix batch — plan-embedded cashflow support, change replace-semantics, mutation refresh, 405 router gate, worker cap, max_tokens 16384 | DONE | — | From live-session analysis; see plan doc §17.1 |
| 2.21 | v1.2 token reduction — D1 plan_id mode, D2 metadata list_plans, D3 summary mode, D4 replay cap, D5 prompt trims, D6 tool-activity persistence | DONE | — | Plan doc §17.3; simulate_plan takes plan_id (no plan_json paste), list_plans metadata-only, summary projection, 30-msg/4k replay cap, worked patch examples in prompt, tools persisted for resume |
| 2.22 | v1.2 verification — Phase A projection check + Phase C dedupe on live users | DONE | — | m24/36/48/60 incomes verified exactly; 0 duplicates to remove; dedupe script kept as ops tool |
| 2.23 | v1.2 fix batch 2 — full-object embedding for AddIncome/AddExpense, embedded-store sync on update/delete, schema hints for cashflow patches, retry-churn prompt rule + quality-gate tests + embed migration | DONE | — | Fixes the "persisted but invisible" add-side bug (web + MCP); quality.test.ts runs on every npm test |
| 2.24 | FDP tools — `list/add/update/delete_fdp` (persist via `UpdatePlan`, entity-validated s+e+i=100) + strategy-aware `add_fdp` simulate patch + tests | DONE | — | Mirrors loan tools; `simulate_plan` `add_fdp` accepts s/e/i (legacy FD shape kept) |
| 2.25 | Loan Manager v1.3 — amortization table in view_loan (EMI/interest/principal/closing + totals) | DONE | — | Data already exists in `emi_schedule`; render only |
| 2.26 | Prepayments engine — `ComputePrepaymentAmounts` + `ComputeLoanAmortizationScheduleWithPrepayments` (shorten mode, step-up, early payoff) + entity validation | DONE | — | EMI constant; prepay reduces principal |
| 2.27 | Snapshot wiring — prepayment rows into `emi_expense_cashflow` (`Prepayment #N - <title>`) → statements/balances/charts | DONE | — | Same seam as EMIs (planSnapshot.ts:76-96) |
| 2.28 | Refinance — `ComputeRefinanceAnalysis` engine fn + Loan Manager panel (apply = end old loan + add new) | DONE | — | Read-only analysis first, then apply |
| 2.29 | MCP wiring — loan_amortization(prepayments), add/update_loan(prepayments), simulate patch, `loan_refinance` tool + prompt | DONE | — | Plan doc §17.4 |
| 3.1 | Tax rules in Mongo — `Tax_Rule_Store` (versioned AY 2023-24→2026-27 rule sets + PRESETS doc), repo/service with code fallback, seed script | DONE | — | Plan: `docs/asset-class-simulation.md` P1 |
| 3.2 | Tax engine (pure) — `ComputeIncomeTax` (regimes/senior/HRA/deductions/87A+marginal relief/surcharge/cess), `ComputeCapitalGains` (112A/foreign/indexation/VDA), `ComputeSalaryNegotiation`, `MonthToAssessmentYear` | DONE | — | Verified against ClearTax worked examples; tests/tax.test.ts |
| 3.3 | RBAC — user `role`, `make-admin.ts`, `ToolContext.role`, `ToolDefinition.requiresRole` enforced in `callRegistryTool` | DONE | — | System-level MCP mutations admin-only (`upsert_tax_rules`, `update_presets`) |
| 3.4 | Tax MCP tools — `list/get_tax_rules`, `tax_calculation`, `salary_negotiation` + admin `upsert_tax_rules`, `update_presets` | DONE | — | tests/mcp/tax.test.ts, tests/mcp/rbac.test.ts |
| 3.5 | Asset engine — `MakeAsset` + presets + `engine/assets.ts` projection + snapshot wiring (`asset_*`, `tax_summary`, `bucket_growth`) + auto income-tax expense | DONE | — | Plan P2; tests/assets.test.ts (15) |
| 3.6 | Asset MCP tools + simulate patches + AI prompt | DONE | — | Plan P3; tests/mcp/assets.test.ts (9) |
| 3.7 | UI — AssetEditor, plan-page panels, Tax Manager, Salary Negotiation | DONE | — | Plan P4; `/api/tax/negotiation` + `next build` green |

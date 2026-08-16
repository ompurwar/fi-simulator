# MCP & AI Assistant — Usage Guide

Implemented on branch `mcp-implementeation`. Design: `docs/mcp-implementation-plan.md`.

## 1. In-app AI assistant

Open the app → robot icon (**desktop**: floating button bottom-right; **mobile**: in the top nav) →
chat. The assistant uses your existing session (no setup) and can read/update your plans and run
what-if simulations:

- "What's my runway?" → runs `plan_snapshot`
- "Add a ₹30k side-hustle income from month 12" → runs `add_income`
- "What if my salary doubles in month 24?" → runs `simulate_plan` (never persists)
- "Add a 10% hike to my salary from month 24" → one-time `add_cashflow_change` (persist after a
  simulated preview)

Assistant replies render as markdown (tables, lists, code). Entities it touches appear as clickable
reference chips (plan / net worth / share objects). Conversations auto-save — the list icon in the
panel header shows past sessions to resume. Guardrails keep it on-topic: coding, other domains, and
standalone math are declined politely.

Requires an LLM key in the server env — any Anthropic-format endpoint works (see §5).

## 2. External agents via MCP (HTTP)

1. Create an API token: Profile → API Tokens → Create (copy it — shown once).
2. Point any MCP client at the endpoint URL, e.g. Claude Code:

```
claude mcp add fi-plan --transport http http://localhost:3000/api/mcp --header "Authorization: Bearer fp_<token>"
```

or OpenCode (`opencode.json`):

```jsonc
{ "mcp": { "fiplan": { "type": "remote", "url": "http://localhost:3000/api/mcp",
    "headers": { "Authorization": "Bearer fp_<token>" } } } }
```

or a raw JSON-RPC check:

```
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer fp_<token>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_plans","arguments":{}}}'
```

## 3. Local stdio (Claude Code / Desktop)

```
npm run mcp:stdio   # needs DB_URL, COOKIE_SECRET, FIPLAN_API_TOKEN in env
```

Claude Code: `claude mcp add fi-plan-local -- node_modules/.bin/tsx standalone/mcp-stdio.ts`

## 4. Tools

26 tools across 6 groups: identity/plans (`whoami`, `list_plans`, `get_plan`,
`create_plan`, `update_plan`, `delete_plan`, `fork_plan`, `set_default_plan`),
engine (`plan_snapshot`, `simulate_plan`, `loan_amortization`), cashflows
(income/expense list/add/update/delete), changes (`*_cashflow_change`), net worth
(`networth_status|sync|connect_url`), sharing (`*_share_object`).

`simulate_plan` takes `{ plan_json, patches: [{op, ...}], duration }` — ops:
`add_income`, `add_expense`, `add_cashflow_change`, `add_loan`, `add_fdp`,
`set_account_balance`. Pure — never writes to the database.

Cashflow-change frequency semantics: one-time = `end_month` equal to `start_month`; recurring annual =
`frequency: "y"`; default `frequency: "m"` with an open end compounds monthly.

## 5. Env vars

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | LLM key for the in-app assistant (Anthropic-format) |
| `AI_PROVIDER` | `anthropic` (default; only provider implemented) |
| `AI_BASE_URL` | Anthropic-format endpoint — default `https://api.anthropic.com`; set `https://api.deepseek.com/anthropic` for DeepSeek |
| `AI_MODEL` | Model name — default `claude-3-5-sonnet-latest`; DeepSeek: `deepseek-v4-flash` / `deepseek-v4-pro` (or any `claude-*` name, auto-mapped) |
| `FIPLAN_API_TOKEN` | stdio single-user auth |
| `MCP_ENABLED` | `true`/`false` gate for the MCP endpoint |

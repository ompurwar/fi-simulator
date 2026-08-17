# MCP & AI Assistant — Usage Guide

Design: `docs/mcp-implementation-plan.md` + `docs/ai-mcp-auth-fix-plan.md`.

## 0. Auth model (external agents)

Two ways for external agents to authenticate to `/api/mcp`:

1. **API token (Bearer)** — manual, for scripts/CLI agents (see §0.1)
2. **OAuth 2.1 sign-in (IndMoney-style)** — interactive, for MCP clients with a
   browser (Claude Desktop, ChatGPT, Copilot): "Sign in with Fi-Plan" → login →
   auto token, nothing to paste (see §0.2)

### 0.1 API tokens

1. Create a token: Profile → API Tokens → Create (copy it — shown once; only a hash is stored).
2. Send it on every request as `Authorization: Bearer fp_<token>`.

Or mint it from the server env (assistant-runnable, auto-signup supported):

```
npm run mcp:auth -- --email me@example.com --password xxx
# prints the token + ready-to-paste configs for every client
```

### 0.2 OAuth 2.1 sign-in (zero manual token)

The server exposes a full OAuth 2.1 authorization server (PKCE S256) at the MCP
endpoint — the same experience as IndMoney's MCP:

- **Claude (claude.ai web)**: avatar → **Customize** → **Connectors** →
  **Add custom connector** → paste the MCP URL
  (`https://<app>/api/mcp`) → **Add** → **Sign in with Fi-Plan** → browser
  email/password login → enable the connector in chat via the **"+"** menu.
  Team/Enterprise: Organization settings → Connectors → Add → Custom → type **Web**.
- **Claude Desktop**: File → Settings → Developer → Edit Config →
  `"mcpServers": { "fi-plan": { "url": "http://localhost:3001/api/mcp" } }` → the
  app shows a "Sign in with Fi-Plan" button → browser opens → log in with
  email/password → the client stores the token automatically.
- **ChatGPT / GitHub Copilot / Cursor / Windsurf**: same — connect to the MCP URL
  and complete the browser sign-in when prompted (no header to configure).

There is also an in-app guide: **Profile → AI Assistants** (link in the profile
menu) — copy-ready MCP URL + step-by-step instructions for every client.

Flow under the hood (all endpoints discovered from the metadata doc):

```
GET  /api/mcp/.well-known/oauth-authorization-server   metadata (RFC 8414)
POST /api/mcp/oauth/register                            dynamic client registration (RFC 7591)
GET  /api/mcp/oauth/authorize                           start → /login?oauth=<id>
POST /api/mcp/oauth/authorize                           session → authorization code → redirect
POST /api/mcp/oauth/token                               code/refresh exchange (RFC 6749, PKCE)
POST /api/mcp/oauth/revoke                              revocation (RFC 7009)
```

Access tokens (`fp_oa_…`) are opaque, stored hashed, 1h TTL; refresh tokens
(`fp_or_…`) 30d, session-style. `/api/mcp` accepts them as
`Authorization: Bearer fp_oa_…` exactly like API tokens. Clients register
dynamically — no static config needed. Consent page + Google sign-in: v2.

### 0.3 Failure semantics (both modes)

- Missing/invalid/revoked token → **HTTP 401 + `WWW-Authenticate: Bearer`** (spec-compliant; MCP
  clients surface a login/credential error instead of failing silently).
- Browser-originated requests (an `Origin` header is present) must come from the app's own origin
  (`CLIENT_APPLICATION`) or an origin in `MCP_ALLOWED_ORIGINS` (comma-separated) → otherwise **HTTP 403**.
  Server-to-server clients (Claude Code, GitHub Copilot, ChatGPT, curl, OpenCode) send no `Origin`
  and are always allowed.
- `MCP_ENABLED=false` disables the endpoint entirely (**404**).

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

### 2.1 Claude Code / Claude Desktop

```
claude mcp add fi-plan --transport http http://localhost:3000/api/mcp --header "Authorization: Bearer fp_<token>"
```

### 2.2 GitHub Copilot

Remote MCP server in VS Code settings (`github.copilot.chat.mcp.servers`) or `~/.copilot/mcp.json`:

```jsonc
{
  "github.copilot.chat.mcp.servers": {
    "fi-plan": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer fp_<token>" }
    }
  }
}
```

### 2.3 ChatGPT

ChatGPT MCP connector (macOS ChatGPT app → Settings → Apps & Services → Connectors →
MCP) — or any MCP-aware ChatGPT flow:

- Server URL: `http://localhost:3000/api/mcp`
- Auth type: **API key**
- Header name: `Authorization`
- Header value: `Bearer fp_<token>` (prefix `Bearer` + space + token)

### 2.4 Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```jsonc
{
  "mcpServers": {
    "fi-plan": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer fp_<token>" }
    }
  }
}
```

### 2.5 Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```jsonc
{
  "mcpServers": {
    "fi-plan": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer fp_<token>" }
    }
  }
}
```

### 2.6 OpenCode (`opencode.json`)

```jsonc
{ "mcp": { "fiplan": { "type": "remote", "url": "http://localhost:3000/api/mcp",
    "headers": { "Authorization": "Bearer fp_<token>" } } } }
```

### 2.7 Raw JSON-RPC check

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

39 tools across 9 groups: identity/plans (`whoami`, `list_plans`, `get_plan`,
`create_plan`, `update_plan`, `delete_plan`, `fork_plan`, `set_default_plan`),
engine (`plan_snapshot`, `simulate_plan`, `loan_amortization`), cashflows
(income/expense list/add/update/delete), changes (`*_cashflow_change`), **loans
(`list_loans`, `add_loan`, `update_loan`, `delete_loan`)**, **accounts
(`list_accounts`, `add_account`, `update_account`, `delete_account` — incl.
`roi` annual interest % and persistent `init_balance`)**, net worth
(`networth_status|sync|connect_url`), indstocks (`indstocks_positions`), sharing
(`*_share_object`).

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
| `MCP_ENABLED` | `true`/`false` gate for the MCP endpoint (false → 404) |
| `MCP_ALLOWED_ORIGINS` | optional comma-separated extra browser origins allowed to call `/api/mcp`; server clients (no `Origin`) are always allowed |

# Distribution Strategy + System Capability Audit

*Answers: what to change, whether the system can support it, how MCP helps, the agent/MCP question, and the 1% Club-style distribution problem.*

> **Evidence base:** all claims about market demand/privacy/WTP are sourced in `docs/market-research.md` → §5 Citations (thread links + quote-level evidence, retrieval method, re-run queries, and limits).

## 1. The core problem: distribution (not features)

The worst problem in the research: **nobody searches for a life-simulator**. The product's problem is go-to-market, not capability. Strategy = distribution channels in order of cost:

### Channel A — MCP as a distribution engine (agents do the marketing)
Fi-Plan already ships a full MCP server (OAuth-protected) + documented tools (`docs/mcp-usage.md`):
plan CRUD, `simulate_plan` patches, engine snapshots, networth (IndMoney), share objects, tax, MCP stdio/HTTP modes.

- **The insight:** Claude/Gemini/ChatGPT/Cursor/Copilot users are the exact ICP (tech-rich, salary earners, planners). Product-as-tool = organic acquisition with zero ad budget.
- **Win condition:** "plan with your AI assistant" becomes the wedge *hero demo*: user asks Claude "build me a 40-year plan for ₹18L salary" → agent drives `create_plan` + `simulate_plan` → user lands in the web app with a plan.
- **Actions:**
  1. Ship the agent-facing marketing: a public "showcase" page + one-page agent install guide (already have access-token auth for stdio + OAuth for remote).
  2. Ensure every agent path ends in a **web continuation link** ("Open in Fi-Plan" → `/plan?p_id=`) so tools → signup.
  3. Later: free-tier tool limits (plans allowed 1; full speed requires signup).

### Channel B — Community play (the "1% Club" model)
1% Club works because **a tight, identity-rich community** gets a tangible tool/identity. The Indian equivalent:
- **r/FIREIndia, r/personalfinanceindia, r/IndiaInvestments, r/FIRE_Ind, r/FatFIREIndia** — hundreds of thousands of members. People already build DIY stuff for this (see research).
- **Telegram/WhatsApp FIRE groups, YouTube finance creators.**
- **Play:** "Share your plan" — public templates (`share_object` t-c/t-i **already exist**) with creator attribution + a hosted showcase page. Free template packs: *Retire at 45*, *NRI return in 5 years*, *₹12L salary blueprint*, *Prepay vs Invest*.
- **Creator collab:** influencers post *their own* net-worth graph/anual review card (we have image/OG utilities + milestone banners). Every share is a backlink with a live demo.

### Channel C — SEO magnets (public, no login)
Small public calculator pages reusing the engine: **Savings-rate calculator, FIRE number, Prepay vs Invest, Retirement corpus**. India searches these constantly; calculators dominate SERPs. Each ends with "build a full plan → signup".
*(Current root `/` is app-internal; needs a public marketing landing + public calc routes.)*

### Channel D — Indian-native pull channels
- **WhatsApp/Telegram digest** > email for India retention (Mailjet exists; add channel later).
- **Annual review card** (share image) = viral loop at year end.
- **Referral**: share-object invite tracking (creator_id already stored).

## 2. What we already have vs what we must change (capability audit)

| Existing capability | Role in strategy | Change needed |
|---|---|---|
| Engine + `simulate_plan`/what-if | The product | none |
| MCP server (OAuth + tools) | Channel A (agents) | Showcase page + "open in app" links + free-tier gating |
| Share objects (public templates, fork) | Channel B | Template packs + hosted showcase + creator attribution |
| Tracker (Mixpanel/GA4/Meta) | Measure | add PostHog later if needed (reverted wizard) |
| Mailjet (password reset) | Retention emails | reuse for monthly digest |
| Onboarding wizard | Activation | "Start from template" path (fork a preset instead of blank wizard) |
| Compare | NRI power use | done (v2 shipped) |
| AI in-app assistant | retention + up-sell | surface on the plan page as auto-questions |
| Root `/` + OG image | SEO | public landing page + public calculators |
| Joint plan / multi-user | couples persona | new (biggest product gap) |

## 3. Is the system capable? — yes, with 3 real gaps

Capable: engine, MCP, sharing, email, tracker, AI backend (Anthropic/Gemini), encryption/KMS, read-only networth sync.
Real gaps (product change needed):
1. **No joint/multi-user plans** (couples = big planning persona).
2. **No public marketing surface** (`/` = app root; no SEO pages).
3. **No re-engagement loop** (no digest/alerts/WhatsApp).

## 4. Does the user want the agent + MCP thing? — evidence says yes

- The persona (tech-rich, salary, planner) is disproportionately high on AI assistants.
- Live proof: the user asking about the PostHog wizard — AI-agent-led tooling is normal for this ICP.
- MCP in India fintech = marginal cost ~0 distribution; even if only 1% of agent users convert, the funnel is top-intent.
- Risk: agents without signup = users who never visit; the "Open in Fi-Plan" link is therefore the conversion step — make it mandatory in every agent terminal state.

## 5. Prioritized roadmap (validation-first)

1. **Public showcase page + "Open in Fi-Plan" on MCP flow** (Channel A) — 1 week
2. **Savings rate + FIRE progress card** (retention) — also the best SEO calculator seed — 1 week
3. **Template packs + showcase grid for community posts** (Channel B) — 1 week
4. **Monthly digest email** (Mailjet reuse) — 1 week
5. **Public calculators** (Savings rate / FIRE / Prepay-vs-invest) — 2 weeks
6. **Joint plan** — later (biggest lift, largest persona)
7. **WhatsApp digest** — later, India-native retention

## 6. Success metrics to watch

- % of new plans created **from a shared template** (Channel B signal)
- % of MCP agent sessions ending in an "Open in Fi-Plan" click (Channel A signal)
- 30-day return rate (the real "will they use it" metric)
- Digest open rate (pull-engine signal)
- SEO: organic sessions on calculator pages

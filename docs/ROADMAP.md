# Fi-Plan Roadmap — follow this

*Source of truth for direction: `docs/market-research.md` (evidence, citations) + `docs/distribution-strategy.md` (channels, capability audit).*

**North star metric: 30-day return rate** (the "will they actually use it" number). Secondary: % plans from shared templates (Channel B), MCP agent sessions ending in "Open in Fi-Plan" (Channel A), digest open rate (pull engine).

---

## Phase 1 — Distribution MVP (the funnel exists → so it can be measured)

| # | Item | System reuse | Success signal |
|---|---|---|---|
| 1.1 | Public showcase/marketing page at `/` (login-free) + OG tags | next config, existing components | Sessions on `/` before signup |
| 1.2 | MCP → web continuation: every agent terminal state shows "Open in Fi-Plan" (`/plan?p_id=`) | MCP server, `/plan` deep-link | Click % of agent sessions |
| 1.3 | Agent install/marketing page (docs + public page: Claude/ChatGPT/Cursor install links) | `docs/mcp-usage.md`, token auth | Downloads / tool calls |
| 1.4 | "Start from template" onboarding branch (fork preset instead of blank wizard) | share_object t-c templates, ForkPlan, onboarding | % sessions finishing onboarding fast |

## Phase 2 — Retention loop (withdrawal-proof dashboards)

| # | Item | System reuse | Success signal |
|---|---|---|---|
| 2.1 | Savings rate + FIRE progress card on plan dashboard | engine snapshot (client-side) | WAU on plan page |
| 2.2 | Monthly digest email (Mailjet reuse: template + schedule) | Mailjet, sendTemplateMail | Open rate, W2→W4 retention |
| 2.3 | Gap/SIP-skip alerts in-channel (email now, WhatsApp later) | `unfunded_expenses`, `skipped_sips` | Alert→app clicks |

## Phase 3 — Channel B (community / 1% Club style)

| # | Item | System reuse | Success signal |
|---|---|---|---|
| 3.1 | Template Packs (Retire at 45, NRI return, ₹12L blueprint) + showcase grid | share_object, public share pages | Forks per template |
| 3.2 | Creator collab: annual review card (shareable OG image) | engine, milestone data, OG pipeline | Shares/backlinks |
| 3.3 | Reddit/Telegram launch posts w/ live demos | citation docs as pitch deck | Signups per post |

## Phase 4 — SEO magnets

| # | Item | System reuse | Success signal |
|---|---|---|---|
| 4.1 | Public calculators (no login): savings rate, FIRE number, prepay-vs-invest | engine (read-only public compute) | Organic sessions |
| 4.2 | Calculator → "build full plan" conversion CTA | signup flow | Signup rate from calc pages |

## Phase 5 — Capability gaps (bigger lifts, schedule after 1–4)

| # | Item | Why |
|---|---|---|
| 5.1 | Joint / multi-user plans | couples persona (highest-LTV gap per research) |
| 5.2 | WhatsApp digest channel | India-native pull |
| 5.3 | PostHog (or adapt existing tracker) for self-driving-style insight | decide after wizard decision (currently reverted) |
| 5.4 | Free-tier limits for MCP agents | monetization + signup pressure (later) |

---

## Working agreements
- Branch-per-phase (or per-item for 1.x), PR + merge flow as before.
- Every item = one small PR, verified by eslint/tsc; no backend contract changes without tests.
- Metric instrumentation: reuse tracker (`src/lib/tracker.ts`); add PostHog only when Phase 5.3 decision is taken.
- Update this file's checkboxes/timestamps when an item ships.

# Fi-Plan Next

A single Next.js (App Router, TypeScript) application that combines a 1:1 port of the **fi-plan-fe** frontend
(Vue 3 → React) with an embedded TypeScript re-implementation of the **findependence-core** backend, architected
so the server can be extracted into a standalone service later.

## What is Fi-Plan?

A financial-planning dashboard: define income/expense cashflows, accounts, loans, and fund-distribution
strategies across a 600-month timeline, then simulate projected balances, EMIs, runway, and net worth.
Plans can be shared as public templates and forked by other users.

## Stack

- **Frontend:** Next.js 15 App Router, React 19, TypeScript, Tailwind v4, Zustand, react-chartjs-2,
  @headlessui/react, react-hook-form + yup, shepherd.js, mixpanel-browser, @sentry/nextjs.
- **Backend (embedded):** clean-architecture layers under `src/server/` — domain → application → infrastructure
  → presentation → http, with a composition root (`di/container.ts`). MongoDB (raw driver, shared Atlas DB with
  the original backend), Mailjet email, Google OAuth.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Configuration lives in `.env.local` (gitignored) — copy values from `findependence-core/.env` and the
fi-plan-fe tracker keys. See `.env.example` for the full variable list.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | production build / serve |
| `npm run lint` | ESLint |
| `npm run standalone` | boot the embedded server standalone on a raw port (extraction proof) |

## Architecture

```
app/                             # Next.js App Router (thin transport layer)
├── (app)/plan|plans|profile|shared_templates|edit|compare/   # auth-guarded pages
├── login/ forgot_password/ link_page/ onboarding/            # public pages
└── api/[[...path]]/route.ts     # single catch-all handler → buildApp().fetch(req)
src/
├── server/                      # ★ embedded backend — 100% extractable
│   ├── domain/                  # entities + repository ports
│   ├── application/             # use cases
│   ├── infrastructure/          # Mongo repos, Mailjet, OAuth, crypto
│   ├── presentation/            # framework-agnostic controllers
│   ├── http/                    # buildApp() — routes + middleware
│   ├── di/                      # buildContainer(env) — composition root
│   ├── engine/                  # financial simulation (ported from fi-plan-fe)
│   └── config/                  # typed, zod-validated env
├── lib/                         # api client, formatting, dates
├── components/                  # React port of the Vue components
├── store/                       # Zustand store (mirrors the Vuex store)
└── hooks/                       # usePlanEngine, useRunway, useBalanceSeq, useWalkThrough
standalone/server.ts             # future standalone service (npm run standalone)
```

**Extraction rules:**

- `src/server/**` has **zero** `next/*` imports. The only Next.js file touching the server is
  `app/api/[[...path]]/route.ts`.
- Dependency rule: `domain ← application ← infrastructure ← presentation ← http`. Nothing inward imports outward.
- `buildApp()` (routes + middleware) and `buildContainer(env)` (wiring) are the only entry points.
- Controllers are pure functions: `(httpRequest) → { statusCode, body, cookies }`.

## Key differences from the original apps

- **Engine moved server-side:** the financial simulation runs in the embedded backend; the UI fetches computed
  statements via `POST /engine/plan_snapshot` (instead of `usePlanEngine` running client-side in the Vue app).
- **Fixed original bugs:** `/income/add` and `/expense/add` no longer drop `end_month`; `/user/onboard` no longer
  leaks `credentials`; the share-object delete ownership check now works; cashflow `_id` handling normalized.
- **Withdrawal policy:** outflows (expense/EMI/prepayment shortfalls and SIP funding) drain a user-set
  `withdrawal_order` (first = drained first; defaults to savings → emergency → investment). SIP instalments are
  funded from the asset's funding account first, then the ladder, and are **skipped** (marked `sip_skipped`,
  excluded from asset value) when the ladder cannot cover them — balances never go negative. The emergency bucket
  is protected from SIP top-ups by default (`withdrawal_settings.protect_emergency_for_sip`, toggle in the
  Withdraw Order editor).
- **Preserved quirks:** coded errors still return HTTP 200 with `status: 'error'` (API compatibility);
  session cookie overrides the `auth-token` header; `/get/share_object` stays public.

## Docs

- `docs/backend-reference.md` — endpoint inventory, data model, auth, OAuth/reset flows, quirks.
- `docs/frontend-reference.md` — routes, store mapping, component inventory, tracker, engine entry points.

## Environment variables

See `.env.example`. Required for a full run: `DB_URL`, `DB_NAME`, `CLIENT_APPLICATION`, `COOKIE_SECRET`,
`COOKIE_SEC`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PASSPORT_CALLBACK_URL`, `MJ_APIKEY_PUBLIC`,
`MJ_APIKEY_PRIVATE`, `SUPPORT_MAIL`, `MAILER_NAME`. Optional: `DEFAULT_PLAN_DURATION` (600),
`SESSION_TIMEOUT` (24h), `PW_RESET_SESSION_LENGTH` (30min).

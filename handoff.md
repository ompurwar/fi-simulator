# Fi-Plan Next — Port Handoff

## Goal
Port the Vue/Vite frontend (`fi-plan-fe`) to Next.js (`fi-plan-next`), matching the original
UI pixel-for-pixel. Strategy: read the original Vue source, translate Tailwind classes 1:1 into
the React/Next components, screenshot both apps, compare, adjust, repeat.

## Original frontend location
`D:\projects\personal-projects\node\findependence\fi-plan-fe`
- Pages: `src/pages/*.page.vue` (login, plan, compare_plan, profile, shared_template, onboard_share_link, forgot_password)
- Key plan-page components: `src/components/month_slider/MonthSlider.vue`,
  `src/components/balance_and_txn_by_month/BalanceAndTxn.vue`,
  `src/components/balance_and_txn_by_month/MonthlyIncomeExpense.vue`,
  `src/components/income_expense_and_net_cahsflow/IncomeExpenseAndNetCashflowStatement.vue`,
  `src/components/charts/MyChart.vue`, `src/components/transactionsListCard.vue`

## Ported project
`E:\fi-plan-next` (this repo; note the handoff previously said D: — the port now lives on E:)

### Running the apps
- **Backend (original findependence-core)** — `cd findependence-core && CLIENT_APPLICATION=http://localhost:8080 npm start` (port 3000; CORS must allow 8080)
- **Original frontend** — `cd fi-plan-fe && npx vite --port 8080 --host`
- **Ported (prod preview)** — `PORT=3001 npm start`
- Login test creds: `pixelcheck-204230@test.com` / `secret123`
- Fresh (non-onboarded) user for onboarding wizard: `parity-onb-0815@test.com` / `secret123`
- Screenshots + compare tooling: `E:\fi-plan-next\standalone\` (`compare-pngs.mjs`, `dump-dom.mjs`, `diff-doms.mjs`, `sample-pixels.mjs` — grid pixel-diff via `agent-browser eval --stdin`)

### Parity status (desktop viewport 1262×624 / mobile 390×844, pixel-diff %)

| Page | Desktop | Mobile | Notes |
|---|---|---|---|
| login | 0% | 0.01% | carousel timing inflates diff unless screenshots synced |
| onboarding | 0.06–0.17% (all stages) | — | fresh-user wizard; currency grid matches original's buggy sort |
| profile | 0.04% | 0.09% | |
| shared_templates | 0.05% | 0.08% | |
| link_page | 0.01% | 0.03% | |
| forgot_password | 0.01% | 1.25% | |
| plan | 9.6% | 6.2% | chart.js v3→v4 canvas rendering differences (bars/ticks) |
| compare | 5.6% | — | ported engine returns month-1 balance where original has 0 (backend biz-logic diff, not UI) |

### Remaining gaps
1. **Chart internals (plan ~9.6%, compare partial)** — chart.js v4 renders bars/ticks slightly
   differently than the original's v3 (antialiasing, tick placement). Colors/labels/annotation
   now match (CSS vars read at runtime — old gap #2 done).
2. **Port engine month-1 balance** — `usePlanEngine` fetches `/engine/plan_snapshot` from the
   ported backend; the original computes client-side. Month-1 emergency balance differs
   (visible in compare page chart). Needs engine-level comparison.
3. **Cypress** — machine-level crash (`Illegal instruction` in the Electron binary) on this
   Windows machine; needs a reboot before `npx cypress run` works. `vitest` unit tests pass (18/18).
4. **Mobile onboarding/compare** — not yet verified at mobile viewport.

### Systemic fixes applied (apply to any future page port)
- Tailwind v4 `@layer base` sets `border-color: #e5e7eb` (v3 default) — v4 defaults to currentColor
- Body: `font-montserrat font-medium bg-[#f8f9fa] text-dark-600` (index.html + App.vue root)
- dark/warning/accent palettes in `app/globals.css` copied from the original `src/index.css` (not Tailwind defaults)
- AppShell: `flex gap-5` wrapper around the `md:mt-16 md:px-2` ErrorBoundary wrapper (prevents margin collapse) and loads profile+plans on public pages when a session exists
- `DisplayAmount` prefers `window.navigator.language` (original `get_local` order) — en vs en-IN compact notation differs (150K vs 1.5L)
- `Button` is a 1:1 port of Button.vue: no built-in padding (call sites pass px/py), `border-2` always, outline/solid variant maps
- Trailing-dash Tailwind classes (`mt-[32rem]-`, `grow-`, `mt-11-`, …) are dead classes in v3 — port them as dead too (or drop them), never "fix" them
- `collapsed` in MonthlyIncomeExpense.vue is hardcoded `true` → the breakdown list never renders

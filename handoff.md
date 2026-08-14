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
`D:\projects\personal-projects\node\findependence\fi-plan-next`

### Running the apps
- **Ported (prod preview)** — terminal 1: `cd fi-plan-next && PORT=3001 npm start`
- **Browser automation** — `agent-browser open http://localhost:3001/login` etc.
- Login test creds: `pixelcheck-204230@test.com` / `secret123`
- Screenshots: `E:\fi-plan-next\standalone\*.png`

### Current status — plan page (`app/(app)/plan/page.tsx`)
DONE — structural parity with original three-column dashboard:

| Section | Status | Notes |
|---|---|---|
| Left manager sidebar (5 tiles + badges) | ✅ | Income/Expense/Loan/Money/Tax with count badges, "Coming Soon" pill |
| MonthSlider | ✅ | Year label + Jan–Dec buttons, chevron/angle nav, current month highlighted |
| Income / Expense cards | ✅ | Icon + count badge, currency value, pct% vs last month, compact/standard notation |
| Net Cashflow card | ✅ | Icon, value, pct vs last month |
| Monthly Statement (mobile + desktop) | ✅ | Income/Expense breakdown with change arrows |
| Net Worth chart (desktop) | ✅ | Dark card, stacked bars, legend (Investment/Savings/Emergency), chevrons, month label |
| Wealth chart (mobile) | ✅ | Below MonthSlider for md:hidden |
| Runway card | ✅ | Runway months/yrs + strategy pill, Net Worth, Burn Rate |
| Account cards | ✅ | Category icon, acc name, balance, ROI %, transaction variance |
| Right transactions sidebar | ✅ | Month list with Income/Expense/Net per month |
| Simulation modal | ✅ | "Setting up plan" spinner |
| Header (plan title + action buttons) | ✅ | Compare / Save / Share / Tour |

### Remaining gaps (to address next)
1. **Account card icons** — fallback rendering on some categories; verify `b.category` values.
2. **Chart colors** — original uses CSS vars (`--color-dark-300`, `--color-accent-600`,
   `--color-primary-400`). Currently hardcoded rgba; should read CSS vars at runtime.
3. **Mobile cockpit popover** — the "Cockpit" Popover (hamburger gauge on mobile) needs
   click-to-open verified.
4. **Walkthrough** — original fires a Shephard.js tour on first load; ported uses a simple
   simulation modal. Low priority unless parity required.
5. **Remaining pages** — onboarding, compare, profile, shared_templates, link_page still need
   porting & screenshot comparison.

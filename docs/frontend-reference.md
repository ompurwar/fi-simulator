# Frontend Reference (fi-plan-fe → Next.js)

This document records the Vue 3 frontend structure (routes, store, components, tracker, engine entry points)
that the Next.js port in `app/`, `src/components/`, `src/store/`, `src/hooks/` mirrors 1:1.

## 1. Routes

Single flat Vue Router array; auth is enforced globally in `router.beforeEach` — whitelist
`['/link_page', '/forgot_password', '/login']` pass through, every other route requires
`business_logic_layer.UserLogic.IsLoggedIn()` (localStorage `'ob-data'` check via `/check/session`),
redirecting to `/login` when false. Every navigation fires `Track(EVENT_TYPES.PAGE_VISIT)`.

| Path | Component | Query params |
|---|---|---|
| `/login` | `login.page.vue` | `?mode=` (login\|signup), `?sid=` (stored to localStorage `"sid"` → redirect `/link_page?sid=`) |
| `/edit` | `GodPlanEntity.vue` | none |
| `/plans/compare` | `compare_plan.page.vue` | `?p_ids=` (comma-joined plan ids, max 3) |
| `/link_page` | `onboard_share_link.page.vue` | `?sid=` (share-object id) |
| `/plan` (+ path param `/plan:p_id`) | `plan.page.vue` | `?p_id=` (duplicate route name `'plan'`) |
| `/` | redirect → `/plan` | — |
| `/shared_templates` | `shared_template.page.vue` | builds `?p_id=`/`?p_ids=`; pushes `/link_page?sid=` |
| `/profile` | `profile.page.vue` | pushes `/plan?p_id=` |
| `/forgot_password` | `forgot_password.page.vue` | `?mode=` (init\|rst), `?rst_ses=` (reset session) |
| `/onboarding` | `onboardingPanel.vue` | `?oauth_signup=success` |

## 2. Vuex store → Zustand mapping

**Flat, single store — no modules.** State: `plan, logged_in, is_on_board, ob_params, profile, plans,
plan_duration(600), currency(''), local('en-IN'), selected_plan_id(''),
god_plan_entity{active,plan_id,entity_type,entity_id,meta_data,sub_entity_type},
auto_save_enabled(true), plan_component_state('closed'), plan_synced_map({}),
share_data{modal_state,ids,type,category}, published_templates([])` (`common_collection` added lazily).

**Getters → Zustand selectors:** `get_published_templates, get_currency_symbol, get_share_data,
get_plan_sync_state, get_plan_component_state, get_selected_plan_id, get_god_plan_entity, get_currency,
get_local, is_on_boarded, get_profile, get_email, get_username, get_profile_image, GetObParams, GetPlan,
get_plans, GetPlanById, common_collection, common_collection_items, get_common_collection_text`.

**API-calling actions → endpoint (all POST, body `{data:{...}}`):**

| Action | Endpoint |
|---|---|
| `sync_plan` | `/plan/update` (+ `PLAN_UPDATED` track) |
| `refresh_plan_list` | `/get/plan` |
| `set_common_collection` | `/get/common_collection` |
| `set_currency` | local only |
| `add/update/delete_cashflow`, `_cashflow_change`, `_fund_distribution_percentage`, `_account`, `_loan_account` | `/plan/update` (whole-doc) |
| `create_plan` | `/plan/add` |
| `fork_plan` | `/plan/fork` |

**Backend-layer namespaces:** `backend_layer = { User, Plans, CommonCollection, ShareObject }`
(`src/core/backend_com/remote_end_points.js`): `USER` → `/user/get/profile`, `/user/set_default_plan`,
`/user/onboard`, `/login`, `/logout`, `/signup`, `/check/session`, `/password/update`,
`/password_reset_session/create`, `/reset_forgotten_password`; `COMMON` → `/get/common_collection`;
`PLANS` → `/get/plan`, `/plan/add`, `/plan/update`, `/plan/delete`, `/plan/fork`;
`SHARE_OBJECT` → `/get/share_object`, `/get/share_object_details`, `/share_object/create`,
`/share_object/optin`, `/share_object/delete`.

## 3. API wrapper

Two stacked wrappers (ported to `src/lib/api.ts`):

- **`http_wrapper.js`** — raw axios client: `baseURL: VITE_API_BASE_URL || ''` (dev `http://localhost:3000`),
  header `authtoken`, `withCredentials: true`; `Get/Post/UploadData/UpdateAuthToken`.
- **`fi_plan_http_wrapper.js`** — unwraps `{status, data, error}`: on `status == 'success'` returns `data`,
  otherwise throws `FiPlanServerHttpError('', {...error})` (extends `Error`, sets `.code`).
- **POST body convention:** every endpoint receives `{ data: {...} }`.
- **Env → server link:** `NodeEnvToAppENV` (development→dev, test→quality, production→prod);
  dev → `http://{location.host}:3000`, quality/prod → `https://zapi.fi-plan.com`.

## 4. Components (one line each)

**`account/`** `AccountCommand.vue` — create/edit account form; `AccountCard.vue` — account card with ROI/balance.
**`account_editor/`** `AccountEditor.vue` — account management panel.
**`balance_and_txn_by_month/`** `BalanceAndTxn.vue` — runway/net-worth/account-balance + per-account txn cards (live);
`BalanceAndTxnByMonth.vue` — legacy month table (used only by DetailsForm + dead copy);
`MonthlyIncomeExpense.vue` — monthly income/expense delta card with chart.
**`button/`** `Button.vue` — themeable button.
**`cashflow/`** `CashflowCommand.vue` — add/edit income/expense form; `CashflowCard.vue` — cashflow row with changes.
**`cashflow_change/`** `CashflowChangeCommand.vue` — hike/inflation form; `CashflowChangeCard.vue` — change row.
**`charts/`** `MyChart.vue` — chart.js wrapper (bar/line/doughnut, annotation, hover emit).
**`flipper/`** `TextFlipper.vue` — rotating text animation.
**`fund_distribution_percentage/`** `FundDistributionPercentageCommand.vue` — FDP strategy form;
`FDPCard.vue` — FDP row; `FDPEditor.vue` — FDP panel w/ chart.
**`general_ui_components/`** `modal.ui.vue` — modal/dialog wrapper.
**`god_plan_entity/`** `GodPlanEntity.vue` — "god mode" edit page (route `/edit`).
**`income_and_expense_editor/`** `IncomeAndExpenseEditor.vue` — income+expense manager panel.
**`income_expense_and_net_cahsflow/`** `IncomeExpenseAndNetCashflowStatement.vue` — month-by-month income/expense/net statement (live);
`MonthlyBreakdown.vue` + `NetMonthlyCashflow.vue` — **dead duplicates** of the `monthly_breakdown/` pair.
**`loan_account/`** `LoanAccountCommand.vue` — loan form; `LoanCard.vue` — loan card w/ EMI.
**`loan_editor/`** `LoanEditor.vue` — loan panel (EMI schedule, amortization chart).
**`logo/`** `Logo.vue` — brand logo, navigates `/` on click.
**`month_slider/`** `MonthSlider.vue` — timeline month slider.
**`monthly_breakdown/`** `MonthlyBreakdown.vue` — month-by-month income/expense breakdown table (live);
`NetMonthlyCashflow.vue` — net-cashflow-per-month table (live).
**`monthlyPlanDetails/`** `monthlyPlanDetails.vue` — **dead** legacy page (commented router lines).
**`notification/`** `NotificationList.vue` — toast stack + `FireNotification`/`ClearAllNotifications`;
`SingleNotification.vue` — one toast.
**`onboarding/`** `onboardingPanel.vue` — onboarding wizard (route `/onboarding`).
**`plan/`** `CreatePlan.vue` — create/fork-plan modal; `ComparablePlanWidget.vue` — one-plan comparison widget;
**`ComparablePlanWidget copy.vue` — dead duplicate.**
**`planOverview/`** `planOverviewPanel.vue` + `anualStatCard/anualStatsCard.vue` — **dead** legacy overview chain.
**`pwa/`** `ReloadPwa.vue` — PWA update/offline prompt.
**`share_object/`** `ShareObject.vue` — create-share-link modal; `ViewShareObject.vue` — public share landing (`/link_page`).
**`validated_inputs/`** `ValidatedInput.vue` — validated email/password/name input.
**Root:** `DisplayAmount.vue` — currency-formatted amount; `ErrorBoundary.vue`; `inputField.vue` — generic onboarding field control;
**dead:** `DetailsForm.vue`, `Chart.vue`, `balanceList.vue`, `balanceSummeryCard.vue`, `transactionsListCard.vue`, `__tests__/HelloWorld.spec.js`.

## 5. Tracker (`src/tracker/tracker.js`)

- **Mixpanel:** dev token `c7762ddf7c3c01a14c7dcd6352dada64` (debug on), prod token `b18c53aed7d5b2f40b4496e9dc16ce0f` (debug off); `ignore_dnt: true`.
- **GA4:** `G-PJRSSJL6NS` — loaded **only in production**.
- **Meta Pixel:** ID `552842670124836` — **production-only**.
- **Gating:** `Track()` early-returns unless `NODE_ENV === 'production'`.
- **EVENT_TYPES:** `SIGN_IN, SIGN_UP, COMPLETED_ONBOARDING, PLAN_CREATED, PLAN_UPDATED, COMPARE,
  TEMPLATE_SHARED, TEMPLATE_BOARDED, PAGE_VISIT, PLAN_SWITCHED (TBD), LOAN_ADDED, LOAN_REMOVED,
  CASHFLOW_ADDED, CASHFLOW_REMOVED, ADD_PLAN_TO_COMPARE` (two keys defined twice — duplicates).

## 6. Business logic / composables → server engine + hooks

**`src/core/business_logic/index.js` exports** `{ MonthlyExpenseStatement, MonthlyIncomeStatement,
FundDistributionPercentage, Account, TransactionLogic, LoanEngine, UserLogic }`:

- `process/get_monthly_expense_statement.service.js` — per-month expense statement.
- `process/get_monthly_income_statement.service.js` — per-month income statement.
- `process/cahsflow_change.js` — expands changes across months by frequency (m/q/h/y).
- `process/fund_distribution_percentage.js` — FDP overlap validation + CRUD.
- `process/account.js` — account validate/CRUD.
- `process/transctions.js` — `TransactionLogic`: `GenerateTransactionsAndAccountBalances`,
  `AggregateBalanceAndTransactionsByMonth`, `OpenAggregation`, `ComputeAvgExpense`; allocation strategies
  (War Chest / Savings / Balanced Growth / Hyper Growth). (Port: `src/server/engine/transactions.ts`)
- `process/loan.js` — `LoanEngine`: EMI, amortization schedule, loan CRUD, restructure, schedule→cashflow.
  (Port: `src/server/engine/loan.ts`)
- `process/onboarding.js` — `BuildOnboardingStage`, `ONBOARDING_DATA_INPUTS`, currency options.
- `process/user.js` — `UserLogic`: Signup/Login/IsLoggedIn (401→false)/UpdatePassword/CreateForgotPasswordSession/
  ResetForgottenPassword/SetDefaultPlan/Logout.

**Composables (ports: `src/hooks/`):**

- `plan_engine.composable.js` → `usePlanEngine(plan_object, duration, state_list)` returns
  `{ income_list, expense_list, account_list, loan_account_list, emi_schedule,
    income_expense_and_net_cashflow, balance_and_transaction_by_month,
    account_balances_and_transactions, aggregated_account_balances_and_transactions_by_month,
    cashflow, UpdateDuration }` — in the port this data comes from the server via
  `POST /engine/plan_snapshot` (hook: `src/hooks/usePlanEngine.ts`).
- `balance.composable.js` → `useBalanceSeq(balances)` → `{ account_balances }` sorted e→s→i.
- `runway.composable.js` → `useRunway(expense_statement, account_balances, month)` →
  `{ avg_expense, runway, net_worth }`.
- `walk_through.composable.js` → `useWalkThrough()` → `{ tour, SetProgress }` (Shepherd tour).

## 7. Walkthrough / design tokens / Sentry

- **Walkthrough:** `src/walk_thorughs/plan_page_walkthrough.steps.js` — `GenerateWalkThroughStepsForPlan({...refs})`
  → 9 Shepherd steps (Cockpit/Input panels, Income & Expense Manager, Loan Manager, Money Manager, Timeline,
  Cashflow & Monthly Breakdown, Plan Details, Accounts, Compare); responsive (sm vs md).
- **Design tokens** (`tailwind.config.js`): screens `xs:320, sm:390, md:768, lg:992, xl:1200, 2xl:1400`;
  colors `primary/success/danger/warning/accent/dark` (50–900) mapped to CSS vars;
  fonts `exo2, inter, montserrat, balsamiq-sans`; `:root` success/primary=emerald, danger=red, warning=amber,
  dark=slate, accent=cyan; component classes `.card`, `.input-filed`; thin scrollbar.
- **Sentry** (production only): dsn `https://b4b4275e9e5840d692a2e44872a37ceb@o1338367.ingest.sentry.io/6609151`;
  `BrowserTracing` (tracingOrigins `["localhost","app.fi-plan.com",/^\//]`) + `Replay`;
  `tracesSampleRate: 1.0`, `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`.

## 8. Dead code — not ported

- **Dead/duplicate components:** `plan/ComparablePlanWidget copy.vue`, `income_expense_and_net_cahsflow/
  MonthlyBreakdown.vue` & `NetMonthlyCashflow.vue` (dupes), `views/home.vue`, `DetailsForm.vue`, `Chart.vue`,
  `monthlyPlanDetails/`, `planOverview/` (+`anualStatsCard/`), `balanceList.vue`, `balanceSummeryCard.vue`,
  `transactionsListCard.vue`, broken `__tests__/HelloWorld.spec.js`.
- **Dead JS:** `transctions copy.js`, `src/core/engine.js`, `src/core/independence-ingine.js`,
  `src/core/finplan-engine.tests.js`.
- `PLAN_SWITCHED` tracker event is marked "feature level TBD in future".

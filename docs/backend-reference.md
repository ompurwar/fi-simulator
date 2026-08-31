# Backend Reference (findependence-core → src/server)

This document records the endpoint inventory, data model, auth mechanism, and quirks of the original
`findependence-core` backend, and how the port in `src/server/` preserves (or fixes) them.

## Stack

- **Original:** Express 4 (ESM) + Passport (Google OAuth2) + MongoDB 3.7 driver + Mailjet + serverless-http (AWS Lambda).
- **Port:** framework-agnostic controllers (`presentation/`) + clean-architecture layers in `src/server/`, mounted
  inside Next.js via `app/api/[[...path]]/route.ts` or standalone via `standalone/server.ts`.

## 1. Endpoint inventory

All business routes are **POST** with a JSON body shaped `{ "data": { ... } }`.

### Raw routes (no envelope, not auth-wrapped)

| Method | Path | Behavior |
|---|---|---|
| GET | `/alive` | returns `"I AM AlIVE!!"` |
| GET | `/` | returns `"success"` |
| GET | `/session` | returns the passport/express-session payload |
| GET | `/failed` | OAuth failure landing — `"oauth failed"` |
| GET | `/oauth/google` | redirect to Google (`scope: profile,email`) |
| GET | `/oauth/google/callback` | OAuth callback (§6) |

### Wrapped routes (controller → use case)

| Method | Path | Controller | Notes |
|---|---|---|---|
| POST | `/login` | LoginController | |
| POST | `/signup` | SignupController | |
| POST | `/logout` | LogoutController | does not clear the cookie |
| POST | `/check/session` | IsLoggedInController | validates session only |
| POST | `/plan/add` | AddPlanController | auto-builds defaults (§9) |
| POST | `/plan/update` | UpdatePlanController | whole-document update |
| POST | `/plan/delete` | DeletePlanController | |
| POST | `/get/plan` | GetPlanController | returns all plans for the user |
| POST | `/plan/fork` | ForkPlanController | ownership bypass with share_id (§8) |
| POST | `/income/add` | AddIncomeController | **broken in original** (§8) |
| POST | `/income/update` | UpdateIncomeController | |
| POST | `/income/delete` | DeleteIncomeController | |
| POST | `/get/income` | GetIncomeController | |
| POST | `/expense/add` | AddExpenseController | **broken in original** (§8) |
| POST | `/expense/update` | UpdateExpenseController | |
| POST | `/expense/delete` | DeleteExpenseController | |
| POST | `/get/expense` | GetExpenseController | |
| POST | `/user/get/profile` | GetUserController | strips `_id`, `credentials` |
| POST | `/user/onboard` | OnboardUserController | **leaks credentials in original** (§8) |
| POST | `/user/set_default_plan` | SetDefaultPlanController | |
| POST | `/get/common_collection` | GetCommonCollectionController | |
| POST | `/share_object/create` | AddShareObjectController | forks plans (§10) |
| POST | `/get/share_object` | GetShareObjectController | public; `filter_by: creator_id|share_id|popularity` |
| POST | `/get/share_object_details` | GetShareObjectController | same controller |
| POST | `/share_object/optin` | OptinShareObjectController | forks plans + increments onboard_count |
| POST | `/share_object/delete` | DeleteShareObjectController | ownership check broken in original (§8) |
| POST | `/share_object/update` | UpdateShareObjectController | **not registered in original** |
| POST | `/password/update` | UpdatePasswordController | rotates credentials + new session cookie |
| POST | `/password_reset_session/create` | InitiateResetPasswordSessionController | public; email with reset link |
| POST | `/reset_forgotten_password` | ResetForgottenPasswordController | public; no new session |

The port adds one new endpoint consumed by the Next.js UI:

| Method | Path | Controller | Notes |
|---|---|---|---|
| POST | `/engine/plan_snapshot` | PlanSnapshot | simulation output (`usePlanEngine` parity) |

## 2. Auth whitelist

The original `Authenticate()` skips session lookup for these exact paths:

```
'login', 'login/', '/login', '/login/',
'signup', '/signup', '/signup/', 'signup/',
'/get/share_object',
'/password_reset_session/create',
'/reset_forgotten_password'
```

Notes:

- `/get/share_object` is public; the controller dereferences `session` (which is `true`), so `filter_by: 'creator_id'` fails with 401 — only `share_id` and `popularity` work anonymously.
- Every other route (including `/check/session`, `/logout`) requires a valid session.
- The `Use_Case_Access_Matrix` collection is imported but never queried (dead dependency in the original).

**Auth mechanism:** token from header `auth-token`, **overridden** by signed cookie `session_id` if present.
Session validated via `FindByActiveSessionId` → `Session_Store` with `{ session_id, state: true, status: 'active', timeout: { $gt: Date.now() } }`.

## 3. Response envelope

Success:

```json
{ "status": "success", "error": null, "data": <payload> }
```

Error:

```json
{ "status": "error", "error": { "msg": "...", "code": 401 }, "data": null }
```

**Quirk preserved in the port:** every error with a `code` returns **HTTP 200**; only errors without a `code`
return 500. Messages for `code === 500` or missing code are masked to `'An unknown error occurred.'`.

Error codes: `400` invalid/required property, `401` auth/unauthorized/invalid operation, `404` user not found,
`500` internal (masked), `601` duplicate email.

## 4. Session auth

- `session_id` = 24-char lowercase hex (`SESSION_ID_LENGTH` unset → 24).
- `timeout` = `Date.now() + SESSION_TIMEOUT hours` (24h default); **not sliding** — activity does not extend it.
- Cookie: `session_id` HMAC-signed with `COOKIE_SECRET`, options `{ maxAge: 24h, secure: true, signed: true, sameSite: 'none' }`.
- Logout sets `state: false` (soft delete); the cookie is not cleared in the original.
- Password change (`/password/update`) rotates credentials and issues a **new** session cookie; old sessions remain valid until timeout.

## 4b. JWT access/refresh auth (newer — dual-mode with §4)

On top of the legacy session, login/signup also issue a JWT pair (cookies `fp_access` + `fp_refresh`):

- **Access token** — HS256 JWT (`sub`, `jti`, `iat`, `exp`, `token_version`), signed with `JWT_SECRET` (falls back to `COOKIE_SECRET`), lifetime `ACCESS_TOKEN_TTL_MIN` (default **15 min**). Cookie `fp_access`, `Max-Age=900`, `Path=/`.
- **Refresh token** — opaque `fp_rt_…`, stored **hashed only** in `Auth_Token_Store`, lifetime `REFRESH_TOKEN_TTL_DAYS` (default **30 days = 1 month**). Cookie `fp_refresh`, httpOnly, `Path=/api/auth` (sent only on refresh calls).
- **Verification** = JWT signature + expiry, then a DB lookup of the access row (`jti`, `status: active`, `expires_at`) and a `token_version` match against the user — every token keeps a DB row so it can be revoked later.
- **`POST /auth/refresh`** (whitelisted) rotates the refresh token (single-use: the old one is revoked, a new pair is issued).
- **Logout** revokes the access `jti` + refresh hash and clears both cookies. **Password change** revokes everything (rows + `token_version` bump).
- `Authenticate` accepts the JWT (`fp_access` cookie, `Authorization: Bearer`, or a JWT-shaped `auth-token` header) first, then falls back to the legacy `session_id` cookie/header — rollout dual-mode. Auth failures surface as the standard 200 + `{ error: { code: 401 } }` envelope; the frontend rotates the refresh token and retries once.
- Vercel note: tokens live in Mongo (authoritative for revocation) — Vercel KV/Edge Config are **not** used; Edge Config is read-only and client-visible, unsuitable for tokens.

### `Auth_Token_Store`

```js
{ _id, kind: 'access'|'refresh', jti /* access lookup key */,
  token_hash /* refresh hash only */, user_id, created_at, expires_at,
  status: 'active'|'revoked', revoked_at }
```

### `User_Profiles.token_version`

Incrementing counter (default 1) bumped whenever all sessions are revoked (password change / revoke-all) — instantly invalidates every outstanding access JWT.

## 5. Database collections

DB name from `DB_NAME` (default `findependence`). Shared Atlas DB with the original — plans are interchangeable.

### `User_Profiles`

```js
{ _id, first_name, last_name, email /* lowercased, unique */,
  credentials: { salt /* 10 hex */, hash /* HMAC-SHA256 */ },
  photos: [], src: 'std'|'google', default_plan_id: '', ob_params: {},
  timestamp: Date.now() }
```

### `Session_Store`

```js
{ _id, user_id, session_id /* 24 hex */, status: 'active'|'deleted',
  timeout: epoch_ms, state: Boolean, timestamp: BSON Timestamp }
```

### `Plan_Store`

```js
{ _id, user_id, title, description, category: 'std'|'t-i'|'t-c',
  account_list: [Account], loan_accounts: [LoanAccount],
  cashflow_list: [CashFlow | ObjectId],   // MIXED — see quirks
  cashflow_change_list: [CashFlowChange],
  fund_distribution_percentage: [FundDistribution],
  share_id: ObjectId|null, parent_id: ObjectId|null,
  status: 'active'|'deleted', timestamp, modified_at }
```

- **Account:** `{ _id: 6-hex, title, init_balance, category: 's'|'e'|'i', type: 'a'|'l', default_investment_priority, parent_id, roi }`
- **CashFlow:** `{ _id: 6-hex, category: 'i'|'e', type: 'o'|'p', frequency: 'm'|'y'|'q'|'h'|null, amount, desc, start_month, end_month, active, primary }`
- **LoanAccount:** `{ _id: 6-hex, title, principal_amount, interest_rate, start_month, end_month, ref_id, type: 1..5 }`
- **FundDistributionPercentage:** `{ _id: 6-hex, start_month, end_month, s, e, i }` with `s+e+i === 100`

### `Cash_Flow_Store`

```js
{ _id: 6-hex /* NOT an ObjectId */, user_id, plan_id,
  category: 'i'|'e', type: 'o'|'p', frequency: 'm'|'y'|'q'|'h'|null,
  amount, desc, start_month, end_month, active, primary,
  status: 'active'|'deleted' }
```

### `Cash_Flow_Change_Store`

```js
{ _id: ObjectId, user_id, cashflow_id, category: 'i'|'e',
  change_type: 'f'|'p', value /* % capped at 100 for 'p' */,
  start_month, end_month, frequency: 'm'|'y'|'q'|'h'|'o',
  active, status: 'active'|'deleted' }
```

### `Share_Object_Store`

```js
{ _id, type: 'template'|'blog-link', category: 't-i'|'t-c',
  state: 'public'|'private', title (≤500), description (≤500),
  promotional_links: [], creator_name, creator_id,
  img_url, onboard_count, plan_ids: [ObjectId],
  status: 'active'|'dormant'|'deleted', timestamp, modified_at }
```

### `Change_Pass_Session`

```js
{ _id, user_id, secret /* 16 hex */, expires_at: epoch_ms, used, status: 'active', timestamp, modified_at }
```

### `Common_Collection`

Free-form single document; only `status: 'active'` required. `GetCommonCollectionList()` returns the first active doc.

## 6. Google OAuth flow

1. GET `/oauth/google` → redirect to Google.
2. GET `/oauth/google/callback`:
   - `FindByEmail`:
     - **Existing user** → `LoginUseCase({ email, password: profile.id })` — works only for `src: 'google'` accounts; `std` users fail → redirect `/failed`.
     - **New user** → `SignUpUseCase({ first_name, last_name, email, password: profile.id, photos, src: 'google' })`.
   - Sets signed `session_id` cookie, redirects to `CLIENT_APPLICATION/onboarding` (existing) or `/onboarding?oauth_signup=success` (new).
3. `serializeUser`/`deserializeUser` pass the session through the express-session `connect.sid` cookie (secret `COOKIE_SEC`).

## 7. Password reset flow

1. **POST `/password_reset_session/create`** (public, `{ data: { email } }`):
   - `FindByEmail` → 404 if absent; 401 if `user.src !== 'std'`.
   - Creates `Change_Pass_Session` (secret 16-hex, expires +30 min).
   - Builds link `CLIENT_APPLICATION/forgot_password?mode=rst&rst_ses=<secret>` and sends Mailjet template **4418784** (`[Fi-Plan] Rest Password Link`).
   - In `NODE_ENV=dev`, sending is skipped but the flow succeeds.
2. **POST `/reset_forgotten_password`** (public, `{ data: { session_secret, new_password } }`):
   - `FindByUserIdAndSecret` → `'unauthorized session'` if none/already used; `'Oops! session expired! try again.'` if expired.
   - Rotates credentials, marks the reset session `used: true`. **No new login session is created.**
3. **POST `/password/update`** (auth, `{ data: { current_password, new_password } }`): rejects non-`std` users, validates current password, rotates credentials, issues a fresh `session_id` cookie.

## 8. Known quirks / bugs (original → port decision)

1. **`/income/add` and `/expense/add` drop `end_month`** — the controllers pass `start_month, start_month` and never forward `end_month`, so `MakeCashFlow` throws `RequiredParameterError` (400) — **these endpoints always fail in the original. Port decision: fix** (pass `end_month` through). Nothing depends on the bug.
2. **Errors return HTTP 200** whenever they carry a `code` — preserved for API compatibility.
3. **`/user/onboard` leaks `credentials.{salt,hash}`** — the controller's `delete` runs on the wrapper object. **Port decision: fix** (strip credentials before returning).
4. **`Cash_Flow_Store._id` mismatch** — entity stamps 6-hex `_id` but list ops convert with `MakeId` (24-hex ObjectId); updates/deletes on 6-char ids throw. `plan.cashflow_list` mixes embedded objects (from `/plan/add`) and ObjectIds (pushed by `/income/add`). **Port decision: normalize** to embedded cashflow objects in the plan document.
5. **`AddIncomeController` response omits `status`/`error` fields** — preserved shape is not required by the client; the port returns the standard envelope.
6. **Share-object ownership checks are broken** — `delete`'s `if (!share_object.creator_id === user_id)` never fires (any authenticated user can delete any share object); update's check always throws. **Port decision: fix** the delete check; update route stays unregistered (parity).
7. **Fork bypasses ownership** — `ForkPlanUseCase` only checks ownership when `share_id` is absent, so any authenticated user can fork any plan into a share object. **Port decision: preserve** (share flow depends on it).
8. **`/get/share_object` public + creator_id filter** — only `share_id`/`popularity` work anonymously; preserved.
9. **`/share_object/create`** — `delete result.creator_id` is a no-op; initial insert uses `plan_ids: []` then updates after forking (two writes). Preserved as-is.
10. **Cookie overrides `auth-token` header** when both present — preserved.
11. **`/session`, `/alive`, `/`, `/failed`, OAuth routes bypass the envelope** — preserved.

## 9. Plan add auto-build

`POST /plan/add` body: `{ data: { title, description, monthly_income, monthly_expense, runway } }`.

- Duration: `DEFAULT_PLAN_DURATION` (600 months).
- Two periodic monthly cashflows (only if the value is provided): income `{ category:'i', type:'p', frequency:'m', desc:'monthly income', primary:true }`, expense `{ category:'e', ..., desc:'monthly expense' }` over months 1–600.
- Three default asset accounts (`type:'a'`, `parent_id:null`):
  - **Emergency** — `init_balance = monthly_expense * runway`, `category:'e'`, priority 1, `roi:3`
  - **Saving** — `init_balance:0`, `category:'s'`, priority 2, `roi:5`
  - **Investment** — `init_balance:0`, `category:'i'`, priority 3, `roi:12`
- `/user/onboard` performs the same auto-build (income desc `'salary'`, title `'My first plan.'`).

## 10. Share object create / optin

**`/share_object/create`** (`{ data: { plan_ids, title, description, category, ... } }`):
1. Inserts share object with `plan_ids: []`, `onboard_count: 0`, `state: 'public'` (hard-coded PUBLIC in the original).
2. Forks each client-supplied `plan_id` in parallel via `ForkPlanUseCase({ plan_id, share_id, user_id: creator_id, category })` — clones the source plan into a new `Plan_Store` doc owned by the creator, `parent_id` = source id, `share_id` = share object id. No ownership check (share_id set).
3. Updates `plan_ids` to the cloned plan ids.
4. Returns `{ share_object, forked_plans }`.

**`/share_object/optin`** (`{ data: { share_id } }`):
1. Finds public share object (`FindByIds({ share_ids, state: 'public' })`).
2. Forks every `plan_ids` entry to the opting-in user.
3. `IncrementObCount` → `$inc: { onboard_count: 1 }`.
4. Returns `{ forked_plans }`; `'share_object not found'` otherwise.

**Reads:** `filter_by: share_id → FindByIds`, `creator_id → FindByCreatorId`, `popularity → GetTrendingShareObject({ max: 10 })` (sorted `onboard_count` desc).

## 11. Engine port (usePlanEngine parity)

New endpoint **POST `/engine/plan_snapshot`** (auth required) — given a plan + duration, returns:

```js
{
  income_list, expense_list, emi_schedule, cashflow,
  net_cashflow, fund_distribution_percentage_list,
  account_balances_and_transactions, balance_and_transaction_by_month
}
```

This is the client-side `usePlanEngine` output, now computed server-side in `src/server/engine/`:
`statements.ts` (income/expense statements), `transactions.ts` (balances + fund distribution + ROI),
`loan.ts` (EMI/amortization), `planSnapshot.ts` (orchestration), `utils.ts` (date math).

## 12. Environment variables

| Var | Purpose | Default |
|---|---|---|
| `DB_URL` | Atlas connection string | – |
| `DB_NAME` | database name | `findependence` |
| `CLIENT_APPLICATION` | frontend origin (OAuth redirect target) | – |
| `COOKIE_SECRET` | HMAC signing for `session_id` cookie | – |
| `COOKIE_SEC` | express-session secret (legacy OAuth) | – |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth | – |
| `PASSPORT_CALLBACK_URL` | OAuth callback URL | – |
| `MJ_APIKEY_PUBLIC` / `MJ_APIKEY_PRIVATE` | Mailjet | – |
| `SUPPORT_MAIL` / `MAILER_NAME` | email sender | – |
| `DEFAULT_PLAN_DURATION` | months per new plan | 600 |
| `SESSION_TIMEOUT` | session lifetime (hours) | 24 |
| `PW_RESET_SESSION_LENGTH` | reset link lifetime (minutes) | 30 |
| `NODE_ENV` | dev skips Mailjet sends | – |

# UI Polish & Improvement Brief — Asset Classes + Tax (for Antigravity)

This doc is the review + polish handoff for the recently merged feature work.
Read it end-to-end before touching any UI. Goal: make the new Asset Classes +
Tax surfaces polished and user-friendly **without breaking the 277 passing tests,
the verified tax math, or the original app's parity**.

---

## 1. What was shipped (context)

Merged PRs: **#11** (feature, commit `391dab8`) and **#13** (ops scripts).
Local `main` head: `53f01e0`. Node 22, Next.js 15 (app router), Tailwind v4,
Vitest, chart.js v4 (react-chartjs-2).

### 1.1 Backend (do NOT change semantics — tax math is verified against ClearTax examples)
- `src/server/tax/` — versioned India tax rules stored in MongoDB
  (`Tax_Rule_Store`, AY 2023-24 → 2026-27 + a `PRESETS` doc). Pure engine:
  `ComputeIncomeTax` (new/old regime, senior slabs, HRA, deductions, 87A rebate +
  marginal relief, surcharge, 4% cess), `ComputeCapitalGains` (112A ₹1.25L
  per-FY aggregate, foreign-equity no-exemption, property indexation option,
  crypto 30%), `ComputeSalaryNegotiation`, `MonthToAssessmentYear`.
- `src/server/engine/assets.ts` — asset projection: `MakeAsset` (10 classes:
  fd, bond, savings, gold, ppf, equity, equity_foreign, mf, real_estate, vda),
  `ProjectAssetMonths` (geometric growth, yield per frequency with
  compounding/payout, FD TDS past ₹40k, SIP step-up, maturity, sale → LTCG/STCG),
  `ComputeAssetSchedule`, `ComputeAssetScenarios` (±1σ bands), auto Income Tax
  expense with **TDS credit** (no double tax).
- Snapshot additions (only when plan has assets/tax — byte-compat enforced):
  `asset_month_map`, `asset_summary`, `asset_scenarios`, `tax_summary` (per
  assessment year), `bucket_growth`, `tax_expense_cashflow`.

### 1.2 MCP (56 tools)
- Asset tools: `list/add/update/delete_asset`, `import_networth_assets`,
  `update_tax_settings` (plan-level).
- Tax tools: `list/get_tax_rules`, `tax_calculation`, `salary_negotiation`
  (all users); `upsert_tax_rules`, `update_presets` (**admin only** — RBAC via
  `ToolDefinition.requiresRole`, enforced in `callRegistryTool`).
- Simulate patches: `add_asset`, `update_asset`, `sell_asset`, `set_salary`,
  `update_tax_settings`.

### 1.3 UI (the surfaces to polish)
| Surface | File |
|---|---|
| Asset editor (list + per-class form, rent/SIP/sale date) | `src/components/edit/AssetEditor.tsx` |
| Tax manager (settings, deductions, HRA, year-wise table, salary negotiation) | `src/components/edit/TaxManager.tsx` |
| Edit-page routing (`entity_type === "asset" | "tax"`) | `app/(app)/edit/page.tsx` |
| Plan page: Assets/Tax manager entries, Asset Mix doughnut, blended growth badges, net worth incl. assets, scenario totals | `app/(app)/plan/page.tsx` (manager sidebar ~line 590-640, `BalanceAndTxn` ~line 160-460) |
| Snapshot hook (new fields) | `src/hooks/usePlanEngine.ts` |
| API: negotiation, net-worth import | `app/api/tax/negotiation/route.ts`, `app/api/plan/import_networth/route.ts` |

---

## 2. Repo conventions (match these, don't invent new patterns)

- **Tailwind v4** with custom palettes in `app/globals.css`: `dark-*`, `primary-*`,
  `accent-*`, `warning-*`, `success-*`, `danger-*`, `blue-*`, `purple-*`.
  Body: `font-montserrat font-medium bg-[#f8f9fa] text-dark-600`.
- **`Button`** (`src/components/ui/Button.tsx`) has **no built-in padding** —
  call sites pass `px-* py-*`. Always `border-2`. Variants: primary/neutral +
  solid/outline.
- **`DisplayAmount`** for every money value — `notation="compact"` (1.5L) or
  `"standard"`.
- **Editor pattern** (Account/FDP/Loan/Asset/Tax): breadcrumb bar (`fixed
  bottom-0` on mobile, `md:relative md:top-0`), list column + command column,
  local-first saves via `update_plan_local(plan)`; the **plan page has a Save
  button** (disabled when synced) — never auto-sync from editors.
- **`MonthPicker`** (`src/components/edit/MonthPicker.tsx`) converts plan-relative
  month numbers ↔ "Mon-YYYY" labels. All dates in the plan are month numbers —
  never raw date strings in UI inputs.
- **`MyChart`** (`src/components/ui/MyChart.tsx`) — chart.js v4 wrapper,
  `chart_type: "doughnut" | "line" | "bar"`. Dataset shape examples: plan page
  stacked bars (e/s/i), networth doughnut, networth line history.
- **No emojis** in code/UI strings. Money in ₹ (DisplayAmount handles locale).
- **Mobile**: editors already use existing responsive patterns; new panels must
  collapse to single column on <md (use `md:flex-row` / `flex-col` stacks).
- Windows dev box: CRLF warnings from git are normal. Do not "fix" line endings.

## 3. Do NOT break (hard constraints)

1. **277/277 tests** (`npm test`). New work must add/adjust tests, never weaken:
   `tests/assets.test.ts`, `tests/mcp/assets.test.ts`, `tests/mcp/fdp.test.ts`,
   `tests/tax.test.ts`, `tests/mcp/tax.test.ts`.
2. **Verified tax math** — `tests/tax.test.ts` replicates ClearTax worked
   examples exactly (₹15L→₹97,500, marginal relief ₹12.1L→₹10,400, indexation
   117→376, old-regime HRA example). Any UI change to inputs must not change
   engine defaults silently.
3. **Byte-compat** — `ComputePlanSnapshot` must not emit `asset_*`/`tax_*` keys
   for plans without assets/tax (asserted in `tests/assets.test.ts`).
4. **Parity with original app** — the pre-existing plan page (bars, cards,
   manager sidebar) is pixel-checked against the old Vue app
   (`docs/handoff.md`, screenshots in `standalone/`). Don't restyle pre-existing
   elements; only ADD new panels/datasets.
5. **Parallel sessions** — other people work in this repo (e.g. gemini provider
   work). Never stage/touch files outside your feature scope. Commit only your
   own files (use explicit `git add <paths>`).
6. `npx tsc --noEmit` has **4 pre-existing errors in tests/mcp/oauth.test.ts** —
   leave them; don't "fix" or suppress.

## 4. Verification loop

```
npm test                 # 277 tests must pass
npm run lint             # 0 errors (warnings exist — don't add new ones)
npx tsc --noEmit         # only the 4 known oauth.test.ts errors
npx next build           # must be green
npm run dev              # manual check at localhost:3000 (needs .env.local)
```
Seed state: tax rules already seeded in the hosted DB
(`npm run seed:tax-rules`), admin = `ompurwar96@gmail.com`.

---

## 5. Known gaps → polish checklist (prioritized)

### P0 — correctness-adjacent UI (do first)
1. **Volatility input missing** — `AssetEditor` has no `volatility` field, so
   the scenario bands (conservative/aggressive) always use the class preset.
   Add an optional "Volatility %/yr" input (market classes only: gold, equity,
   mf, real_estate, vda, bond). Engine already consumes it.
2. **Indexation gate not settable** — `purchase_date` (ISO, pre-23-Jul-2024
   property gets the 20%-with-indexation option) is MCP-only. Add a "Purchased
   before Jul 2024" toggle on real_estate (maps to `purchase_date:
   "2024-07-22"`). Hints: show which tax treatment applies.
3. **Tax table refresh** — `TaxManager` fetches the snapshot when `plan`
   identity changes; confirm the year-wise table updates right after
   `SaveSettings` (it does via `update_plan_local` → new plan object → effect
   re-runs). If it flickers, keep the previous table while loading (skeleton).
4. **Physical gold vs SGB** — gold class defaults `yield_rate: 2.5` (SGB
   coupon). Physical-gold users must zero it. Add a "SGB?" toggle in the form
   (sets yield 2.5 / 0) + a hint line.

### P1 — user-friendliness
5. **Salary negotiation: custom offer + Apply** — scenarios are hardcoded
   (+10/20/30/50%). Add a custom target input, and an **"Apply offer"** action
   that persists the new salary (update the primary income line's `amount` via
   `update_plan_local` + note the plan-page Save button will sync it).
6. **Import refresh** — `import_networth_assets` skips classes already present.
   UI: add a "Refresh values" mode (checkbox) that updates principals of
   existing mapped classes instead of skipping. Backend tweak needed in the
   route + MCP tool (small, additive).
7. **AssetEditor empty state** — when a plan has 0 assets, show a friendly
   onboarding block (icon + "Add your first FD/stock/property" + Import
   button) instead of just the Add button.
8. **Net-worth import UX** — after import, show per-class added values inline
   (currently only a message line). Disable Import button while syncing.
9. **Mobile pass** — verify AssetEditor + TaxManager at 390×844 (use the
   existing breadcrumb/list patterns from AccountEditor for reference). The
   3-column TaxManager layout must stack: settings → negotiation → table.
10. **Asset Mix panel on plan page** — add a tiny per-class % next to each
    legend row, and show "total vs invested" (unrealized gain/loss color) in
    the header.
11. **Blended-growth badge tooltip** — the `%` badge on account cards already
    has `title="Blended asset growth"`; add a visual differentiator (e.g.
    `~12%` or an icon) so users can tell blended vs flat ROI at a glance.

### P2 — delight (optional)
12. **Wealth chart asset band** — the big stacked bar chart (plan page, e/s/i)
    does not include asset values. Add a 4th dataset: total asset value per
    month as a **line** (mixed chart — check `MyChart` passes per-dataset props
    through; if not, extend it minimally). Optionally shade conservative/
    aggressive from `asset_scenarios.month_map`.
13. **FDP suggestion from asset mix** — Money Manager could show a suggested
    e/s/i split derived from `bucket_growth` (read-only hint, never auto-apply).
14. **Scenario toggle** — a small control on the Asset Mix panel to preview
    conservative/aggressive totals in the net-worth figure (currently totals
    only).
15. **Assets summary card** — manager sidebar Assets entry could show total
    asset value under the count badge.

### Notes / documented approximations (do NOT "fix" — they are deliberate)
- FD TDS: applied to subsequent credits once the FY threshold crosses (real
  banks also true-up at year end — simulation simplification, commented in
  `engine/assets.ts`).
- Auto Income Tax treats all income cashflow lines as salary (standard
  deduction applies). Rent should be modeled as a real_estate asset's `rent`,
  not as a cashflow line.
- Scenario bands are deterministic ±1σ (not Monte Carlo).

---

## 6. Suggested workflow for Antigravity

1. Run the verification loop once on a clean `main` to confirm the baseline
   (277 tests, lint, tsc, build).
2. Pick ONE checklist item → implement → run the loop again → commit with the
   repo's message style (`feat(ui): …` / `fix(ui): …`), explicit `git add` of
   only your files.
3. Commit per item (or per P0/P1 group), push a branch, open a PR against
   `main` (repo convention: merge commits, e.g. PRs #8/#9/#11).
4. Leave `tests/mcp/oauth.test.ts` errors and the pre-existing lint warnings
   untouched.

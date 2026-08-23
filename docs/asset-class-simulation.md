# Asset Classes + Versioned Tax Engine — Plan (Task 3.1+)

## Scope
Asset-class simulation (FD, bonds, savings, gold, PPF, equity/MF, real estate, crypto) layered on the
existing e/s/i buckets, a **database-backed, versioned tax-rule system** (India, per assessment year),
salary-negotiation support, and full MCP exposure with **role-gated system mutations**.

## P1 — Tax rules in MongoDB + pure computations + MCP + RBAC (this branch)
- `Tax_Rule_Store` collection: versioned rule sets per assessment year (AY 2023-24 → 2026-27) + a
  non-versioned `PRESETS` document (asset-class assumption defaults). Legal rules in DB; code keeps
  bundled fallbacks so an unseeded DB still works.
- Pure computations in `src/server/tax/`: `ComputeIncomeTax` (new/old regime, senior slabs, HRA,
  80C/80D/80TTA/80TTB/24(b)/NPS, 87A rebate + marginal relief, surcharge w/ LTCG cap, 4% cess),
  `ComputeCapitalGains` (holding periods, 112A ₹1.25L, foreign-equity no-exemption, indexation option
  for pre-23-Jul-24 property, VDA 30%), `ComputeSalaryNegotiation` (marginal rate on hikes),
  `MonthToAssessmentYear`.
- Rule changes are **data-only**: new AY = new doc; corrections = upsert + cache invalidation.
- MCP tools: `list_tax_rules`, `get_tax_rules`, `tax_calculation`, `salary_negotiation`
  (all users); `upsert_tax_rules`, `update_presets` (**admin only**).
- RBAC: `role: "user"|"admin"` on users; `ToolDefinition.requiresRole` enforced in the single
  `callRegistryTool` choke point (covers HTTP, stdio, in-app assistant).

## P2 — Asset engine (next)
`MakeAsset` entity + presets; `engine/assets.ts` monthly projection (growth/income/maturity/SIP/rent,
TDS net-credit, realized LTCG/STCG); snapshot wiring (`asset_month_map`, `asset_summary`,
`tax_summary` per AY, `bucket_growth` = derived e/s/i growth); auto "Income Tax" monthly expense from
the income statement (salary hikes flow through slabs automatically).

## P3 — MCP + AI (next)
`list/add/update/delete_asset`, `update_tax_settings` (plan), simulate patches
(`add_asset`, `update_asset`, `sell_asset`, `set_salary`, `update_tax_settings`), prompt guidance.

## P4 — UI (next)
`AssetEditor.tsx` (AccountEditor pattern), plan-page Assets entry + asset-mix doughnut +
blended-growth badge, working Tax Manager (regime/AY/age/deductions/HRA + per-year tax table),
Salary Negotiation panel. Additive-only; snapshots omit new keys when no assets/tax → byte-identical
old output (tested).

## P5 — Polish (later)
Scenario bands (expected ± 1σ), FDP suggestions from asset mix, net-worth import seeds, docs/TASKS/CHANGELOG.

## Verified tax data (sources: ClearTax FY 2025-26/2026-27 pages, fetched 2026-08)
- New regime slabs FY 2025-26/26-27: 0-4L 0% · 4-8L 5% · 8-12L 10% · 12-16L 15% · 16-20L 20% ·
  20-24L 25% · >24L 30%. Std ded ₹75k. 87A rebate ₹60k → tax-free ≤ ₹12L, marginal relief above.
- Old regime: 0-2.5L 0% · 2.5-5L 5% · 5-10L 20% · >10L 30%. Std ded ₹50k. 87A ₹12.5k ≤ ₹5L.
- Surcharge: 50L 10% · 1Cr 15% · 2Cr 25% · 5Cr 25% (new)/37% (old); LTCG surcharge capped 15%. Cess 4%.
- LTCG 12.5% (112/112A), ₹1.25L exemption ONLY for Indian listed equity/equity-MF; STCG 111A 20%;
  debt MF → slab (post Apr-23); foreign/unlisted shares 24-mo LTCG 12.5% no exemption; gold 24-mo 12.5%;
  property 12.5% or 20%+indexation (bought ≤ 22-Jul-24); crypto/VDA flat 30%. CII 2001-02=100 … 2025-26=376.
- FD TDS 10% (>₹40k/₹50k senior); 80TTA ₹10k; 80TTB ₹50k (senior); 80C ₹1.5L; 80D ₹25k/₹50k; 24(b) ₹2L.

## RBAC
- `User_Profiles.role` (`"user"` default / `"admin"`). `standalone/make-admin.ts --email <e>` promotes.
- Enforced in `callRegistryTool`: `definition.requiresRole === "admin"` → `FORBIDDEN` envelope for non-admins.

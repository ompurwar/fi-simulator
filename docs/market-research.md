# Market Research — will Indians use Fi-Plan?

*Date: 2026-09-05. Sources: direct Reddit thread mining (search engines), product-fit analysis against the existing engine/capabilities.*

## 1. What the product is (the wedge)

Fi-Plan is a **plan-first financial simulator**: declare income/expenses/loans/assets once and the engine
models the next 50 years (net worth, runway, FDP strategies, SIPs, EMIs, taxes, funding gaps, SEN
scenarios). Compared to the Indian market:

- Groww / Zerodha / Moneycontrol — **transactional** (invest & track). Not planners.
- IndMoney — closest competitor; owns "FI Vision" framing but is a brokerage (distribution + conflict-of-interest angle).
- YNAB/Monarch — the US planning category leaders; **no Indian equivalent owns "simulate my life".**

> Positioning: "Trackers tell you what happened. Fi-Plan shows you what's possible."

## 2. Personas + fit

| Persona | Trigger | Fit | Notes |
|---|---|---|---|
| Salary earner 26–40 (₹5–30L) | monthly review, salary hike, tax season | High | Core ICP |
| NRI / US-return | 401k vs India, tax, FIRE plans | High | Compare engine + scenarios map 1:1 |
| Couples / newly married | combined finances, goals | High once **joint plan** exists | Multi-user = biggest gap |
| FIRE community (FI/RE) | runway, FI freedom | High | Native vocabulary |
| Retirees 45+ | lump-sum, estate | Medium | advisory-led |
| Low financial literacy | "where do I start" | Medium | onboarding + templates help |

## 3. Reddit evidence (validation)

Mined via indexed Reddit threads (Reddit API blocks bots; quotes from search snippets).

**Pain is real & recurring** (r/personalfinanceindia, r/IndiaInvestments, r/india):
- "Are there any apps that simplify all of it, and bring everything under one roof? — tax calculations, asset management and trade all together" → consolidation demand.
- "Too many apps on the market that don't live up to expectations."
- "Too many bank accounts and I can't keep track."

**Willingness to pay:**
- "Using moneyManager paid app... best purchase of my life, my finance understanding and spending habits has improved drastically" → paid habit-improvement apps work in India.

**Privacy is an explicit fear (our differentiator):**
- "Apps that can auto track your expenses are the ones that have complete access to your financial data." → users **fear** auto-tracking permissions; manual-entry + read-only integrations + encryption is a trust lever, not a limitation.

**The planner gap is wide open:**
- Only "plan ahead" mention: "Mint, if you are looking to plan ahead" — Mint is dead.
- r/FIREIndia / r/FIRE_Ind / r/FatFIREIndia users **build their own** FIRE/SIP webapps and ask for retirement-calculator reviews → demand exists, no incumbent owns it.
- NRI threads active: "401(k) for NRI with FIRE in India plans", "returning US→India for retirement".

**Caveats:** ~10 threads, snippet-level (no comment mining), directional not quantitative.

## 4. Verdict

Yes — for a defined slice: **the plan-first independent planner for Indian salary earners (26–40), FIRE-minded users, and NRIs.** Two conditions decide victory:

1. **Pull mechanisms** (retention > new features): monthly digest/reminders — without them users set a plan once and ghost.
2. **Demonstrable correctness**: engine outputs must reconcile with real (synced) balances; any visible mismatch kills trust.

Discovery is the hard part — nobody searches for a "life simulator". → see `docs/distribution-strategy.md`.

---

## 5. Citations / evidence log

**Method (2026-09-05):** Reddit's API (`www.reddit.com/search.json`, `api.reddit.com`, `old.reddit.com`, proxy `r.jina.ai`) all return 403 to bot traffic — quotes below were captured via search-engine indexed snippets (DuckDuckGo HTML endpoint) of the threads. **Future re-validation: rerun the queries in this section against a logged-in Reddit account, or use the Wayback Machine for each URL.**

| # | Thread (subreddit) | Validates | URL |
|---|---|---|---|
| 1 | "Where do you manage, record, and plan all your finances?" — r/personalfinanceindia | Paid tracker loyalty: *"moneyManager paid app... best purchase of my life... spending habits improved drastically"* | https://www.reddit.com/r/personalfinanceindia/comments/17xgdpd/where_do_you_manage_record_and_plan_all_your/ |
| 2 | "Good Money manager App?" — r/personalfinanceindia | Unsatisfied market: *"too many apps on the market that don't live up to expectations"*, *"too many bank accounts and I can't keep track"* | https://www.reddit.com/r/personalfinanceindia/comments/19dqm3k/good_money_manager_app/ |
| 3 | "What app do you use for your personal finances?" — r/personalfinanceindia | Everything-under-one-roof demand: *"tax calculations, asset management and trade all together to give you an overview"* | https://www.reddit.com/r/personalfinanceindia/comments/1ag5il8/what_app_do_you_use_for_your_personal_finances/ |
| 4 | "Regular apps for managing finances" — r/personalfinanceindia | Needs span MFs/FDs/SGBs/PPF/loans/expenses — the full-stack data our engine models | https://www.reddit.com/r/personalfinanceindia/comments/16v7j9e/regular_apps_for_managing_finances/ |
| 5 | "Best Apps/System to track how much you save" — r/personalfinanceindia | Privacy fear: *"auto track your expenses... complete access to your financial data"* → encryption/read-only wedge | https://www.reddit.com/r/personalfinanceindia/comments/191gdhu/best_appssystem_to_track_how_much_you_save_and/ |
| 6 | "Suggest a good Money Expense Tracker/Manager" — r/india | Planner gap: *"Mint, if you are looking to plan ahead"* (Mint is dead); trackers = Wallet/Monefy | https://www.reddit.com/r/india/comments/yifcl3/suggest_a_good_money_expense_trackermanager/ |
| 7 | "Suggest best app to track expenses and categorize" — r/IndiaInvestments | Incumbents live on bank-SMS parsing (Moneyview) — permission-heavy, which users dislike (see #5) | https://www.reddit.com/r/IndiaInvestments/comments/1ad24wn/suggest_best_app_to_track_expenses_and_categorize/ |
| 8 | r/personalfinanceindia wiki | Community size/activity baseline for distribution (Channel B) | https://www.reddit.com/r/personalfinanceindia/wiki/index/ |
| 9 | r/FIREIndia wiki (education/marriage cost planning) | Goal-planning demand (kids' education, marriage costs) | https://www.reddit.com/r/FIREIndia/wiki/index/ |
| 10 | "401(k) for NRI with FIRE in India Plans" — r/FIREIndia | NRI persona: cross-country retirement/tax planning — compare engine fits | https://www.reddit.com/r/FIREIndia/comments/12ukivo/401k_for_nri_with_fire_in_india_plans/ |
| 11 | "Retirement calculators" — r/FIREIndia | Calculator-quality gap: people debate finding/trusting numbers; DIY vs tool | https://www.reddit.com/r/FIREIndia/comments/lmlr4m/retirement_calculators/ |
| 12 | "Retirement Calculator" (self-built webapp) — r/FatFIREIndia | Users BUILD their own calculator (expense/inflation/savings/returns → SIP to goal) — exactly Fi-Plan's engine | https://www.reddit.com/r/FatFIREIndia/comments/1dchljv/retirement_calculator/ |
| 13 | "Retirement Calculator" (self-built webapp) — r/FIRE_Ind | Same DIY signal, second community | https://www.reddit.com/r/FIRE_Ind/comments/1dchb3v/retirement_calculator/ |
| 14 | "Has anyone returned from US to India for retirement?" — r/FIRE_Ind | NRI/return migration persona: multi-year scenarios, tax, currency | https://www.reddit.com/r/FIRE_Ind/comments/1bl377p/has_anyone_returned_from_us_to_india_for/ |
| 15 | "Milestone Update: Achieved 4 cr retirement corpus" — r/FIRE_Ind | Milestone-sharing culture → shareable cards/annual-review loop | https://www.reddit.com/r/FIRE_Ind/comments/1cutoga/milestone_update_achived_4_cr_retirement_corpus/ |
| 16 | "FIREd by 33. My straightforward story" — r/FIRE_Ind | Story-driven community → content/creator channel fits | https://www.reddit.com/r/FIRE_Ind/comments/19aoesg/fired_by_33_my_straightforward_story_to_an_early/ |
| 17 | r/IndianPersonalFinance | Adjacent community for distribution | https://www.reddit.com/r/IndianPersonalFinance/ |

**Re-run queries for future validation:**

```
site:reddit.com "financial planning app" india       (DuckDuckGo html endpoint)
site:reddit.com best app to plan finances india
site:reddit.com FIRE India app plan retirement
site:reddit.com IndMoney review reddit
site:reddit.com retirement calculator india reddit
```

**Strengths/limits of evidence:** 17 threads, signposts over statistically significant; snippet-level quotes (not full comment analysis); corroborates direction (demand + WTP + privacy + planner gap + FIRE/NRI beachhead). Needs a larger sample before investing in paid acquisition.

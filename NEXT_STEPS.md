# Iris — Next Steps

## ⭐ START HERE — next session (as of 2026-06-14, data-honesty + audit session)

Branch **`overnight-polish-2026-06-11`** — **34 commits over `master`, unmerged.** Tree clean (only untracked throwaway `scripts/*`). `npx tsc -b` clean · `npm test` 121/121 (in pre-commit). Dev server :5173 (`npm run dev`); **restart it before any sync** (server-side `teller-map.ts` changed this session). Validate in Scott's real Chrome.

**Next session = work the AUDIT FIX QUEUE.** Full report: `docs/audits/2026-06-14-numbers-audit.md` (14-agent swarm, 12 findings, every high-severity one adversarially verified, none refuted). These are number/logic fixes — **no Fable needed** (the UI/UX redesign is the thing waiting on Fable). Queue, biggest distortion first:

1. **Scorecard under-base verdict** (`savingsScorecard.ts:96`) — judges operating-only, hides $57,078 reserve spend; shows 9/9 green, honest is **3/9**. Trend line (#6, `savingsScorecard.ts:111-115`) rides along.
   - **DECISION TO MAKE FIRST (changes what "under base" means):**
     - **Option A — count everything:** judge vs *total* real spend (operating + reserve + investing). Blunt/honest → 3/9 months under; a $13k tax month correctly shows red.
     - **Option B — credit the set-aside (RECOMMENDED):** judge vs `base − stash contributions ($2k/mo) − operating`. Since the stashes ARE how Scott pre-funds taxes/travel, this asks "did you live within base *after* setting aside for the lumpy stuff?" — matches how he actually budgets, surfaces reserve spend instead of hiding it, and won't scream red just because a planned tax payment landed.
   - Claude leans **B**; Scott to confirm A vs B at the top of the build session, then implement #1 + #6 together. (Discussed end of the 2026-06-14 session; deferred to the build session.)
2. **Variable-pay band detection** (`VariableSurplusCard.tsx:87-131`) — false 4/30 "pay change" drops ~$17.3k; shows $16.5k YTD vs **$33,816** true. Replace consecutive-diff with a modal-low floor; sum over ALL base paychecks; add a "free to deploy / fast-forward to vacation·reno" tile (Scott wants this).
3. **Cash-flow time-axis** (`DashboardView.tsx:394-396`) — MTD spend vs full-month income/investing overstates "left this month" by ~$7–10k. Prorate income/investing OR relabel "left so far" + on-pace projection. **Fix this BEFORE deciding $1k→$2k investing** — real monthly room is much tighter than it looks.
4. **Savings-rate 401k/HSA blindness** (`insightsEngine.ts:220-221` + 2 dup copies; also `budgetDefaults.ts:378-379`, `BudgetView.tsx:415-416`) — fires false "critical 5%" because 401k/HSA = $0; real rate ~**10.7%**. Populate real 401k (~$658, ~3%) + HSA (~$692) in the paycheck panel; extract one shared savings-rate helper.
5. **Investing $20 vs $1,000** (`transactionAnalysis.ts:226-227`, `budgetHistory.ts:23-26`, `BudgetView.tsx:1323`, `budgetDefaults.ts:375`) — fat-finger snapshot; cash-flow right only by accident. Stop applying historical target to investing, exclude from snapshots, repair row, make input read-only.
6–12 (medium/low, in the report): scorecard trend line · reserve constant $1,500→$1,000 (`budgetLanes.ts:41` + test) · US Treasury mapping drift → taxes · travel stash blank name → "Trips" · reimbursement income guard (`monthlyBudgetableIncome`) · recent-activity transfer guard (`DashboardView.tsx:129`, cosmetic) · stash targets = $0 (Scott sets, lights up GoalTracker).

**Verified CLEAN (don't re-litigate):** net worth $544,574 (to the penny) · import integrity ($105k transfers never leak into spend) · Safe-to-Spend $2,735 · stash math · cash-flow investing not double-subtracted.

**Scott's pending DECISIONS (gated on the fixes):** $1k→$2k/mo investing (decide after #3 shows true room) · 401k% vs direct-market (after #4) · taxes stash $1,000 likely UNDER-funds (real ~$1,400/mo) · **equity = $0: his Abnormal RSUs aren't entered at all — get them in (he's leaving Abnormal, likely a vesting event).**

**Architecture (logged, NOT building yet):** keep Supabase cloud canonical + add local CACHE layer (offline resilience, mobile later) — see memory `project_iris_offline_architecture`; formalize as ADR (updates ADR-0002) when grounded. Real "fast on a plane / offline" fix = a production build (bundled); Vite dev is heavy. Google-Fonts render-block already fixed (`703c692`).

Then, once numbers are trusted + Fable's back: **the UI/UX redesign** (commercial-grade) + couples scoreboard.

---

## (Prior) Next Steps — 2026-06-12, couples data model session

Working branch: **`overnight-polish-2026-06-11`** — **29 commits over `master`, unmerged. Scott reviews & merges first.**
Review: `git log master..overnight-polish-2026-06-11` / `git diff master...overnight-polish-2026-06-11`.
Health: `npx tsc -b` clean · `npm test` 121/121 (now wired into pre-commit) · all surfaces browser-verified in Scott's Chrome.
Audit trail: `docs/audits/2026-06-11-budget-gap-audit.txt` (36 findings, 0 refuted) · design doc `docs/stashes-design.md`.

## ✅ What shipped 2026-06-12 (COUPLES DATA MODEL — the pre-paint build, DONE)

(`1d2cf94`, `a57074d`, `83c93ea`, `b5a4342` + hook/docs)
- **Fun-money THIS-MONTH bug fixed**: monthlySpent now derives from the current
  calendar month (refund-netted), not computeCategoryAverages. Pots seeded from
  Earner profiles (fun_money collection was empty — the wizard never ran for
  this pre-existing install). FunMoney gains earnerId/category/emoji; all
  'Scott'/'Claire' literals gone from runtime code (contained in seed/migration).
- **Real partner identity**: activeUser no longer discarded at the provider
  boundary; context exposes activeUser/activeEarner/earners. AuditEntry gains
  `actor`, stamped on every write from session identity (viewer UI = redesign).
- **Per-person attribution**: `Expense.spender` (Earner.id | 'ours') + the
  `sourceOwners` collection. ONE resolution rule: transaction override →
  account owner → 'ours' (unattributed money is JOINT — never guessed).
  Settings → Account Owners panel (all 5 sources, per-person picker).
  Expense Manager "Who?" cycle toggle (inherit → each earner → ours), verified
  persisting through the full cycle. Teller re-sync preserve-list carries
  `spender` (server change — dev server already restarted).
- **Fun Money on the daily Budget Overview** (out of edit mode; spent recomputed
  from transactions on render; "Set a budget" jumps into Edit Budget).
  **GoalTracker mounted on Dashboard** — stashes WITH a target amount/date,
  balances DERIVED via stashMath, date-pacing live. Hidden today because no
  stash has a target yet (appears as soon as Scott's homework lands).
- `src/utils/funMoney.ts` + `src/utils/attribution.ts` pure, 18 new tests
  (121 total). `npm test` now runs in the pre-commit hook.

## ✅ What shipped today (the budget engine is DONE)

**Trust the numbers** (`f044f28`, `a21751a`, `56c8f06`, `4a849c4`)
- Real current-month axis; calendar-complete months govern all math, never visibility. Overview defaults to the in-progress month with an IN PROGRESS badge.
- ONE operating-spend definition everywhere (excl. work + reserve lanes); scorecard lane-aware (9/9 under base), banked stays cash-honest.
- **Safe to Spend** (take-home − fixed max(budget,MTD) − stash set-asides − flexible MTD): dashboard hero + budget banner with formula + $/day.
- **Live trending**: Budget Pulse "trending to ~$X vs watermark" + per-category "→ lands at $X at today's pace"; lane-aware pacing (no false PACING on fixed bills); TriggerCenter fed true MTD buckets.
- Fixed: refund netting+categorization, CashFlowBar double-investing, drilldown ×12 bug, UTC 1st-of-month drift, donut top-6 mislabel, NaN guards. "Sinking fund" → "Stash" everywhere user-visible.

**Pipeline hardening** (`b2701b7`, `02b698e`, `9edebd5`)
- Employer-agnostic payroll match (job-change safe); sync window anchored to last clean sync; honest partial-sync reporting; pendings skipped; deletion tombstones; merchant mappings applied server-side; recategorize endpoint guards income rows; connector lifecycle (re-enroll retires, dead tokens marked); failed attempts don't arm the debounce.
- **Card refunds import as categorized refunds** + 9-month backfill (33 rows / $2,633 that was silently counted as spend). GOTCHA baked into `server/teller-map.ts`: Teller types EVERY card credit as `payment` — detection is description-only.

**Redesign gate** (`261d73d`, `7d96cce`, `d0401c3`)
- 103 unit tests on the pure math (8 files; `npm test`, ~1s). ~1,500 lines dead code deleted (GoalTracker deliberately KEPT for the scoreboard).
- BudgetView write-on-read killed (the bucket-clobber mechanism — targets finally stick). Chat input out of global context. `replaceCollection` so bucket/stash deletes persist.

**Features** (`d1b43a5`, `50633aa`, `3c7c1bb`)
- **Stashes**: derived balances (contributions − linked-category draws, honestly negative), stash categories = the reserve lane (dynamic registry), StashesCard on the daily Overview, Taxes/$1,500 + Trips&Travel/$1,000 seeded. Inline two-click delete confirm.
- **Paycheck & Watermark editor** (Settings): net/gross/401k/HSA, Save-Discard, "Re-derive from bank deposits" for the job change.
- **Budget-target history**: append-only snapshots inside saveBudgetBuckets; complete months judged against the caps in effect THEN ("judged against the targets you had that month").

**Data fixes**: Dubai medical → travel_personal (~$14.6k out of healthcare); 2 international Ubers un-worked.

**Pre-paint sweep verdicts** (6 agents): YNAB/Monarch/Copilot = ready_to_paint (remaining gaps are presentation = redesign work; zero-based/rollover/Age-of-Money = confident skips). Couples = gaps_first → that IS the next build. Independent SQL recompute of all live numbers: 6/6 PASS within $1.

## 📋 Scott's no-code homework (sooner = better: target history starts accruing from real caps)
1. **Set real budget targets** via Edit Budget (amazon $500 / groceries $1,000 / subs $250 / personal $200 + the rest). They stick now AND get snapshotted.
2. **Stash opening balances** (what's actually set aside for taxes/trips) + link more lumpy categories (gifts_holidays, home/car maintenance; decide insurance). **Stash targets/dates make GoalTracker appear on the Dashboard.**
3. 401k/HSA in the Paycheck panel (display-only, fixes the savings-rate read).
4. **NEW: Fun-money budgets** (Budget Overview → "Set a budget" on each pot) + **Account Owners** (Settings → assign Citi/CapOne/checking to a person; joint stays Ours).
5. Merge the branch when reviewed.
6. (Leftover from the delete-confirm test: a throwaway "New stash" still exists — delete it; deletes persist now.)

## 🎨 NEXT BUILD: the UI/UX redesign (establishes the visual language equity/investments will inherit)
Fold in: couples scoreboard centerpiece (Safe to Spend = the one shared number; per-person spend rollups now computable from `effectiveSpender`), month-in-review ritual (computeMonthComparison is computed and consumed by NOTHING), sankey "where money goes", bills-due-this-week strip (nextExpectedDate exists), paycheck anatomy (OTE → deductions → take-home, info-only), stash target-date pacing, audit-log viewer (entries now carry `actor`), BudgetView 10-seam decomposition (line ranges in the audit — also fixes the sluggish 1,752-row table re-render on every toggle).

## ⏳ Known boundaries / later
- **Watermark not versioned** — same reflection problem one level up; do before/at the job switch (paycheck snapshot alongside target snapshots).
- Annual-bill detection (recurring lookback >180d) → feeds stash suggestions.
- Banked-vs-bank-balance sanity check; per-category rollover (probably never — stashes cover it); split transactions; card-liability line (Phase 2 net worth); alerts leaving the app (push/email); remaining helper dedup (formatCurrency/monthKey/category maps, budgetStore-vs-collectionsClient) + context memoization; wire `npm test` into pre-commit.

## ⚠️ Standing gotchas
- Teller dev tier: 100-enrollment lifetime cap is the scarce resource; sync via existing tokens is free; NEVER auto-poll; back-to-back full-history pulls get rate-limited (dry-run + real run = 2 pulls, space them).
- Server-side changes need a dev-server restart (Vite middleware reload also drops in-flight requests — that was the "Couldn't refresh" Scott saw).
- Scott's language: "watermark"/"reserves"/"Stashes" yes; "sinking fund"/OTE-framing never.
- Lane defaults + $1,500/$1,000 reserve constants in `budgetLanes.ts` are FALLBACKS — stash config overrides at runtime via `configureStashLanes`.
- June income $0 until the first June paycheck lands — honest, not a bug.

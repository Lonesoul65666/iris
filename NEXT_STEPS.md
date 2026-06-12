# Iris — Next Steps (as of 2026-06-11, end of the marathon session)

Working branch: **`overnight-polish-2026-06-11`** — **23 commits over `master`, unmerged. Scott reviews & merges first.**
Review: `git log master..overnight-polish-2026-06-11` / `git diff master...overnight-polish-2026-06-11`.
Health: `npx tsc -b` clean · `npm test` 103/103 · all surfaces browser-verified in Scott's Chrome.
Audit trail: `docs/audits/2026-06-11-budget-gap-audit.txt` (36 findings, 0 refuted) · design doc `docs/stashes-design.md`.

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
2. **Stash opening balances** (what's actually set aside for taxes/trips) + link more lumpy categories (gifts_holidays, home/car maintenance; decide insurance).
3. 401k/HSA in the Paycheck panel (display-only, fixes the savings-rate read).
4. Merge the branch when reviewed.
5. (Leftover from the delete-confirm test: a throwaway "New stash" may exist + an old confirm dialog may be open in a Chrome tab — OK/Cancel either way, then delete the test stash; deletes persist now.)

## 🔨 NEXT BUILD: couples data model (BEFORE the paint — else we paint twice)
From the sweep's scoreboard build list:
1. **Per-person attribution**: owner on account sources, spender override on transactions (p1/p2/ours — reuse the one-click Personal↔Work toggle pattern).
2. **Real partner identity**: stop discarding activeUser (AppDataContext:~102); actor on AuditEntry writes.
3. **Fun-money THIS-MONTH bug**: monthlySpent uses computeCategoryAverages (historical avg) — must be current-month spend. Also de-hardcode 'Scott'/'Claire' literals (fun-money sync + emoji).
4. Surface FunMoney out of edit mode; mount GoalTracker (its date-pacing math feeds StashesCard too).

## 🎨 THEN: the UI/UX redesign (establishes the visual language equity/investments will inherit)
Fold in: couples scoreboard centerpiece (Safe to Spend = the one shared number), month-in-review ritual (computeMonthComparison is computed and consumed by NOTHING), sankey "where money goes", bills-due-this-week strip (nextExpectedDate exists), paycheck anatomy (OTE → deductions → take-home, info-only), stash target-date pacing, BudgetView 10-seam decomposition (line ranges in the audit).

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

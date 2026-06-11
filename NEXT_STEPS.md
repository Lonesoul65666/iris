# Iris — Next Steps (as of 2026-06-11, evening session)

Working branch: **`overnight-polish-2026-06-11`** (NOT merged to `master` — review & merge first).
Review: `git log master..overnight-polish-2026-06-11` and `git diff master...overnight-polish-2026-06-11`.
Full audit findings (36 verified, 0 refuted): `docs/audits/2026-06-11-budget-gap-audit.txt`.

## ✅ Shipped this session (on top of the overnight-polish commits)

**Data fixes (applied directly to Postgres, verified in Chrome):**
- Dubai medical artifact: 4 SAUDI GERMAN charges (~$14.6k) moved healthcare → travel_personal. Healthcare reads green.
- 2 Dubai Ubers un-worked per the international-Uber rule.

**Phase 1 — Trust the numbers (`f044f28`, `a21751a`):**
- Real current-month axis: dashboard "this month" surfaces show true month-to-date, not multi-month averages.
- Calendar-based partial-month handling everywhere (replaced the >10-txn heuristics).
- ONE operating-spend definition (excl. work + reserve lanes) across budget summary, watermark tile, Cash Flow sub-score, scorecard. Scorecard discipline number is lane-aware → 9/9 months under base; banked stays cash-honest.
- **SAFE TO SPEND shipped**: hero chip on dashboard + formula banner on Budget overview (take-home − fixed − reserve set-asides − flexible MTD, with $/day pacing).
- Fixed: CashFlowBar double-investing, refund netting + categorization, avg-mode drilldown ×12 bug, UTC 1st-of-month drift, top-6-labeled-as-total donut, savings-rate NaN. "Sinking fund" copy → "Stash".
- Budget overview + Monthly Detail default to the last COMPLETE month; the in-progress month is navigable with an explicit badge.

**Phase 2 — Pipeline bombs defused (`b2701b7`):**
- Income import recognizes generic payroll markers (employer change safe).
- Sync window anchors to last clean sync (no more >14-day data holes).
- Partial syncs surface honestly; staleness clock only advances on clean syncs; rate-limit branch reachable.
- Pendings skipped (no phantom holds / double-counts). Deleted Teller rows tombstoned (`deletedTellerIds` collection).
- Merchant mappings apply server-side to new imports. Recategorize endpoint guards non-expense rows (the $188k paycheck-flip footgun is dead).
- Connector lifecycle: re-enrollment retires old rows; dead tokens marked 'disconnected'.
- **NOTE: server-side changes need a dev-server restart to take effect.**

**Phase 3 — Redesign gate (`261d73d` + test suite, partially complete):**
- ~1,500 lines of dead code deleted (migrations, NudgeCenter, SynthesisDigest, ProgressTracker, depositAdvisor, actionExecutor.verify). GoalTracker kept on purpose (couples scoreboard will mount it).
- BudgetView write-on-read killed — **this was the bucket-clobber mechanism**; budget targets set via Edit Budget now stick, and SQL-set targets would survive too.
- Chat input out of global context (keystroke no longer re-renders ~20 consumers).
- categoryEmoji fixed + completed.
- Vitest + unit-test suite on the pure math modules (see test agent result / `npm test`).

## 🔜 Remaining gate items (small, next session)
1. Canonicalize duplicated helpers: one formatCurrency (format.ts vs calculations.ts), one monthKey (8 private reimplementations), merge the 3 category-metadata maps with budgetLanes (essentialCats vs FIXED_CATEGORIES disagree on charity/investing).
2. Memoize the AppDataContext value + derived selectors (chatInput removal already killed the worst re-render).
3. BudgetView 10-seam decomposition (can overlap the redesign itself) + AppDataContext 5 seams + ExpenseManager parser extraction. Map with line ranges in the audit.
4. Wire vitest into the pre-commit hook (currently tsc only).

## 🔜 Then: the UI/UX redesign + couples scoreboard (fold together)
Surfacing Fun Money, mounting GoalTracker, de-hardcoding 'Scott'/'Claire' literals, audit-log actor — same painting work as the redesign. Investment/equity (Phase 2) rises after that (Scott leaving Abnormal → RSU liquidity). Gamification stays braked.

## ⚠️ Gotchas (rolling)
- Teller dev tier: 100-enrollment lifetime cap is the scarce resource; sync with existing tokens is free. No auto-sync by design.
- Scott's language: keep "watermark"/"reserves"/"Stashes"; never "sinking fund"; OTE/gross framing stays dead.
- Lane rules + reserve amounts ($1,500 tax / $1,000 travel) live in `src/utils/budgetLanes.ts` (code = clobber-proof). NOTE audit finding: these are Scott-specific constants — make them user-editable when the Stashes/reserve balance feature lands.
- June income shows $0 until the first June paycheck lands — honest MTD, not a bug.
- May 2026 honestly shows 8 categories over (semi-annual insurance premium, annual card fees, childcare) — real data, decide whether to re-lane lumpy semi-annuals (audit: gifts/home/car-maintenance "stash-style" categories live in the flexible alarm lane).

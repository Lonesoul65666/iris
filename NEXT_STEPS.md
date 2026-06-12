# Iris — Next Steps (as of 2026-06-11, late session)

## ✅ LATE-SESSION ADDITIONS (after the three phases)
- **Overview shows the in-progress month by default** with an IN PROGRESS badge (`56c8f06`) — "a budget is run during the month."
- **Live trending in Budget Pulse** (`4a849c4`): headline "trending to ~$X vs watermark" (fixed counts once, flex projects linearly) + per-category "→ $X at today's pace"; lane-aware pacing (fixed bills stop false-PACING); TriggerCenter fed true MTD buckets. Pulse renders only for the live month.
- **Sync debounce fix** (`02b698e`): failed attempts no longer block retries with a lying "Already up to date."
- **STASH SYSTEM SHIPPED** (`d1b43a5`, design: `docs/stashes-design.md`): derived balances (contributions − linked-category draws, nothing stored but intent), stash categories = the reserve lane (dynamic registry, legacy defaults until configured), Safe-to-Spend subtracts Σ contributions, StashesCard on the daily Overview, Taxes/$1,500 + Trips&Travel/$1,000 auto-seeded from this month. 97/97 tests.
- **Scott's next stash moves (no code)**: set real opening balances (what's actually sitting in savings per pot), link more lumpy categories (gifts_holidays, home_maintenance, car_maintenance — and decide on insurance, whose semi-annual premium is the May false-alarm), give Holidays/Emergency pots contributions, hit "Start auto-tracking" on the legacy pots.
- **Stash follow-ups (code, later)**: recurring-detection-driven stash suggestions (needs the >180-day lookback fix), insurance premium split (monthly part fixed-lane, premium stash-drawn), stash history sparkline.
- **PAYCHECK & WATERMARK EDITOR SHIPPED** (Settings, under Household Earners): net take-home / gross / 401k / HSA with Save-Discard + "Re-derive from bank deposits" (for after the job change). **Scott: enter your real 401k + HSA contributions** — they're $0 today, which understates the savings rate.
- **CARD REFUNDS SHIPPED + BACKFILLED**: Teller import keeps merchant credits as categorized refunds (33 rows / $2,633 over 9 months were silently counted as spend). KEY GOTCHA baked into `server/teller-map.ts`: Teller types EVERY card credit as `payment` — detection is description-only ("ONLINE PAYMENT, THANK YOU" / "CAPITAL ONE MOBILE PYMT").
- **HONESTY PASS DONE**: TriggerCenter renders only wired actions ("See breakdown" → drilldown; Sweep/Classify removed until built; dismissals persist per-month), NotificationSettings marks unbuilt detectors "coming soon" instead of pretending, Quick Import All stale-closure row-drop fixed.
- **BUDGET-TARGET HISTORY SHIPPED** (Scott promoted from "later": reflection requires knowing what the goals WERE). Append-only snapshots in collection `budgetTargets`, recorded inside saveBudgetBuckets (deduped, best-effort); complete months in Overview + Monthly Detail judged via `targetsForMonth` (src/utils/budgetHistory.ts, 6 tests). Known boundary: the watermark/paycheck itself is NOT versioned yet — same problem one level up when net take-home changes at the job switch.
- StashesCard delete = inline two-click confirm (window.confirm froze the tab).
- **⭐ PRE-UI WORK COMPLETE (22 commits, 103/103 tests). Order confirmed with Scott: (1) his data homework → (2) couples DATA MODEL (attribution/identity/actor + fun-money month bug) → (3) UI/UX redesign (scoreboard, month-in-review, sankey, bills strip, paycheck anatomy) → (4) investments/equity inherit the visual language.**


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

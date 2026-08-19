---
name: project-iris-handoff-2026-06-11-v2
description: "Iris handoff 2026-06-11 evening — audit + three-phase hardening: trust-the-numbers (Safe-to-Spend shipped), pipeline bombs defused, redesign gate (84 tests, dead code purged, clobber killed). READ FIRST."
metadata: 
  node_type: memory
  type: project
  originSessionId: 7937142e-f77e-4205-8b36-fa3c90fd9ad2
---

# Iris handoff — 2026-06-11 evening (Fable audit + three-phase hardening)

**MOST RECENT. Supersedes the morning 2026-06-11 handoff's queue (its shipped-work notes still valid).** Branch `overnight-polish-2026-06-11` now has **11 commits over master** — Scott reviews/merges. Repo `C:\Claude\projects\signal\signal-app`, dev server :5173 stays up. Current state + next steps live in repo `NEXT_STEPS.md` (canonical, updated this session).

## The audit (do not re-run — results archived)
37-agent workflow audit, 6 dimensions, every high finding adversarially verified: **36 findings, 0 refuted**. Full report: `docs/audits/2026-06-11-budget-gap-audit.txt` (+ full.json). Key systemic finding: the app had NO real "this month" axis (everything was multi-month averages) and partial-month detection was transaction-count-based (broken at ~180 txns/mo).

## Shipped this session (all tsc-clean, browser-verified, 84/84 tests green)
1. **Data fixes**: Dubai medical (4 Saudi German rows ~$14.6k healthcare→travel_personal w/ note); 2 Dubai Ubers un-worked (international rule). Mislabel cleanup was moot — Scott's mappings grew to 205; only 2 rows/$22 disagreed (left alone, likely intentional).
2. **Phase 1 — trust the numbers** (`f044f28`,`a21751a`): calendar month axis (currentMonthKey/isCompleteMonth/parseLocalDate in transactionAnalysis), MonthlySpending gains totalOperating/totalReserve, ONE operating-spend definition everywhere, refund netting+categorization, scorecard lane-aware (9/9 under base; banked stays cash-honest), drilldown ×12 bug, CashFlowBar double-investing, donut top-6 mislabel, UTC drift. **SAFE TO SPEND SHIPPED**: `src/utils/safeToSpend.ts` (take-home − fixed max(budget,MTD) − $2,500 reserves − flex MTD), dashboard hero chip + Budget banner w/ formula + $/day. Dashboard donut/cashflow = true MTD via `monthToDate` in context. Budget overview + Monthly Detail default to last COMPLETE month; June navigable with "IN PROGRESS" badge.
3. **Phase 2 — pipeline bombs** (`b2701b7`): payroll-marker income match (employer-change-safe — Scott leaving Abnormal), sync window anchored to last clean sync, honest partial syncs (staleness clock only advances on clean; LAST_ATTEMPT key debounces), pendings skipped, deleted-row tombstones (`deletedTellerIds` collection), merchant mappings applied server-side on import, **recategorize endpoint guards non-expense rows** (killed the ?all=1 $188k paycheck-flip footgun), connector lifecycle (re-enroll retires old row; 401/403 marks 'disconnected'). **Server changes need a dev-server restart.**
4. **Phase 3 — redesign gate** (`261d73d` + test commit): deleted 8 dead files ~1,500L (both completed IndexedDB migrations + main.tsx hooks, NudgeCenter, SynthesisDigest+util, ProgressTracker, depositAdvisor, actionExecutor.verify; **GoalTracker kept on purpose** — couples scoreboard mounts it later). **Killed BudgetView write-on-read — THE bucket-clobber mechanism; Edit Budget targets now stick.** Chat input local to ChatView (sendMessage(text, image?) signature change; keystroke no longer re-renders ~20 consumers). categoryEmoji healthcare fix + full map. **Vitest: 84 tests / 6 pure modules, `npm test`, ~1s.**

## Scott's product calls this session (durable)
- "Sinking fund" name is DEAD → "Stashes" (see [[no-sinking-fund-naming]]). Concept wanted: area for taxes/annual bills/remodels/trips; future = funded-balance tracking under that name.
- Income Sources panel: 24 dismissed detections were correctly killed (not income). Future idea: that space shows base pay + OTE/variable + other additions = "what truly hit the bank this month".
- Claire's-mom-type irregular trips STAY as family travel (life happens); only true anomalies (Dubai hospital) get re-categorized.
- Roadmap re-affirmed: finish gate → UI/UX redesign + couples scoreboard folded together → investment/equity (rising priority) → gamification braked.

## Late-session additions (same day, after the three phases)
- Scott: "a budget is run DURING the month" → Overview defaults to the in-progress month (IN PROGRESS badge, `56c8f06`); **Budget Pulse got live trending** (`4a849c4`): "trending to ~$12.7k vs watermark" headline + per-category "→ $X at today's pace" (flex linear, fixed counts once), lane-aware pacing (6 PACING → 1 real), TriggerCenter on true MTD buckets.
- Sync transient hit Scott ("Couldn't refresh") → diagnosed (dev-server mid-reload), endpoints verified healthy live (caught a fresh $4,292 Coupa reimbursement + 7 pendings skipped correctly); fixed the debounce-arming-on-failure bug it exposed (`02b698e`).
- **STASH SYSTEM SHIPPED** (`d1b43a5`; design doc `docs/stashes-design.md`, decisions D1–D6): derived balances (openingBalance + contribution×months − linked-category net spend; can go honestly negative), stash-linked categories ARE the reserve lane (configureStashLanes registry; defaults unchanged until configured), Safe-to-Spend subtracts Σ stash contributions, StashesCard on the daily Budget Overview (replaced the edit-mode-buried grid), one-time seed: Taxes $1,500/mo + Trips & Travel $1,000/mo from this month. `stashMath.ts` pure + 13 tests (97/97 total). Verified live: Travel pot $922 = $1,000 − $78 June draws.
- Scott's no-code stash tasks: set opening balances, link more lumpy categories (gifts/home/car-maintenance, decide insurance), contributions for Holidays/Emergency, "Start auto-tracking" on legacy pots.
- **Paycheck & Watermark editor shipped** (Settings → PaycheckPanel.tsx): net take-home/gross/401k/HSA, Save-Discard, "Re-derive from bank deposits" (computeGuaranteedBase) for after the job change. Verified in Chrome. **Scott to enter real 401k/HSA** (currently $0 → savings rate understated).
- **Card refunds shipped + backfilled (33 rows / $2,633)**: Teller card credits import as categorized refunds. **GOTCHA (empirically verified): Teller types EVERY card credit as `payment` — never trust t.type for cards; detection is description-only** (Citi "ONLINE PAYMENT, THANK YOU", CapOne "CAPITAL ONE MOBILE PYMT"). Probe script pattern in scripts/probe-card-credits.mjs (untracked scratch).
- **Honesty pass done**: TriggerCenter only renders wired actions + per-month persisted dismissals; NotificationSettings "coming soon" on unbuilt detectors; Quick Import All stale closure fixed.
- **PRE-UI SHORTLIST COMPLETE.** Scott's pending no-code tasks: 401k/HSA in the paycheck panel, stash opening balances + category links, budget targets via Edit Budget (now both clobber-proof AND history-tracked).
- **Pre-paint sweep (6 agents)**: YNAB/Monarch/Copilot all verdict ready_to_paint (gaps are presentation = redesign work; zero-based/rollover/AoM = confident skips); couples verdict gaps_first → THE SCOREBOARD BUILD LIST: per-person attribution (Expense has no spender; accounts no owner), real partner identity + audit actor (activeUser discarded), fun-money THIS-MONTH bug (shows historical average via computeCategoryAverages — real math bug), then surface FunMoney + mount GoalTracker. Independent SQL recompute of all live numbers: 6/6 PASS within $1. One bug found→fixed: collection deletes didn't persist (upsert-only) → replaceCollection for buckets+stashes.
- **BUDGET-TARGET HISTORY SHIPPED** (Scott's call: reflection needs the goals as they WERE): append-only `budgetTargets` snapshots recorded in saveBudgetBuckets, `targetsForMonth` resolution in src/utils/budgetHistory.ts, wired into Overview + Monthly Detail for complete months. 22 commits, 103/103 tests. KNOWN BOUNDARY: watermark/paycheck not versioned yet (matters at job switch). StashesCard delete = inline confirm (window.confirm froze the tab — a confirm dialog may still be open in Scott's Chrome from the delete test; the throwaway 'New stash' may remain — delete works properly post-fix either way).
- **CONFIRMED ORDER: Scott's data homework → couples data model → UI/UX redesign → investments/equity.**

## ⭐ NEXT SESSION
1. Scott reviews/merges the 11-commit branch (audit findings + NEXT_STEPS.md make the review map).
2. Remaining gate crumbs (small): canonicalize formatCurrency/monthKey/category-maps (essentialCats vs FIXED_CATEGORIES disagree on charity/investing), memoize context value + derived selectors, wire `npm test` into pre-commit, BudgetView 10-seam decomposition (line ranges in audit §code-health — can overlap redesign).
3. Then THE UI/UX REDESIGN + couples scoreboard (Fun Money surfaced, GoalTracker mounted, de-hardcode 'Scott'/'Claire' literals in AppDataContext fun-money sync + emoji pick, audit-log actor).
4. Watch May's honest "8 over" (semi-annual insurance, annual card fees) — decide whether stash-style lumpy categories (gifts/home/car-maintenance) move out of the flexible alarm lane.
5. June income shows $0 until first June paycheck lands — honest MTD, not a bug.

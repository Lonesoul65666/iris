---
name: project-iris-handoff-2026-06-11
description: "Iris handoff 2026-06-11 — overnight polish branch — budget lanes, sync UI, categorization+clobber fix, dashboard false-alarm kill. READ FIRST."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9cab7d69-cab9-4767-9cc6-61f196b07c3b
---

# Iris handoff — 2026-06-11 (overnight polish session)

**MOST RECENT STATE. Supersedes the 2026-06-10 handoff for everything below.** Repo: `C:\Claude\projects\signal\signal-app`. Dev server on :5173 (Scott keeps it running; reuse his Chrome tab via Claude-in-Chrome). All data in user-owned Supabase Postgres (`DATABASE_URL` in `.env.local`).

## Work landed on branch `overnight-polish-2026-06-11` (NOT merged to master — Scott reviews/merges)
5 commits on top of `3aac02b`:
1. `0e09796` **three-lane budget view** — new `src/utils/budgetLanes.ts` classifier: **Fixed** (housing/childcare/utilities/insurance/healthcare/kids/transportation/groceries/charity/investing) = green "on target"; **Flexible** = blue→amber→red pressure; **Reserve** (taxes/travel_personal/travel_work) = lumpy, excluded from monthly over/under. Per-category bars now = % of own budget (busted=full red). Net-Take-Home is the hero tile; **dropped Gross/OTE tile** (Scott: confuses Claire); Budget Health sorted best→worst; **removed Paycheck Waterfall** (Scott said worthless). `RESERVE_ALLOCATIONS` in code: taxes $1500/mo, travel_personal $1000/mo, travel_work $0 (reimbursed). `FIXED_OVER_TOLERANCE=1.15`.
2. `25705c0` **on-demand Teller sync UI** — `src/lib/syncTellerTransactions.ts` + `src/components/Dashboard/SyncStatus.tsx` (in dashboard HUD, replaced the fake "● LIVE" chip). 48h staleness banner ("Refresh your accounts"), 5-min debounce, 429 back-off, new/updated/through indicators. Settings keys: `last_teller_sync` (ISO) + `last_teller_sync_summary` (JSON). Import endpoint now returns `inserted`/`updated` via Postgres `(xmax=0)` trick + `through` date. **Upsert now PRESERVES manual edits** (category/isWorkExpense/reimbursementStatus/notes/recurring/incomeSubtype/incomeSourceId) on re-sync via jsonb merge — was clobbering them with `data=EXCLUDED.data`. **No auto-sync/polling by design** (Scott's call: human-click only keeps it under Teller's undisclosed dev-tier limit).
3. `ae6001f` **categorization fix** — `server/teller-map.ts` new `bestCategory()` runs `classifyBankTransaction` (the merchant-tuned classifier, same one `/api/expenses/recategorize` uses) BEFORE Teller's sparse slug. Was the root cause of new syncs mis-categorizing (EXXON 7-ELEVEN → groceries; now → transportation, verified). Existing categories preserved (not retroactively fixed — see morning queue).
4. `0baaffd` **dashboard false-alarm kill** — `insightsEngine.ts`/`budgetDefaults.ts`/`AppDataContext.tsx`/`DashboardView.tsx` all now lane-aware. Killed "10 categories over" + false "$3.4k over income" (deficit + surplus exclude reserve lanes = operating spend only; over-budget insights flex-only; hero count + spending donut use `isOverBudget`). Dashboard now shows **+$837 cycle surplus**, donut $10,065 operating (was $12,212), fixed bills no longer flagged red.
5. `9d3e89d` **quick fixes** — Housing-ratio NaN guard (grossMonthly=0), disabled the unbuilt "Upload Screenshot" no-op button ("coming soon"), corrected 4 false "data lives in your browser/IndexedDB" privacy claims → "your own private database that only you control" (it's Postgres now).

Verified: tsc clean (app+node) on every commit (pre-commit hook runs `tsc -b`); classifier output checked on 9 real merchants; jsonb-merge semantics tested; dashboard + budget tabs screenshotted clean. Throwaway analysis scripts left untracked in `scripts/` (budget-shave-*, work-travel-*, verify-classifier.ts, buckets-backup-2026-06-10.json).

## Data integrity findings (3-agent review)
- **NO real duplicates** — all 1718 expenses have unique `teller_<txnId>` ids; the 8 same-desc+date+amount "pairs" are genuinely distinct Teller txns (sequential ids). DO NOT dedupe on date+amount+desc (kills legit same-day charges). Table is correctly keyed.
- Sync current through **June 10** (today June 11).
- Net worth shown ~$544,574.

## ⭐ MORNING QUEUE (needs Scott or deliberately deferred)
- **Safe-to-Spend number** — the big missing consumer feature (all 3 reviews + Scott's watermark concept point to it). Deferred: needs Scott's input on the formula (take-home − fixed − reserves − spent − committed) + placement. HIGH value.
- **Healthcare shows inflated/red** on dashboard — the one-time $12,298 Dubai medical charge (Jan, miscategorized as `healthcare`) inflates the healthcare AVERAGE. Not a lane bug — a data artifact. Fix = recategorize that one charge (travel/medical-abroad) or exclude outliers from averages.
- **Already-synced mis-categorized rows** (e.g. current EXXON still `food_groceries`) are preserved-as-is by design (don't clobber manual work). Scott to fix in-app, or run a TARGETED recategorize (NOT `?all=1` — that clobbers his 135 merchant mappings).
- **Sync full-page reload** (`SyncStatus.tsx` `window.location.reload()`) → replace with in-place context refetch (needs AppDataContext to expose a reload fn — refactor, do with Scott awake).
- **Plain-language**: Scott LIKES "watermark"/"reserves" (he used them) — do NOT strip. OTE (worst offender) already gone.
- **Functionality audit leftovers** (low current value, Phase-2 surfaces): Refresh-Prices no-op with 0 accounts; Equity "Settings→Equity" dead-end (no equity editor exists); Watchlist nudges never render (NudgeCenter/SynthesisDigest are dead components).
- **Roadmap (agreed order):** budget polish (now) → **investment + equity** (Scott LEAVING ABNORMAL soon → RSU/equity liquidity is rising priority, the $1k/Coinbase/equity pieces) → **gamification = Phase 3, slow down** (Scott asked me to brake him; don't build until core is daily-used + investment in).
- **Multi-PC for Claire** (deferred, easy): standalone server `npm run server` with `--host` (already in launch config) + cloud DB = her laptop/upstairs PC open `http://<host-ip>:5173`, no install, same data. Spec when ready.
- **Budget targets** Scott approved earlier (amazon $500/groceries $1000/subs $250/personal $200) were SET VIA SQL THEN CLOBBERED by the running app — must be set via the in-app Edit Budget UI (the app owns/rebalances buckets; direct SQL doesn't survive).

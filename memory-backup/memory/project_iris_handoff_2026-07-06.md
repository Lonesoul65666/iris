---
name: project-iris-handoff-2026-07-06
description: "Iris handoff 2026-07-06 — READ FIRST. Branch MERGED to master (was overnight-polish-2026-06-11). Shipped: zero-AI streak engine + live announcer greeting; creation-forward stash cards + start-month display; THE FULL ACHIEVEMENTS SYSTEM (forward-only engine, 39-item tiered catalog, celebration nudges via NudgeCard, Trophy Room wall, grandfathered 'before Iris' display); Budget→Ask Iris entry point. tsc clean, 221 tests. Roadmap = [[project-iris-gamification-roadmap]]."
metadata: 
  node_type: memory
  type: project
  originSessionId: 0a5c9773-fbb7-4a85-9252-6ce8edf0cfde
---

# Iris handoff — 2026-07-06 · READ FIRST

Supersedes [[project-iris-handoff-2026-07-05]] as read-first (its shipped context still valid). Repo `C:\Claude\projects\signal\signal-app`. **Branch `overnight-polish-2026-06-11` was MERGED to `master` (fast-forward, 9013e26) — work on master now.** tsc -b clean · **221/221** · pre-commit runs tsc+vitest. Preview MCP server name is **`iris`** on :5173. Roadmap north-star: [[project-iris-gamification-roadmap]].

## Shipped this session (all committed to master, browser-verified)
1. **Merged the 137-commit branch to master** (9013e26).
2. **Zero-AI streak engine + live announcer** (351e08d) — `src/utils/gamification.ts`: streakOf/underBaseStreak/funMoneyStreaks/computeGameState/gameGreeting. Dashboard shows a live "N-mo streak" chip + templated greeting. `dashFunMoney` exposed on AppDataContext.
3. **Creation-forward stash cards** (40cb302) — `stashExistedBy(stash, month)` in stashMath filters BudgetPulse commit-run rows so a pot never shows in a month before its `startMonth`. (Scott's cards all start 2026-07, so paging to June now hides them.)
4. **Start month on stash cards** (bab3e14) — cards read "Started Jul '26 · funded N months" (was finish-line only).
5. ⭐ **THE ACHIEVEMENTS SYSTEM** (b0804b6, 7fda166, e456970):
   - **Engine** `src/utils/achievements.ts` — `Achievement` type, **39-item tiered catalog** (bronze→platinum) across discipline/funMoney/couples/savings/goals/netWorth/exploration/prestige. `captureBaseline` + `evaluateAchievements` with the **FORWARD-ONLY rule** (metric-crossing milestones gate against a first-run baseline; nothing backfilled fires a hollow trophy; real completions do). Unlocks permanent. `grandfathered` flag = forward-only achievements the user was already past at baseline.
   - **Wired live** in AppDataContext: evaluates on data change, persists baseline + unlocks to settings, surfaces unlocks as **celebration nudges** through the existing `NudgeCard`. **Xbox "waits for you" model**: unlock persists `celebrated:false`, card shows until "Got it" (survives reload + React StrictMode double-invoke). `dismissCelebration` marks acknowledged. Exposed: `achievementStates`, `celebrationNudges`, `dismissCelebration`.
   - **Trophy Room wall** `src/components/Achievements/TrophyWall.tsx` on the dashboard — earned lit, in-progress with bars, secrets as "???", grandfathered as "before Iris · your start line" (sorted last). Tier summary + rail. Expandable.
   - Full 52-item design + deferred primitives: `docs/achievements-catalog.md`.
6. **Budget→Ask Iris** (0d7f5a1) — "Ask Iris anything →" link on the Iris's Take card routes to the (already-built, was hidden) ChatView.

7. **Clean-slate fix** (eb0b297) — Scott: an existing install shouldn't get credit for setup already done. Setup/engagement AND goals achievements are now forward-only too (gate against baseline `engagement` snapshot + `funBalance`; goals count only crushes with `achievedAt` after `baseline.capturedAt`). Baseline capture is **debounced 500ms** so it snapshots the FULLY-loaded state (fun money loads after expenses — capturing mid-load fired false unlocks). Result: existing instance = **0 earned, earns only forward**; fresh install earns setup by doing it. Verified 0/38.
8. **Tier medallion icons** (49657c7) — replaced the "absolutely terrible" emojis with `Medallion.tsx`: tier-colored gradient coins + SVG glyphs, mapped by id+category. Locked greyscaled, light up in tier color when earned. On wall + celebration cards. Scott chose medallions over emoji/line-icons.

**Scott's baseline (settings `gamification_baseline`) RE-CAPTURED clean 2026-07-06** after the forward-only-everything fix: his full current state is the start line, `achievements_unlocked` = **[] (0 earned)**. He earns purely forward now. (During dev I injected/removed demo unlocks to screenshot colored medallions — restored to [].)

## Session part 2 (2026-07-06 cont.) — fixes + pre-pivot push
- **Audit/resilience fixes** (980836d): main.tsx boot() wrapped (white-screen guard), format.ts sign (-$2.5M), dynamicActions equity.grants guard, IntelligenceView toUpperCase guard, SyncStatus cancellable reload, db-pool >1-user warning, ChatView copy now budget-framed. Verified already-done: Yahoo proxy allow-list, shared formatCurrency, stable allocation keys. **Cold-start `useAppData` error = dev-only Vite Fast-Refresh transient (mixed exports in AppDataContext), NOT a prod bug** — no fix needed.
- **Achievement start-line = growth SINCE baseline** (b6506a0): `thresholdSince` — cumulative trophies (banked/net-worth/months-under-base/saved) measure delta from baseline, so "Five Figures Deep" = $10k banked AFTER start (0% now), not counting the $8k already there. Start line ≈ 7/1 (baseline); 6/1 avoided (net-worth data-entry artifact). Baseline stores funSaved.
- **Collapsible dashboard sections** (3ab8bc9): Have-To/Want-To (open by default), Trophy Room + Spend by account (collapsed) via DashSection + `bare` prop on GoalTracker/AccountBreakdown/TrophyWall.
- **Sync-health = Proactive Iris v1** (e1de1d0): `src/utils/syncHealth.ts` → nudges for broken/incomplete/rate-limited/stale refreshes so no data is missed behind a rate limit. Silent when healthy.
- **Cooperative achievements** (acca553): Same Page / Household Machine / Both Chipping In (Scott wants coop > competitive; only the 2 fun-money h2h stay competitive). + saveFunMoney dedup key normalized (trim+lowercase).
- **Fun-money annualized projection + meet-in-middle slider** (dd9da75): "on pace for $X/yr from restraint"; comparative-planner blend is now a persisted slider (`budget_blend_rate`, default 0.4).
- **Proactive Iris v2 = persistent dismiss/learning loop** (1106d35): nudges respect snooze (cadence) / dismiss-forever across sessions via nudge engine DismissState (`nudge_dismiss::<id>`). Verified survives reload.
- **Now: master, tsc clean, 232 tests, ~21 commits this session.** Achievements baseline re-captured clean (0/38 earned, growth-since-start).

## ⚠️ Dev-mistake logged (2026-07-06): during a demo I clobbered `last_teller_sync_summary` (cosmetic sync cache, NOT financial data) because I stashed the real value in a window var that a reload wiped. Cleared it (regenerates on next ↻ Refresh). **Rule: never stash-across-reload for a restore — snapshot to a durable place first.** (Later sync-nudge verifications restored correctly using captured values.)

## 🔀 PIVOT READY → Investment (Phase 2/3)
Pre-pivot gamification/fixes push is DONE. Next session likely pivots to the investment side (budget → maintenance). See [[project-iris-gamification-roadmap]] "Direction shift". Deferred: visual redesign (Scott + Gemini; "everything in the same style box"), tooltips + tutorial, deeper coop achievements needing per-month team-banked history, full-history Teller re-pull.

## Persistence + gotchas
- Settings keys: **`gamification_baseline`** (one-time), **`achievements_unlocked`** (`[{id, unlockedAt, celebrated}]`). Both in Postgres (shared DB — preview :5173 and Scott's Chrome hit the SAME DB; baseline captured from preview = fine, it's the intended start line).
- **Cold-start reload race**: hard reload throws transient `useAppData must be used within AppDataProvider` (App.tsx boot, audit PLAUSIBLE `main.tsx boot()`); ErrorBoundary recovers and the app renders. NOT a regression — pre-existing. Worth fixing (wrap boot()).
- ChatView welcome copy is portfolio-framed ("portfolio, market trends") — reads slightly off from a budget entry point. Minor future polish.
- Bash cwd resets to `C:\Claude` — `cd /c/Claude/projects/signal/signal-app` first.

## ⏭️ NEXT — queue (Scott gates priority)
- **Deferred achievements needing new engine primitives** (in docs/achievements-catalog.md): per-month team-banked history (both-banked-3/6/12mo, synchronized-discipline), h2h previous-month lead (comeback), absence detection + event timestamps (comeback-after-week, first-week-explorer), stash computed progress (stash-half/fully/have-to-done), fun spend within-5% (treat-yourself), true distinct-months-used.
- **Proactive Iris (Stage 3)** — the nudge engine now has a budget-milestone precedent; wire the dormant PORTFOLIO nudges too + weekly regenerating nudges + dismiss/learning loop. [[project-iris-dynamic-action-items]].
- **Dedicated Achievements view + nav** (currently a dashboard section); add an 'achievements' route (mind PHASE_1_LOCK gating in useEnabledModules).
- **Couples "earn it, use it on each other"** power-ups (idea pool — winner's pick, taunt cards, chore tokens, rubber-banding, wagers).
- From prior queue: meet-in-middle tuning, fun-money flourishes, cash-flow calendar, subscription radar, FI/retirement projection, debt payoff (deferred, for other households), packaging/PIN-auth + rotate `.env.local`, remaining audit resilience items.
- **Tutorial + tooltips on every graph** (Scott: not till close to final).

## Scott's homework (human actions, unchanged)
Set fun-money opening balances (Scott + Claire) · set real stash cadences · check the $200k car value · reconcile July investing month-end. Also: acknowledge/enjoy the first-run trophy batch.

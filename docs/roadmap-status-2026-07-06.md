# Iris — status & prioritized backlog (2026-07-06 session close)

Snapshot for picking up next session. Full narrative in the memory handoff (`project_iris_handoff_2026-07-06`) and roadmap (`project_iris_gamification_roadmap`).

## State
- **Branch:** `master`. **tsc clean · 232 tests.** ~21 commits this session (last: `1106d35`).
- **Backup posture:** code fully committed to git (local master); data in user-owned **Supabase Postgres** (durable cloud) — nothing browser-trapped. Point-in-time export verified (1,948 expenses / 21 buckets / 6 stashes / 3 accounts). Manual local copy anytime via **Settings → Export**.
- **Decision:** budget/gamification side is solid → next up is the **INVESTMENT pivot** (budget drops to maintenance).

## Solid / shipped (don't re-touch)
Budget engine (3-lane, guaranteed-base, Safe-to-Spend, comparative planner) · Teller sync + mapper · couples model · Fun Money 70/30 ledger · Iris's Take (grounded AI coach) · **Achievements system** (forward-only engine, 41-item tiered catalog, medallion icons, Trophy Room, growth-since-start semantics) · **Proactive Iris** (sync-health nudges + persistent dismiss/learning loop) · streak announcer · collapsible dashboard sections · cooperative achievements · meet-in-the-middle blend slider · audit/resilience fixes.

## Prioritized backlog

### P1 — Investment pivot (next session's focus)
- Unlock the investment module (PHASE_1_LOCK in `useEnabledModules`).
- Wake the dormant **portfolio nudges** (`nudgeEngine` already has holding-move / concentration / cash-drag / net-worth-milestone detectors — never called).
- Conviction holds, rebalancing / monthly allocation recommendations, ETF X-Ray concentration, market intelligence.
- Bones exist: `portfolioIntelligence`, `etfXray`, `IntelligenceView`, `WatchlistView`, `marketDataApi`, `marketIntelligence`.

### P2 — Gamification / Proactive continuation
- **Deeper cooperative achievements** — need a **per-month team-banked history** rollup (the good "both banked N months" ones); also h2h prev-month lead, absence detection, event timestamps, stash computed-progress, fun-spent-within-5%, true distinct-months-used.
- **Proactive Iris v3** — regenerating *weekly* nudges + prescriptive "do/watch/change this" framing (`project_iris_dynamic_action_items`).
- **Dedicated Achievements view + nav** (it's a dashboard section today; mind PHASE_1_LOCK gating).
- More fun-money flourishes (round-number celebrations, streak variety).

### P3 — Near-final polish (before "done")
- **Visual redesign** — Scott's diagnosis: "everything is in the same style box." Needs variety; Scott + Gemini to drive. **Defer piecemeal visual work until then.**
- **Tooltips** on each section/graph.
- **Tutorial / walkthrough.**

### Ops / bugs / low
- **Full-history Teller re-pull** — older transfers/card-payments not backfilled (rate-limited data op; back up expenses first, run guarded).
- **Packaging** — Tauri/SQLite downloadable + PIN→server-session API auth + rotate `.env.local` + GitHub auto-update pipeline.
- **Offline/cache layer** — stale-while-revalidate at the collectionsClient seam (bypass cache on sync/commit; from the offline-architecture decision).
- Cold-start `useAppData` error = dev-only Vite Fast-Refresh transient (NOT a prod bug) — optional export-split cleanup only if the dev-console noise annoys.

## Homework (Scott, mostly done)
Stash cadences ✅ · fun-money opening balances ✅ · car value ✅ · July investing reconcile = pending (hasn't hit yet). After next real ↻ Refresh, `last_teller_sync_summary` repopulates (cleared this session — see handoff dev-mistake note).

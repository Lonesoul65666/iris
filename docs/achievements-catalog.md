# Iris Achievements Catalog — design reference

Source: gamification design pass (2026-07-06). 52 achievements, coach voice, emojis in `icon` only (copy is emoji-free). This doc is the FULL design; `src/utils/achievements.ts` implements the subset evaluable with today's data. Deferred entries need new engine primitives (see bottom).

Tiers: bronze (frequent early dopamine) → silver → gold → platinum (pie-in-the-sky). ~22/15/9/6.

## Categories
- **discipline** — under-base streaks & lifetime counts, cumulative banked
- **funMoney** — personal restraint streaks, banked, saved-from-restraint
- **couples** — team wins + head-to-head competition
- **savings** — savings rate, household saved
- **goals** — stashes funded & crushed
- **netWorth** — prestige, ALWAYS forwardOnly (jumps on investment-account connect)
- **exploration** — feature/engagement events
- **prestige** — composed pie-in-the-sky

## Forward-only rule
Anything the user could already be sitting on from backfilled/imported data (streak lengths, months-under-base, banked $, net worth, savings rate) is `forwardOnly` — gated against a baseline captured on first run, only counts progress AFTER Iris started watching. Net worth especially: connecting a brokerage later must NOT fire a fireworks show. Genuine completion/one-shot events (crushed a goal, connected a bank, committed a move, got an Iris's Take) are NOT forward-only.

## Implemented 2026-07-06 (Rock 2) — turned out to need NO new primitive
`household-machine` (3mo), `household-machine-6`, `household-machine-12`, and `synchronized-discipline` are all live in `achievements.ts`. The original doc entry below assumed a new stored monthly rollup was needed — it wasn't: `funMoneyStreaks`/`underBaseStreak` already derive per-month history live from real expenses, so the joint ("both") streak is just `Math.min(...)` across the existing per-person streaks, forward-only gated against `baseline.funStreaks`/`baseline.underBaseStreak`. Also fixed in passing: `household-machine` was missing `forwardOnly` (a real gap vs. the locked rule) — no unlocks existed yet, so free to fix.

**Dropped** (not deferred — removed) 2026-07-06: `h2h-lead-1`/`h2h-lead-3` (competitive per-person badges) per the cooperative-only decision. Also dropped from this deferred list: `h2h-comeback` / `stole-the-crown` (same reason — competitive, out of scope now).

## Deferred — need new engine primitives (build later)
1. **Comeback-kid** — needs a streak "generation" counter (broke and rebuilt), not just current/best.
2. **Fun spent within 5% of allowance** (treat-yourself) — needs retained monthly fun spend vs allowance delta.
3. **First-week composite + absence detection** (first-week-explorer, comeback-after-week) — need event timestamps / last-open session tracking.
4. **Stash computed progress** (stash-half, stash-fully-funded, have-to-done) — needs computeStashStatus wired into the achievement context (balance vs target).
5. **distinct-months-used** — currently approximated by scorecard full-month count.

The full 52-row table with copy lives in git history of this design pass; the implemented catalog in `achievements.ts` is the source of truth for what actually fires.

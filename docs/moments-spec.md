# Moments — spec

Status: building (phases 1–3), 2026-07-19. Author: Scott + Claude.

## Why
Achievements are the permanent monument (one-and-done, tiered, the trophy wall).
**Moments are the heartbeat** — repeatable, mostly-monthly wins that recur and keep
you (and Claire) engaged. They celebrate every time, tally over time, and *roll up
into* Achievements. This is the reward substrate the future **AI Quest Engine**
(Proactive Iris) will hand out tasks against — so it's built first.

Design muse: Pokémon GO. Quests come TO you; consistency beats grinding (PoGo
Research Breakthrough stamps don't reset on a missed day — mirrors Iris's
life-happens "Glad You're Back" ethos).

## Concepts
- **Moment** — a discrete, repeatable, positive event tied to a period (a month,
  usually). A single occurrence. Unlike an achievement, it can happen again.
- **periodKey** — the month it belongs to, `"YYYY-MM"`.
- **Tally** — derived from the log: total count, current streak, best streak per type.
- **Live quest** — the *current* (incomplete) month shown in-progress with urgency;
  not logged/celebrated until the month closes.

## v1 catalog (all derived from existing data — zero new tracking)
| id | name | fires when | source | scope |
|---|---|---|---|---|
| `beat-the-clock` | Beat the Clock | completed month came in under guaranteed base | Scorecard month | household |
| `both-banked` | Both Banked | both partners under fun-money allowance that month | GameState.fun | couples |
| `held-the-line` | Held the Line | a partner personally under their fun allowance | GameState.fun | per-person |
| `goal-crushed` | Goal Crushed | retired a Want-To (paid cash) | Stash.achievedAt | either |
| `restraint-dividend` | Restraint Dividend | skimmed fun money into savings that month | FunMoney.savedToDate | either |

## Data model
`moments_log` — a settings JSON blob (matches `achievements_unlocked`; ~60 rows/yr).
Entry:
```
{ id: string;            // moment type id, e.g. 'beat-the-clock'
  periodKey: string;     // 'YYYY-MM' (or ISO date for event-style like goal-crushed)
  person?: string;       // for per-person moments
  earnedAt: string;      // ISO
  magnitude?: number;    // optional ($ banked, $ goal, etc.) for copy/sorting
  celebrated?: boolean;  // acknowledged?
}
```
Idempotent key: `${id}:${periodKey}:${person ?? ''}` — logged once, ever.
Migrate to a `collections` table only if it outgrows a settings blob.

## Rules
- **Forward-only** (same as achievements): months completed *before* the baseline
  seed the tally COUNT but never retro-celebrate ("no trophies for June"). Baseline
  reuses / parallels the gamification baseline captured at first run.
- **Completed months only** log + celebrate. A month is "complete" once `now` is
  past its end.
- **Current month = live quest** — computed, not logged. Shows progress + urgency.

## Celebration routing (restraint)
- Routine Moment → quiet **NudgeCard** (stacks, dismiss). Monthly takeovers would
  get old — that stays tacky-adjacent.
- A Moment that **completes a streak / unlocks an Achievement** → escalates to the
  full-screen **CelebrationOverlay** takeover. Big stays big.

## Roll-up into Achievements
Moment tallies become a new input to the achievements engine. Count-based trophies
(lifetime, not just consecutive): "Beat the Clock ×10", "Both Banked ×6", etc.
Existing streak achievements (streak-3/6/12) stay; these add the cumulative angle.

## Phases
1. **Engine + log + tally** — pure `src/utils/moments.ts` + tests. Evaluate catalog
   against Scorecard/GameState/stashes/funMoney; return new Moments + tallies.
2. **Celebration routing** — new Moments → NudgeCard; milestone Moments → takeover.
   Persist `moments_log`, acknowledge like achievements.
3. **Live current-month quest** — a dashboard card: "🎯 July — $X buffer, N days
   left, hold the line." The daily hook.
4. **Moments collection grid** — the Pokédex-style badge book (type × month).
5. **Count-based achievements** the tallies unlock.

## Future layer (NOT this build): AI Quest Engine
Proactive Iris + dynamic action items. Iris reads real spend and generates weekly
quests ("hold dining to $X this week") that stamp toward a monthly breakthrough;
multi-month "sagas" (Special Research); Iris-as-buddy. Moments is what those quests
reward. See [[project-iris-gamification-roadmap]] and the backlog.

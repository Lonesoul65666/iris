# Stashes — design (2026-06-11)

**Status:** approved direction (Scott, 2026-06-11: "an area to add those other saving goals like
taxes, and other random shit that is due every year including saving for remodels or trips").
Naming rule: **"Stash", never "sinking fund"** (user-visible). Internal `SinkingFund` type
migrates opportunistically.

## Problem

Lumpy bills (semi-annual insurance premium, annual card fees, December gifts, quarterly taxes,
trips, remodels) fire monthly over-budget alarms that the user must mentally dismiss — the exact
false-alarm class the Reserve lane was built to kill, but today only `taxes`/`travel_*` get that
treatment, via constants hardcoded in `budgetLanes.ts`. Three disconnected half-systems exist:

1. `RESERVE_ALLOCATIONS` — Scott-specific $/mo constants, display-only, not editable in-app.
2. `SinkingFund.currentBalance` — a manual number box nothing ever updates.
3. `GoalTracker.tsx` — fully built progress UI, rendered nowhere.

Nothing tracks whether the set-asides were actually set aside: the $13k April tax payment is
*conceptually* pre-funded, not *provably*.

## Prior art (what we're synthesizing, not copying)

- **YNAB envelopes/targets**: every category is an envelope with a funded balance; overspending
  pulls from the envelope, not the month. Gold standard, but heavyweight — demands zero-based
  budgeting discipline for every dollar. We want it for LUMPY categories only.
- **Monarch goals**: named goals with target + monthly plan, linked to accounts. Pretty, but
  balances come from account linking, not category flow — doesn't net lumpy *spending* down.
- **Simple (RIP) Goals**: auto-accrue daily toward a target; spending "from" a goal. Closest in
  spirit: money quietly accumulates, big bill draws it down, no monthly alarm.

Iris synthesis: **a Stash = monthly contribution + linked expense categories.** Contributions
accrue automatically; spend in linked categories draws the stash down instead of busting the
month. Categories linked to a stash ARE the reserve lane (replaces the hardcoded list).

## Decisions

**D1 — Balances are DERIVED, never stored.** `balance(now) = openingBalance + monthlyContribution
× monthsElapsed(startMonth → current month, inclusive) − netSpend(linked categories, startMonth →
now)`. Pure function of (stash config, expenses, clock) in `src/utils/stashMath.ts`, unit-tested.
No accrual job, no stored running balance to drift or clobber — same principle that killed the
bucket write-on-read bug today. The only persisted fields are user intent: name, contribution,
target, categories, startMonth, openingBalance.

**D2 — Stash-linked categories become the reserve lane, dynamically.** `budgetLanes.ts` gains a
runtime registry (`configureStashLanes(categories, allocations)`) seeded from stash config at app
load — same pattern as `registerCustomCategories`. Defaults stay exactly today's behavior
(taxes/travel_personal/travel_work, $1,500/$1,000/$0) so nothing changes until stashes are
configured. All `laneOf()` call sites and the 84 tests stay untouched.

**D3 — Safe-to-Spend subtracts stash contributions.** The reserve set-aside line becomes
Σ(monthlyContribution) over all stashes when stash config exists, falling back to the legacy
constants otherwise. One source of truth — never both (no double-count).

**D4 — Balance can go negative, and that's the point.** A negative Taxes stash says "you spent
taxes you hadn't set aside" — honest, actionable, never hidden. UI shows it red with plain copy.

**D5 — Seeding (one-time, flagged `stashes_seeded_v1`).** On first load after ship: existing
stash rows are kept; if no stash covers `taxes` / `travel_personal`, append "Taxes" ($1,500/mo)
and "Trips & Travel" ($1,000/mo) seeded from the legacy constants, `startMonth` = current month,
`openingBalance` 0. Scott sets real opening balances in the card (what's actually sitting in
savings for each pot). No retroactive backfill by default — a backfilled stash would render a
huge negative balance on day one (Sept 2025 → now tax spend exceeds 10×$1,500), which is honest
but reads as broken before the user has even configured opening balances.

**D6 — UI is a NEW component (`StashesCard.tsx`), not more BudgetView.** BudgetView is ~1,690
lines; the scalability-watchdog rule says new surfaces get their own modules. The card replaces
the edit-mode-buried Stashes grid on the Budget overview: per stash — derived balance, target
progress, monthly contribution, linked-category chips, draws this year, inline edit (contribution,
target, opening balance, category links). Emergency-fund-style stashes simply link no categories.

**Scope locks (NOT in this build):** per-transaction stash assignment (category links only),
partner attribution, external account balances backing a stash, auto-suggesting stash candidates
from recurring detection (follow-up: needs the >180-day lookback fix), GoalTracker merge (the
couples scoreboard mounts it later — different surface, same math module).

## Consequences

- `SinkingFund` type gains optional `categories: string[]`, `startMonth: 'YYYY-MM'`,
  `openingBalance: number`. Old rows without them keep working (no categories = pure savings pot).
- Lane math becomes configuration-sensitive: tests pin BOTH the default behavior and a configured
  example.
- The Monthly Detail reserve rows and Safe-to-Spend formula line read from the registry, so the
  numbers Scott edits in the card flow everywhere immediately.

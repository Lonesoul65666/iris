// Stash math — DERIVED balances for the saving pots (taxes, trips, remodels,
// "random shit that is due every year"). See docs/stashes-design.md.
//
// COMMIT-DRIVEN balance (2026-07-05, Scott): a pot holds what you actually MOVED,
// not what time says you should have. It does NOT auto-accrue by month.
//
//   balance(now) = openingBalance
//                + Σ committed moves for this stash (DeployConfirmations) up to `now`
//                − Σ EXPLICIT draws recorded against this stash (PotDraws) up to `now`
//
// Both sides are capped AS OF `now` so a month-scoped view (paging the Pulse
// back) can never show money that hadn't moved yet.
//
// DRAW-DOWN IS EXPLICIT, NEVER INFERRED (Scott, 2026-08-13: "we definitely don't
// want to draw down"; 2026-08-17: "one explicit button, no inference"). The
// balance used to subtract net spend in `stash.categories`, which meant linking a
// category silently armed auto-draw-down. Because that was unwanted, every pot
// was left with `categories: []` — which ALSO disabled the stash-driven reserve
// lane (applyStashLaneConfig no-ops without categories), so the app fell back to
// hardcoded legacy constants that no longer matched the real plan. Splitting the
// two concerns fixes both: `categories` now only classifies the reserve LANE, and
// money leaves a pot only when a human says it did.
//
// A month only adds to the balance once you hit "commit" (a DeployConfirmation on
// the stash's lane) — matching the "a dollar only moves once it's committed"
// model. The old design accrued `monthlyContribution × monthsElapsed`, which
// showed a phantom balance before anything was committed. Nothing is persisted
// but user intent + the commit ledger. Pure functions, no React/IO.

import type { Expense, Stash } from '../types/budget';
import type { DeployConfirmation, PotDraw } from '../stores/budgetStore';
import { currentMonthKey } from './transactionAnalysis';
import { configureStashLanes, RESERVE_ALLOCATIONS } from './budgetLanes';

export interface StashStatus {
  stash: Stash;
  /** Derived when startMonth is set; falls back to the legacy manual balance. */
  balance: number;
  derived: boolean;
  contributed: number;     // openingBalance + accrued contributions
  /** Σ EXPLICIT draws recorded against this pot (never inferred from spend). */
  drawn: number;
  monthsAccrued: number;
  /** $ committed to this pot in the CURRENT month (0 = this month's move hasn't
   *  been made yet). Lets every surface show commit state right next to the
   *  numbers, instead of splitting "here's the balance" and "here's the button"
   *  across two cards that can't see each other. */
  committedThisMonth: number;
  /** Largest single-month draw since startMonth — "the bill this stash exists for". */
  biggestDraw: { month: string; amount: number } | null;
  /** Progress toward targetAmount (0..1), null when no target set. */
  targetProgress: number | null;
}

/** Whole months from startMonth through the current month, both inclusive.
 *  Contributions are credited on the 1st — funding a stash starts the month
 *  you create it. Returns 0 for a startMonth in the future. */
export function monthsElapsedInclusive(startMonth: string, now: Date = new Date()): number {
  if (!/^\d{4}-\d{2}$/.test(startMonth)) return 0;
  const [sy, sm] = startMonth.split('-').map(Number);
  const cur = currentMonthKey(now);
  const [cy, cm] = cur.split('-').map(Number);
  const n = (cy - sy) * 12 + (cm - sm) + 1;
  return Math.max(0, n);
}

/** Did this stash exist by `month` ('YYYY-MM')? A stash is anchored by its
 *  startMonth (when accrual began — the creation proxy), so it should never
 *  appear in a month-scoped view (e.g. paging back the commit run) BEFORE it
 *  existed. Legacy pots with no startMonth are treated as always-existing — we
 *  can't know their creation date and hiding real data is worse than showing it.
 *  An empty month (the 'avg' overview, not a specific past month) → true. */
export function stashExistedBy(stash: Stash, month: string): boolean {
  if (!month) return true;
  if (!stash.startMonth) return true;
  return stash.startMonth <= month;
}

/** ⚠️ `_expenses` is UNUSED and kept only so the 29 existing call sites don't all
 *  have to change in the same commit as the balance-model switch. The balance no
 *  longer reads transactions at all — draws are explicit. Drop the parameter in a
 *  follow-up (the compiler will find every site; the types don't line up if one
 *  is missed). Do not add logic that depends on it. */
export function computeStashStatus(stash: Stash, _expenses: Expense[], confirms: DeployConfirmation[] = [], now: Date = new Date(), draws: PotDraw[] = []): StashStatus {
  const derived = Boolean(stash.startMonth);
  if (!derived) {
    return {
      stash,
      balance: stash.currentBalance || 0,
      derived: false,
      contributed: stash.currentBalance || 0,
      drawn: 0,
      monthsAccrued: 0,
      committedThisMonth: 0,
      biggestDraw: null,
      targetProgress: stash.targetAmount > 0 ? Math.min(1, (stash.currentBalance || 0) / stash.targetAmount) : null,
    };
  }

  const start = stash.startMonth!;
  const thisMonth = currentMonthKey(now);
  // Commit-driven: sum the moves ACTUALLY committed to this pot, not an accrual of
  // the planned drip. monthsAccrued = the count of committed months ("funded N
  // months" reads as N months you actually moved money).
  //
  // AS-OF `now`, never "all months" (fixed 2026-08-20). Draws were already capped
  // at the current month while commits weren't, so paging the Pulse back to July
  // showed July's withdrawals against a balance that included AUGUST's commit —
  // a past month reading as funded by money that hadn't been moved yet. A
  // month-scoped view has to be scoped on both sides of the ledger.
  const stashConfirms = confirms.filter((c) => c.lane === stash.id && (c.month || '') <= thisMonth);
  const committed = stashConfirms.reduce((s, c) => s + (c.amount || 0), 0);
  const monthsAccrued = stashConfirms.length;
  const contributed = (stash.openingBalance || 0) + committed;
  const committedThisMonth = stashConfirms
    .filter((c) => c.month === thisMonth)
    .reduce((s, c) => s + (c.amount || 0), 0);

  // EXPLICIT draws only. `stash.categories` deliberately plays no part here —
  // it classifies the reserve lane, nothing more. Draws after the current month
  // are ignored so paging back to an earlier month can't show future withdrawals
  // (the commit side above is capped the same way).
  const potDraws = draws.filter(d => d.potId === stash.id && d.month >= start && d.month <= thisMonth);
  let drawn = 0;
  let biggestDraw: { month: string; amount: number } | null = null;
  const byMonth = new Map<string, number>();
  // Amounts are SIGNED: positive = money left the pot, negative = money came back
  // (the bill was refunded, or the draw was recorded too high). The old inferred
  // model got this free by netting refunds inside the category; with explicit
  // draws it has to be expressible, so `drawn` is a NET figure.
  for (const d of potDraws) {
    const amt = d.amount || 0;
    if (!Number.isFinite(amt) || amt === 0) continue;
    drawn += amt;
    byMonth.set(d.month, (byMonth.get(d.month) || 0) + amt);
  }
  // "The bill this pot exists for" = the biggest single month of withdrawals,
  // which is what the recurring-have-to forecast paces against.
  for (const [month, amount] of byMonth) {
    if (!biggestDraw || amount > biggestDraw.amount) biggestDraw = { month, amount: Math.round(amount) };
  }

  const balance = Math.round(contributed - drawn);
  return {
    stash,
    balance,
    derived: true,
    contributed: Math.round(contributed),
    drawn: Math.round(drawn),
    monthsAccrued,
    committedThisMonth: Math.round(committedThisMonth),
    biggestDraw,
    targetProgress: stash.targetAmount > 0 ? Math.max(0, Math.min(1, balance / stash.targetAmount)) : null,
  };
}

export function computeAllStashes(stashes: Stash[], expenses: Expense[], confirms: DeployConfirmation[] = [], now: Date = new Date(), draws: PotDraw[] = []): StashStatus[] {
  return stashes.map(s => computeStashStatus(s, expenses, confirms, now, draws));
}

const DAYS_PER_MONTH = 30.44;
const MS_PER_DAY = 86_400_000;

/** Resolve a stash's NEXT due date from its cadence — the anchor the countdown
 *  and pace math run against. Pure (no IO):
 *   - 'custom' (or a legacy targetDate with no cadence) → the one-time targetDate.
 *   - 'annual' → the next 1st-of-`dueMonth` strictly after `now`.
 *   - 'semiannual' → the sooner of `dueMonth` and `dueMonth`+6, next occurrence.
 *  Returns null when the cadence has no usable anchor (unset month / date). */
export function nextDueDate(stash: Stash, now: Date = new Date()): Date | null {
  const cadence = stash.cadence;
  if (cadence === 'custom' || (!cadence && stash.targetDate)) {
    if (!stash.targetDate) return null;
    const d = new Date(`${stash.targetDate}T00:00:00`);
    // ⚠️ An Invalid Date is TRUTHY and every arithmetic guard downstream passes
    // quietly (`NaN <= 0` is false, `NaN > 0` is false), so a malformed
    // targetDate — a half-typed date, a hand-edited row, a bad import — rendered
    // "$NaN" on the card, and the auto-fill then WROTE NaN, which JSON.stringify
    // turns into null. Refuse it here, once, where the date is parsed.
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // A dueMonth outside 1–12 is data corruption, not a date: JS would happily
  // normalise month 98 into a real (nonsense) future date.
  if ((cadence === 'annual' || cadence === 'semiannual') && stash.dueMonth && stash.dueMonth >= 1 && stash.dueMonth <= 12) {
    const m = stash.dueMonth - 1; // 0-indexed month
    const cands: Date[] = [];
    const push = (year: number, month: number) => {
      const d = new Date(year, month, 1); // JS normalizes month overflow into the next year
      if (d.getTime() > now.getTime()) cands.push(d);
    };
    push(now.getFullYear(), m);
    push(now.getFullYear() + 1, m);
    if (cadence === 'semiannual') {
      push(now.getFullYear() - 1, m + 6);
      push(now.getFullYear(), m + 6);
      push(now.getFullYear() + 1, m + 6);
    }
    cands.sort((a, b) => a.getTime() - b.getTime());
    return cands[0] ?? null;
  }
  return null;
}

/** How many monthly moves are LEFT to make before the bill lands — counting this
 *  month, inclusive. This is the denominator the whole section paces against.
 *
 *  ⚠️ This replaced `daysToDue / 30.44` (bug found 2026-08-12). A pot is funded by
 *  DISCRETE monthly commits, but fractional calendar time shrinks every single
 *  day while the balance only jumps once a month. So a drip set to exactly hit
 *  the goal read "behind" the very next morning, and the "bump to $X/mo" number
 *  climbed daily — all five of Scott's pots were flagged behind with requireds
 *  inflated 5–30%. Counting MOVES makes the number stable inside a month and
 *  recalculated only when a month turns (or when you commit).
 *
 *  A bill due on the 1st can't be helped by that month's move, so the due month
 *  only counts when the bill lands after the 1st. Scott's model: "you want to do
 *  this in four months and it's going to cost $2,000 — I got to split that into
 *  five pieces" — this month plus the four ahead of it. */
export function commitMonthsRemaining(due: Date, now: Date = new Date()): number {
  const whole = (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth());
  const dueMonthUsable = due.getDate() > 1 ? 1 : 0;
  return Math.max(0, whole + dueMonthUsable);
}

/** Chunk D — the shortfall nudge. A lumpy bill can outrun its pot (you set aside
 *  $900, the $1,600 bill lands) → the derived balance goes negative. Surface the
 *  gap so the user makes it up, plus how long the current drip takes to recover.
 *  Returns null unless the pot is derived AND underwater. Pure. */
export interface StashShortfall {
  gap: number;                                   // how far underwater (> 0)
  culprit: { month: string; amount: number } | null; // the bill that outran it
  recoverMonths: number | null;                  // months back to $0 at the current drip (null if no drip)
}
export function computeShortfall(status: StashStatus): StashShortfall | null {
  if (!status.derived || status.balance >= 0) return null;
  const gap = Math.round(-status.balance);
  const contribution = status.stash.monthlyContribution || 0;
  return {
    gap,
    culprit: status.biggestDraw,
    recoverMonths: contribution > 0 ? Math.ceil(gap / contribution) : null,
  };
}

/** Forward look at a stash vs its goal — built on the DERIVED balance, so the
 *  pots show "how full + when full" the same way they show their balance. Pure
 *  numbers + a status enum; the component formats the label (keeps this IO-free).
 *  Returns null when no goal is set (nothing to forecast). */
export interface StashForecast {
  target: number;
  remaining: number;              // $ still needed to hit the goal (>= 0)
  percent: number;                // 0..100 of goal funded
  status: 'met' | 'past_due' | 'on_track' | 'behind' | 'projecting' | 'idle';
  projectedMonth: string | null;  // "Mar 2027" — when it fills at the current rate
  additionalNeeded: number | null;// extra $/mo to make a set deadline
  monthsToGo: number | null;      // months to fill at the current contribution
  // ── gamified / cadence layer ──
  kind: 'have_to' | 'want_to';
  contribution: number;           // the current $/mo drip (for the label)
  daysToFill: number | null;      // days to reach target at the drip (0 when met, null when no drip)
  dueLabel: string | null;        // "Oct 1, 2026" — resolved next due date
  daysToDue: number | null;       // days until the due date (null when no deadline)
  requiredPerMonth: number | null;// $/mo needed to hit the deadline in time
  expectedHit: number | null;     // recurring have-to: size of the next bill (biggest past draw)
  hitRemaining: number | null;    // recurring have-to: $ still needed to cover the NEXT hit (vs the full-year goal in `remaining`)
  // ── commit layer (2026-08-12) — "here's what you need to do to get there" ──
  /** Monthly moves left before the bill lands, counting this one. */
  commitMonthsLeft: number | null;
  /** $ already committed to this pot THIS month (0 = the move isn't made yet). */
  committedThisMonth: number;
  /** ⭐ The headline ask: what to commit THIS month to stay on plan. Recomputed
   *  from the live balance over the moves left, so overpaying shrinks every
   *  future ask and underpaying grows them — the pot self-corrects at month
   *  boundaries instead of drifting upward by the day. 0 once this month's move
   *  is committed (or the goal is met). */
  thisMonthAsk: number;
  /** Recurring have-to: the steady-state $/mo once a full cycle is available
   *  (annual total ÷ 12). Null for one-time goals — nothing recurs. */
  steadyStatePerMonth: number | null;
  /** Recurring have-to that started mid-cycle, so the FIRST hit has fewer months
   *  to fund it than the steady state assumes. Lets the UI surface BOTH numbers
   *  instead of scoring the pot "behind" for something the calendar did. */
  firstCycleCompressed: boolean;
}

/** First of a 'YYYY-MM' month, as a local Date. */
function monthStart(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

export function computeStashForecast(status: StashStatus, now: Date = new Date()): StashForecast | null {
  const { stash, biggestDraw, committedThisMonth } = status;
  // Coerce the stored numbers. `target <= 0` already rejects a missing goal, but
  // a NaN passes every comparison it meets, and one NaN infects the whole
  // forecast — target, remaining, percent, the ask. Nothing downstream can
  // recover from it, so it stops here.
  const target = Number(stash.targetAmount) || 0;
  if (target <= 0) return null;
  const balance = Number(status.balance) || 0;

  const remaining = Math.max(0, target - balance);
  const percent = Math.max(0, Math.min(100, Math.round((balance / target) * 100)));
  const contribution = Number(stash.monthlyContribution) || 0;
  const kind = stash.kind ?? 'want_to';
  const fmtMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  // A recurring pot's deadline is about covering the NEXT payment, so the size of
  // that payment is either what the last one actually cost (biggestDraw) or, with
  // no history yet, the target split across the cycle.
  const isRecurring = stash.cadence === 'annual' || stash.cadence === 'semiannual';
  // Gated on the CADENCE, not the kind (fixed 2026-08-20). Gating on
  // `kind === 'have_to'` left a semiannual WANT-to pacing against the full annual
  // target while its own steady-state line divided that target by 12 — the pot
  // contradicted itself, and it was the one case where the auto-fill and the
  // displayed ask still disagreed after they were unified.
  const expectedHit = biggestDraw?.amount
    ?? (isRecurring || kind === 'have_to' ? Math.round(target / (stash.cadence === 'semiannual' ? 2 : 1)) : null);

  // Days to reach the goal at the current drip — the gamified "how long" number.
  const daysToFill = remaining <= 0 ? 0
    : contribution > 0 ? Math.round((remaining / contribution) * DAYS_PER_MONTH)
    : null;

  const due = nextDueDate(stash, now);
  const dueLabel = due ? fmtDay(due) : null;
  // CEIL, not round: with rounding, a bill due at 00:00 tomorrow read as 0 days
  // from about lunchtime today, which tripped the `daysToDue <= 0` past-due
  // branch a day early — the pot declared the deadline missed while there was
  // still a day to move money. Any time left at all is at least one day.
  const daysToDue = due ? Math.ceil((due.getTime() - now.getTime()) / MS_PER_DAY) : null;

  // A recurring have-to's deadline is about covering the NEXT payment (annual =
  // the whole goal; semiannual = half), not topping up the full-year reserve.
  const hitTarget = (isRecurring && expectedHit) ? expectedHit : target;
  const hitRemaining = isRecurring ? Math.max(0, hitTarget - balance) : null;

  // Monthly MOVES left before the bill lands — the pacing denominator. See
  // commitMonthsRemaining: never fractional calendar time.
  const commitMonthsLeft = due ? commitMonthsRemaining(due, now) : null;

  // Steady state for a recurring obligation: the annual total spread over 12.
  // ($3,300/yr insurance paid twice = $275/mo, regardless of cadence.)
  const steadyStatePerMonth = isRecurring ? Math.ceil(target / 12) : null;

  // Started mid-cycle? Then the first hit has fewer months behind it than the
  // steady state assumes — an artifact of WHEN you started, not overspending.
  const cycleMonths = stash.cadence === 'semiannual' ? 6 : 12;
  const movesSinceStart = (due && stash.startMonth)
    ? commitMonthsRemaining(due, monthStart(stash.startMonth))
    : null;
  const firstCycleCompressed = isRecurring && movesSinceStart !== null && movesSinceStart < cycleMonths;

  const base = {
    target, remaining, percent, kind, contribution, daysToFill, dueLabel, daysToDue,
    expectedHit, hitRemaining, commitMonthsLeft, committedThisMonth,
    steadyStatePerMonth, firstCycleCompressed,
  };

  if (balance >= target) {
    return { ...base, status: 'met', projectedMonth: null, additionalNeeded: null, monthsToGo: 0, daysToFill: 0, requiredPerMonth: null, thisMonthAsk: 0 };
  }

  // Anchored to a cadence deadline: what does this month need?
  if (due && daysToDue !== null && commitMonthsLeft !== null) {
    // Recurring pots pace against the next payment; one-time goals against the goal.
    const needed = isRecurring ? Math.max(0, hitTarget - balance) : remaining;
    if (daysToDue <= 0 || commitMonthsLeft <= 0) {
      // PAST DUE. There are no moves left to spread the gap over, so this branch
      // used to offer the ENTIRE remaining gap as the month's one-tap commit — a
      // $6,000 button sitting next to a $1,082 plan, on the surface whose whole
      // purpose is "hit commit, then move exactly that from checking".
      //
      // A missed deadline doesn't change what you can actually move this month.
      // So the ask falls back to the pot's own planned drip (the same rule the
      // no-deadline branch uses) and the gap stays visible in `remaining` /
      // `hitRemaining` with the status still past_due — the card's job is to say
      // "catch up at your rate, or re-date it", not to pre-fill a number nobody
      // is going to transfer.
      const dripAsk = Math.max(0, Math.round(contribution) - committedThisMonth);
      return {
        ...base, status: 'past_due', projectedMonth: fmtMonth(due), additionalNeeded: null,
        monthsToGo: null, requiredPerMonth: null,
        thisMonthAsk: contribution > 0 ? dripAsk : Math.round(needed),
      };
    }
    if (needed <= 0) {
      // Already hold enough for the next hit — nothing more to do this cycle.
      return { ...base, status: 'on_track', projectedMonth: fmtMonth(due), additionalNeeded: null, monthsToGo: commitMonthsLeft, requiredPerMonth: 0, thisMonthAsk: 0 };
    }
    // Pace against what this month needed BEFORE any of it was committed.
    // `balance` (and therefore `needed`) already includes this month's commits,
    // so pacing off `needed` alone would shrink the month's own target the
    // moment you part-funded it — the pot would congratulate itself for a
    // partial move. Adding the commits back makes `requiredPerMonth` stable for
    // the whole month, which is what StashesCard already promises the user.
    const monthNeeded = needed + committedThisMonth;
    const requiredPerMonth = Math.ceil(monthNeeded / commitMonthsLeft);
    // The ask is the RESIDUAL, not a boolean. A partial commit used to zero this
    // out, so a $436 move against a $1,082 month read "fully funded" (Scott's
    // August 2026 taxes pot did exactly that). Overpaying clamps to 0 and shrinks
    // future months via the smaller `needed`; underpaying leaves the gap visible.
    const thisMonthAsk = Math.max(0, requiredPerMonth - committedThisMonth);
    if (contribution >= requiredPerMonth) {
      return { ...base, status: 'on_track', projectedMonth: fmtMonth(due), additionalNeeded: null, monthsToGo: commitMonthsLeft, requiredPerMonth, thisMonthAsk };
    }
    return { ...base, status: 'behind', projectedMonth: fmtMonth(due), additionalNeeded: Math.max(1, requiredPerMonth - contribution), monthsToGo: commitMonthsLeft, requiredPerMonth, thisMonthAsk };
  }

  // No deadline: project a fill date from the monthly drip.
  if (contribution > 0) {
    const monthsToGo = Math.ceil(remaining / contribution);
    const projected = new Date(now.getFullYear(), now.getMonth() + monthsToGo, 1);
    // No deadline, so the drip IS the month's target — residual, same as above.
    return { ...base, status: 'projecting', projectedMonth: fmtMonth(projected), additionalNeeded: null, monthsToGo, requiredPerMonth: null, thisMonthAsk: Math.max(0, Math.round(contribution) - committedThisMonth) };
  }

  // A goal with no funding path — can't project; nudge to set a contribution.
  return { ...base, status: 'idle', projectedMonth: null, additionalNeeded: null, monthsToGo: null, requiredPerMonth: null, thisMonthAsk: 0 };
}

/** The $/mo to write into the contribution field when the goal or the date
 *  changes — the auto-fill ("don't make me do the math"). Pass the pot's status
 *  with the EDIT already applied to `.stash`.
 *
 *  This is deliberately a thin delegate to computeStashForecast: the number we
 *  WRITE has to be the number the card will JUDGE against. They used to be two
 *  computations, and they disagreed in two real cases —
 *    · a recurring pot with history: the card paces against the last actual bill
 *      (`biggestDraw`), the old autofill against the full-year target, so it
 *      wrote a drip the card immediately called "behind";
 *    · a part-committed month: the card adds this month's commits back so the
 *      requirement is stable all month, the old autofill didn't, so editing a
 *      date after committing wrote a number too low.
 *
 *  Null when there's nothing to compute (no goal, no due date, past due, or the
 *  cycle is already funded) — the caller then leaves the user's number alone. */
export function requiredMonthlyForGoal(status: StashStatus, now: Date = new Date()): number | null {
  const f = computeStashForecast(status, now);
  const req = f?.requiredPerMonth;
  // Last line of defence before a number gets PERSISTED: never write a non-finite
  // contribution (JSON turns NaN into null, so the pot silently loses its drip).
  return req && Number.isFinite(req) ? req : null;
}

// ── The commit run ────────────────────────────────────────────────────────────
// Scott's actual workflow: hit commit on each pot, add up the total, then move
// exactly that from checking into the special savings account. So the total is a
// LOAD-BEARING number, not a summary — and it has to be the same number wherever
// it appears (2026-08-12: the Pulse footer summed each pot's PLANNED fill for
// committed pots, so a $640 move against a $240 plan reported $240 — you'd have
// transferred the wrong amount). One computation, every surface.

export interface StashCommitRow {
  stash: Stash;
  status: StashStatus;
  forecast: StashForecast | null;
  /** What's STILL owed this month to stay on plan. Falls back to the planned drip
   *  for pots with no goal (nothing to pace against). 0 once the month's target
   *  is met — which a partial commit does NOT do. */
  ask: number;
  /** $ ACTUALLY committed this month — what the total must be built from. */
  committed: number;
  /** A confirm exists for this month. NOT the same as "done" — check `ask === 0`
   *  for that, since a partial commit is committed AND still owing. */
  isCommitted: boolean;
  /** This month's target is fully met (nothing left to move). */
  isFullyFunded: boolean;
}

export interface StashCommitRun {
  rows: StashCommitRow[];
  /** Σ actually committed this month — the amount to move from checking. */
  committedTotal: number;
  /** Σ of what every pot is still asking for — including part-funded ones. */
  remainingAsk: number;
  /** Pots that still owe something this month, part-funded ones included. */
  pendingCount: number;
  /** Pots carrying a confirm that doesn't cover the month's target. */
  partialCount: number;
}

/** Build the month's commit run: per-pot ask + commit state, and the totals.
 *  Active pots only — a retired want-to is inert. Pure. */
export function computeCommitRun(
  stashes: Stash[],
  expenses: Expense[],
  confirms: DeployConfirmation[] = [],
  now: Date = new Date(),
  draws: PotDraw[] = [],
): StashCommitRun {
  const rows: StashCommitRow[] = [];
  for (const s of stashes) {
    if (s.achievedAt) continue;
    const status = computeStashStatus(s, expenses, confirms, now, draws);
    const forecast = computeStashForecast(status, now);
    const committed = status.committedThisMonth;
    // No goal to pace against → the planned drip IS the target (the Savings pot).
    const planned = Math.round(s.monthlyContribution || 0);
    // Residual, never a boolean — `committed > 0 ? 0 : …` was the bug: any commit,
    // however small, reported the pot done for the month.
    const ask = forecast ? forecast.thisMonthAsk : Math.max(0, planned - committed);
    rows.push({
      stash: s, status, forecast, ask, committed,
      isCommitted: committed > 0,
      isFullyFunded: ask === 0,
    });
  }
  return {
    rows,
    committedTotal: rows.reduce((t, r) => t + r.committed, 0),
    remainingAsk: rows.reduce((t, r) => t + r.ask, 0),
    pendingCount: rows.filter(r => r.ask > 0).length,
    partialCount: rows.filter(r => r.committed > 0 && r.ask > 0).length,
  };
}

/** Σ monthly contributions — the PLANNED set-aside (Safe-to-Spend default line).
 *  In the "Make Every Dolla Holla" commit model this is intent, not money moved:
 *  the live surfaces override it with committedReserves() (what actually left). */
export function totalStashContributions(stashes: Stash[]): number {
  return stashes.reduce((s, f) => s + (f.monthlyContribution || 0), 0);
}

/** Σ of stash "moves" the user has COMMITTED (physically moved to savings) in a
 *  given month — the committed-reserve number that replaces the old auto $2,000
 *  set-aside. A stash lane is any DeployConfirmation whose lane is a stash id
 *  (all stash ids are `stash-…`); 'investing' and other lanes are excluded. A
 *  dollar only leaves the $15,800 once it's committed, so this starts at $0 and
 *  climbs as pots are funded. Pure — feeds Money Map / Pulse / Safe-to-Spend. */
/** Σ committed stash moves across every month of `year` ('YYYY') — the honest
 *  year-to-date set-aside. Replaces `totalReserveSetAside() × monthsElapsed` in
 *  the "free to deploy" reconciliation, which credited a PLANNED constant
 *  ($2,000/mo of legacy defaults = $16,000 by August) against the ~$2,403 actually
 *  moved, overstating free cash by the difference. Same principle Safe-to-Spend
 *  already uses: a dollar only counts as set aside once it's been moved. */
export function committedReservesForYear(confirms: DeployConfirmation[], year: string): number {
  if (!year) return 0;
  return confirms
    .filter(c => c.lane.startsWith('stash-') && c.month.startsWith(`${year}-`))
    .reduce((s, c) => s + (c.amount || 0), 0);
}

export function committedReserves(confirms: DeployConfirmation[], month: string): number {
  if (!month) return 0;
  return confirms
    .filter(c => c.month === month && c.lane.startsWith('stash-'))
    .reduce((s, c) => s + (c.amount || 0), 0);
}

/** Per-category allocation map for the lane registry (configureStashLanes).
 *  A category covered by several stashes sums their contributions. */
export function stashAllocationsByCategory(stashes: Stash[]): { categories: string[]; allocations: Record<string, number> } {
  const allocations: Record<string, number> = {};
  const categories: string[] = [];
  for (const s of stashes) {
    for (const c of s.categories ?? []) {
      if (!categories.includes(c)) categories.push(c);
      // Spread the stash contribution evenly across its categories for display;
      // the lane decision only needs membership, the $ split is advisory.
      const share = (s.monthlyContribution || 0) / Math.max(1, (s.categories ?? []).length);
      allocations[c] = Math.round(((allocations[c] || 0) + share) * 100) / 100;
    }
  }
  return { categories, allocations };
}

/** True when any stash has linked categories — i.e. stash config should drive
 *  the reserve lane instead of the legacy defaults. */
export function stashesConfigured(stashes: Stash[]): boolean {
  return stashes.some(s => (s.categories ?? []).length > 0);
}

/** Push stash config into the lane registry (call at app load and whenever
 *  stashes change). No-op when stashes aren't configured — legacy defaults
 *  keep ruling, so pre-stash installs behave exactly as before. */
export function applyStashLaneConfig(stashes: Stash[]): void {
  if (!stashesConfigured(stashes)) return;
  const { categories, allocations } = stashAllocationsByCategory(stashes);
  configureStashLanes(categories, allocations, totalStashContributions(stashes));
}

/** One-time seed (design D5): if no stash covers taxes / personal travel,
 *  create them from the legacy reserve constants, accruing from this month
 *  with a $0 opening balance (the user sets the real opening number).
 *  Returns the appended list, or null when nothing needed seeding. */
export function seedDefaultStashes(stashes: Stash[], now: Date = new Date()): Stash[] | null {
  const covered = new Set(stashes.flatMap(s => s.categories ?? []));
  // Also skip by id — a Taxes/Trips stash that exists but hasn't linked its
  // category must NOT be duplicated (dup ids collapse on save = data loss).
  const existingIds = new Set(stashes.map(s => s.id));
  // …and skip by NAME. Both guards above miss the now-normal case: a
  // user-created pot called "Income Taxes" with no linked category and a
  // generated `stash-<timestamp>` id. `covered` is empty (no categories anywhere
  // — the default since draw-down went explicit) and the id isn't 'stash-taxes',
  // so seeding would happily add a SECOND taxes pot beside the real one, and the
  // new pot's `categories` would flip the whole reserve lane on its way in.
  // Scott only escaped this because `stashes_seeded_v1` was already set.
  const nameMatches = (needles: string[]) =>
    stashes.some(s => {
      const n = (s.name ?? '').toLowerCase();
      return needles.some(w => n.includes(w));
    });
  const hasTaxesPot = nameMatches(['tax']);
  const hasTravelPot = nameMatches(['travel', 'trip', 'vacation']);
  const additions: Stash[] = [];
  if (!covered.has('taxes') && !existingIds.has('stash-taxes') && !hasTaxesPot) {
    additions.push({
      id: 'stash-taxes', name: 'Taxes', targetAmount: 0, currentBalance: 0,
      monthlyContribution: RESERVE_ALLOCATIONS.taxes ?? 0, color: '#dc2626',
      categories: ['taxes'], startMonth: currentMonthKey(now), openingBalance: 0,
      kind: 'have_to',
    });
  }
  if (!covered.has('travel_personal') && !existingIds.has('stash-travel') && !hasTravelPot) {
    additions.push({
      id: 'stash-travel', name: 'Trips & Travel', targetAmount: 0, currentBalance: 0,
      monthlyContribution: RESERVE_ALLOCATIONS.travel_personal ?? 0, color: '#0ea5e9',
      categories: ['travel_personal'], startMonth: currentMonthKey(now), openingBalance: 0,
      kind: 'want_to',
    });
  }
  return additions.length > 0 ? [...stashes, ...additions] : null;
}

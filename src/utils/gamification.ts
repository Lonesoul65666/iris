// Gamification engine — the "money as a hobby" layer. PURE and ZERO-AI.
//
// This is the deterministic spine the game rides on: streaks, and the templated
// "live announcer" greeting shown when you open the app. Everything here is
// computed from data we ALREADY derive (savings scorecard + fun-money ledger) —
// no new DB collection, no migration, and crucially NO LLM call. The proactive
// AI voice (Iris's Take) narrates ON TOP of this state later; the game itself
// never costs a token. See project_iris_gamification_roadmap (Tier 2).
//
// Tone: Scott's full-send coach voice, emojis OFF (trophy-room tone note).

import type { Expense, FunMoney } from '../types/budget';
import type { Scorecard } from './savingsScorecard';
import { computeMonthlySpending, currentMonthKey } from './transactionAnalysis';
import { funBudgetForMonth, funCategoryFor } from './funMoney';

// ─── Streak primitive ───

export interface Streak {
  /** Consecutive qualifying periods ending at the most recent COMPLETED one. */
  current: number;
  /** Longest qualifying run ever observed in the series. */
  best: number;
  /** Is the run still alive (the most recent completed period qualified)? */
  active: boolean;
}

/** Reduce a chronological run of pass/fail flags to a streak.
 *  `current` = trailing run of trues; `best` = longest run anywhere. */
export function streakOf(flags: boolean[]): Streak {
  let best = 0;
  let run = 0;
  for (const f of flags) {
    run = f ? run + 1 : 0;
    if (run > best) best = run;
  }
  let current = 0;
  for (let i = flags.length - 1; i >= 0; i--) {
    if (flags[i]) current++;
    else break;
  }
  return { current, best, active: current > 0 };
}

/** Enumerate 'YYYY-MM' from `start` up to (but NOT including) `endExclusive`.
 *  Mirrors funMoney's internal helper (kept local — that one isn't exported). */
function monthsUpTo(start: string, endExclusive: string): string[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = endExclusive.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while ((y < ey || (y === ey && m < em)) && out.length < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// ─── Household discipline streak ───

/** Consecutive FULL months the household's total spend came in at/under the
 *  guaranteed base. This is the core "we're living within our means" streak. */
export function underBaseStreak(scorecard: Scorecard): Streak {
  const full = scorecard.months.filter((m) => !m.partial);
  return streakOf(full.map((m) => m.surplusVsBase >= 0));
}

// ─── Per-person fun-money streak ───

export interface PersonFunStreak {
  person: string;
  earnerId?: string;
  /** Consecutive completed months this person stayed at/under their fun allowance. */
  streak: Streak;
}

/** Per-person, per-COMPLETED-month fun-money pass/fail (leftover ≥ 0 against the
 *  allowance in effect that month). The current in-progress month is excluded —
 *  only settled months count. Single source of truth for both the fun streaks
 *  below and the Moments engine (which logs a Moment per qualifying month). */
export interface PersonMonthResults {
  person: string;
  earnerId?: string;
  months: { periodKey: string; passed: boolean }[]; // chronological, completed only
}

export function funMonthlyResults(
  funMoney: FunMoney[],
  expenses: Expense[],
  now: Date = new Date(),
): PersonMonthResults[] {
  const monthly = computeMonthlySpending(expenses);
  const byMonth = new Map(monthly.map((m) => [m.month, m]));
  const curKey = currentMonthKey(now);

  return funMoney.map((f) => {
    const cat = f.category ?? funCategoryFor(f.person);
    const start = f.startMonth ?? curKey;
    const months = monthsUpTo(start, curKey).map((mk) => {
      const spend = byMonth.get(mk)?.byCategory[cat] ?? 0;
      return { periodKey: mk, passed: funBudgetForMonth(f, mk) - spend >= 0 };
    });
    return { person: f.person, earnerId: f.earnerId, months };
  });
}

/** For each fun-money pot, the run of completed months the person spent at or
 *  under the allowance that was in effect that month (leftover ≥ 0). The current
 *  in-progress month is excluded — only settled months count toward the streak. */
export function funMoneyStreaks(
  funMoney: FunMoney[],
  expenses: Expense[],
  now: Date = new Date(),
): PersonFunStreak[] {
  return funMonthlyResults(funMoney, expenses, now).map((r) => ({
    person: r.person,
    earnerId: r.earnerId,
    streak: streakOf(r.months.map((m) => m.passed)),
  }));
}

// ─── Aggregate game state + the templated announcer ───

export interface GameState {
  underBase: Streak;
  fun: PersonFunStreak[];
  monthsUnderBase: number; // lifetime count of full months under base
  cumulativeBanked: number;
  trend: Scorecard['trend'];
}

export function computeGameState(
  scorecard: Scorecard,
  funMoney: FunMoney[],
  expenses: Expense[],
  now: Date = new Date(),
): GameState {
  return {
    underBase: underBaseStreak(scorecard),
    fun: funMoneyStreaks(funMoney, expenses, now),
    monthsUnderBase: scorecard.monthsUnderBase,
    cumulativeBanked: scorecard.cumulativeBanked,
    trend: scorecard.trend,
  };
}

export interface Greeting {
  headline: string;
  detail?: string;
}

const mo = (n: number) => `${n} month${n === 1 ? '' : 's'}`;

/** The live announcer. Deterministic pick from game state (no AI, no randomness —
 *  same state always yields the same line, which keeps it testable). Leads with
 *  the strongest signal: a live discipline streak, then the fun-money head-to-head,
 *  then trend, then a cold-start welcome. Full-send voice, emojis off. */
export function gameGreeting(state: GameState): Greeting {
  const { underBase, fun, trend } = state;

  // 1. A live household discipline streak is the headline act.
  if (underBase.active && underBase.current >= 2) {
    const detail = fun.length >= 2 ? funHeadToHead(fun) : undefined;
    const tie = underBase.current === underBase.best && underBase.best >= 3
      ? ` That's your best run yet.`
      : '';
    return {
      headline: `${mo(underBase.current)} straight living under your base.${tie} That's not luck — that's a habit.`,
      detail,
    };
  }

  // 2. Streak just snapped — name it, don't sugarcoat, point forward.
  if (!underBase.active && underBase.best >= 2) {
    return {
      headline: `Your ${mo(underBase.best)} under-base streak snapped. One clean month starts the next one.`,
      detail: fun.length >= 2 ? funHeadToHead(fun) : undefined,
    };
  }

  // 3. No discipline streak yet — let the fun-money race carry it.
  if (fun.length >= 2) {
    const line = funHeadToHead(fun);
    if (line) return { headline: line };
  }

  // 4. Trend fallback.
  if (trend === 'better') {
    return { headline: `Spending came down last month. Keep the foot off the gas.` };
  }
  if (trend === 'worse') {
    return { headline: `Spending ticked up last month. Let's win this one back.` };
  }

  // 5. Cold start.
  return { headline: `Let's make this month count. First clean month starts the streak.` };
}

/** The Scott-vs-Claire fun-money one-liner. Returns '' if it isn't a real race
 *  (fewer than two people, or nobody has a streak going). */
export function funHeadToHead(fun: PersonFunStreak[]): string {
  const active = fun.filter((p) => p.streak.current > 0);
  if (fun.length < 2) return '';

  const sorted = [...fun].sort((a, b) => b.streak.current - a.streak.current);
  const [lead, chase] = sorted;

  if (active.length === 0) return `Fun-money slate is clean — first one to bank a month takes the lead.`;

  if (lead.streak.current === chase.streak.current) {
    return `${lead.person} and ${chase.person} are dead even — ${mo(lead.streak.current)} banked apiece. Break the tie.`;
  }

  const gap = lead.streak.current - chase.streak.current;
  return `${lead.person}'s banked fun money ${mo(lead.streak.current)} running — ${chase.person}'s ${gap} behind. Catch up.`;
}

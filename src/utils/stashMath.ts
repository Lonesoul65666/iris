// Stash math — DERIVED balances for the saving pots (taxes, trips, remodels,
// "random shit that is due every year"). See docs/stashes-design.md (D1):
//
//   balance(now) = openingBalance
//                + monthlyContribution × monthsElapsed(startMonth → current, inclusive)
//                − net spend in linked categories since startMonth
//
// Nothing is persisted but user intent (contribution, target, categories,
// startMonth, openingBalance) — no stored running balance to drift or clobber.
// Pure functions, no React/IO.

import type { Expense, Stash } from '../types/budget';
import { currentMonthKey, computeMonthlySpending } from './transactionAnalysis';
import { configureStashLanes, RESERVE_ALLOCATIONS } from './budgetLanes';

export interface StashStatus {
  stash: Stash;
  /** Derived when startMonth is set; falls back to the legacy manual balance. */
  balance: number;
  derived: boolean;
  contributed: number;     // openingBalance + accrued contributions
  drawn: number;           // net linked-category spend since startMonth (refunds netted)
  monthsAccrued: number;
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

export function computeStashStatus(stash: Stash, expenses: Expense[], now: Date = new Date()): StashStatus {
  const derived = Boolean(stash.startMonth);
  if (!derived) {
    return {
      stash,
      balance: stash.currentBalance || 0,
      derived: false,
      contributed: stash.currentBalance || 0,
      drawn: 0,
      monthsAccrued: 0,
      biggestDraw: null,
      targetProgress: stash.targetAmount > 0 ? Math.min(1, (stash.currentBalance || 0) / stash.targetAmount) : null,
    };
  }

  const start = stash.startMonth!;
  const monthsAccrued = monthsElapsedInclusive(start, now);
  const contributed = (stash.openingBalance || 0) + stash.monthlyContribution * monthsAccrued;

  let drawn = 0;
  let biggestDraw: { month: string; amount: number } | null = null;
  const cats = new Set(stash.categories ?? []);
  if (cats.size > 0) {
    // computeMonthlySpending already nets refunds inside byCategory.
    const monthly = computeMonthlySpending(expenses).filter(m => m.month >= start && m.month <= currentMonthKey(now));
    for (const m of monthly) {
      let monthDraw = 0;
      for (const c of cats) monthDraw += m.byCategory[c] || 0;
      drawn += monthDraw;
      if (monthDraw > 0 && (!biggestDraw || monthDraw > biggestDraw.amount)) {
        biggestDraw = { month: m.month, amount: Math.round(monthDraw) };
      }
    }
  }

  const balance = Math.round(contributed - drawn);
  return {
    stash,
    balance,
    derived: true,
    contributed: Math.round(contributed),
    drawn: Math.round(drawn),
    monthsAccrued,
    biggestDraw,
    targetProgress: stash.targetAmount > 0 ? Math.max(0, Math.min(1, balance / stash.targetAmount)) : null,
  };
}

export function computeAllStashes(stashes: Stash[], expenses: Expense[], now: Date = new Date()): StashStatus[] {
  return stashes.map(s => computeStashStatus(s, expenses, now));
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
  additionalNeeded: number | null;// extra $/mo to make a set targetDate
  monthsToGo: number | null;      // months to fill at the current contribution
}

export function computeStashForecast(status: StashStatus, now: Date = new Date()): StashForecast | null {
  const { stash, balance } = status;
  const target = stash.targetAmount || 0;
  if (target <= 0) return null;

  const remaining = Math.max(0, target - balance);
  const percent = Math.max(0, Math.min(100, Math.round((balance / target) * 100)));
  const contribution = stash.monthlyContribution || 0;
  const fmtMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  if (balance >= target) {
    return { target, remaining: 0, percent: 100, status: 'met', projectedMonth: null, additionalNeeded: null, monthsToGo: 0 };
  }

  // Anchored to an explicit deadline: are we pacing to make it?
  if (stash.targetDate) {
    const td = new Date(stash.targetDate);
    const monthsLeft = (td.getFullYear() - now.getFullYear()) * 12 + (td.getMonth() - now.getMonth());
    const projectedMonth = fmtMonth(td);
    if (monthsLeft <= 0) {
      return { target, remaining, percent, status: 'past_due', projectedMonth, additionalNeeded: null, monthsToGo: null };
    }
    const requiredPerMonth = remaining / monthsLeft;
    if (contribution >= requiredPerMonth) {
      return { target, remaining, percent, status: 'on_track', projectedMonth, additionalNeeded: null, monthsToGo: monthsLeft };
    }
    return { target, remaining, percent, status: 'behind', projectedMonth, additionalNeeded: Math.ceil(requiredPerMonth - contribution), monthsToGo: monthsLeft };
  }

  // No deadline: project a fill date from the monthly drip.
  if (contribution > 0) {
    const monthsToGo = Math.ceil(remaining / contribution);
    const projected = new Date(now.getFullYear(), now.getMonth() + monthsToGo, 1);
    return { target, remaining, percent, status: 'projecting', projectedMonth: fmtMonth(projected), additionalNeeded: null, monthsToGo };
  }

  // A goal with no funding path — can't project; nudge to set a contribution.
  return { target, remaining, percent, status: 'idle', projectedMonth: null, additionalNeeded: null, monthsToGo: null };
}

/** Σ monthly contributions — the Safe-to-Spend "reserve set-asides" line (D3). */
export function totalStashContributions(stashes: Stash[]): number {
  return stashes.reduce((s, f) => s + (f.monthlyContribution || 0), 0);
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
  const additions: Stash[] = [];
  if (!covered.has('taxes')) {
    additions.push({
      id: 'stash-taxes', name: 'Taxes', targetAmount: 0, currentBalance: 0,
      monthlyContribution: RESERVE_ALLOCATIONS.taxes ?? 0, color: '#dc2626',
      categories: ['taxes'], startMonth: currentMonthKey(now), openingBalance: 0,
      kind: 'have_to',
    });
  }
  if (!covered.has('travel_personal')) {
    additions.push({
      id: 'stash-travel', name: 'Trips & Travel', targetAmount: 0, currentBalance: 0,
      monthlyContribution: RESERVE_ALLOCATIONS.travel_personal ?? 0, color: '#0ea5e9',
      categories: ['travel_personal'], startMonth: currentMonthKey(now), openingBalance: 0,
      kind: 'want_to',
    });
  }
  return additions.length > 0 ? [...stashes, ...additions] : null;
}

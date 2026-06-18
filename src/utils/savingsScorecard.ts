// Savings scorecard — the Budget Engine's payoff metric (Phase 1).
//
// Answers "are we living under our GUARANTEED income, month over month, and
// what have we banked?" Per the locked budget architecture (variable = surplus),
// the baseline is the GUARANTEED BASE — the steady paycheck(s) you can always
// count on — NOT the blended average that includes lumpy variable/RSU/OT.
//
// Two numbers per month:
//   surplusVsBase = base - personal spend   (the discipline number; + = under guarantee)
//   banked        = real income - spend      (the cash-truth number; variable bridges)
// Plus a cumulative "banked since" running total. Pure function — no React/IO.

import type { Expense } from '../types/budget';
import { computeMonthlySpending, isCompleteMonth } from './transactionAnalysis';

function monthKey(date: string | undefined): string {
  if (!date) return '';
  if (date.includes('/')) {
    const [m, , y] = date.split('/');
    return m && y ? `${y}-${m.padStart(2, '0')}` : '';
  }
  return date.slice(0, 7);
}

/**
 * Guaranteed base monthly income = the steady paycheck floor. Computed as the
 * MODAL paycheck (rounded to $50 — the recurring base, not the variable spikes)
 * × pay-periods-per-month (observed). Excludes variable/RSU/OT and reimbursements
 * (only transactionType==='income' inflows count). E.g. $7,917 base × 2 ≈ $15,800.
 */
export function computeGuaranteedBase(expenses: Expense[]): number {
  const income = expenses.filter(
    (e) => (e.flow || 'outflow') === 'inflow' && e.transactionType === 'income',
  );
  if (income.length === 0) return 0;

  // Modal paycheck amount (round to nearest $50 so penny/variance doesn't fragment).
  const counts = new Map<number, number>();
  for (const e of income) {
    const k = Math.round(Math.abs(e.amount) / 50) * 50;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let modal = 0;
  let best = 0;
  for (const [k, c] of counts) {
    if (c > best) { best = c; modal = k; }
  }

  // Pay periods per month = paycheck count / distinct months they landed in.
  const months = new Set(income.map((e) => monthKey(e.date)).filter(Boolean));
  const perMonth = Math.max(1, Math.round(income.length / Math.max(1, months.size)));
  return modal * perMonth;
}

export interface ScorecardMonth {
  month: string;          // 'YYYY-MM'
  label: string;          // 'May 2026'
  income: number;         // real earned income that month (excludes reimbursements)
  spend: number;          // everyday/operating spend (excludes work, reimbursements, reserve, investing)
  reserveSpend: number;   // reserve-lane outflows (taxes/travel) — the lumpy stuff
  totalSpend: number;     // everyday + reserve — the REAL personal spend that month
  surplusVsBase: number;  // base - totalSpend  (+ = lived under base; - = over base, by how much)
  banked: number;         // income - totalSpend (cash-honest; variable income bridges the gap)
  partial: boolean;       // current/in-progress month (don't count in trend/cumulative)
}

/**
 * The honest spend-vs-base picture, averaged over full months — surfaced as a
 * one-line summary beneath the bars. The bars already show every month's TOTAL
 * spend against base (a $26k tax/travel month towers in red); this line states
 * the average and how much of it leans on variable pay.
 */
export interface SolvencySummary {
  base: number;           // guaranteed base income / mo
  avgEveryday: number;    // mean everyday spend over full months
  avgReserve: number;     // mean reserve spend (taxes/travel) over full months
  avgTotalSpend: number;  // avgEveryday + avgReserve — what the full life actually costs / mo
  variableLean: number;   // max(0, avgTotalSpend - base) — how much/mo leans on variable pay
}

export interface Scorecard {
  guaranteedBase: number;
  months: ScorecardMonth[];
  cumulativeBanked: number;     // sum of banked over full months
  monthsUnderBase: number;      // count of full months whose TOTAL spend came in under base
  fullMonthCount: number;
  lastFull?: ScorecardMonth;
  priorFull?: ScorecardMonth;
  /** 'better' = last full month's total spend was less than the prior; 'worse' = more. */
  trend: 'better' | 'worse' | 'flat' | 'unknown';
  solvency: SolvencySummary;
}

export function computeScorecard(expenses: Expense[], opts: { since?: string } = {}): Scorecard {
  const since = opts.since ?? '2025-09';
  const base = computeGuaranteedBase(expenses);

  const monthly = computeMonthlySpending(expenses)
    .filter((m) => m.month >= since)
    .sort((a, b) => a.month.localeCompare(b.month));

  const months: ScorecardMonth[] = monthly.map((m) => {
    const spend = Math.round(m.totalOperating);
    const reserveSpend = Math.round(m.totalReserve);
    const totalSpend = spend + reserveSpend;
    return {
      month: m.month,
      label: m.monthLabel,
      income: Math.round(m.totalIncome),
      spend,
      reserveSpend,
      totalSpend,
      // Blunt and honest: did our TOTAL real spend (everyday + the lumpy
      // taxes/travel) come in under the guaranteed base? A $26k tax/travel month
      // towers over base in red; green only when we genuinely spent less than
      // base. Variable pay covers the overage (System 2 — the overage card) —
      // but THIS chart shows the raw truth, no set-aside sleight of hand.
      surplusVsBase: base - totalSpend,
      banked: Math.round(m.totalIncome - m.totalExpenses),
      // CALENDAR check — the in-progress month is partial no matter how many
      // transactions it has. (income===0 guards data-edge months, e.g. an import
      // that started mid-month.)
      partial: !isCompleteMonth(m.month) || m.totalIncome === 0,
    };
  });

  const full = months.filter((m) => !m.partial);
  const cumulativeBanked = full.reduce((s, m) => s + m.banked, 0);
  const monthsUnderBase = full.filter((m) => m.surplusVsBase >= 0).length;
  const lastFull = full[full.length - 1];
  const priorFull = full[full.length - 2];

  let trend: Scorecard['trend'] = 'unknown';
  if (lastFull && priorFull) {
    if (lastFull.totalSpend < priorFull.totalSpend) trend = 'better';
    else if (lastFull.totalSpend > priorFull.totalSpend) trend = 'worse';
    else trend = 'flat';
  }

  // Solvency summary — averaged over full months. The bars carry the raw truth;
  // this states the average total spend vs base and the variable lean.
  const n = Math.max(1, full.length);
  const avgEveryday = Math.round(full.reduce((s, m) => s + m.spend, 0) / n);
  const avgReserve = Math.round(full.reduce((s, m) => s + m.reserveSpend, 0) / n);
  const avgTotalSpend = avgEveryday + avgReserve;
  const solvency: SolvencySummary = {
    base,
    avgEveryday,
    avgReserve,
    avgTotalSpend,
    variableLean: Math.max(0, avgTotalSpend - base),
  };

  return { guaranteedBase: base, months, cumulativeBanked, monthsUnderBase, fullMonthCount: full.length, lastFull, priorFull, trend, solvency };
}

/**
 * The recurring per-PAYCHECK base floor — the modal paycheck amount (rounded to
 * $50 so penny variance doesn't fragment the mode). This is `computeGuaranteedBase`
 * BEFORE multiplying by pay-periods-per-month: the floor a single paycheck has to
 * clear before the excess counts as variable/overage. Robust to the semi-monthly
 * base/base+variable alternation that broke the old consecutive-diff band walk.
 */
export function computeRecurringPaycheckFloor(expenses: Expense[]): number {
  const income = expenses.filter(
    (e) => (e.flow || 'outflow') === 'inflow' && e.transactionType === 'income',
  );
  if (income.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const e of income) {
    const k = Math.round(Math.abs(e.amount) / 50) * 50;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let modal = 0;
  let best = 0;
  for (const [k, c] of counts) {
    if (c > best) { best = c; modal = k; }
  }
  return modal;
}

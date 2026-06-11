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
import { computeMonthlySpending } from './transactionAnalysis';

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
  spend: number;          // personal spend (excludes work + reimbursements)
  surplusVsBase: number;  // base - spend  (+ = lived under the guarantee)
  banked: number;         // income - spend (actual net cash banked that month)
  partial: boolean;       // current/partial month (don't count in trend/cumulative)
}

export interface Scorecard {
  guaranteedBase: number;
  months: ScorecardMonth[];
  cumulativeBanked: number;     // sum of banked over full months
  monthsUnderBase: number;      // count of full months that lived under base
  fullMonthCount: number;
  lastFull?: ScorecardMonth;
  priorFull?: ScorecardMonth;
  /** 'better' = last full month spent less than the prior; 'worse' = more. */
  trend: 'better' | 'worse' | 'flat' | 'unknown';
}

export function computeScorecard(expenses: Expense[], opts: { since?: string } = {}): Scorecard {
  const since = opts.since ?? '2025-09';
  const base = computeGuaranteedBase(expenses);

  const monthly = computeMonthlySpending(expenses)
    .filter((m) => m.month >= since)
    .sort((a, b) => a.month.localeCompare(b.month));

  const months: ScorecardMonth[] = monthly.map((m) => ({
    month: m.month,
    label: m.monthLabel,
    income: Math.round(m.totalIncome),
    spend: Math.round(m.totalExpenses),
    surplusVsBase: Math.round(base - m.totalExpenses),
    banked: Math.round(m.totalIncome - m.totalExpenses),
    // Heuristic: a month with very few transactions OR no income yet is partial.
    partial: m.transactionCount <= 10 || m.totalIncome === 0,
  }));

  const full = months.filter((m) => !m.partial);
  const cumulativeBanked = full.reduce((s, m) => s + m.banked, 0);
  const monthsUnderBase = full.filter((m) => m.surplusVsBase >= 0).length;
  const lastFull = full[full.length - 1];
  const priorFull = full[full.length - 2];

  let trend: Scorecard['trend'] = 'unknown';
  if (lastFull && priorFull) {
    if (lastFull.spend < priorFull.spend) trend = 'better';
    else if (lastFull.spend > priorFull.spend) trend = 'worse';
    else trend = 'flat';
  }

  return { guaranteedBase: base, months, cumulativeBanked, monthsUnderBase, fullMonthCount: full.length, lastFull, priorFull, trend };
}

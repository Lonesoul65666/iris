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
  spend: number;          // OPERATING / everyday spend (excludes work, reimbursements, AND reserve lanes)
  reserveSpend: number;   // reserve-lane outflows that month (taxes/travel — lumpy, drawn from stash/overage)
  surplusVsBase: number;  // base - set-aside - everyday spend  (+ = lived under base after setting aside)
  banked: number;         // income - ALL personal spend (the honest cash number; reserves included)
  partial: boolean;       // current/in-progress month (don't count in trend/cumulative)
}

/**
 * The honest "can guaranteed money carry our whole life" picture — averaged
 * over full months. System 1 (the green/red verdict) grades the everyday game
 * you can win; this is the calm truth underneath it, so a winnable headline
 * can never hide the fact that the variable quietly funds the rest.
 */
export interface SolvencySummary {
  base: number;           // guaranteed base income / mo
  setAside: number;       // monthly reserve set-aside (stash contributions) charged against base
  avgOperating: number;   // mean everyday spend over full months
  avgReserve: number;     // mean reserve spend (taxes/travel) over full months — the lumpy truth, amortized
  overhead: number;       // base - setAside - avgOperating  (everyday cushion left under base)
  trueLifeCost: number;   // avgOperating + avgReserve  (what the full life actually costs / mo)
  variableLean: number;   // max(0, trueLifeCost - base)  (how much of the full life leans on variable pay)
}

export interface Scorecard {
  guaranteedBase: number;
  setAside: number;             // monthly reserve set-aside charged against base in the verdict
  months: ScorecardMonth[];
  cumulativeBanked: number;     // sum of banked over full months
  monthsUnderBase: number;      // count of full months that lived under base (after set-aside)
  fullMonthCount: number;
  lastFull?: ScorecardMonth;
  priorFull?: ScorecardMonth;
  /** 'better' = last full month's everyday spend was less than the prior; 'worse' = more. */
  trend: 'better' | 'worse' | 'flat' | 'unknown';
  solvency: SolvencySummary;
}

/**
 * @param opts.setAside  Monthly reserve set-aside (Σ stash contributions). The
 *   two-system model: the everyday verdict charges this COMMITMENT against base,
 *   while the lumpy spend it funds (taxes/travel) draws the stash/overage and so
 *   never paints a month red on its own. Defaults to 0 (operating-only — the
 *   legacy behavior, kept for tests and pre-stash installs).
 */
export function computeScorecard(expenses: Expense[], opts: { since?: string; setAside?: number } = {}): Scorecard {
  const since = opts.since ?? '2025-09';
  const setAside = Math.max(0, Math.round(opts.setAside ?? 0));
  const base = computeGuaranteedBase(expenses);

  const monthly = computeMonthlySpending(expenses)
    .filter((m) => m.month >= since)
    .sort((a, b) => a.month.localeCompare(b.month));

  const months: ScorecardMonth[] = monthly.map((m) => ({
    month: m.month,
    label: m.monthLabel,
    income: Math.round(m.totalIncome),
    // The everyday verdict charges base MINUS the monthly set-aside against your
    // everyday spend. A $13k tax payment is a planned reserve withdrawal that
    // draws the stash/overage — not "blew the base by $13k" (the two-system
    // model's whole point). banked stays cash-honest: income minus EVERYTHING
    // personal (operating + reserve), so taxes still reduce what you banked.
    spend: Math.round(m.totalOperating),
    reserveSpend: Math.round(m.totalReserve),
    surplusVsBase: Math.round(base - setAside - m.totalOperating),
    banked: Math.round(m.totalIncome - m.totalExpenses),
    // CALENDAR check — the in-progress month is partial no matter how many
    // transactions it has. (income===0 guards data-edge months, e.g. an import
    // that started mid-month.)
    partial: !isCompleteMonth(m.month) || m.totalIncome === 0,
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

  // Solvency truth — averaged over full months. This is the line that keeps the
  // winnable headline honest: it surfaces how much of the real, full-life cost
  // (everyday + lumpy taxes/travel) the guaranteed base genuinely covers, and
  // how much leans on the variable. Calm information, never an alarm.
  const n = Math.max(1, full.length);
  const avgOperating = Math.round(full.reduce((s, m) => s + m.spend, 0) / n);
  const avgReserve = Math.round(full.reduce((s, m) => s + m.reserveSpend, 0) / n);
  const trueLifeCost = avgOperating + avgReserve;
  const solvency: SolvencySummary = {
    base,
    setAside,
    avgOperating,
    avgReserve,
    overhead: base - setAside - avgOperating,
    trueLifeCost,
    variableLean: Math.max(0, trueLifeCost - base),
  };

  return { guaranteedBase: base, setAside, months, cumulativeBanked, monthsUnderBase, fullMonthCount: full.length, lastFull, priorFull, trend, solvency };
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

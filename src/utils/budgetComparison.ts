// Budget comparison — the "don't plan blind" layer (2026-07-05, Scott).
//
// When you set up a month's budget, this shows what you ACTUALLY did last month
// (and the recent average) next to your target, and — where you overspent — where
// the slack is to cover it. Pure functions over the existing monthly-spend math;
// no React/IO. Feeds both the comparative UI and the AI advisor's grounded facts.

import type { Expense, BudgetBucket } from '../types/budget';
import { computeMonthlySpending, isCompleteMonth } from './transactionAnalysis';
import { laneOf, isOverBudget } from './budgetLanes';

export interface CategoryComparison {
  category: string;
  label: string;
  icon: string;
  target: number;            // current planned monthlyBudget
  lastMonthActual: number;   // spend in the most recent COMPLETE month
  avgActual: number;         // mean actual over the last up-to-3 complete months
  deltaVsTarget: number;     // lastMonthActual − target (+ = over, − = under)
  status: 'over' | 'under' | 'on';
  lane: 'fixed' | 'flexible' | 'reserve';
}

// A suggested reallocation: pull slack from an under-spent flexible category to
// cover a consistent overspend elsewhere, so the month is shaped from reality.
export interface RebalanceMove {
  fromCategory: string; fromLabel: string;
  toCategory: string;   toLabel: string;
  amount: number;
  reason: string;
}

export interface BudgetComparison {
  hasHistory: boolean;
  lastMonth: string;         // 'YYYY-MM' of the most recent complete month ('' if none)
  lastMonthLabel: string;    // 'June 2026'
  monthsCompared: number;    // how many complete months the average spans (1–3)
  rows: CategoryComparison[];
  moves: RebalanceMove[];
  totalOverspend: number;    // Σ overage across over-target flexible categories
  totalSlack: number;        // Σ slack across under-target flexible categories
}

// Lane-aware, matching the app's isOverBudget semantics so we don't cry wolf:
//  • reserve (taxes / work travel / personal travel) is funded separately and
//    never flags — showing reimbursed work travel as "over" is just noise.
//  • fixed (housing, healthcare…) only flags past its tolerance band; you can't
//    rebalance a mortgage, so it's never a slack source.
//  • flexible flags over the moment it exceeds, and is the only slack source.
function classify(category: string, actual: number, target: number): 'over' | 'under' | 'on' {
  const lane = laneOf(category);
  if (lane === 'reserve') return 'on';
  if (isOverBudget(category, actual, target)) return 'over';
  if (lane === 'flexible' && target - actual >= Math.max(25, target * 0.1)) return 'under';
  return 'on';
}

export function computeBudgetComparison(
  expenses: Expense[],
  buckets: BudgetBucket[],
  now: Date = new Date(),
): BudgetComparison {
  const complete = computeMonthlySpending(expenses).filter((m) => isCompleteMonth(m.month, now));
  const recent = complete.slice(-3); // last up-to-3 complete months
  const last = recent[recent.length - 1];

  const empty: BudgetComparison = {
    hasHistory: false, lastMonth: '', lastMonthLabel: '', monthsCompared: 0,
    rows: [], moves: [], totalOverspend: 0, totalSlack: 0,
  };
  if (!last) return empty;

  const rows: CategoryComparison[] = buckets.map((b) => {
    const lastMonthActual = Math.round(last.byCategory[b.category] || 0);
    const avgActual = Math.round(
      recent.reduce((s, m) => s + (m.byCategory[b.category] || 0), 0) / recent.length,
    );
    const target = b.monthlyBudget || 0;
    return {
      category: b.category,
      label: b.label,
      icon: b.icon,
      target,
      lastMonthActual,
      avgActual,
      deltaVsTarget: lastMonthActual - target,
      status: classify(b.category, lastMonthActual, target),
      lane: laneOf(b.category),
    };
  });

  // Rebalance suggestions only trade FLEXIBLE (discretionary) categories — you
  // can't move a housing payment or a tax reserve to cover a dining blowout.
  const flex = rows.filter((r) => r.lane === 'flexible');
  const over = flex.filter((r) => r.status === 'over').sort((a, b) => b.deltaVsTarget - a.deltaVsTarget);
  const under = flex
    .filter((r) => r.status === 'under')
    .map((r) => ({ ...r, slack: r.target - r.lastMonthActual }))
    .sort((a, b) => b.slack - a.slack);

  const totalOverspend = over.reduce((s, r) => s + r.deltaVsTarget, 0);
  const totalSlack = under.reduce((s, r) => s + r.slack, 0);

  // Greedy match: cover each overspend from the largest remaining slack pools.
  const moves: RebalanceMove[] = [];
  const slackLeft = under.map((r) => ({ ...r }));
  for (const o of over) {
    let need = o.deltaVsTarget;
    for (const s of slackLeft) {
      if (need <= 0) break;
      if (s.slack <= 0) continue;
      const amount = Math.round(Math.min(need, s.slack));
      if (amount < 10) continue; // don't suggest trivial moves
      moves.push({
        fromCategory: s.category, fromLabel: s.label,
        toCategory: o.category, toLabel: o.label,
        amount,
        reason: `${o.label} ran ${money(o.deltaVsTarget)} over last month; ${s.label} came in ${money(s.slack)} under.`,
      });
      s.slack -= amount;
      need -= amount;
    }
  }

  return {
    hasHistory: true,
    lastMonth: last.month,
    lastMonthLabel: last.monthLabel,
    monthsCompared: recent.length,
    rows,
    moves: moves.slice(0, 5), // keep the helper focused
    totalOverspend: Math.round(totalOverspend),
    totalSlack: Math.round(totalSlack),
  };
}

function money(n: number): string {
  return `$${Math.abs(Math.round(n)).toLocaleString()}`;
}

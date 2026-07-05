// Budget comparison — the "don't plan blind" layer (2026-07-05, Scott).
//
// When you set up a month's budget, this shows what you ACTUALLY did last month
// next to your target, and suggests adapting each category's OWN target toward
// reality — "meet in the middle." It does NOT move money between buckets (Scott:
// never raid the fun money to cover dining — those are untouchable). Pure funcs
// over the existing monthly-spend math; feeds the UI and the AI advisor.

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

// A suggested change to ONE category's own target — meet last month in the middle.
// No cross-bucket transfers. `kind` is which way the target moves.
export interface TargetSuggestion {
  category: string;
  label: string;
  currentTarget: number;
  suggestedTarget: number;
  lastMonthActual: number;
  kind: 'raise' | 'trim';
  reason: string;
}

export interface BudgetComparison {
  hasHistory: boolean;
  lastMonth: string;         // 'YYYY-MM' of the most recent complete month ('' if none)
  lastMonthLabel: string;    // full name, e.g. 'June 2026'
  monthsCompared: number;    // how many complete months the average spans (1–3)
  rows: CategoryComparison[];
  suggestions: TargetSuggestion[];
}

// Fun-money pots (fun_scott / fun_wife / fun_*) are UNTOUCHABLE — the whole point
// of them is do-whatever-you-want money, so we never suggest changing their cap.
function isUntouchable(category: string): boolean {
  return category.startsWith('fun_');
}

// Only flexible, non-fun categories are adaptable — you can't retune a mortgage,
// a tax reserve, or someone's fun money.
function isAdjustable(category: string, lane: string): boolean {
  return lane === 'flexible' && !isUntouchable(category);
}

// Lane-aware over/under, matching the app's isOverBudget so we don't cry wolf:
// reserve never flags, fixed only past tolerance, flexible flags on any excess.
function classify(category: string, actual: number, target: number): 'over' | 'under' | 'on' {
  const lane = laneOf(category);
  if (lane === 'reserve') return 'on';
  if (isOverBudget(category, actual, target)) return 'over';
  if (lane === 'flexible' && target - actual >= Math.max(25, target * 0.1)) return 'under';
  return 'on';
}

function fullMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Meet the plan and the actual in the middle, rounded to $25. This is the new
// target a category should probably carry given how it really ran.
function meetInMiddle(target: number, actual: number): number {
  return Math.round((target + actual) / 2 / 25) * 25;
}

export function computeBudgetComparison(
  expenses: Expense[],
  buckets: BudgetBucket[],
  now: Date = new Date(),
): BudgetComparison {
  const complete = computeMonthlySpending(expenses).filter((m) => isCompleteMonth(m.month, now));
  const recent = complete.slice(-3); // last up-to-3 complete months
  const last = recent[recent.length - 1];

  if (!last) {
    return { hasHistory: false, lastMonth: '', lastMonthLabel: '', monthsCompared: 0, rows: [], suggestions: [] };
  }

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

  // Per-category "meet in the middle" target tweaks — adjustable categories only,
  // and only when the new target moves at least $25 (skip no-op nudges).
  const suggestions: TargetSuggestion[] = rows
    .filter((r) => isAdjustable(r.category, r.lane) && r.status !== 'on' && r.target > 0)
    .map((r) => {
      const suggestedTarget = meetInMiddle(r.target, r.lastMonthActual);
      const kind: 'raise' | 'trim' = r.lastMonthActual > r.target ? 'raise' : 'trim';
      return {
        category: r.category,
        label: r.label,
        currentTarget: r.target,
        suggestedTarget,
        lastMonthActual: r.lastMonthActual,
        kind,
        reason: kind === 'raise'
          ? `Spent ${money(r.lastMonthActual)} vs ${money(r.target)} plan — split the difference.`
          : `Only spent ${money(r.lastMonthActual)} of ${money(r.target)} — free up the slack.`,
      };
    })
    .filter((s) => Math.abs(s.suggestedTarget - s.currentTarget) >= 25)
    // Biggest raises first (the blowouts), then trims.
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'raise' ? -1 : 1;
      return Math.abs(b.suggestedTarget - b.currentTarget) - Math.abs(a.suggestedTarget - a.currentTarget);
    })
    .slice(0, 8);

  return {
    hasHistory: true,
    lastMonth: last.month,
    lastMonthLabel: fullMonthLabel(last.month),
    monthsCompared: recent.length,
    rows,
    suggestions,
  };
}

function money(n: number): string {
  return `$${Math.abs(Math.round(n)).toLocaleString()}`;
}

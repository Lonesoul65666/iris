// Fun-money math — pure, testable. The couples model's first surface.
//
// Two jobs:
//  1. Seed FunMoney rows from the household's Earner profiles (the cold-start
//     wizard was supposed to do this; pre-wizard installs have an empty
//     fun_money collection and earners configured in Settings).
//  2. Derive monthlySpent as CURRENT-CALENDAR-MONTH spend in the pot's
//     category. The old path used computeCategoryAverages — a historical
//     average that never moved with the month (2026-06-11 pre-paint sweep,
//     "fun-money THIS-MONTH bug").

import type { Expense, ExpenseCategory, FunMoney, Earner } from '../types/budget';
import { computeMonthlySpending, currentMonthKey } from './transactionAnalysis';
import { monthsElapsedInclusive } from './stashMath';

/** Legacy category names predate the couples model and literally encode the
 *  household's first names. The mapping lives HERE, in seed/resolve code only —
 *  runtime display and math read FunMoney.category, never a name. */
const LEGACY_FUN_CATEGORY: Record<string, ExpenseCategory> = {
  scott: 'fun_scott',
  claire: 'fun_wife',
};

const LEGACY_FUN_EMOJI: Record<string, string> = {
  scott: '🎮',
  claire: '💅',
};

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/** Resolve the fun category for a person name: legacy built-ins first,
 *  otherwise a per-person custom category key. */
export function funCategoryFor(name: string): ExpenseCategory {
  return LEGACY_FUN_CATEGORY[slug(name)] ?? (`fun_${slug(name)}` as ExpenseCategory);
}

/** One FunMoney pot per earner. Budgets start at 0 — the pot surfaces with a
 *  "set a budget" nudge rather than inventing a number the household never chose. */
export function seedFunMoneyFromEarners(earners: Earner[], now: Date = new Date()): FunMoney[] {
  return earners.map(e => ({
    person: e.name,
    earnerId: e.id,
    category: funCategoryFor(e.name),
    emoji: LEGACY_FUN_EMOJI[slug(e.name)] ?? '🎯',
    monthlyBudget: 0,
    monthlySpent: 0,
    startMonth: currentMonthKey(now),
    openingBalance: 0,
  }));
}

/** Backfill the new identity fields on legacy rows (matched by person name)
 *  without touching budgets. Idempotent. */
export function linkFunMoneyToEarners(funMoney: FunMoney[], earners: Earner[], now: Date = new Date()): FunMoney[] {
  return funMoney.map(f => {
    const match = earners.find(e => slug(e.name) === slug(f.person));
    return {
      ...f,
      earnerId: f.earnerId ?? match?.id,
      category: f.category ?? funCategoryFor(f.person),
      emoji: f.emoji ?? LEGACY_FUN_EMOJI[slug(f.person)] ?? '🎯',
      // Anchor accrual to now on first sight (persisted by the sync save), so the
      // banked balance doesn't reset each month. Legacy rows start banking today.
      startMonth: f.startMonth ?? currentMonthKey(now),
      openingBalance: f.openingBalance ?? 0,
    };
  });
}

/** monthlySpent = this calendar month's spend in the pot's category, with
 *  refunds netted (computeMonthlySpending credits refunds back to their
 *  category). Pass ALL expenses, not pre-filtered ones, so netting works. */
/** The allowance in effect during `month` — the latest history entry at or before
 *  it, else the current budget. Lets a budget change apply forward without
 *  rewriting past months. */
export function funBudgetForMonth(f: FunMoney, month: string): number {
  const hist = f.budgetHistory;
  if (!hist || hist.length === 0) return f.monthlyBudget;
  let best = '';
  let amt = f.monthlyBudget;
  for (const h of hist) {
    if (h.month <= month && h.month >= best) { best = h.month; amt = h.amount; }
  }
  return best ? amt : f.monthlyBudget;
}

/** Enumerate 'YYYY-MM' from `start` up to (but NOT including) `endExclusive`. */
function monthsFromTo(start: string, endExclusive: string): string[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = endExclusive.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const out: string[] = [];
  let y = sy, m = sm;
  while ((y < ey || (y === ey && m < em)) && out.length < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Fun-money ledger (2026-07-05). Each COMPLETED month settles:
 *   • came in under → (1−savingsRate) of the leftover BANKS into the pot,
 *     savingsRate PROMOTES to savings (one-way up — never clawed back);
 *   • overspent → the full overage rides forward and reduces the pot.
 *  The current (in-progress) month is live: its allowance is spendable on top of
 *  the carried pot. Returns monthlySpent (this month), balance (spendable now),
 *  savedToDate (cumulative promoted to savings), monthsAccrued. Constant budget
 *  assumed across months (no per-month fun-budget history). Pure. */
export function computeFunMoneySpent(
  funMoney: FunMoney[],
  expenses: Expense[],
  now: Date = new Date(),
  savingsRate = 0.30,
): FunMoney[] {
  const monthly = computeMonthlySpending(expenses);
  const byMonth = new Map(monthly.map(m => [m.month, m]));
  const curKey = currentMonthKey(now);
  const rate = Math.min(1, Math.max(0, savingsRate));
  const spendIn = (month: string, cat: string) => byMonth.get(month)?.byCategory[cat] ?? 0;

  return funMoney.map(f => {
    const cat = f.category ?? funCategoryFor(f.person);
    const monthlySpent = Math.round(spendIn(curKey, cat) * 100) / 100;
    const start = f.startMonth ?? curKey;

    let banked = f.openingBalance ?? 0;
    let saved = 0;
    for (const mk of monthsFromTo(start, curKey)) {      // completed months only
      const leftover = funBudgetForMonth(f, mk) - spendIn(mk, cat); // per-month allowance
      if (leftover >= 0) { banked += (1 - rate) * leftover; saved += rate * leftover; }
      else { banked += leftover; }                        // full overage rides forward
    }
    // Current month is live — its fresh allowance is spendable on top of the pot.
    const balance = Math.round((banked + f.monthlyBudget - monthlySpent) * 100) / 100;
    const monthsAccrued = monthsElapsedInclusive(start, now);
    return { ...f, monthlySpent, balance, savedToDate: Math.round(saved * 100) / 100, monthsAccrued };
  });
}

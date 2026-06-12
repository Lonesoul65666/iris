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
export function seedFunMoneyFromEarners(earners: Earner[]): FunMoney[] {
  return earners.map(e => ({
    person: e.name,
    earnerId: e.id,
    category: funCategoryFor(e.name),
    emoji: LEGACY_FUN_EMOJI[slug(e.name)] ?? '🎯',
    monthlyBudget: 0,
    monthlySpent: 0,
  }));
}

/** Backfill the new identity fields on legacy rows (matched by person name)
 *  without touching budgets. Idempotent. */
export function linkFunMoneyToEarners(funMoney: FunMoney[], earners: Earner[]): FunMoney[] {
  return funMoney.map(f => {
    const match = earners.find(e => slug(e.name) === slug(f.person));
    return {
      ...f,
      earnerId: f.earnerId ?? match?.id,
      category: f.category ?? funCategoryFor(f.person),
      emoji: f.emoji ?? LEGACY_FUN_EMOJI[slug(f.person)] ?? '🎯',
    };
  });
}

/** monthlySpent = this calendar month's spend in the pot's category, with
 *  refunds netted (computeMonthlySpending credits refunds back to their
 *  category). Pass ALL expenses, not pre-filtered ones, so netting works. */
export function computeFunMoneySpent(
  funMoney: FunMoney[],
  expenses: Expense[],
  now: Date = new Date(),
): FunMoney[] {
  const mtd = computeMonthlySpending(expenses).find(m => m.month === currentMonthKey(now));
  return funMoney.map(f => {
    const cat = f.category ?? funCategoryFor(f.person);
    const spent = mtd?.byCategory[cat] ?? 0;
    return { ...f, monthlySpent: Math.round(spent * 100) / 100 };
  });
}

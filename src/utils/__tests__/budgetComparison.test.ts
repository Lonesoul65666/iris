import { describe, it, expect } from 'vitest';
import { computeBudgetComparison } from '../budgetComparison';
import type { Expense, BudgetBucket } from '../../types/budget';

const NOW = new Date(2026, 6, 15); // Jul 15, 2026 → May & Jun are complete, Jul is not

function exp(date: string, amount: number, category: string): Expense {
  return {
    id: `e-${date}-${category}-${amount}`, date, amount, description: category,
    category, flow: 'outflow', transactionType: 'expense', isWorkExpense: false,
  } as Expense;
}

function bucket(category: string, monthlyBudget: number): BudgetBucket {
  return { category, label: category, icon: '📦', monthlyBudget, monthlyActual: 0 } as BudgetBucket;
}

// June (last complete month) actuals: dining 1800 (over 800), amazon 120 (under 600),
// housing 3200 (over — but FIXED), taxes 900 (reserve), fun_scott 1400 (over 900 — UNTOUCHABLE).
const EXPENSES: Expense[] = [
  exp('2026-05-10', 700, 'food_dining'), exp('2026-06-10', 1800, 'food_dining'),
  exp('2026-05-11', 280, 'amazon'),      exp('2026-06-11', 120, 'amazon'),
  exp('2026-06-01', 3200, 'housing'),
  exp('2026-06-02', 900, 'taxes'),
  exp('2026-06-03', 1400, 'fun_scott'),
];
const BUCKETS: BudgetBucket[] = [
  bucket('food_dining', 800), bucket('amazon', 600),
  bucket('housing', 3000), bucket('taxes', 1000), bucket('fun_scott', 900),
];

describe('computeBudgetComparison', () => {
  it('reports no history when there are no complete months', () => {
    const c = computeBudgetComparison([exp('2026-07-05', 100, 'food_dining')], BUCKETS, NOW);
    expect(c.hasHistory).toBe(false);
    expect(c.rows).toEqual([]);
  });

  it('anchors to the most recent complete month with a full label', () => {
    const c = computeBudgetComparison(EXPENSES, BUCKETS, NOW);
    expect(c.hasHistory).toBe(true);
    expect(c.lastMonth).toBe('2026-06');
    expect(c.lastMonthLabel).toBe('June 2026'); // full name, not "Jun"
    expect(c.monthsCompared).toBe(2);
  });

  it('classifies over / under against target', () => {
    const c = computeBudgetComparison(EXPENSES, BUCKETS, NOW);
    const by = Object.fromEntries(c.rows.map(r => [r.category, r]));
    expect(by.food_dining.status).toBe('over');
    expect(by.amazon.status).toBe('under');
  });

  it('suggests adapting a category\'s OWN target to the midpoint — no transfers', () => {
    const c = computeBudgetComparison(EXPENSES, BUCKETS, NOW);
    const dining = c.suggestions.find(s => s.category === 'food_dining')!;
    expect(dining.kind).toBe('raise');
    expect(dining.currentTarget).toBe(800);
    expect(dining.suggestedTarget).toBe(1300); // (800 + 1800) / 2
    // Suggestions carry no from/to — each category owns its own number.
    expect((dining as unknown as { fromCategory?: string }).fromCategory).toBeUndefined();
  });

  it('trims an under-spent flexible category toward its actual', () => {
    const c = computeBudgetComparison(EXPENSES, BUCKETS, NOW);
    const amazon = c.suggestions.find(s => s.category === 'amazon')!;
    expect(amazon.kind).toBe('trim');
    expect(amazon.suggestedTarget).toBe(350); // (600 + 120) / 2 = 360, rounded to nearest $25
  });

  it('never suggests changing fun-money, fixed, or reserve categories', () => {
    const c = computeBudgetComparison(EXPENSES, BUCKETS, NOW);
    const cats = c.suggestions.map(s => s.category);
    expect(cats).not.toContain('fun_scott'); // untouchable even though $500 over
    expect(cats).not.toContain('housing');   // fixed
    expect(cats).not.toContain('taxes');     // reserve
  });
});

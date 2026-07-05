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

// June (last complete month) actuals: dining 580 (over 400), amazon 120 (under 300),
// entertainment 100 (on 100), housing 3200 (over — but FIXED), taxes 900 (reserve).
const EXPENSES: Expense[] = [
  exp('2026-05-10', 420, 'food_dining'), exp('2026-06-10', 580, 'food_dining'),
  exp('2026-05-11', 280, 'amazon'),      exp('2026-06-11', 120, 'amazon'),
  exp('2026-06-12', 100, 'entertainment'),
  exp('2026-06-01', 3200, 'housing'),
  exp('2026-06-02', 900, 'taxes'),
];
const BUCKETS: BudgetBucket[] = [
  bucket('food_dining', 400), bucket('amazon', 300), bucket('entertainment', 100),
  bucket('housing', 3000), bucket('taxes', 1000),
];

describe('computeBudgetComparison', () => {
  it('reports no history when there are no complete months', () => {
    const c = computeBudgetComparison([exp('2026-07-05', 100, 'food_dining')], BUCKETS, NOW);
    expect(c.hasHistory).toBe(false);
    expect(c.rows).toEqual([]);
  });

  it('anchors to the most recent complete month', () => {
    const c = computeBudgetComparison(EXPENSES, BUCKETS, NOW);
    expect(c.hasHistory).toBe(true);
    expect(c.lastMonth).toBe('2026-06');
    expect(c.monthsCompared).toBe(2); // May + June
  });

  it('classifies over / under / on against target', () => {
    const c = computeBudgetComparison(EXPENSES, BUCKETS, NOW);
    const by = Object.fromEntries(c.rows.map(r => [r.category, r]));
    expect(by.food_dining.status).toBe('over');
    expect(by.food_dining.deltaVsTarget).toBe(180);   // 580 − 400
    expect(by.amazon.status).toBe('under');
    expect(by.entertainment.status).toBe('on');
    expect(by.food_dining.avgActual).toBe(500);        // (420 + 580) / 2
  });

  it('suggests moving slack from an under-spent flexible category to an over-spent one', () => {
    const c = computeBudgetComparison(EXPENSES, BUCKETS, NOW);
    expect(c.moves.length).toBeGreaterThanOrEqual(1);
    const m = c.moves[0];
    expect(m.fromCategory).toBe('amazon');
    expect(m.toCategory).toBe('food_dining');
    expect(m.amount).toBe(180); // min(180 need, 180 slack)
  });

  it('never rebalances fixed or reserve categories (housing/taxes excluded from moves + totals)', () => {
    const c = computeBudgetComparison(EXPENSES, BUCKETS, NOW);
    for (const m of c.moves) {
      expect(['housing', 'taxes']).not.toContain(m.fromCategory);
      expect(['housing', 'taxes']).not.toContain(m.toCategory);
    }
    // Only flexible dining counts toward overspend, not housing's $200 over.
    expect(c.totalOverspend).toBe(180);
    expect(c.totalSlack).toBe(180);
  });
});

import { describe, it, expect } from 'vitest';
import { targetsForMonth, targetsOf, sameTargets, type BudgetTargetSnapshot } from '../budgetHistory';
import type { BudgetBucket } from '../../types/budget';

const snap = (takenAt: string, targets: Record<string, number>): BudgetTargetSnapshot => ({ takenAt, targets });

describe('targetsForMonth — "what were the goals THAT month?"', () => {
  const history = [
    snap('2026-03-15T10:00:00.000Z', { food_groceries: 1180, amazon: 1000 }),
    snap('2026-06-20T08:00:00.000Z', { food_groceries: 1000, amazon: 500 }),
    snap('2026-08-02T09:00:00.000Z', { food_groceries: 900, amazon: 500 }),
  ];

  it('a month is judged by the last snapshot taken before it ended', () => {
    expect(targetsForMonth(history, '2026-04')!.food_groceries).toBe(1180); // March caps still in effect
    expect(targetsForMonth(history, '2026-06')!.food_groceries).toBe(1000); // changed mid-June → June's last word
    expect(targetsForMonth(history, '2026-07')!.food_groceries).toBe(1000); // August change must NOT leak back
    expect(targetsForMonth(history, '2026-09')!.food_groceries).toBe(900);
  });

  it('a snapshot taken ON the 1st of the next month does not count for the prior month', () => {
    const h = [snap('2026-03-15T10:00:00.000Z', { a: 1 }), snap('2026-07-01T00:00:00.000Z', { a: 2 })];
    expect(targetsForMonth(h, '2026-06')!.a).toBe(1);
    expect(targetsForMonth(h, '2026-07')!.a).toBe(2);
  });

  it('pre-history months fall back to the earliest snapshot; empty history is null', () => {
    expect(targetsForMonth(history, '2025-11')!.food_groceries).toBe(1180);
    expect(targetsForMonth([], '2026-06')).toBeNull();
    expect(targetsForMonth(history, 'garbage')).toBeNull();
  });

  it('handles unsorted input', () => {
    const shuffled = [history[2], history[0], history[1]];
    expect(targetsForMonth(shuffled, '2026-07')!.amazon).toBe(500);
    expect(targetsForMonth(shuffled, '2026-04')!.amazon).toBe(1000);
  });
});

describe('snapshot helpers', () => {
  it('targetsOf extracts category -> monthlyBudget', () => {
    const buckets = [
      { category: 'food_groceries', monthlyBudget: 1000, monthlyActual: 750 },
      { category: 'amazon', monthlyBudget: 500, monthlyActual: 6 },
    ] as BudgetBucket[];
    expect(targetsOf(buckets)).toEqual({ food_groceries: 1000, amazon: 500 });
  });

  it('sameTargets ignores nothing — added, removed, and changed categories all differ', () => {
    expect(sameTargets({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameTargets({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameTargets({ a: 1 }, { a: 1, b: 5 })).toBe(false);
    expect(sameTargets({ a: 1, b: 0 }, { a: 1 })).toBe(true); // absent == 0 (bucket removed vs zeroed)
  });
});

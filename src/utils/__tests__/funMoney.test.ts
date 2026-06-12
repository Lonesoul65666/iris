import { describe, it, expect } from 'vitest';
import type { Expense, FunMoney, Earner } from '../../types/budget';
import { funCategoryFor, seedFunMoneyFromEarners, linkFunMoneyToEarners, computeFunMoneySpent } from '../funMoney';

const NOW = new Date(2026, 5, 12); // June 12, 2026 (local)

function exp(over: Partial<Expense>): Expense {
  return {
    id: Math.random().toString(16).slice(2),
    date: '2026-06-05',
    description: 'test',
    amount: 50,
    category: 'fun_scott',
    reimbursementStatus: 'not_reimbursable',
    isWorkExpense: false,
    recurring: false,
    ...over,
  };
}

const earners: Earner[] = [
  { id: 'earner-scott', name: 'Scott', isWorking: true },
  { id: 'earner-claire', name: 'Claire', isWorking: false },
];

describe('funCategoryFor', () => {
  it('maps legacy household names to the legacy category union', () => {
    expect(funCategoryFor('Scott')).toBe('fun_scott');
    expect(funCategoryFor('Claire')).toBe('fun_wife');
  });

  it('derives a slug category for anyone else', () => {
    expect(funCategoryFor('Sam Jones')).toBe('fun_sam_jones');
  });
});

describe('seedFunMoneyFromEarners', () => {
  it('creates one zero-budget pot per earner with identity fields', () => {
    const pots = seedFunMoneyFromEarners(earners);
    expect(pots).toHaveLength(2);
    expect(pots[0]).toMatchObject({
      person: 'Scott', earnerId: 'earner-scott', category: 'fun_scott',
      emoji: '🎮', monthlyBudget: 0, monthlySpent: 0,
    });
    expect(pots[1]).toMatchObject({
      person: 'Claire', earnerId: 'earner-claire', category: 'fun_wife', emoji: '💅',
    });
  });
});

describe('linkFunMoneyToEarners', () => {
  it('backfills identity fields on legacy rows without touching budgets', () => {
    const legacy: FunMoney[] = [{ person: 'Scott', monthlyBudget: 400, monthlySpent: 123 }];
    const [linked] = linkFunMoneyToEarners(legacy, earners);
    expect(linked).toMatchObject({
      person: 'Scott', earnerId: 'earner-scott', category: 'fun_scott',
      emoji: '🎮', monthlyBudget: 400, monthlySpent: 123,
    });
  });

  it('is idempotent — existing fields win', () => {
    const row: FunMoney = { person: 'Scott', earnerId: 'custom', category: 'fun_wife', emoji: '🛹', monthlyBudget: 1, monthlySpent: 0 };
    const [linked] = linkFunMoneyToEarners([row], earners);
    expect(linked.earnerId).toBe('custom');
    expect(linked.category).toBe('fun_wife');
    expect(linked.emoji).toBe('🛹');
  });
});

describe('computeFunMoneySpent', () => {
  const pots = seedFunMoneyFromEarners(earners);

  it('counts ONLY the current calendar month, not a historical average', () => {
    const expenses = [
      exp({ date: '2026-06-03', amount: 40, category: 'fun_scott' }),
      exp({ date: '2026-06-10', amount: 25, category: 'fun_scott' }),
      // Heavy history that would skew an average:
      exp({ date: '2026-05-15', amount: 900, category: 'fun_scott' }),
      exp({ date: '2026-04-15', amount: 900, category: 'fun_scott' }),
    ];
    const [scott] = computeFunMoneySpent(pots, expenses, NOW);
    expect(scott.monthlySpent).toBe(65);
  });

  it('keeps pots independent per category', () => {
    const expenses = [
      exp({ date: '2026-06-03', amount: 40, category: 'fun_scott' }),
      exp({ date: '2026-06-04', amount: 30, category: 'fun_wife' }),
    ];
    const [scott, claire] = computeFunMoneySpent(pots, expenses, NOW);
    expect(scott.monthlySpent).toBe(40);
    expect(claire.monthlySpent).toBe(30);
  });

  it('nets refunds against the month\'s spend', () => {
    const expenses = [
      exp({ date: '2026-06-03', amount: 100, category: 'fun_scott' }),
      exp({ date: '2026-06-08', amount: 30, category: 'fun_scott', flow: 'inflow', transactionType: 'refund' }),
    ];
    const [scott] = computeFunMoneySpent(pots, expenses, NOW);
    expect(scott.monthlySpent).toBe(70);
  });

  it('returns 0 when the month has no fun spend yet (June-1 honesty)', () => {
    const expenses = [exp({ date: '2026-05-20', amount: 500, category: 'fun_scott' })];
    const [scott] = computeFunMoneySpent(pots, expenses, NOW);
    expect(scott.monthlySpent).toBe(0);
  });

  it('resolves category from person on unlinked legacy rows', () => {
    const legacy: FunMoney[] = [{ person: 'Claire', monthlyBudget: 200, monthlySpent: 999 }];
    const expenses = [exp({ date: '2026-06-02', amount: 45, category: 'fun_wife' })];
    const [claire] = computeFunMoneySpent(legacy, expenses, NOW);
    expect(claire.monthlySpent).toBe(45);
  });
});

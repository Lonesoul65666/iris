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

describe('computeFunMoneySpent — 70/30 ledger (banked balance + savings)', () => {
  const pot = (over: Partial<FunMoney>): FunMoney =>
    ({ person: 'Scott', category: 'fun_scott', emoji: '🎮', monthlyBudget: 400, monthlySpent: 0, ...over });

  it('banks 70% of a completed month\'s leftover and promotes 30% to savings', () => {
    // Start April ($400/mo). Settled: Apr spent 100 (leftover 300 → +210 pot, +90 save),
    // May spent 0 (leftover 400 → +280 pot, +120 save). Pot=490, saved=210.
    // Current June spent 65 (live): balance = 490 + 400 − 65 = 825.
    const p = pot({ startMonth: '2026-04', openingBalance: 0 });
    const expenses = [
      exp({ date: '2026-04-10', amount: 100, category: 'fun_scott' }),
      exp({ date: '2026-06-03', amount: 65, category: 'fun_scott' }),
    ];
    const [scott] = computeFunMoneySpent([p], expenses, NOW, 0.30);
    expect(scott.monthlySpent).toBe(65);
    expect(scott.savedToDate).toBe(210);   // 90 + 120
    expect(scott.balance).toBe(825);       // 490 pot + 400 allowance − 65 spent
  });

  it('includes the opening balance in the current-month spendable', () => {
    const [scott] = computeFunMoneySpent([pot({ startMonth: '2026-06', openingBalance: 500 })], [], NOW, 0.30);
    expect(scott.balance).toBe(900); // 500 opening + 400 allowance − 0
    expect(scott.savedToDate).toBe(0);
  });

  it('overspending the live month goes negative', () => {
    const expenses = [exp({ date: '2026-06-05', amount: 550, category: 'fun_scott' })];
    const [scott] = computeFunMoneySpent([pot({ startMonth: '2026-06', openingBalance: 0 })], expenses, NOW, 0.30);
    expect(scott.balance).toBe(-150); // 400 − 550
  });

  it('climbs out of the hole before saving; overage never touches savings (one-way up)', () => {
    // Apr overspent by 100 (spent 500) → pot −100, savings unchanged.
    // May under by 400: $100 fills the hole (100%, no save), surplus $300 → +210 pot,
    // +90 save. Pot = 210, saved = 90 (NOT 120 — no saving while underwater).
    const expenses = [exp({ date: '2026-04-15', amount: 500, category: 'fun_scott' })];
    const [scott] = computeFunMoneySpent([pot({ startMonth: '2026-04', openingBalance: 0 })], expenses, NOW, 0.30);
    expect(scott.savedToDate).toBe(90);
    expect(scott.balance).toBe(610);       // 210 pot + 400 allowance − 0
  });

  it('uses the per-month allowance from budgetHistory (change applies forward)', () => {
    // $500 through April, dropped to $400 from May. Both months underspent to $0.
    // Apr: 500 → +350 pot, +150 save. May: 400 → +280 pot, +120 save. Current June
    // at the current $400 budget: balance = 630 pot + 400 − 0 = 1030.
    const p = pot({
      startMonth: '2026-04', openingBalance: 0, monthlyBudget: 400,
      budgetHistory: [{ month: '2026-04', amount: 500 }, { month: '2026-05', amount: 400 }],
    });
    const [scott] = computeFunMoneySpent([p], [], NOW, 0.30);
    expect(scott.savedToDate).toBe(270); // 150 + 120
    expect(scott.balance).toBe(1030);
  });

  it('honors a configurable split rate', () => {
    // Start May, May under by 400, rate 50%: +200 pot, +200 save.
    const [scott] = computeFunMoneySpent([pot({ startMonth: '2026-05', openingBalance: 0 })], [], NOW, 0.50);
    expect(scott.savedToDate).toBe(200);
    expect(scott.balance).toBe(600); // 200 pot + 400 allowance
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import {
  monthsElapsedInclusive, computeStashStatus, totalStashContributions,
  stashAllocationsByCategory, stashesConfigured, seedDefaultStashes, applyStashLaneConfig,
} from '../stashMath';
import { laneOf, totalReserveSetAside, configureStashLanes, RESERVE_CATEGORIES, RESERVE_ALLOCATIONS } from '../budgetLanes';
import type { Expense, Stash } from '../../types/budget';

const NOW = new Date(2026, 5, 11); // June 11, 2026 (local)

function exp(partial: Partial<Expense>): Expense {
  return {
    id: partial.id ?? `e-${Math.abs(JSON.stringify(partial).length)}-${partial.date}-${partial.amount}`,
    date: partial.date ?? '2026-06-01',
    description: partial.description ?? 'test',
    amount: partial.amount ?? 100,
    category: partial.category ?? 'other',
    flow: partial.flow ?? 'outflow',
    transactionType: partial.transactionType ?? 'expense',
    isWorkExpense: partial.isWorkExpense ?? false,
  } as Expense;
}

function stash(partial: Partial<Stash>): Stash {
  return {
    id: partial.id ?? 's1', name: partial.name ?? 'Test', targetAmount: partial.targetAmount ?? 0,
    currentBalance: partial.currentBalance ?? 0, monthlyContribution: partial.monthlyContribution ?? 0,
    color: '#fff', ...partial,
  };
}

// configureStashLanes mutates the module registry — restore defaults so other
// tests in this file see legacy behavior.
afterEach(() => {
  configureStashLanes(RESERVE_CATEGORIES.filter(c => c !== 'travel_work'), { ...RESERVE_ALLOCATIONS });
});

describe('monthsElapsedInclusive', () => {
  it('counts both endpoints inclusive', () => {
    expect(monthsElapsedInclusive('2026-06', NOW)).toBe(1);  // started this month
    expect(monthsElapsedInclusive('2026-01', NOW)).toBe(6);
    expect(monthsElapsedInclusive('2025-09', NOW)).toBe(10);
  });
  it('future start month accrues nothing; garbage parses to 0', () => {
    expect(monthsElapsedInclusive('2026-07', NOW)).toBe(0);
    expect(monthsElapsedInclusive('not-a-month', NOW)).toBe(0);
  });
});

describe('computeStashStatus — derived balances (design D1)', () => {
  it('balance = opening + contributions − linked-category draws', () => {
    const s = stash({ monthlyContribution: 1500, categories: ['taxes'], startMonth: '2026-01', openingBalance: 2000 });
    const expenses = [
      exp({ date: '2026-04-15', amount: 5000, category: 'taxes' }),
      exp({ date: '2026-03-02', amount: 100, category: 'food_dining' }), // unlinked — ignored
      exp({ date: '2025-12-30', amount: 9999, category: 'taxes' }),      // before startMonth — ignored
    ];
    const st = computeStashStatus(s, expenses, NOW);
    expect(st.derived).toBe(true);
    expect(st.contributed).toBe(2000 + 1500 * 6);
    expect(st.drawn).toBe(5000);
    expect(st.balance).toBe(2000 + 9000 - 5000);
    expect(st.biggestDraw).toEqual({ month: '2026-04', amount: 5000 });
  });

  it('refunds in a linked category reduce the draw (netting flows through)', () => {
    const s = stash({ monthlyContribution: 0, categories: ['travel_personal'], startMonth: '2026-01', openingBalance: 1000 });
    const expenses = [
      exp({ date: '2026-02-10', amount: 800, category: 'travel_personal' }),
      exp({ date: '2026-02-20', amount: 300, category: 'travel_personal', flow: 'inflow', transactionType: 'refund' }),
    ];
    const st = computeStashStatus(s, expenses, NOW);
    expect(st.drawn).toBe(500);
    expect(st.balance).toBe(500);
  });

  it('can go honestly negative (design D4)', () => {
    const s = stash({ monthlyContribution: 100, categories: ['taxes'], startMonth: '2026-05', openingBalance: 0 });
    const st = computeStashStatus(s, [exp({ date: '2026-06-01', amount: 5000, category: 'taxes' })], NOW);
    expect(st.balance).toBe(200 - 5000);
  });

  it('legacy stash without startMonth falls back to the manual balance', () => {
    const st = computeStashStatus(stash({ currentBalance: 750, targetAmount: 1000 }), [], NOW);
    expect(st.derived).toBe(false);
    expect(st.balance).toBe(750);
    expect(st.targetProgress).toBeCloseTo(0.75);
  });
});

describe('aggregations', () => {
  it('totalStashContributions sums every pot, categories or not', () => {
    expect(totalStashContributions([
      stash({ monthlyContribution: 1500 }), stash({ id: 's2', monthlyContribution: 1000 }), stash({ id: 's3', monthlyContribution: 250 }),
    ])).toBe(2750);
  });

  it('stashAllocationsByCategory splits a multi-category stash evenly', () => {
    const { categories, allocations } = stashAllocationsByCategory([
      stash({ monthlyContribution: 200, categories: ['home_maintenance', 'car_maintenance'] }),
      stash({ id: 's2', monthlyContribution: 1500, categories: ['taxes'] }),
    ]);
    expect(categories.sort()).toEqual(['car_maintenance', 'home_maintenance', 'taxes']);
    expect(allocations.home_maintenance).toBe(100);
    expect(allocations.taxes).toBe(1500);
  });
});

describe('lane registry wiring (design D2/D3)', () => {
  it('applyStashLaneConfig moves linked categories into the reserve lane and sets the set-aside total', () => {
    applyStashLaneConfig([
      stash({ monthlyContribution: 300, categories: ['gifts_holidays'] }),
      stash({ id: 's2', monthlyContribution: 400 }), // pure savings pot — no categories, still counts in total
    ]);
    expect(laneOf('gifts_holidays')).toBe('reserve');
    expect(laneOf('travel_work')).toBe('reserve');   // always reserve
    expect(laneOf('taxes')).toBe('flexible');        // no longer covered → leaves the reserve lane
    expect(totalReserveSetAside()).toBe(700);
  });

  it('is a no-op when no stash has categories (legacy defaults rule)', () => {
    applyStashLaneConfig([stash({ monthlyContribution: 999 })]);
    expect(laneOf('taxes')).toBe('reserve');
    expect(totalReserveSetAside()).toBe(2500);
  });
});

describe('seedDefaultStashes (design D5)', () => {
  it('adds Taxes + Trips & Travel from the legacy constants when uncovered', () => {
    const seeded = seedDefaultStashes([stash({ name: 'Emergency' })], NOW)!;
    const names = seeded.map(s => s.name);
    expect(names).toContain('Taxes');
    expect(names).toContain('Trips & Travel');
    const taxes = seeded.find(s => s.name === 'Taxes')!;
    expect(taxes.monthlyContribution).toBe(1500);
    expect(taxes.startMonth).toBe('2026-06');
    expect(taxes.openingBalance).toBe(0);
  });
  it('returns null when both are already covered', () => {
    expect(seedDefaultStashes([
      stash({ categories: ['taxes'] }), stash({ id: 's2', categories: ['travel_personal'] }),
    ], NOW)).toBeNull();
  });
  it('stashesConfigured flips on the first linked category', () => {
    expect(stashesConfigured([stash({})])).toBe(false);
    expect(stashesConfigured([stash({ categories: ['taxes'] })])).toBe(true);
  });
});

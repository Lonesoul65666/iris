import { describe, it, expect } from 'vitest';
import { computeSafeToSpend } from '../safeToSpend';
import { configureStashLanes, RESERVE_CATEGORIES, RESERVE_ALLOCATIONS } from '../budgetLanes';
import { exp } from './fixtures';
import type { BudgetBucket, ExpenseCategory } from '../../types/budget';

function bucket(category: ExpenseCategory, monthlyBudget: number): BudgetBucket {
  return {
    category,
    label: category,
    icon: 'x',
    monthlyBudget,
    monthlyActual: 0,
    color: '#000',
    guideline: '',
    guidelinePercent: 0,
  };
}

// June 11, 2026 — June has 30 days, so daysLeft = 30 - 11 + 1 = 20.
const NOW = new Date(2026, 5, 11);
const RESERVE_SET_ASIDE = 2000; // taxes 1000 + travel_personal 1000 + travel_work 0

describe('computeSafeToSpend', () => {
  it('amount = takeHome - fixedCommitment - reserveSetAside - flexSpent', () => {
    const s = computeSafeToSpend(
      [
        exp({ date: '2026-06-03', amount: 2800, category: 'housing' }),     // fixed, under budget
        exp({ date: '2026-06-05', amount: 400, category: 'food_dining' }),  // flexible MTD
      ],
      [bucket('housing', 3000), bucket('food_dining', 2000)],
      15800,
      NOW,
    );
    expect(s.month).toBe('2026-06');
    expect(s.takeHome).toBe(15800);
    expect(s.fixedCommitment).toBe(3000); // budget wins while the bill is under it
    expect(s.reserveSetAside).toBe(RESERVE_SET_ASIDE);
    expect(s.flexSpent).toBe(400);
    expect(s.amount).toBe(15800 - 3000 - 2000 - 400);
  });

  it('fixed commitment bumps to the ACTUAL when a fixed bill ran hotter than budget', () => {
    const s = computeSafeToSpend(
      [exp({ date: '2026-06-02', amount: 3500, category: 'housing' })],
      [bucket('housing', 3000)],
      15800,
      NOW,
    );
    expect(s.fixedCommitment).toBe(3500); // max(3000, 3500)
  });

  it('flexible-lane bucket budgets never enter fixedCommitment', () => {
    const s = computeSafeToSpend(
      [],
      [bucket('housing', 3000), bucket('food_dining', 2000), bucket('amazon', 500)],
      15800,
      NOW,
    );
    expect(s.fixedCommitment).toBe(3000);
    expect(s.flexSpent).toBe(0);
  });

  it('reserve and work spend do NOT count as flexible MTD spend', () => {
    const s = computeSafeToSpend(
      [
        exp({ date: '2026-06-04', amount: 13000, category: 'taxes' }),           // reserve lane
        exp({ date: '2026-06-05', amount: 900, category: 'travel_work' }),       // work
        exp({ date: '2026-06-06', amount: 250, category: 'food_dining', isWorkExpense: true }), // flagged work
        exp({ date: '2026-06-07', amount: 100, category: 'amazon' }),            // the only flex spend
      ],
      [],
      10000,
      NOW,
    );
    expect(s.flexSpent).toBe(100);
    expect(s.amount).toBe(10000 - 0 - 2000 - 100);
  });

  it('refunds net out of flexible MTD spend', () => {
    const s = computeSafeToSpend(
      [
        exp({ date: '2026-06-03', amount: 300, category: 'amazon' }),
        exp({ date: '2026-06-08', amount: 100, category: 'amazon', flow: 'inflow', transactionType: 'refund' }),
      ],
      [],
      10000,
      NOW,
    );
    expect(s.flexSpent).toBe(200);
  });

  it('flexSpent is floored at 0 (a refund-only month cannot ADD safe-to-spend)', () => {
    const s = computeSafeToSpend(
      [exp({ date: '2026-06-08', amount: 100, category: 'amazon', flow: 'inflow', transactionType: 'refund' })],
      [],
      10000,
      NOW,
    );
    expect(s.flexSpent).toBe(0);
    expect(s.amount).toBe(10000 - 2000);
  });

  it('only the current month counts — prior-month spend is ignored', () => {
    const s = computeSafeToSpend(
      [
        exp({ date: '2026-05-20', amount: 5000, category: 'food_dining' }), // last month
        exp({ date: '2026-06-02', amount: 75, category: 'food_dining' }),
      ],
      [],
      10000,
      NOW,
    );
    expect(s.flexSpent).toBe(75);
  });

  it('daysLeft includes today; perDay = amount / daysLeft', () => {
    const s = computeSafeToSpend([], [], 10000, NOW);
    expect(s.daysLeft).toBe(20); // June 11 → 20 days incl. today
    expect(s.perDay).toBe(Math.round(s.amount / 20));

    const lastDay = computeSafeToSpend([], [], 10000, new Date(2026, 5, 30));
    expect(lastDay.daysLeft).toBe(1);
    expect(lastDay.perDay).toBe(lastDay.amount);
  });

  it('reserveOverride replaces the default set-aside (commit model)', () => {
    // Commit model: nothing moved yet → $0 comes off the top (not the $2,000 plan).
    const none = computeSafeToSpend(
      [exp({ date: '2026-06-05', amount: 400, category: 'food_dining' })],
      [],
      15800,
      NOW,
      0,
    );
    expect(none.reserveSetAside).toBe(0);
    expect(none.amount).toBe(15800 - 400);

    // Commit two moves ($1,000 + $1,000) → they come off the top.
    const committed = computeSafeToSpend(
      [exp({ date: '2026-06-05', amount: 400, category: 'food_dining' })],
      [],
      15800,
      NOW,
      2000,
    );
    expect(committed.reserveSetAside).toBe(2000);
    expect(committed.amount).toBe(15800 - 2000 - 400);
  });

  it('a committed stash bill is NOT double-counted when it posts (Scott: commit + the item coming in)', () => {
    // Car Insurance stash links car_insurance → it lives in the reserve lane.
    configureStashLanes(['car_insurance'], { car_insurance: 275 }, 275);
    try {
      const s = computeSafeToSpend(
        [
          exp({ date: '2026-06-04', amount: 1650, category: 'car_insurance' }), // the bill lands
          exp({ date: '2026-06-05', amount: 400, category: 'food_dining' }),    // ordinary flex spend
        ],
        [],
        15800,
        NOW,
        275, // committedReserves: the $275 Scott moved to the stash this month
      );
      // The $1,650 bill is a planned withdrawal from the pre-funded pot — it must
      // NOT hit flexSpent, and only the $275 commit comes off the top. Counting
      // both the commit AND the bill would double-charge the base.
      expect(s.flexSpent).toBe(400);
      expect(s.reserveSetAside).toBe(275);
      expect(s.amount).toBe(15800 - 275 - 400); // the $1,650 appears nowhere
    } finally {
      configureStashLanes(RESERVE_CATEGORIES.filter(c => c !== 'travel_work'), { ...RESERVE_ALLOCATIONS });
    }
  });

  it('amount can go negative when committed + spent exceed take-home', () => {
    const s = computeSafeToSpend(
      [exp({ date: '2026-06-05', amount: 4000, category: 'food_dining' })],
      [bucket('housing', 5000)],
      8000,
      NOW,
    );
    expect(s.amount).toBe(8000 - 5000 - 2000 - 4000); // -3000
    expect(s.amount).toBeLessThan(0);
  });
});

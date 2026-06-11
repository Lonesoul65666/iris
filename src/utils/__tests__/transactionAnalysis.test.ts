import { describe, it, expect } from 'vitest';
import {
  currentMonthKey,
  isCompleteMonth,
  parseLocalDate,
  computeMonthlySpending,
  computeCategoryAverages,
  computeWorkExpenses,
  computeMonthComparison,
} from '../transactionAnalysis';
import { exp } from './fixtures';

// NOTE: computeMonthComparison (and computeSpendingSummary) call isCompleteMonth
// with the REAL current date internally — so month-bucket fixtures use 2020
// dates, which are calendar-complete forever. Functions that accept `now`
// (currentMonthKey / isCompleteMonth / computeCategoryAverages) get it injected.

describe('currentMonthKey', () => {
  it('formats YYYY-MM with zero-padded month', () => {
    expect(currentMonthKey(new Date(2026, 0, 5))).toBe('2026-01');
  });

  it('handles double-digit months', () => {
    expect(currentMonthKey(new Date(2026, 5, 11))).toBe('2026-06');
    expect(currentMonthKey(new Date(2025, 11, 31))).toBe('2025-12');
  });
});

describe('isCompleteMonth', () => {
  const now = new Date(2026, 5, 11); // June 11, 2026

  it('a prior calendar month is complete', () => {
    expect(isCompleteMonth('2026-05', now)).toBe(true);
    expect(isCompleteMonth('2025-12', now)).toBe(true);
  });

  it('the in-progress and future months are NOT complete', () => {
    expect(isCompleteMonth('2026-06', now)).toBe(false);
    expect(isCompleteMonth('2026-07', now)).toBe(false);
  });

  it('malformed keys are never complete', () => {
    expect(isCompleteMonth('2026-5', now)).toBe(false);
    expect(isCompleteMonth('garbage', now)).toBe(false);
    expect(isCompleteMonth('', now)).toBe(false);
  });
});

describe('parseLocalDate', () => {
  it("'YYYY-MM-DD' lands on that LOCAL calendar day (not UTC-midnight drift)", () => {
    const d = parseLocalDate('2026-06-01');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(1);
  });

  it("'M/D/YYYY' parses to the same local day", () => {
    const d = parseLocalDate('6/1/2026');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(1);

    const e = parseLocalDate('12/31/2025');
    expect(e.getFullYear()).toBe(2025);
    expect(e.getMonth()).toBe(11);
    expect(e.getDate()).toBe(31);
  });
});

describe('computeMonthlySpending', () => {
  it('buckets transactions by month, sorted ascending, with labels', () => {
    const months = computeMonthlySpending([
      exp({ date: '2020-02-10', amount: 50, category: 'food_dining' }),
      exp({ date: '2020-01-05', amount: 100, category: 'food_dining' }),
      exp({ date: '1/20/2020', amount: 25, category: 'food_dining' }), // M/D/YYYY also buckets
    ]);
    expect(months.map(m => m.month)).toEqual(['2020-01', '2020-02']);
    expect(months[0].monthLabel).toBe('Jan 2020');
    expect(months[0].byCategory.food_dining).toBe(125);
    expect(months[0].transactionCount).toBe(2);
  });

  it('work expenses (isWorkExpense flag) go to totalWork, not totalExpenses', () => {
    const [m] = computeMonthlySpending([
      exp({ date: '2020-01-05', amount: 80, category: 'food_dining', isWorkExpense: true }),
    ]);
    expect(m.totalWork).toBe(80);
    expect(m.totalExpenses).toBe(0);
    expect(m.totalOperating).toBe(0);
    expect(m.byCategory.travel_work).toBe(80); // flag wins over category
    expect(m.byCategory.food_dining).toBeUndefined();
  });

  it("category 'travel_work' is work spend even without the flag", () => {
    const [m] = computeMonthlySpending([
      exp({ date: '2020-01-05', amount: 300, category: 'travel_work' }),
    ]);
    expect(m.totalWork).toBe(300);
    expect(m.totalExpenses).toBe(0);
  });

  it('reserve categories hit totalReserve + totalExpenses but NOT totalOperating', () => {
    const [m] = computeMonthlySpending([
      exp({ date: '2020-01-10', amount: 13000, category: 'taxes' }),
      exp({ date: '2020-01-12', amount: 1200, category: 'travel_personal' }),
    ]);
    expect(m.totalReserve).toBe(14200);
    expect(m.totalExpenses).toBe(14200);
    expect(m.totalOperating).toBe(0);
    expect(m.byCategory.taxes).toBe(13000);
  });

  it('operating expenses hit both totalExpenses and totalOperating', () => {
    const [m] = computeMonthlySpending([
      exp({ date: '2020-01-10', amount: 400, category: 'food_groceries' }),
    ]);
    expect(m.totalExpenses).toBe(400);
    expect(m.totalOperating).toBe(400);
    expect(m.totalReserve).toBe(0);
  });

  it('refunds SUBTRACT from totalExpenses + byCategory + operating lane, and are NOT income', () => {
    const [m] = computeMonthlySpending([
      exp({ date: '2020-01-05', amount: 200, category: 'amazon' }),
      exp({ date: '2020-01-15', amount: 50, category: 'amazon', flow: 'inflow', transactionType: 'refund' }),
    ]);
    expect(m.totalExpenses).toBe(150);
    expect(m.byCategory.amazon).toBe(150);
    expect(m.totalOperating).toBe(150);
    expect(m.totalIncome).toBe(0);
  });

  it('refunds in a reserve category credit the reserve lane', () => {
    const [m] = computeMonthlySpending([
      exp({ date: '2020-01-05', amount: 1000, category: 'taxes' }),
      exp({ date: '2020-01-20', amount: 200, category: 'taxes', flow: 'inflow', transactionType: 'refund' }),
    ]);
    expect(m.totalReserve).toBe(800);
    expect(m.totalExpenses).toBe(800);
    expect(m.totalOperating).toBe(0);
  });

  it('work refunds credit totalWork, not personal spend', () => {
    const [m] = computeMonthlySpending([
      exp({ date: '2020-01-05', amount: 400, category: 'travel_work' }),
      exp({ date: '2020-01-20', amount: 100, isWorkExpense: true, flow: 'inflow', transactionType: 'refund' }),
    ]);
    expect(m.totalWork).toBe(300);
    expect(m.byCategory.travel_work).toBe(300);
    expect(m.totalExpenses).toBe(0);
  });

  it('reimbursements (e.g. Coupa) go to totalReimbursement, NOT totalIncome', () => {
    const [m] = computeMonthlySpending([
      exp({ date: '2020-01-08', amount: 750, flow: 'inflow', transactionType: 'reimbursement' }),
    ]);
    expect(m.totalReimbursement).toBe(750);
    expect(m.totalIncome).toBe(0);
  });

  it('income inflows go to totalIncome', () => {
    const [m] = computeMonthlySpending([
      exp({ date: '2020-01-01', amount: 7900, flow: 'inflow', transactionType: 'income' }),
      exp({ date: '2020-01-15', amount: 7900, flow: 'inflow', transactionType: 'income' }),
    ]);
    expect(m.totalIncome).toBe(15800);
    expect(m.totalExpenses).toBe(0);
  });

  it('transfers and investments are tracked separately from spend', () => {
    const [m] = computeMonthlySpending([
      exp({ date: '2020-01-03', amount: 5000, transactionType: 'transfer' }),
      exp({ date: '2020-01-04', amount: 1000, transactionType: 'investment', category: 'investing' }),
    ]);
    expect(m.totalTransfers).toBe(5000);
    expect(m.totalInvestments).toBe(1000);
    expect(m.totalExpenses).toBe(0);
    expect(m.totalOperating).toBe(0);
    expect(m.transactionCount).toBe(2);
  });
});

describe('computeCategoryAverages', () => {
  const now = new Date(2026, 5, 15); // June 15, 2026

  it('excludes the in-progress month from BOTH numerator and denominator', () => {
    const avgs = computeCategoryAverages(
      [
        exp({ date: '2026-04-10', amount: 100, category: 'food_dining' }),
        exp({ date: '2026-05-10', amount: 200, category: 'food_dining' }),
        exp({ date: '2026-06-05', amount: 999, category: 'food_dining' }), // in-progress — ignored
      ],
      now,
    );
    expect(avgs.food_dining).toBe(150); // (100+200)/2, NOT (100+200+999)/3
  });

  it('divides by the complete-month count even when a category skips a month', () => {
    const avgs = computeCategoryAverages(
      [
        exp({ date: '2026-04-10', amount: 100, category: 'food_dining' }),
        exp({ date: '2026-05-10', amount: 60, category: 'subscriptions' }),
      ],
      now,
    );
    expect(avgs.food_dining).toBe(50); // 100 / 2 complete months
    expect(avgs.subscriptions).toBe(30);
  });
});

describe('computeWorkExpenses', () => {
  it('counts flag-OR-travel_work as work; everything else personal', () => {
    const { work, personal } = computeWorkExpenses([
      exp({ date: '2020-01-05', amount: 100, category: 'food_dining', isWorkExpense: true }),
      exp({ date: '2020-01-06', amount: 200, category: 'travel_work' }),
      exp({ date: '2020-01-07', amount: 300, category: 'food_dining' }),
    ]);
    expect(work).toBe(300);
    expect(personal).toBe(300);
  });

  it('filters to a single month when monthKey is given, and ignores non-expenses', () => {
    const { work, personal } = computeWorkExpenses(
      [
        exp({ date: '2020-01-05', amount: 100, category: 'travel_work' }),
        exp({ date: '2020-02-05', amount: 999, category: 'travel_work' }), // other month
        exp({ date: '2020-01-09', amount: 50, category: 'food_dining' }),
        exp({ date: '2020-01-10', amount: 5000, transactionType: 'transfer' }), // not a real expense
      ],
      '2020-01',
    );
    expect(work).toBe(100);
    expect(personal).toBe(50);
  });
});

describe('computeMonthComparison', () => {
  it('compares the last two CALENDAR-complete months', () => {
    const cmp = computeMonthComparison([
      exp({ date: '2020-01-10', amount: 1000, category: 'food_dining' }),
      exp({ date: '2020-02-10', amount: 1400, category: 'food_dining' }),
    ]);
    expect(cmp).not.toBeNull();
    expect(cmp!.currentMonth).toBe('Feb 2020');
    expect(cmp!.priorMonth).toBe('Jan 2020');
    expect(cmp!.currentExpenses).toBe(1400);
    expect(cmp!.priorExpenses).toBe(1000);
    expect(cmp!.expenseChange).toBe(400);
    expect(cmp!.expenseChangePct).toBe(40);
  });

  it('excludes the real in-progress month — comparison stays on complete months', () => {
    const thisMonth = `${currentMonthKey()}-05`;
    const cmp = computeMonthComparison([
      exp({ date: '2020-01-10', amount: 1000, category: 'food_dining' }),
      exp({ date: '2020-02-10', amount: 1400, category: 'food_dining' }),
      exp({ date: thisMonth, amount: 88888, category: 'food_dining' }), // in-progress — ignored
    ]);
    expect(cmp!.currentMonth).toBe('Feb 2020');
    expect(cmp!.currentExpenses).toBe(1400);
  });

  it('returns null with fewer than two complete months', () => {
    expect(
      computeMonthComparison([exp({ date: '2020-01-10', amount: 100, category: 'food_dining' })]),
    ).toBeNull();
  });

  it('skips trivial (<$20) category changes', () => {
    const cmp = computeMonthComparison([
      exp({ date: '2020-01-10', amount: 1000, category: 'food_dining' }),
      exp({ date: '2020-02-10', amount: 1400, category: 'food_dining' }),
      exp({ date: '2020-01-11', amount: 100, category: 'utilities' }),
      exp({ date: '2020-02-11', amount: 110, category: 'utilities' }), // +$10 — trivial
    ]);
    const cats = cmp!.categoryChanges.map(c => c.category);
    expect(cats).toContain('food_dining');
    expect(cats).not.toContain('utilities');
  });
});

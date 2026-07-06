import { describe, it, expect } from 'vitest';
import type { RecurringCandidate } from '../recurringDetector';
import { buildSubscriptionRadar, monthlyEquivalent } from '../subscriptionRadar';

function cand(over: Partial<RecurringCandidate> & Pick<RecurringCandidate, 'merchant' | 'cadence' | 'avgAmount'>): RecurringCandidate {
  return {
    id: `recur-${over.merchant}`,
    normalizedKey: over.merchant.toLowerCase(),
    avgIntervalDays: 30,
    amountVariancePct: 0,
    occurrences: 5,
    firstDate: '2026-01-01',
    lastDate: '2026-06-15',
    nextExpectedDate: '2026-07-15',
    daysUntilNext: 9,
    category: 'subscriptions',
    flow: 'outflow',
    confidence: 0.9,
    expenseIds: [],
    ...over,
  } as RecurringCandidate;
}

describe('monthlyEquivalent', () => {
  it('normalizes cadences to a monthly figure', () => {
    expect(monthlyEquivalent(10, 'weekly')).toBeCloseTo(43.45);
    expect(monthlyEquivalent(10, 'biweekly')).toBeCloseTo(21.725);
    expect(monthlyEquivalent(10, 'monthly')).toBe(10);
    expect(monthlyEquivalent(300, 'quarterly')).toBe(100);
    expect(monthlyEquivalent(120, 'yearly')).toBe(10);
    expect(monthlyEquivalent(10, 'irregular')).toBe(0);
  });
});

describe('buildSubscriptionRadar', () => {
  it('ranks recurring outflows by monthly-equivalent cost, highest first', () => {
    const r = buildSubscriptionRadar([
      cand({ merchant: 'Netflix', cadence: 'monthly', avgAmount: 16 }),
      cand({ merchant: 'Insurance', cadence: 'yearly', avgAmount: 1200 }), // $100/mo
      cand({ merchant: 'Coffee', cadence: 'weekly', avgAmount: 5 }), // ~$21.7/mo
    ]);
    expect(r.items.map((i) => i.merchant)).toEqual(['Insurance', 'Coffee', 'Netflix']);
    expect(r.items[0].monthlyCost).toBe(100);
    expect(r.count).toBe(3);
    expect(r.totalMonthly).toBe(100 + 22 + 16); // rounded
    expect(r.totalAnnual).toBe(r.totalMonthly * 12);
  });

  it('excludes inflows, irregular cadence, and low-confidence charges', () => {
    const r = buildSubscriptionRadar([
      cand({ merchant: 'Paycheck', cadence: 'biweekly', avgAmount: 3000, flow: 'inflow' }),
      cand({ merchant: 'Random', cadence: 'irregular', avgAmount: 50 }),
      cand({ merchant: 'Noise', cadence: 'monthly', avgAmount: 20, confidence: 0.3 }),
      cand({ merchant: 'Spotify', cadence: 'monthly', avgAmount: 12 }),
    ]);
    expect(r.items.map((i) => i.merchant)).toEqual(['Spotify']);
    expect(r.totalMonthly).toBe(12);
  });

  it('is empty when nothing qualifies', () => {
    const r = buildSubscriptionRadar([]);
    expect(r).toEqual({ items: [], totalMonthly: 0, totalAnnual: 0, count: 0 });
  });
});

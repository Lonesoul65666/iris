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
    expect(r.totalMonthly).toBe(138); // round(100 + 21.725 + 16)
    // totalAnnual comes from the RAW monthly sum, not 12× the rounded total —
    // so it's within a couple dollars of totalMonthly*12, not exactly equal.
    expect(r.totalAnnual).toBe(Math.round((100 + 5 * 4.345 + 16) * 12)); // 1653
    expect(Math.abs(r.totalAnnual - r.totalMonthly * 12)).toBeLessThanOrEqual(5);
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
    expect(r).toEqual({ items: [], canceled: [], ignored: [], totalMonthly: 0, totalAnnual: 0, count: 0 });
  });

  it('partitions by status and keeps canceled/ignored out of the active total', () => {
    const r = buildSubscriptionRadar(
      [
        cand({ merchant: 'Netflix', cadence: 'monthly', avgAmount: 16 }),
        cand({ merchant: 'SUNO', cadence: 'monthly', avgAmount: 10 }),
        cand({ merchant: 'RandomBuy', cadence: 'monthly', avgAmount: 25 }),
      ],
      { statusMap: { suno: { status: 'canceled', canceledOn: '2026-06-30' }, randombuy: { status: 'ignored' } } },
    );
    expect(r.items.map((i) => i.merchant)).toEqual(['Netflix']);
    expect(r.canceled.map((i) => i.merchant)).toEqual(['SUNO']);
    expect(r.ignored.map((i) => i.merchant)).toEqual(['RandomBuy']);
    expect(r.count).toBe(1);
    expect(r.totalMonthly).toBe(16); // canceled + ignored excluded
  });

  it('flags a canceled charge that billed again AFTER the cancel date as resurrected', () => {
    const r = buildSubscriptionRadar(
      [cand({ merchant: 'SUNO', cadence: 'monthly', avgAmount: 10, lastDate: '2026-07-10' })],
      { statusMap: { suno: { status: 'canceled', canceledOn: '2026-06-20' } } },
    );
    expect(r.canceled[0].resurrected).toBe(true);
  });

  it('does NOT flag a canceled charge whose last bill predates the cancel date', () => {
    const r = buildSubscriptionRadar(
      [cand({ merchant: 'SUNO', cadence: 'monthly', avgAmount: 10, lastDate: '2026-06-10' })],
      { statusMap: { suno: { status: 'canceled', canceledOn: '2026-06-20' } } },
    );
    expect(r.canceled[0].resurrected).toBe(false);
  });
});

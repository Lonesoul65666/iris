import { describe, it, expect } from 'vitest';
import { detectRecurring, normalizeMerchant, monthlyRecurringLoad } from '../recurringDetector';
import type { RecurringCandidate } from '../recurringDetector';
import { exp } from './fixtures';

const NOW = new Date(2026, 5, 1); // June 1, 2026 — all fixtures sit inside the 180d lookback

function netflix(date: string, amount = 15.49) {
  return exp({ date, amount, description: 'NETFLIX.COM', category: 'subscriptions' });
}

// 4 monthly charges: intervals 28/31/30 days → median 30 → 'monthly'
const NETFLIX_SERIES = [
  netflix('2026-02-15'),
  netflix('2026-03-15'),
  netflix('2026-04-15'),
  netflix('2026-05-15'),
];

describe('detectRecurring', () => {
  it('finds a monthly bill from 4 same-amount monthly occurrences', () => {
    const out = detectRecurring(NETFLIX_SERIES, { now: NOW });
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.cadence).toBe('monthly');
    expect(c.occurrences).toBe(4);
    expect(c.avgAmount).toBe(15.49);
    expect(c.amountVariancePct).toBe(0);
    expect(c.category).toBe('subscriptions');
    expect(c.flow).toBe('outflow');
    expect(c.firstDate).toBe('2026-02-15');
    expect(c.lastDate).toBe('2026-05-15');
    expect(c.expenseIds).toHaveLength(4);
    expect(c.confidence).toBeGreaterThan(0.7);
  });

  it('respects minOccurrences', () => {
    expect(detectRecurring(NETFLIX_SERIES, { now: NOW, minOccurrences: 5 })).toHaveLength(0);
    // default minOccurrences=3: a 3-charge series qualifies
    expect(detectRecurring(NETFLIX_SERIES.slice(0, 3), { now: NOW })).toHaveLength(1);
  });

  it('respects minConfidence', () => {
    expect(detectRecurring(NETFLIX_SERIES, { now: NOW, minConfidence: 0.95 })).toHaveLength(0);
  });

  it('skips irregular ad-hoc spacing', () => {
    const adHoc = [
      exp({ date: '2026-01-01', amount: 50, description: 'SOME SHOP' }),
      exp({ date: '2026-01-04', amount: 50, description: 'SOME SHOP' }),
      exp({ date: '2026-02-23', amount: 50, description: 'SOME SHOP' }),
      exp({ date: '2026-05-25', amount: 50, description: 'SOME SHOP' }),
    ]; // intervals 3 / 50 / 91 → median 50 → irregular
    expect(detectRecurring(adHoc, { now: NOW })).toHaveLength(0);
  });

  it('ignores transfers (CC payments are not bills)', () => {
    const transfers = NETFLIX_SERIES.map(e => ({
      ...e,
      description: 'CITI AUTOPAY',
      transactionType: 'transfer' as const,
    }));
    expect(detectRecurring(transfers, { now: NOW })).toHaveLength(0);
  });

  it('only looks back lookbackDays (default 180)', () => {
    const old = [
      netflix('2025-01-15'),
      netflix('2025-02-15'),
      netflix('2025-03-15'),
      netflix('2025-04-15'),
    ];
    expect(detectRecurring(old, { now: NOW })).toHaveLength(0); // all before Dec 2025 cutoff
    expect(detectRecurring(old, { now: NOW, lookbackDays: 800 })).toHaveLength(1);
  });

  it('folds merchant description variants into ONE candidate', () => {
    const mixed = [
      exp({ date: '2026-02-15', amount: 15.49, description: 'NETFLIX.COM 11/15', category: 'subscriptions' }),
      exp({ date: '2026-03-15', amount: 15.49, description: 'NETFLIX.COM LOS GATOS CA', category: 'subscriptions' }),
      exp({ date: '2026-04-15', amount: 15.49, description: 'NETFLIX.COM', category: 'subscriptions' }),
      exp({ date: '2026-05-15', amount: 15.49, description: 'NETFLIX.COM', category: 'subscriptions' }),
    ];
    const out = detectRecurring(mixed, { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].occurrences).toBe(4);
  });

  it('projects nextExpectedDate = lastDate + average interval', () => {
    const [c] = detectRecurring(NETFLIX_SERIES, { now: NOW });
    // last 2026-05-15 + avg 29.7d → June 13
    expect(c.nextExpectedDate).toBe('2026-06-13');
    expect(c.avgIntervalDays).toBeCloseTo(29.7, 1);
    expect(c.daysUntilNext).toBeGreaterThanOrEqual(12);
    expect(c.daysUntilNext).toBeLessThanOrEqual(13);
  });
});

describe('normalizeMerchant', () => {
  it('strips processor prefixes, trailing ids, and locations', () => {
    expect(normalizeMerchant('SQ *COFFEE SHOP 123456')).toBe('coffee shop');
    expect(normalizeMerchant('NETFLIX.COM 11/15')).toBe(normalizeMerchant('NETFLIX.COM LOS GATOS CA'));
  });

  it('never throws on missing descriptions — empty key signals skip', () => {
    expect(normalizeMerchant(undefined)).toBe('');
    expect(normalizeMerchant(null)).toBe('');
    expect(normalizeMerchant('')).toBe('');
  });
});

describe('monthlyRecurringLoad', () => {
  function cand(over: Partial<RecurringCandidate>): RecurringCandidate {
    return {
      id: 'x', merchant: 'x', normalizedKey: 'x', cadence: 'monthly',
      avgIntervalDays: 30, avgAmount: 0, amountVariancePct: 0, occurrences: 4,
      firstDate: '2026-01-01', lastDate: '2026-04-01', nextExpectedDate: '2026-05-01',
      daysUntilNext: 10, category: 'other', flow: 'outflow', confidence: 0.9, expenseIds: [],
      ...over,
    };
  }

  it('normalizes every cadence to a monthly equivalent, netting inflows', () => {
    const { outflow, inflow, net } = monthlyRecurringLoad([
      cand({ cadence: 'monthly', avgAmount: 100 }),            // 100
      cand({ cadence: 'quarterly', avgAmount: 300 }),          // 100
      cand({ cadence: 'yearly', avgAmount: 1200 }),            // 100
      cand({ cadence: 'monthly', avgAmount: 50, flow: 'inflow' }),
    ]);
    expect(outflow).toBe(300);
    expect(inflow).toBe(50);
    expect(net).toBe(-250);
  });
});

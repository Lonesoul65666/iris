import { describe, it, expect } from 'vitest';
import type { RecurringCandidate, Cadence } from '../recurringDetector';
import { forecastCashflow } from '../cashflowForecast';

const NOW = new Date(2026, 6, 6); // Mon Jul 6, 2026 (local)

function cand(over: Partial<RecurringCandidate> & Pick<RecurringCandidate, 'merchant' | 'cadence' | 'nextExpectedDate'>): RecurringCandidate {
  return {
    id: `recur-${over.merchant}-${over.cadence}`,
    normalizedKey: over.merchant.toLowerCase(),
    avgIntervalDays: 30,
    avgAmount: 20,
    amountVariancePct: 0,
    occurrences: 5,
    firstDate: '2026-01-01',
    lastDate: '2026-06-15',
    daysUntilNext: 5,
    category: 'subscriptions',
    flow: 'outflow',
    confidence: 0.9,
    expenseIds: [],
    ...over,
  } as RecurringCandidate;
}

describe('forecastCashflow', () => {
  it('projects a monthly bill once into a 30-day window on its expected date', () => {
    const f = forecastCashflow([cand({ merchant: 'Netflix', cadence: 'monthly', nextExpectedDate: '2026-07-15', avgAmount: 18 })], { now: NOW });
    expect(f.count).toBe(1);
    expect(f.total).toBe(18);
    expect(f.days).toHaveLength(1);
    expect(f.days[0].date).toBe('2026-07-15');
    expect(f.days[0].items[0].merchant).toBe('Netflix');
  });

  it('projects a weekly bill multiple times across the window', () => {
    const f = forecastCashflow([cand({ merchant: 'Coffee', cadence: 'weekly', nextExpectedDate: '2026-07-07', avgAmount: 10 })], { now: NOW });
    // Jul 7, 14, 21, 28, Aug 4 → within 30 days (end = Aug 5): 5 hits.
    expect(f.count).toBe(5);
    expect(f.total).toBe(50);
    expect(f.days.map((d) => d.date)).toEqual(['2026-07-07', '2026-07-14', '2026-07-21', '2026-07-28', '2026-08-04']);
  });

  it('rolls an overdue expected date forward to the next real occurrence', () => {
    // nextExpectedDate is in the past; monthly → next lands Jul 20.
    const f = forecastCashflow([cand({ merchant: 'Gym', cadence: 'monthly', nextExpectedDate: '2026-06-20', avgAmount: 40 })], { now: NOW });
    expect(f.count).toBe(1);
    expect(f.days[0].date).toBe('2026-07-20');
  });

  it('filters out low-confidence and inflow candidates', () => {
    const f = forecastCashflow([
      cand({ merchant: 'Noise', cadence: 'monthly', nextExpectedDate: '2026-07-10', confidence: 0.3 }),
      cand({ merchant: 'Paycheck', cadence: 'biweekly', nextExpectedDate: '2026-07-10', flow: 'inflow' }),
      cand({ merchant: 'Rent', cadence: 'monthly', nextExpectedDate: '2026-07-10', avgAmount: 2000 }),
    ], { now: NOW });
    expect(f.count).toBe(1);
    expect(f.days[0].items[0].merchant).toBe('Rent');
  });

  it('groups multiple bills on the same day and sorts days ascending', () => {
    const f = forecastCashflow([
      cand({ merchant: 'B', cadence: 'monthly', nextExpectedDate: '2026-07-20', avgAmount: 30 }),
      cand({ merchant: 'A', cadence: 'monthly', nextExpectedDate: '2026-07-10', avgAmount: 50 }),
      cand({ merchant: 'C', cadence: 'monthly', nextExpectedDate: '2026-07-10', avgAmount: 90 }),
    ], { now: NOW });
    expect(f.days.map((d) => d.date)).toEqual(['2026-07-10', '2026-07-20']);
    expect(f.days[0].total).toBe(140);
    // items within a day sort by amount desc
    expect(f.days[0].items.map((i) => i.merchant)).toEqual(['C', 'A']);
  });

  it('skips irregular cadence and respects a custom horizon', () => {
    const irregular = forecastCashflow([cand({ merchant: 'Random', cadence: 'irregular' as Cadence, nextExpectedDate: '2026-07-10' })], { now: NOW });
    expect(irregular.count).toBe(0);

    // A quarterly bill 60 days out is excluded at 30d, included at 90d.
    const q = cand({ merchant: 'Insurance', cadence: 'quarterly', nextExpectedDate: '2026-09-01', avgAmount: 300 });
    expect(forecastCashflow([q], { now: NOW, horizonDays: 30 }).count).toBe(0);
    expect(forecastCashflow([q], { now: NOW, horizonDays: 90 }).count).toBe(1);
  });
});

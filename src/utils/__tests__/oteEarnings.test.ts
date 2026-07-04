import { describe, it, expect } from 'vitest';
import { computeOteStatus } from '../oteEarnings';

// July 2, 2026 — half the year (183/365 ≈ 0.5014) gone by.
const NOW = new Date(2026, 6, 2);
const FLOOR = 6000;   // base check
const TARGET = 360000;

// A base check on the 15th + a base+commission check end-of-month, Jan→Jun.
function paychecks(commissionPerMonth: number[]) {
  const out: { date: string; amount: number }[] = [];
  commissionPerMonth.forEach((comm, i) => {
    const mm = String(i + 1).padStart(2, '0');
    out.push({ date: `2026-${mm}-15`, amount: FLOOR });               // base
    out.push({ date: `2026-${mm}-29`, amount: FLOOR + comm });        // base + commission
  });
  return out;
}

describe('computeOteStatus', () => {
  it('splits total comp into base + commission', () => {
    const s = computeOteStatus(paychecks([9000, 9000, 9000, 9000, 9000, 9000]), FLOOR, TARGET, NOW);
    // 12 checks × 6000 base = 72000 base; 6 × 9000 commission = 54000.
    expect(s.baseYtd).toBe(72000);
    expect(s.commissionYtd).toBe(54000);
    expect(s.earnedYtd).toBe(126000);
  });

  it('measures pace against a straight-line target-to-date', () => {
    // $36k/mo total for 6 months = 216k by mid-year → ahead of the ~180k line.
    const s = computeOteStatus(paychecks([24000, 24000, 24000, 24000, 24000, 24000]), FLOOR, TARGET, NOW);
    expect(s.earnedYtd).toBe(216000); // 72k base + 144k commission
    expect(s.targetToDate).toBeCloseTo(360000 * s.fractionElapsed, 5); // self-consistent
    expect(s.targetToDate).toBeGreaterThan(178000); // ~half of 360k
    expect(s.targetToDate).toBeLessThan(182000);
    expect(s.pace).toBeGreaterThan(0);
    expect(s.onPace).toBe(true);
  });

  it('flags behind pace and projects the year-end shortfall', () => {
    const s = computeOteStatus(paychecks([0, 0, 0, 0, 0, 0]), FLOOR, TARGET, NOW); // base only
    expect(s.earnedYtd).toBe(72000);
    expect(s.onPace).toBe(false);
    expect(s.pace).toBeLessThan(0);
    // annualized from ~half a year ≈ 2× → ~144k, well under 360k
    expect(s.projectedYearEnd).toBeGreaterThan(140000);
    expect(s.projectedYearEnd).toBeLessThan(150000);
    expect(s.projectedYearEnd).toBeLessThan(TARGET);
  });

  it('builds a month-by-month series through the current month', () => {
    const s = computeOteStatus(paychecks([9000, 9000, 9000, 9000, 9000, 9000]), FLOOR, TARGET, NOW);
    expect(s.byMonth).toHaveLength(7); // Jan..Jul (current month inclusive)
    expect(s.byMonth[0]).toEqual({ month: '2026-01', total: 21000, commission: 9000 });
    expect(s.byMonth[6]).toEqual({ month: '2026-07', total: 0, commission: 0 }); // no July check yet
  });

  it('anchors to a mid-year raise date — run-rate since the raise', () => {
    const anchor = new Date(2026, 1, 1); // Feb 1 (the role change)
    const s = computeOteStatus(paychecks([9000, 9000, 9000, 9000, 9000, 9000]), FLOOR, TARGET, NOW, anchor);
    // Jan's checks excluded → Feb..Jun = 5 months × (6000 + 15000) = 105000.
    expect(s.earnedYtd).toBe(105000);
    expect(s.byMonth[0].month).toBe('2026-02');   // strip starts at the raise month
    expect(s.byMonth).toHaveLength(6);            // Feb..Jul inclusive
    // ~5 months since the raise → fraction well under half a year.
    expect(s.fractionElapsed).toBeLessThan(0.45);
    expect(s.fractionElapsed).toBeGreaterThan(0.3);
  });

  it('handles an empty / no-target install without dividing by zero', () => {
    const s = computeOteStatus([], FLOOR, 0, NOW);
    expect(s.earnedYtd).toBe(0);
    expect(s.pctOfTarget).toBe(0);
    expect(s.projectedYearEnd).toBe(0);
  });
});

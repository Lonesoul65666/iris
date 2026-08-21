import { describe, it, expect } from 'vitest';
import { buildNetWorthSeries, NW_SERIES_COLORS, NW_OTHER_COLOR, CASH_KEY, ASSETS_KEY, OTHER_KEY } from '../netWorthSeries';
import type { Account, PortfolioSnapshot } from '../../types/portfolio';

function acct(id: string, type: Account['type'], institution: string, value = 0): Account {
  return {
    id, name: id, institution, type, status: 'active', lastUpdated: '2026-08-20',
    totalValue: value, holdings: [],
  };
}

function snap(date: string, totals: Array<[string, number]>, over: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  const liquid = totals.reduce((s, [, v]) => s + v, 0);
  return {
    date,
    totalLiquidNetWorth: liquid,
    totalNetWorth: liquid,
    accountTotals: totals.map(([accountId, value]) => ({ accountId, value })),
    ...over,
  };
}

const CASH = acct('teller-bofa_checking', 'bank', 'Bank of America');
const FID = acct('plaid-inv-1', 'brokerage', 'Fidelity');
const COIN = acct('plaid-inv-2', 'crypto', 'Coinbase');
const HOOD = acct('plaid-inv-3', 'brokerage', 'Robinhood');

describe('buildNetWorthSeries', () => {
  it('groups cash together and each investment institution on its own', () => {
    const cash2 = acct('teller-bofa_savings', 'bank', 'Bank of America');
    const { groups, points } = buildNetWorthSeries(
      [snap('2026-08-01', [[CASH.id, 10_000], [cash2.id, 5_000], [FID.id, 400_000]])],
      [CASH, cash2, FID],
    );
    expect(groups.map((g) => g.label)).toEqual(['Cash', 'Fidelity']);
    // Four chequing accounts are not four stories.
    expect(points[0][CASH_KEY]).toBe(15_000);
    expect(points[0]['inst:fidelity']).toBe(400_000);
    expect(points[0].total).toBe(415_000);
  });

  it('derives the non-account pool from the two totals the snapshot already has', () => {
    const s = snap('2026-08-01', [[CASH.id, 10_000]], { totalNetWorth: 310_000 });
    const { groups, points } = buildNetWorthSeries([s], [CASH]);
    expect(groups.map((g) => g.key)).toEqual([CASH_KEY, ASSETS_KEY]);
    expect(points[0][ASSETS_KEY]).toBe(300_000); // equity + home − mortgage + car
  });

  it('gives every entity a fixed colour, and a NEW institution never repaints an old one', () => {
    const before = buildNetWorthSeries([snap('2026-08-01', [[CASH.id, 10_000], [FID.id, 400_000]])], [CASH, FID]);
    const after = buildNetWorthSeries(
      [
        snap('2026-08-01', [[CASH.id, 10_000], [FID.id, 400_000]]),
        snap('2026-08-20', [[CASH.id, 10_000], [FID.id, 400_000], [COIN.id, 30_000], [HOOD.id, 20_000]]),
      ],
      [CASH, FID, COIN, HOOD],
    );
    const colorOf = (s: ReturnType<typeof buildNetWorthSeries>, key: string) => s.groups.find((g) => g.key === key)!.color;
    expect(colorOf(before, CASH_KEY)).toBe(NW_SERIES_COLORS[0]);
    expect(colorOf(after, CASH_KEY)).toBe(NW_SERIES_COLORS[0]);
    expect(colorOf(before, 'inst:fidelity')).toBe(colorOf(after, 'inst:fidelity'));
    // Newcomers take the next free slots, in first-appearance order.
    expect(colorOf(after, 'inst:coinbase')).toBe(NW_SERIES_COLORS[2]);
    expect(colorOf(after, 'inst:robinhood')).toBe(NW_SERIES_COLORS[3]);
  });

  it('breaks the line rather than drawing a zero where no per-account data exists', () => {
    // Early snapshots (or a hand-written one) can carry a total and no breakdown.
    const bare: PortfolioSnapshot = { date: '2026-07-01', totalLiquidNetWorth: 9_000, totalNetWorth: 9_000, accountTotals: [] };
    const { points } = buildNetWorthSeries([bare, snap('2026-08-01', [[CASH.id, 10_000]])], [CASH]);
    expect(points[0][CASH_KEY]).toBeNull();
    expect(points[0].total).toBe(9_000);   // the headline is still honest
    expect(points[1][CASH_KEY]).toBe(10_000);
  });

  it('folds past six series into a neutral Other instead of inventing a colour', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => acct(`inv-${i}`, 'brokerage', n, 1000));
    const { groups } = buildNetWorthSeries(
      [snap('2026-08-01', [[CASH.id, 1_000], ...many.map((a) => [a.id, 1_000] as [string, number])], { totalNetWorth: 100_000 })],
      [CASH, ...many],
    );
    // cash + 4 institutions + assets + Other = 7 rows, 6 of them coloured hues.
    expect(groups.map((g) => g.label)).toEqual(['Cash', 'A', 'B', 'C', 'D', 'Equity & real assets', 'Other']);
    expect(groups.find((g) => g.key === OTHER_KEY)!.color).toBe(NW_OTHER_COLOR);
    expect(new Set(groups.map((g) => g.color)).size).toBe(groups.length); // no hue used twice
  });

  it('keeps a deleted account visible as Other rather than losing the money', () => {
    const { groups, points } = buildNetWorthSeries(
      [snap('2026-08-01', [[CASH.id, 10_000], ['ghost-account', 4_000]])],
      [CASH],
    );
    expect(groups.map((g) => g.key)).toEqual([CASH_KEY, OTHER_KEY]);
    expect(points[0][OTHER_KEY]).toBe(4_000);
  });

  it('reports each series latest value, for a legend that carries numbers', () => {
    const { groups } = buildNetWorthSeries(
      [snap('2026-08-01', [[CASH.id, 10_000]]), snap('2026-08-20', [[CASH.id, 12_500]])],
      [CASH],
    );
    expect(groups.find((g) => g.key === CASH_KEY)!.latest).toBe(12_500);
  });

  it('sorts by date, whatever order the snapshots arrive in', () => {
    const { points } = buildNetWorthSeries(
      [snap('2026-08-20', [[CASH.id, 2]]), snap('2026-08-01', [[CASH.id, 1]])],
      [CASH],
    );
    expect(points.map((p) => p.date)).toEqual(['2026-08-01', '2026-08-20']);
  });

  it('is empty with no snapshots', () => {
    expect(buildNetWorthSeries([], [CASH])).toEqual({ groups: [], points: [] });
  });
});

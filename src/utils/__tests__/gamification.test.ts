import { describe, it, expect } from 'vitest';
import type { FunMoney } from '../../types/budget';
import type { Scorecard, ScorecardMonth } from '../savingsScorecard';
import {
  streakOf,
  underBaseStreak,
  funMoneyStreaks,
  computeGameState,
  gameGreeting,
  funHeadToHead,
} from '../gamification';
import { exp } from './fixtures';

// July 15, 2026 — completed months are those before '2026-07'.
const NOW = new Date(2026, 6, 15);

// Minimal ScorecardMonth; only `partial` and `surplusVsBase` are read by the engine.
function scMonth(over: Partial<ScorecardMonth> & Pick<ScorecardMonth, 'month' | 'surplusVsBase'>): ScorecardMonth {
  return {
    label: over.month,
    income: 15800,
    spend: 0,
    reserveSpend: 0,
    totalSpend: 0,
    banked: 0,
    partial: false,
    ...over,
  };
}

function scorecard(months: ScorecardMonth[]): Scorecard {
  const full = months.filter((m) => !m.partial);
  return {
    guaranteedBase: 15800,
    months,
    cumulativeBanked: full.reduce((s, m) => s + m.banked, 0),
    monthsUnderBase: full.filter((m) => m.surplusVsBase >= 0).length,
    fullMonthCount: full.length,
    lastFull: full[full.length - 1],
    priorFull: full[full.length - 2],
    trend: 'flat',
    solvency: { base: 15800, avgEveryday: 0, avgReserve: 0, avgTotalSpend: 0, variableLean: 0 },
  };
}

describe('streakOf', () => {
  it('counts the trailing run and the best run', () => {
    expect(streakOf([true, true, false, true, true, true])).toEqual({ current: 3, best: 3, active: true });
  });
  it('current is 0 when the last period failed', () => {
    expect(streakOf([true, true, true, false])).toEqual({ current: 0, best: 3, active: false });
  });
  it('handles an empty series', () => {
    expect(streakOf([])).toEqual({ current: 0, best: 0, active: false });
  });
  it('best exceeds current when an older run was longer', () => {
    expect(streakOf([true, true, true, true, false, true])).toEqual({ current: 1, best: 4, active: true });
  });
});

describe('underBaseStreak', () => {
  it('counts consecutive full months at/under base, ignoring the partial current month', () => {
    const sc = scorecard([
      scMonth({ month: '2026-03', surplusVsBase: 200 }),
      scMonth({ month: '2026-04', surplusVsBase: 500 }),
      scMonth({ month: '2026-05', surplusVsBase: 100 }),
      scMonth({ month: '2026-06', surplusVsBase: -300, partial: true }), // in-progress: excluded
    ]);
    expect(underBaseStreak(sc)).toEqual({ current: 3, best: 3, active: true });
  });

  it('breaks the streak on an over-base month', () => {
    const sc = scorecard([
      scMonth({ month: '2026-03', surplusVsBase: 200 }),
      scMonth({ month: '2026-04', surplusVsBase: -50 }), // blew base
      scMonth({ month: '2026-05', surplusVsBase: 100 }),
    ]);
    expect(underBaseStreak(sc)).toEqual({ current: 1, best: 1, active: true });
  });
});

describe('funMoneyStreaks', () => {
  const scottPot: FunMoney = {
    person: 'Scott', earnerId: 'scott', category: 'fun_scott',
    monthlyBudget: 200, monthlySpent: 0, startMonth: '2026-04',
  };
  const clairePot: FunMoney = {
    person: 'Claire', earnerId: 'claire', category: 'fun_wife',
    monthlyBudget: 200, monthlySpent: 0, startMonth: '2026-04',
  };

  it('counts completed months at/under allowance and drops the current month', () => {
    const expenses = [
      exp({ date: '2026-04-10', amount: 150, category: 'fun_scott' }), // under
      exp({ date: '2026-05-10', amount: 250, category: 'fun_scott' }), // over — breaks
      exp({ date: '2026-06-10', amount: 100, category: 'fun_scott' }), // under
      exp({ date: '2026-07-10', amount: 999, category: 'fun_scott' }), // current month — ignored
    ];
    const [scott] = funMoneyStreaks([scottPot], expenses, NOW);
    expect(scott.streak).toEqual({ current: 1, best: 1, active: true });
  });

  it('a clean run banks every completed month', () => {
    const expenses = [
      exp({ date: '2026-04-10', amount: 50, category: 'fun_wife' }),
      exp({ date: '2026-05-10', amount: 60, category: 'fun_wife' }),
      exp({ date: '2026-06-10', amount: 70, category: 'fun_wife' }),
    ];
    const [claire] = funMoneyStreaks([clairePot], expenses, NOW);
    expect(claire.streak).toEqual({ current: 3, best: 3, active: true });
  });
});

describe('funHeadToHead', () => {
  const race = (a: number, b: number) => funHeadToHead([
    { person: 'Scott', streak: { current: a, best: a, active: a > 0 } },
    { person: 'Claire', streak: { current: b, best: b, active: b > 0 } },
  ]);

  it('names the leader and the gap', () => {
    expect(race(3, 1)).toBe("Scott's banked fun money 3 months running — Claire's 2 behind. Catch up.");
  });
  it('calls a tie', () => {
    expect(race(2, 2)).toContain('dead even');
  });
  it('nudges when nobody has banked yet', () => {
    expect(race(0, 0)).toContain('slate is clean');
  });
  it('is empty with fewer than two people', () => {
    expect(funHeadToHead([{ person: 'Scott', streak: { current: 3, best: 3, active: true } }])).toBe('');
  });
});

describe('gameGreeting', () => {
  const base = (over: Partial<ReturnType<typeof computeGameState>>) => gameGreeting({
    underBase: { current: 0, best: 0, active: false },
    fun: [],
    monthsUnderBase: 0,
    cumulativeBanked: 0,
    trend: 'flat',
    ...over,
  });

  it('leads with a live discipline streak', () => {
    expect(base({ underBase: { current: 3, best: 3, active: true } }).headline).toContain('3 months straight');
  });
  it('flags a snapped streak', () => {
    expect(base({ underBase: { current: 0, best: 4, active: false } }).headline).toContain('snapped');
  });
  it('falls back to a cold-start welcome', () => {
    expect(base({}).headline).toContain('First clean month');
  });

  it('computeGameState wires the pieces together', () => {
    const sc = scorecard([
      scMonth({ month: '2026-05', surplusVsBase: 100, banked: 800 }),
      scMonth({ month: '2026-06', surplusVsBase: 200, banked: 900 }),
    ]);
    const state = computeGameState(sc, [], [], NOW);
    expect(state.underBase.current).toBe(2);
    expect(state.monthsUnderBase).toBe(2);
    expect(state.cumulativeBanked).toBe(1700);
  });
});

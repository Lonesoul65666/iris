import { describe, it, expect } from 'vitest';
import type { Scorecard, ScorecardMonth } from '../savingsScorecard';
import type { PersonMonthResults } from '../gamification';
import type { MomentsContext, MomentRecord } from '../moments';
import {
  evaluateMoments, momentOccurrences, captureMomentsBaseline, MOMENT_TYPES,
  currentMonthQuest, pendingMomentCelebrations, momentToNudge,
} from '../moments';

function month(over: Partial<ScorecardMonth> & { month: string }): ScorecardMonth {
  return {
    label: over.month, income: 16000, spend: 10000, reserveSpend: 0, totalSpend: 10000,
    surplusVsBase: 5800, banked: 6000, partial: false, ...over,
  };
}

function scorecard(months: ScorecardMonth[]): Scorecard {
  return {
    guaranteedBase: 15800, months, cumulativeBanked: 0, monthsUnderBase: 0,
    fullMonthCount: months.filter((m) => !m.partial).length, trend: 'flat',
    solvency: { base: 15800, avgEveryday: 0, avgReserve: 0, avgTotalSpend: 0, variableLean: 0 },
  };
}

function ctx(over: Partial<MomentsContext> = {}): MomentsContext {
  return {
    scorecard: scorecard([]), funMonthly: [], stashes: [], now: new Date(2026, 6, 15), ...over,
  };
}

// A baseline far in the past → nothing is grandfathered (everything is "forward").
const OLD_BASELINE = captureMomentsBaseline('2020-01-01T00:00:00.000Z');

describe('momentOccurrences', () => {
  it('logs Beat the Clock only for completed months under base', () => {
    const c = ctx({ scorecard: scorecard([
      month({ month: '2026-05', surplusVsBase: 400 }),   // under → win
      month({ month: '2026-06', surplusVsBase: -200 }),  // over → no
      month({ month: '2026-07', surplusVsBase: 900, partial: true }), // in-progress → no
    ]) });
    const btc = momentOccurrences(c).filter((o) => o.type === 'beat-the-clock');
    expect(btc.map((o) => o.periodKey)).toEqual(['2026-05']);
  });

  it('logs Held the Line per person per passing month, and Both Banked only when all pass', () => {
    const funMonthly: PersonMonthResults[] = [
      { person: 'Scott', months: [{ periodKey: '2026-05', passed: true }, { periodKey: '2026-06', passed: true }] },
      { person: 'Claire', months: [{ periodKey: '2026-05', passed: true }, { periodKey: '2026-06', passed: false }] },
    ];
    const occ = momentOccurrences(ctx({ funMonthly }));
    const held = occ.filter((o) => o.type === 'held-the-line').map((o) => `${o.periodKey}:${o.person}`);
    expect(held.sort()).toEqual(['2026-05:Claire', '2026-05:Scott', '2026-06:Scott']);
    const both = occ.filter((o) => o.type === 'both-banked').map((o) => o.periodKey);
    expect(both).toEqual(['2026-05']); // June: Claire missed → not both
  });

  it('does not fire Both Banked for a solo household (only one partner tracked)', () => {
    const funMonthly: PersonMonthResults[] = [
      { person: 'Scott', months: [{ periodKey: '2026-05', passed: true }] },
    ];
    expect(momentOccurrences(ctx({ funMonthly })).some((o) => o.type === 'both-banked')).toBe(false);
  });

  it('logs Goal Crushed per retired stash, keyed by goal id', () => {
    const stashes = [
      { id: 'trip', name: 'Italy', achievedAt: '2026-06-10T00:00:00Z', achievement: { savedAmount: 4200 } },
      { id: 'couch', name: 'Couch', /* not achieved */ },
    ] as MomentsContext['stashes'];
    const crushed = momentOccurrences(ctx({ stashes })).filter((o) => o.type === 'goal-crushed');
    expect(crushed).toHaveLength(1);
    expect(crushed[0]).toMatchObject({ key: 'goal-crushed:trip', periodKey: '2026-06', magnitude: 4200, label: 'Italy' });
  });
});

describe('evaluateMoments — forward-only + idempotent', () => {
  const c = () => ctx({ scorecard: scorecard([
    month({ month: '2026-05', surplusVsBase: 400 }),
    month({ month: '2026-06', surplusVsBase: 300 }),
  ]) });

  it('first run with a fresh baseline celebrates NOTHING already-complete (no retro flood)', () => {
    // Baseline captured now (2026-07-15) → both May and June already completed.
    const baseline = captureMomentsBaseline(new Date(2026, 6, 15).toISOString());
    const { newlyEarned, log, tallies } = evaluateMoments(c(), baseline, []);
    expect(newlyEarned).toHaveLength(0);
    expect(log).toHaveLength(0);
    // …but the tally still COUNTS the history.
    expect(tallies.find((t) => t.type === 'beat-the-clock')!.count).toBe(2);
  });

  it('celebrates occurrences that completed AFTER the baseline', () => {
    // Baseline back in April → May & June are forward → both fire, oldest first.
    const baseline = captureMomentsBaseline('2026-04-15T00:00:00Z');
    const { newlyEarned, log } = evaluateMoments(c(), baseline, []);
    expect(newlyEarned.map((o) => o.periodKey)).toEqual(['2026-05', '2026-06']);
    expect(log.every((r) => r.celebrated === false)).toBe(true);
  });

  it('does not re-earn an occurrence already in the log', () => {
    const prior: MomentRecord[] = [
      { key: 'beat-the-clock:2026-05', type: 'beat-the-clock', periodKey: '2026-05', label: '2026-05', earnedAt: '2026-05-31T23:59:59Z', celebrated: true },
    ];
    const { newlyEarned } = evaluateMoments(c(), OLD_BASELINE, prior);
    expect(newlyEarned.map((o) => o.periodKey)).toEqual(['2026-06']); // May already logged
  });
});

describe('tallies + streaks', () => {
  it('computes Beat the Clock streak over completed months (ignores partial + breaks)', () => {
    const c = ctx({ scorecard: scorecard([
      month({ month: '2026-03', surplusVsBase: 100 }),
      month({ month: '2026-04', surplusVsBase: -50 }),   // break
      month({ month: '2026-05', surplusVsBase: 100 }),
      month({ month: '2026-06', surplusVsBase: 100 }),
      month({ month: '2026-07', surplusVsBase: 100, partial: true }), // excluded
    ]) });
    const t = evaluateMoments(c, OLD_BASELINE, []).tallies.find((x) => x.type === 'beat-the-clock')!;
    expect(t.count).toBe(3);           // Mar, May, Jun
    expect(t.currentStreak).toBe(2);   // May, Jun
    expect(t.bestStreak).toBe(2);
  });

  it('exposes a tally for every catalog type', () => {
    const tallies = evaluateMoments(ctx(), OLD_BASELINE, []).tallies;
    expect(tallies.map((t) => t.type).sort()).toEqual([...MOMENT_TYPES].sort());
  });
});

describe('currentMonthQuest', () => {
  it('reports buffer + on-track from the in-progress (partial) month', () => {
    const c = ctx({ now: new Date(2026, 6, 20), scorecard: scorecard([
      month({ month: '2026-06', surplusVsBase: 300 }),
      month({ month: '2026-07', surplusVsBase: 1200, partial: true }),
    ]) });
    const q = currentMonthQuest(c)!;
    expect(q).toMatchObject({ type: 'beat-the-clock', periodKey: '2026-07', buffer: 1200, onTrack: true });
    expect(q.daysLeft).toBe(12); // Jul 20 → 31 inclusive
  });

  it('flags over-base as off-track', () => {
    const c = ctx({ now: new Date(2026, 6, 20), scorecard: scorecard([
      month({ month: '2026-07', surplusVsBase: -450, partial: true }),
    ]) });
    expect(currentMonthQuest(c)!.onTrack).toBe(false);
  });

  it('returns null when there is no in-progress month', () => {
    const c = ctx({ scorecard: scorecard([month({ month: '2026-06', surplusVsBase: 100 })]) });
    expect(currentMonthQuest(c)).toBeNull();
  });
});

describe('celebration nudges', () => {
  it('pendingMomentCelebrations only surfaces un-acknowledged log entries, namespaced', () => {
    const log = [
      { key: 'beat-the-clock:2026-05', type: 'beat-the-clock' as const, periodKey: '2026-05', label: 'May 2026', earnedAt: '2026-05-31T23:59:59Z', celebrated: false },
      { key: 'both-banked:2026-05', type: 'both-banked' as const, periodKey: '2026-05', label: 'May 2026', earnedAt: '2026-05-31T23:59:59Z', celebrated: true },
    ];
    const nudges = pendingMomentCelebrations(log);
    expect(nudges.map((n) => n.id)).toEqual(['moment:beat-the-clock:2026-05']);
    expect(nudges[0].severity).toBe('celebration');
  });

  it('momentToNudge carries the type icon and one-shot flag', () => {
    const n = momentToNudge({ key: 'goal-crushed:trip', type: 'goal-crushed', periodKey: '2026-06', magnitude: 4200, completedAt: '2026-06-10T00:00:00Z', label: 'Italy' });
    expect(n.oneShot).toBe(true);
    expect(n.title).toContain('Italy');
  });
});

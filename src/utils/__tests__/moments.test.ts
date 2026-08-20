import { describe, it, expect } from 'vitest';
import type { Scorecard, ScorecardMonth } from '../savingsScorecard';
import type { PersonMonthResults } from '../gamification';
import type { MomentsContext, MomentRecord } from '../moments';
import {
  evaluateMoments, momentOccurrences, captureMomentsBaseline, MOMENT_TYPES,
  currentMonthQuest, pendingMomentCelebrations, momentToNudge,
  reconcileMoments, pendingMomentAmendments,
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

  // Since the settle lag, TWO months can be partial at once: the one that just
  // ended (still settling) and the one in progress. Picking "the first partial
  // month" would have shown August's quest for the first days of September.
  it('picks THIS month when the just-ended month is also still partial', () => {
    const c = ctx({ now: new Date(2026, 8, 2), scorecard: scorecard([
      month({ month: '2026-08', surplusVsBase: 4000, partial: true }),  // settling
      month({ month: '2026-09', surplusVsBase: 900, partial: true }),   // in progress
    ]) });
    const q = currentMonthQuest(c)!;
    expect(q.periodKey).toBe('2026-09');
    expect(q.buffer).toBe(900);
  });

  it('is not fooled by an early month left partial by missing income', () => {
    const c = ctx({ now: new Date(2026, 6, 20), scorecard: scorecard([
      month({ month: '2025-09', surplusVsBase: 50, partial: true }),    // data-edge month
      month({ month: '2026-07', surplusVsBase: 1200, partial: true }),
    ]) });
    expect(currentMonthQuest(c)!.periodKey).toBe('2026-07');
  });

  it('carries the target and spend so the card can state the goal', () => {
    const c = ctx({ now: new Date(2026, 6, 20), scorecard: scorecard([
      month({ month: '2026-07', totalSpend: 10959, surplusVsBase: 4841, partial: true }),
    ]) });
    const q = currentMonthQuest(c)!;
    expect(q.target).toBe(15800);
    expect(q.spent).toBe(10959);
    // The three numbers must reconcile, or the card contradicts itself.
    expect(q.spent + q.buffer).toBe(q.target);
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

// ─── Amend policy: data that lands AFTER a month was judged ───
//
// The settle lag holds a month for three days so it isn't judged while the totals
// are still moving. These cover the other half — a charge posting on day five,
// when the record is already written and its key blocks any re-earn.

describe('reconcileMoments', () => {
  const judged = (over: Partial<MomentRecord> = {}): MomentRecord => ({
    key: 'beat-the-clock:2026-07', type: 'beat-the-clock', periodKey: '2026-07',
    label: 'July 2026', earnedAt: '2026-07-31T23:59:59Z', magnitude: 1200, celebrated: true, ...over,
  });
  const july = (over: Partial<ScorecardMonth> = {}) => ctx({
    now: new Date(2026, 7, 6),
    scorecard: scorecard([month({ month: '2026-07', label: 'July 2026', surplusVsBase: 900, banked: 1200, ...over })]),
  });

  it('leaves an unchanged record alone (and returns the same array)', () => {
    const log = [judged()];
    const res = reconcileMoments(july(), log);
    expect(res.amendments).toEqual([]);
    expect(res.log).toBe(log);
  });

  it('amends the magnitude when a settled month moves, keeping what we first said', () => {
    const { log, amendments } = reconcileMoments(july({ banked: 260 }), [judged()]);
    expect(amendments).toEqual([
      { key: 'beat-the-clock:2026-07', type: 'beat-the-clock', label: 'July 2026', kind: 'amended', from: 1200, to: 260 },
    ]);
    expect(log[0]).toMatchObject({ magnitude: 260, originalMagnitude: 1200, amendKind: 'amended', amendAcknowledged: false });
    expect(log[0].amendedAt).toBe(new Date(2026, 7, 6).toISOString());
  });

  it('ignores movement inside the tolerance (rounding is not news)', () => {
    expect(reconcileMoments(july({ banked: 1201 }), [judged()]).amendments).toEqual([]);
  });

  it('revokes the win when late charges push the month back over base', () => {
    const { log, amendments } = reconcileMoments(july({ surplusVsBase: -1800 }), [judged()]);
    expect(amendments[0].kind).toBe('revoked');
    expect(log[0].revokedAt).toBeTruthy();
    expect(log[0].revokedReason).toMatch(/over base/);
    // Keeps the row — superseded, not deleted — and remembers the stated figure.
    expect(log[0]).toMatchObject({ key: 'beat-the-clock:2026-07', originalMagnitude: 1200 });
  });

  it('says it once — a second pass over an already-revoked record is quiet', () => {
    const c = july({ surplusVsBase: -1800 });
    const once = reconcileMoments(c, [judged()]);
    const twice = reconcileMoments(c, once.log);
    expect(twice.amendments).toEqual([]);
    expect(twice.log).toBe(once.log);
  });

  it('reinstates a revoked record when a late refund makes it qualify again', () => {
    const revoked = reconcileMoments(july({ surplusVsBase: -1800 }), [judged()]).log;
    const { log, amendments } = reconcileMoments(july({ banked: 1500 }), revoked);
    expect(amendments[0].kind).toBe('reinstated');
    expect(log[0].revokedAt).toBeUndefined();
    expect(log[0].magnitude).toBe(1500);
  });

  it('never revokes off missing context — a partial month is not grounds', () => {
    // The month is back in the "still moving" state: no opinion, no revocation.
    const { log, amendments } = reconcileMoments(july({ surplusVsBase: -1800, partial: true }), [judged()]);
    expect(amendments).toEqual([]);
    expect(log[0].revokedAt).toBeUndefined();
  });

  it('never revokes a fun-money Moment when funMonthly has not loaded', () => {
    const held: MomentRecord = {
      key: 'held-the-line:2026-07:Scott', type: 'held-the-line', periodKey: '2026-07',
      person: 'Scott', label: 'July 2026', earnedAt: '2026-07-31T23:59:59Z', celebrated: true,
    };
    // Empty funMonthly (cold load) → silence…
    expect(reconcileMoments(july(), [held]).amendments).toEqual([]);
    // …but a loaded month that says the allowance was blown DOES revoke.
    const loaded = ctx({
      now: new Date(2026, 7, 6),
      funMonthly: [{ person: 'Scott', months: [{ periodKey: '2026-07', passed: false }] }],
    });
    expect(reconcileMoments(loaded, [held]).amendments[0].kind).toBe('revoked');
  });

  it('does not revoke Goal Crushed just because the stash was deleted', () => {
    const crushed: MomentRecord = {
      key: 'goal-crushed:trip', type: 'goal-crushed', periodKey: '2026-06',
      label: 'Italy', earnedAt: '2026-06-10T00:00:00Z', magnitude: 4200, celebrated: true,
    };
    expect(reconcileMoments(ctx(), [crushed]).amendments).toEqual([]);
  });
});

describe('evaluateMoments — amend integration', () => {
  const july = (over: Partial<ScorecardMonth> = {}) => ctx({
    now: new Date(2026, 7, 6),
    scorecard: scorecard([month({ month: '2026-07', label: 'July 2026', surplusVsBase: 900, banked: 1200, ...over })]),
  });
  const judged: MomentRecord = {
    key: 'beat-the-clock:2026-07', type: 'beat-the-clock', periodKey: '2026-07',
    label: 'July 2026', earnedAt: '2026-07-31T23:59:59Z', magnitude: 1200, celebrated: false,
  };

  it('reports the amendment and persists the corrected number', () => {
    const res = evaluateMoments(july({ banked: 260 }), OLD_BASELINE, [judged]);
    expect(res.amendments.map((a) => a.kind)).toEqual(['amended']);
    expect(res.log[0].magnitude).toBe(260);
    expect(res.newlyEarned).toHaveLength(0);   // amending is not a new win
  });

  it('pulls a still-waiting celebration when the win is revoked', () => {
    expect(pendingMomentCelebrations([judged])).toHaveLength(1);
    const res = evaluateMoments(july({ surplusVsBase: -1800 }), OLD_BASELINE, [judged]);
    expect(pendingMomentCelebrations(res.log)).toHaveLength(0);
    expect(res.log).toHaveLength(1);           // superseded, not deleted
  });

  it('does not append a duplicate record when a revoked month re-qualifies', () => {
    const revoked = evaluateMoments(july({ surplusVsBase: -1800 }), OLD_BASELINE, [judged]).log;
    const res = evaluateMoments(july({ banked: 1500 }), OLD_BASELINE, revoked);
    expect(res.log).toHaveLength(1);
    expect(res.log[0].revokedAt).toBeUndefined();
    expect(res.newlyEarned).toHaveLength(0);
  });
});

describe('pendingMomentAmendments', () => {
  const rec = (over: Partial<MomentRecord>): MomentRecord => ({
    key: 'beat-the-clock:2026-07', type: 'beat-the-clock', periodKey: '2026-07',
    label: 'July 2026', earnedAt: '2026-07-31T23:59:59Z', celebrated: true, ...over,
  });

  it('surfaces un-acknowledged corrections as warnings, namespaced apart from wins', () => {
    const n = pendingMomentAmendments([rec({
      amendedAt: '2026-08-06T00:00:00Z', amendKind: 'amended', originalMagnitude: 1200, magnitude: 260,
    })]);
    expect(n).toHaveLength(1);
    expect(n[0].id).toBe('moment-amend:beat-the-clock:2026-07');
    expect(n[0].severity).toBe('warning');     // a correction is not a celebration
    expect(n[0].body).toContain('$1,200');
    expect(n[0].body).toContain('$260');
  });

  it('goes quiet once acknowledged', () => {
    expect(pendingMomentAmendments([rec({
      amendedAt: '2026-08-06T00:00:00Z', amendKind: 'amended', amendAcknowledged: true,
    })])).toEqual([]);
  });

  it('says out loud that a win is being taken back', () => {
    const n = pendingMomentAmendments([rec({
      amendedAt: '2026-08-06T00:00:00Z', amendKind: 'revoked', revokedAt: '2026-08-06T00:00:00Z',
      revokedReason: 'Late charges pushed the month back over base.', originalMagnitude: 1200,
    })]);
    expect(n[0].title).toContain('Taking one back');
    expect(n[0].body).toContain('over base');
  });
});

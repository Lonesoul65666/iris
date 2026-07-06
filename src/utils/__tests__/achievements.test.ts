import { describe, it, expect } from 'vitest';
import type { Scorecard } from '../savingsScorecard';
import type { GameState } from '../gamification';
import type { AchievementContext, GamificationBaseline, EngagementSignals } from '../achievements';
import {
  captureBaseline, evaluateAchievements, achievementSummary, ACHIEVEMENTS,
} from '../achievements';

function scorecard(over: Partial<Scorecard> = {}): Scorecard {
  return {
    guaranteedBase: 15800, months: [], cumulativeBanked: 0, monthsUnderBase: 0,
    fullMonthCount: 0, trend: 'flat',
    solvency: { base: 15800, avgEveryday: 0, avgReserve: 0, avgTotalSpend: 0, variableLean: 0 },
    ...over,
  };
}

function game(over: Partial<GameState> = {}): GameState {
  return {
    underBase: { current: 0, best: 0, active: false },
    fun: [],
    monthsUnderBase: 0, cumulativeBanked: 0, trend: 'flat',
    ...over,
  };
}

function engagement(over: Partial<EngagementSignals> = {}): EngagementSignals {
  return {
    connectedData: false, createdStash: false, stashCount: 0, crushedGoals: 0, committedMove: false,
    setFunOpening: false, gotAdvisorTake: false, monthsActive: 0, ...over,
  };
}

function ctx(over: Partial<AchievementContext> = {}): AchievementContext {
  return {
    scorecard: scorecard(), game: game(), funMoney: [], stashes: [],
    netWorth: 0, savingsRate: 0, engagement: engagement(), ...over,
  };
}

const NOW = new Date(2026, 6, 15);

describe('captureBaseline', () => {
  it('snapshots the forward-only metrics', () => {
    const c = ctx({
      game: game({ underBase: { current: 3, best: 3, active: true }, fun: [{ person: 'Scott', streak: { current: 2, best: 2, active: true } }] }),
      scorecard: scorecard({ monthsUnderBase: 3, cumulativeBanked: 8000 }),
      netWorth: 546000,
    });
    const b = captureBaseline(c, NOW.toISOString());
    expect(b).toMatchObject({ underBaseStreak: 3, monthsUnderBase: 3, cumulativeBanked: 8000, netWorth: 546000, funStreaks: { Scott: 2 } });
  });
});

describe('forward-only gating (no trophies for June)', () => {
  it('does NOT unlock a streak the user already had at baseline', () => {
    const c = ctx({ game: game({ underBase: { current: 3, best: 3, active: true } }) });
    const baseline: GamificationBaseline = captureBaseline(c, NOW.toISOString()); // baseline streak = 3
    const { states } = evaluateAchievements(c, baseline, [], NOW);
    const streak3 = states.find((s) => s.achievement.id === 'streak-3')!;
    expect(streak3.earned).toBe(false); // already had it at the start line
  });

  it('DOES unlock once the streak grows past the baseline', () => {
    const baseline: GamificationBaseline = {
      capturedAt: NOW.toISOString(), underBaseStreak: 1, monthsUnderBase: 1, cumulativeBanked: 0, netWorth: 0, savingsRate: 0, funBalance: 0, funSaved: 0, funStreaks: {}, engagement: engagement(),
    };
    const c = ctx({ game: game({ underBase: { current: 3, best: 3, active: true } }) });
    const { states, newlyUnlocked } = evaluateAchievements(c, baseline, [], NOW);
    expect(states.find((s) => s.achievement.id === 'streak-3')!.earned).toBe(true);
    expect(newlyUnlocked.map((a) => a.id)).toContain('streak-3');
  });
});

describe('savings rate is forward-only', () => {
  it('does NOT award a rate the user already had at baseline', () => {
    const c = ctx({ savingsRate: 18 });
    const baseline = captureBaseline(c, NOW.toISOString()); // baseline rate = 18
    const { states } = evaluateAchievements(c, baseline, [], NOW);
    expect(states.find((s) => s.achievement.id === 'savings-rate-10')!.earned).toBe(false);
  });
  it('awards once the rate climbs past a threshold it was below at baseline', () => {
    const baseline: GamificationBaseline = {
      capturedAt: NOW.toISOString(), underBaseStreak: 0, monthsUnderBase: 0,
      cumulativeBanked: 0, netWorth: 0, savingsRate: 12, funBalance: 0, funSaved: 0, funStreaks: {}, engagement: engagement(),
    };
    const c = ctx({ savingsRate: 22 });
    const { states } = evaluateAchievements(c, baseline, [], NOW);
    expect(states.find((s) => s.achievement.id === 'savings-rate-20')!.earned).toBe(true);
  });
});

describe('grandfathered (cleared before Iris started counting)', () => {
  it('flags an absolute-threshold achievement the user was already past at baseline', () => {
    const c = ctx({ savingsRate: 25 });
    const baseline = captureBaseline(c, NOW.toISOString()); // baseline rate = 25 (already ≥ 10 & 20)
    const { states } = evaluateAchievements(c, baseline, [], NOW);
    const rate10 = states.find((s) => s.achievement.id === 'savings-rate-10')!;
    expect(rate10.earned).toBe(false);
    expect(rate10.grandfathered).toBe(true);
  });
});

describe('cumulative achievements measure growth SINCE the start line', () => {
  const baseline = () => ({
    capturedAt: NOW.toISOString(), underBaseStreak: 0, monthsUnderBase: 0,
    cumulativeBanked: 8000, netWorth: 0, savingsRate: 0, funBalance: 0, funSaved: 0, funStreaks: {}, engagement: engagement(),
  });

  it('a big pre-existing banked total does NOT count toward Five Figures Deep', () => {
    const c = ctx({ scorecard: scorecard({ cumulativeBanked: 8000 }) }); // already had $8k
    const s = evaluateAchievements(c, baseline(), [], NOW).states.find((x) => x.achievement.id === 'banked-10k')!;
    expect(s.earned).toBe(false);
    expect(s.progress).toBe(0); // 0% — not 80%
  });

  it('unlocks once $10k is banked AFTER the start line', () => {
    const c = ctx({ scorecard: scorecard({ cumulativeBanked: 18000 }) }); // +$10k since baseline
    const s = evaluateAchievements(c, baseline(), [], NOW).states.find((x) => x.achievement.id === 'banked-10k')!;
    expect(s.earned).toBe(true);
  });
});

describe('goals count only when crushed after the baseline', () => {
  const baseline: GamificationBaseline = {
    capturedAt: '2026-07-01T00:00:00Z', underBaseStreak: 0, monthsUnderBase: 0,
    cumulativeBanked: 0, netWorth: 0, savingsRate: 0, funBalance: 0, funSaved: 0, funStreaks: {}, engagement: engagement(),
  };
  const crushed = (achievedAt: string) => ({
    id: 's1', name: 'Trip', targetAmount: 1000, currentBalance: 1000, monthlyContribution: 0, color: '#fff', achievedAt,
  });

  it('a goal crushed AFTER the start line unlocks first-crush', () => {
    const c = ctx({ stashes: [crushed('2026-07-10T00:00:00Z')] });
    const { states } = evaluateAchievements(c, baseline, [], NOW);
    expect(states.find((s) => s.achievement.id === 'first-crush')!.earned).toBe(true);
  });

  it('a goal crushed BEFORE the start line does NOT count', () => {
    const c = ctx({ stashes: [crushed('2026-06-10T00:00:00Z')] });
    const { states } = evaluateAchievements(c, baseline, [], NOW);
    expect(states.find((s) => s.achievement.id === 'first-crush')!.earned).toBe(false);
  });
});

describe('permanence + newlyUnlocked', () => {
  it('a recorded unlock stays earned even if the live metric dips, and is not re-reported as new', () => {
    const c = ctx({ game: game({ underBase: { current: 0, best: 5, active: false } }) }); // streak broke
    const prior = [{ id: 'streak-3', unlockedAt: '2026-06-01T00:00:00Z' }];
    const { states, newlyUnlocked } = evaluateAchievements(c, null, prior, NOW);
    const s = states.find((x) => x.achievement.id === 'streak-3')!;
    expect(s.earned).toBe(true);
    expect(s.unlockedAt).toBe('2026-06-01T00:00:00Z');
    expect(newlyUnlocked.map((a) => a.id)).not.toContain('streak-3');
  });
});

describe('exploration + summary', () => {
  it('setup achievements are forward-only: earned by DOING it, not by pre-existing state', () => {
    // An already-set-up install (baseline already connected) does NOT unlock it.
    const setup = ctx({ engagement: engagement({ connectedData: true }) });
    const existing = evaluateAchievements(setup, captureBaseline(setup, NOW.toISOString()), [], NOW);
    const grandfathered = existing.states.find((s) => s.achievement.id === 'connect-bank')!;
    expect(grandfathered.earned).toBe(false);
    expect(grandfathered.grandfathered).toBe(true);

    // A fresh install (baseline NOT connected) unlocks it once the bank connects.
    const freshBaseline = captureBaseline(ctx({ engagement: engagement({ connectedData: false }) }), NOW.toISOString());
    const afterConnect = evaluateAchievements(setup, freshBaseline, [], NOW);
    expect(afterConnect.states.find((s) => s.achievement.id === 'connect-bank')!.earned).toBe(true);
  });

  it('a first-run baseline earns NOTHING — clean slate (Scott: no retroactive trophies)', () => {
    const c = ctx({ engagement: engagement({ connectedData: true, createdStash: true, stashCount: 5, monthsActive: 3 }) });
    const { states } = evaluateAchievements(c, captureBaseline(c, NOW.toISOString()), [], NOW);
    const sum = achievementSummary(states);
    expect(sum.total).toBe(ACHIEVEMENTS.length);
    expect(sum.earned).toBe(0);
    expect(sum.byTier.bronze.total).toBeGreaterThan(0);
  });

  it('every achievement has a unique id', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

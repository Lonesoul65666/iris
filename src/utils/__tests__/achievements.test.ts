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
    connectedData: false, createdStash: false, crushedGoals: 0, committedMove: false,
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
      capturedAt: NOW.toISOString(), underBaseStreak: 1, monthsUnderBase: 1, cumulativeBanked: 0, netWorth: 0, funStreaks: {},
    };
    const c = ctx({ game: game({ underBase: { current: 3, best: 3, active: true } }) });
    const { states, newlyUnlocked } = evaluateAchievements(c, baseline, [], NOW);
    expect(states.find((s) => s.achievement.id === 'streak-3')!.earned).toBe(true);
    expect(newlyUnlocked.map((a) => a.id)).toContain('streak-3');
  });
});

describe('real completions fire regardless of baseline', () => {
  it('unlocks first-crush on the first run when a goal is already crushed', () => {
    const c = ctx({ engagement: engagement({ crushedGoals: 1 }) });
    const baseline = captureBaseline(c, NOW.toISOString());
    const { states } = evaluateAchievements(c, baseline, [], NOW);
    expect(states.find((s) => s.achievement.id === 'first-crush')!.earned).toBe(true);
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
  it('unlocks connect-bank when data is present', () => {
    const c = ctx({ engagement: engagement({ connectedData: true }) });
    const { states } = evaluateAchievements(c, captureBaseline(c, NOW.toISOString()), [], NOW);
    expect(states.find((s) => s.achievement.id === 'connect-bank')!.earned).toBe(true);
  });

  it('summary counts earned/total and splits by tier', () => {
    const c = ctx({ engagement: engagement({ connectedData: true }) });
    const { states } = evaluateAchievements(c, captureBaseline(c, NOW.toISOString()), [], NOW);
    const sum = achievementSummary(states);
    expect(sum.total).toBe(ACHIEVEMENTS.length);
    expect(sum.earned).toBeGreaterThanOrEqual(1);
    expect(sum.byTier.bronze.total).toBeGreaterThan(0);
  });

  it('every achievement has a unique id', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

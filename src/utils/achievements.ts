// Achievements engine — the permanent trophy layer of the "money as a hobby"
// system. PURE. Achievements are the source of truth (a permanent wall of what
// you've earned); when a NEW one unlocks the caller emits a `celebration` Nudge
// through the existing NudgeCard for the "FUCK YEAH" moment. See
// project_iris_gamification_roadmap (Tier 2).
//
// FORWARD-ONLY RULE (Scott, load-bearing): anything the user could already be
// sitting on from backfilled/imported data (streak lengths, months-under-base,
// net worth) is gated against a BASELINE captured on first run — it only fires
// for progress made AFTER Iris started watching. Genuine completion/engagement
// events (crushed a goal, connected a bank) are NOT forward-only. On the first
// run current === baseline, so nothing forward-only fires ("no trophies for
// June"); real completions still can.
//
// Tone: full-send coach voice, EMOJIS OFF in copy (icon field holds the emoji).

import type { FunMoney, Stash } from '../types/budget';
import type { Scorecard } from './savingsScorecard';
import type { GameState } from './gamification';
import type { Nudge } from './nudgeEngine';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type AchievementCategory =
  | 'discipline' | 'funMoney' | 'couples' | 'savings'
  | 'goals' | 'netWorth' | 'exploration' | 'prestige';

/** Engagement/feature signals the engine can read without new event tracking —
 *  derived at the call site from existing collections. */
export interface EngagementSignals {
  connectedData: boolean;   // real accounts/transactions present
  createdStash: boolean;    // at least one Have-To/Want-To exists
  stashCount: number;       // how many stashes exist
  crushedGoals: number;     // count of retired (achievedAt) stashes
  committedMove: boolean;   // at least one DeployConfirmation exists
  setFunOpening: boolean;   // a fun-money pot has been anchored/seeded
  gotAdvisorTake: boolean;  // has run "Iris's Take" at least once
  monthsActive: number;     // full months of data
}

export interface AchievementContext {
  scorecard: Scorecard;
  game: GameState;
  funMoney: FunMoney[];
  stashes: Stash[];
  netWorth: number;
  savingsRate: number;      // 0..100
  engagement: EngagementSignals;
}

/** Snapshot of the metrics that forward-only achievements measure against.
 *  Captured ONCE on first run; everything already true becomes the start line. */
export interface GamificationBaseline {
  capturedAt: string;
  underBaseStreak: number;
  monthsUnderBase: number;
  cumulativeBanked: number;
  netWorth: number;
  savingsRate: number;
  funBalance: number;
  funSaved: number;
  funStreaks: Record<string, number>;
  /** Setup/engagement state at the start line — so "connect a bank", "create a
   *  stash", etc. only unlock when the ACTION happens after Iris starts watching,
   *  not because an already-set-up install has the state. */
  engagement: EngagementSignals;
}

export interface AchievementEval {
  earned: boolean;
  progress: number;         // 0..1 toward earning (for the locked/progress display)
  detail?: string;          // optional live sub-text ("3 / 6 months")
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  hypeCopy: string;
  icon: string;
  tier: AchievementTier;
  category: AchievementCategory;
  secret?: boolean;
  forwardOnly?: boolean;
  evaluate: (ctx: AchievementContext, baseline: GamificationBaseline | null) => AchievementEval;
}

/** An unlocked-achievement record (persisted as JSON in a setting). */
export interface UnlockRecord {
  id: string;
  unlockedAt: string;       // ISO
  /** Has the celebration been acknowledged? Un-acknowledged unlocks keep showing
   *  their celebration card until dismissed — so the "FUCK YEAH" moment waits for
   *  you across reloads and survives React StrictMode's double-invoke. */
  celebrated?: boolean;
}

// ─── Baseline ───

export function captureBaseline(ctx: AchievementContext, at: string): GamificationBaseline {
  return {
    capturedAt: at,
    underBaseStreak: ctx.game.underBase.current,
    monthsUnderBase: ctx.scorecard.monthsUnderBase,
    cumulativeBanked: ctx.scorecard.cumulativeBanked,
    netWorth: ctx.netWorth,
    savingsRate: ctx.savingsRate,
    funBalance: maxFunBalance(ctx),
    funSaved: maxSavedToDate(ctx),
    funStreaks: Object.fromEntries(ctx.game.fun.map((f) => [f.person, f.streak.current])),
    engagement: ctx.engagement,
  };
}

// ─── evaluate() helpers ───

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** A threshold achievement: earned when `value >= threshold`. When forwardOnly,
 *  also require the baseline to have been BELOW the threshold (so a value the
 *  user was already sitting on doesn't unlock it). */
function threshold(
  value: number,
  target: number,
  base: number | null,
  detail?: string,
): AchievementEval {
  const crossedForward = base === null ? false : base < target;
  const earned = value >= target && (base === null ? true : crossedForward);
  return { earned, progress: clamp01(value / target), detail };
}

const mo = (n: number) => `${n} mo`;

/** A cumulative achievement measured SINCE the start line: earned when the value
 *  has GROWN by `target` past the baseline. A big pre-existing total doesn't
 *  count — "$10k banked" means $10k banked AFTER Iris started, not $10k absolute
 *  (which would be nearly free if you already had $8k). Progress is delta/target. */
function thresholdSince(value: number, base: number | null, target: number, detail?: string): AchievementEval {
  const delta = base === null ? 0 : Math.max(0, value - base);
  return { earned: delta >= target, progress: clamp01(delta / target), detail };
}

/** A do-it-once achievement, forward-only: earned only when the action becomes
 *  true AFTER the start line (baseline was false). An install that already has
 *  the state at baseline gets it grandfathered, never a hollow unlock. */
function didForward(current: boolean, wasAtBaseline: boolean | undefined): AchievementEval {
  if (wasAtBaseline === undefined) return { earned: false, progress: current ? 1 : 0 };
  return { earned: current && !wasAtBaseline, progress: current ? 1 : 0 };
}

// Cross-cutting derivations used by several achievements.
const bestFunStreak = (c: AchievementContext) => c.game.fun.reduce((m, f) => Math.max(m, f.streak.current), 0);
const baseBestFunStreak = (b: GamificationBaseline | null) => (b ? Math.max(0, ...Object.values(b.funStreaks), 0) : null);
// Joint "both banked" streak — the min of both partners' current fun-money
// streaks. Needs 2+ pots to mean anything; a solo household never fires these.
const minFunStreak = (c: AchievementContext) => (c.game.fun.length >= 2 ? Math.min(...c.game.fun.map((f) => f.streak.current)) : 0);
const baseMinFunStreak = (b: GamificationBaseline | null) => {
  if (!b) return null;
  const vals = Object.values(b.funStreaks);
  return vals.length >= 2 ? Math.min(...vals) : null;
};
// Sustained "same page" — both banking AND the household under base, together,
// for the same run of months (min across all three streaks).
const minSyncStreak = (c: AchievementContext) => (c.game.fun.length >= 2 ? Math.min(c.game.underBase.current, ...c.game.fun.map((f) => f.streak.current)) : 0);
const baseMinSyncStreak = (b: GamificationBaseline | null) => {
  if (!b) return null;
  const vals = Object.values(b.funStreaks);
  return vals.length >= 2 ? Math.min(b.underBaseStreak, ...vals) : null;
};
const maxFunBalance = (c: AchievementContext) => c.funMoney.reduce((m, f) => Math.max(m, f.balance ?? 0), 0);
const maxSavedToDate = (c: AchievementContext) => c.funMoney.reduce((m, f) => Math.max(m, f.savedToDate ?? 0), 0);
const householdSaved = (c: AchievementContext) => c.scorecard.cumulativeBanked + c.funMoney.reduce((s, f) => s + (f.savedToDate ?? 0), 0);
// Goals CRUSHED after the start line — forward-only by construction (a goal
// bought before Iris started watching doesn't count toward the wall).
const crushedSince = (c: AchievementContext, since: string | undefined) =>
  c.stashes.filter((s) => s.achievedAt && (!since || s.achievedAt > since));
const crushSavedMaxSince = (c: AchievementContext, since: string | undefined) =>
  crushedSince(c, since).reduce((m, s) => Math.max(m, s.achievement?.savedAmount ?? 0), 0);
const crushMonthsMaxSince = (c: AchievementContext, since: string | undefined) =>
  crushedSince(c, since).reduce((m, s) => Math.max(m, s.achievement?.monthsSaving ?? 0), 0);

// ─── The catalog ───
// Seed set spanning categories/tiers/forward-only; enriched toward ~50 from the
// design pass. Each owns its unlock logic in evaluate(). Add freely — new
// achievements ship like console achievement packs (Scott's Xbox model).

export const ACHIEVEMENTS: Achievement[] = [
  // ── exploration (setup/engagement — forward-only so they unlock by DOING the
  //    setup after the start line, not because an existing install has the state) ──
  {
    id: 'connect-bank', name: 'Plugged In', description: 'Connected real money to Iris.',
    hypeCopy: 'Bank is connected, the lights are on. Iris can finally see the whole board — let us play.',
    icon: '🔌', tier: 'bronze', category: 'exploration', forwardOnly: true,
    evaluate: (c, b) => didForward(c.engagement.connectedData, b?.engagement?.connectedData),
  },
  {
    id: 'first-stash', name: 'Planted a Flag', description: 'Created your first Have-To or Want-To.',
    hypeCopy: 'You gave a future expense a name and a home. That is the moment money stops happening TO you.',
    icon: '🚩', tier: 'bronze', category: 'exploration', forwardOnly: true,
    evaluate: (c, b) => didForward(c.engagement.createdStash, b?.engagement?.createdStash),
  },
  {
    id: 'three-stashes', name: 'Portfolio of Plans', description: 'Have three stashes going at once.',
    hypeCopy: 'Three pots at once. You are not putting out fires anymore, you are planning them out of existence.',
    icon: '🗂️', tier: 'bronze', category: 'exploration', forwardOnly: true,
    evaluate: (c, b) => threshold(c.engagement.stashCount, 3, b?.engagement?.stashCount ?? null, `${c.engagement.stashCount} / 3`),
  },
  {
    id: 'first-move', name: 'Made a Move', description: 'Committed your first monthly money move.',
    hypeCopy: 'You did not just look at the plan, you DID it. Committed and executed. That is the whole ballgame.',
    icon: '♟️', tier: 'bronze', category: 'exploration', forwardOnly: true,
    evaluate: (c, b) => didForward(c.engagement.committedMove, b?.engagement?.committedMove),
  },
  {
    id: 'set-fun-balances', name: 'Rules of Engagement', description: 'Anchored fun money for the household.',
    hypeCopy: 'Fun money has a scoreboard now. Let the friendly bloodsport begin.',
    icon: '📊', tier: 'bronze', category: 'exploration', forwardOnly: true,
    evaluate: (c, b) => didForward(c.engagement.setFunOpening, b?.engagement?.setFunOpening),
  },
  {
    id: 'first-iris-take', name: 'Faced the Music', description: 'Asked Iris for her honest take.',
    hypeCopy: 'You asked the hard question and Iris kept it real. Coaching, not cuddling.',
    icon: '🎤', tier: 'bronze', category: 'exploration', forwardOnly: true,
    evaluate: (c, b) => didForward(c.engagement.gotAdvisorTake, b?.engagement?.gotAdvisorTake),
  },
  {
    id: 'used-3-months', name: 'Sticking Around', description: 'Used Iris across three more months.',
    hypeCopy: 'Three months in and still showing up. Most people quit budgeting apps by week two. Not you.',
    icon: '📆', tier: 'bronze', category: 'exploration', forwardOnly: true,
    evaluate: (c, b) => threshold(c.engagement.monthsActive, (b?.engagement?.monthsActive ?? 0) + 3, b?.engagement ? b.engagement.monthsActive : null, `${c.engagement.monthsActive} mo`),
  },

  // ── discipline (forward-only streak/count/banked milestones) ──
  {
    id: 'first-month-under-base', name: 'First Blood', description: 'One full month under your guaranteed base.',
    hypeCopy: 'One month in the green. That is not luck, that is the start of a body count.',
    icon: '🩸', tier: 'bronze', category: 'discipline', forwardOnly: true,
    evaluate: (c, b) => thresholdSince(c.scorecard.monthsUnderBase, b?.monthsUnderBase ?? null, 1),
  },
  {
    id: 'streak-2', name: 'Back to Back', description: 'Two straight months under your base.',
    hypeCopy: 'Two in a row. Anybody can fluke one — you just proved it was not an accident.',
    icon: '⛓️', tier: 'bronze', category: 'discipline', forwardOnly: true,
    evaluate: (c, b) => threshold(c.game.underBase.current, 2, b?.underBaseStreak ?? null, mo(c.game.underBase.current)),
  },
  {
    id: 'streak-3', name: 'On a Heater', description: 'Three-month under-base streak.',
    hypeCopy: 'Three straight. The household is on a heater — do not you dare cool off.',
    icon: '🔥', tier: 'silver', category: 'discipline', forwardOnly: true,
    evaluate: (c, b) => threshold(c.game.underBase.current, 3, b?.underBaseStreak ?? null, mo(c.game.underBase.current)),
  },
  {
    id: 'streak-6', name: 'Half-Year Hitman', description: 'Six straight months under your base.',
    hypeCopy: 'Six months, six clean kills. That is not a habit anymore, that is a lifestyle.',
    icon: '🎯', tier: 'gold', category: 'discipline', forwardOnly: true,
    evaluate: (c, b) => threshold(c.game.underBase.current, 6, b?.underBaseStreak ?? null, mo(c.game.underBase.current)),
  },
  {
    id: 'streak-12', name: 'The Perfect Year', description: 'Twelve straight months under your base.',
    hypeCopy: 'Twelve for twelve. A full lap around the sun without a single blown month. Frame this one.',
    icon: '👑', tier: 'platinum', category: 'prestige', forwardOnly: true, secret: true,
    evaluate: (c, b) => threshold(c.game.underBase.current, 12, b?.underBaseStreak ?? null, mo(c.game.underBase.current)),
  },
  {
    id: 'comeback-kid', name: 'Comeback Kid', description: 'Rebuilt a 3-month streak after breaking one.',
    hypeCopy: 'Blew the streak, put your head down, ran it back to three. Losers quit, you re-racked.',
    icon: '🔄', tier: 'silver', category: 'discipline', forwardOnly: true,
    evaluate: (c, b) => {
      const rebuilt = c.game.underBase.current >= 3 && c.game.underBase.best > c.game.underBase.current;
      return { earned: rebuilt && (b === null ? false : b.underBaseStreak < 3 || b.underBaseStreak < c.game.underBase.best), progress: clamp01(c.game.underBase.current / 3) };
    },
  },
  {
    id: 'under-base-12-lifetime', name: 'Dozen Down', description: 'Twelve lifetime months under base.',
    hypeCopy: 'A dozen clean months on the books. The scoreboard remembers every one.',
    icon: '🗓️', tier: 'silver', category: 'discipline', forwardOnly: true,
    evaluate: (c, b) => thresholdSince(c.scorecard.monthsUnderBase, b?.monthsUnderBase ?? null, 12, `${Math.max(0, c.scorecard.monthsUnderBase - (b?.monthsUnderBase ?? c.scorecard.monthsUnderBase))} / 12`),
  },
  {
    id: 'banked-1k', name: 'Petty Cash', description: '$1,000 cumulative banked under base.',
    hypeCopy: 'A grand banked from just not-spending. Free money for the low price of self-control.',
    icon: '💵', tier: 'bronze', category: 'discipline', forwardOnly: true,
    evaluate: (c, b) => thresholdSince(c.scorecard.cumulativeBanked, b?.cumulativeBanked ?? null, 1000),
  },
  {
    id: 'banked-10k', name: 'Five Figures Deep', description: '$10,000 cumulative banked under base.',
    hypeCopy: 'Ten grand you did not blow. That is a used car you decided not to be dumb about.',
    icon: '💰', tier: 'silver', category: 'discipline', forwardOnly: true,
    evaluate: (c, b) => thresholdSince(c.scorecard.cumulativeBanked, b?.cumulativeBanked ?? null, 10000),
  },
  {
    id: 'banked-50k', name: 'The War Chest', description: '$50,000 cumulative banked under base.',
    hypeCopy: 'Fifty grand of pure restraint. This is a war chest now. Guard it like one.',
    icon: '🏦', tier: 'gold', category: 'discipline', forwardOnly: true,
    evaluate: (c, b) => thresholdSince(c.scorecard.cumulativeBanked, b?.cumulativeBanked ?? null, 50000),
  },
  {
    id: 'banked-100k', name: 'Six-Figure Discipline', description: '$100,000 cumulative banked under base.',
    hypeCopy: 'Six figures banked one boring month at a time. You out-disciplined it into existence.',
    icon: '🏆', tier: 'platinum', category: 'prestige', forwardOnly: true,
    evaluate: (c, b) => thresholdSince(c.scorecard.cumulativeBanked, b?.cumulativeBanked ?? null, 100000),
  },

  // ── funMoney (forward-only restraint) ──
  {
    id: 'fun-first-month', name: 'Held the Line', description: 'One month at/under your fun-money allowance.',
    hypeCopy: 'One month, under your own number, on purpose. Grown-up money behavior and it looks good on you.',
    icon: '🎮', tier: 'bronze', category: 'funMoney', forwardOnly: true,
    evaluate: (c, b) => threshold(bestFunStreak(c), 1, baseBestFunStreak(b), mo(bestFunStreak(c))),
  },
  {
    id: 'fun-streak-3', name: 'Restraint Arc', description: 'Three straight months under fun-money allowance.',
    hypeCopy: 'Three months of not lighting your fun budget on fire. Character development, live and in color.',
    icon: '🧘', tier: 'silver', category: 'funMoney', forwardOnly: true,
    evaluate: (c, b) => threshold(bestFunStreak(c), 3, baseBestFunStreak(b), mo(bestFunStreak(c))),
  },
  {
    id: 'fun-streak-6', name: 'Iron Wallet', description: 'Six straight months under fun-money allowance.',
    hypeCopy: 'Six months your fun money could not tempt you. That wallet is made of iron now.',
    icon: '🔒', tier: 'gold', category: 'funMoney', forwardOnly: true,
    evaluate: (c, b) => threshold(bestFunStreak(c), 6, baseBestFunStreak(b), mo(bestFunStreak(c))),
  },
  {
    id: 'fun-banked-500', name: 'Pocket Padding', description: '$500 banked fun-money balance.',
    hypeCopy: 'Five hundred bucks of fun money you sat on instead of blew. Future-you is smirking.',
    icon: '🪙', tier: 'bronze', category: 'funMoney', forwardOnly: true,
    evaluate: (c, b) => thresholdSince(maxFunBalance(c), b?.funBalance ?? null, 500),
  },
  {
    id: 'fun-saved-1k', name: 'Restraint Dividend', description: '$1,000 promoted from fun-money restraint into savings.',
    hypeCopy: 'A grand you moved from could-have-splurged to actually-saved. That is the whole trick, and you pulled it off.',
    icon: '📈', tier: 'silver', category: 'funMoney', forwardOnly: true,
    evaluate: (c, b) => thresholdSince(maxSavedToDate(c), b?.funSaved ?? null, 1000),
  },

  // ── couples ──
  {
    id: 'both-banked-1mo', name: 'Power Couple', description: 'You both banked fun money the same month.',
    hypeCopy: 'Both of you came in under, same month, same team. That is not a household, that is a two-person heist crew.',
    icon: '🤝', tier: 'bronze', category: 'couples',
    evaluate: (c) => {
      const both = c.game.fun.length >= 2 && c.game.fun.every((f) => f.streak.active);
      return { earned: both, progress: c.game.fun.length ? c.game.fun.filter((f) => f.streak.active).length / c.game.fun.length : 0 };
    },
  },
  // ── cooperative "we did it together" (Scott wants coop, not competitive —
  // the head-to-head lead badges were dropped 2026-07-06 for this reason;
  // the fun-money h2h box itself stays, it just doesn't earn a trophy) ──
  {
    id: 'same-page', name: 'Same Page', description: 'Both of you banked fun money in a month you lived under base.',
    hypeCopy: 'Both of you under on fun money AND the household under base — same month, same team. That is the whole damn point.',
    icon: '🤝', tier: 'silver', category: 'couples',
    evaluate: (c) => {
      const both = c.game.fun.length >= 2 && c.game.fun.every((f) => f.streak.active);
      return { earned: both && c.game.underBase.active, progress: both && c.game.underBase.active ? 1 : 0 };
    },
  },
  {
    // Bugfix (2026-07-06): this was missing forwardOnly, so a household with
    // a pre-existing fun-money streak at first run could fire it hollow — the
    // same class of bug the clean-slate pass fixed elsewhere. No unlocks
    // existed yet, so making it forward-only here costs nothing.
    id: 'household-machine', name: 'Household Machine', description: 'Both partners on a 3-month fun-money streak at once.',
    hypeCopy: 'Both of you, three months straight, dialed in together. This household is a machine now.',
    icon: '⚙️', tier: 'gold', category: 'couples', forwardOnly: true,
    evaluate: (c, b) => threshold(minFunStreak(c), 3, baseMinFunStreak(b), `${minFunStreak(c)} / 3 each`),
  },
  {
    id: 'household-machine-6', name: 'In Sync', description: 'Both partners on a 6-month fun-money streak at once.',
    hypeCopy: 'Half a year, both of you, no gaps. That is not luck, that is a system.',
    icon: '⚙️', tier: 'platinum', category: 'couples', forwardOnly: true,
    evaluate: (c, b) => threshold(minFunStreak(c), 6, baseMinFunStreak(b), `${minFunStreak(c)} / 6 each`),
  },
  {
    id: 'household-machine-12', name: 'Perfectly Aligned', description: 'Both partners on a 12-month fun-money streak at once.',
    hypeCopy: 'A full year, both of you, together, every single month. This is the ceiling.',
    icon: '👑', tier: 'platinum', category: 'prestige', forwardOnly: true, secret: true,
    evaluate: (c, b) => threshold(minFunStreak(c), 12, baseMinFunStreak(b), `${minFunStreak(c)} / 12 each`),
  },
  {
    id: 'synchronized-discipline', name: 'Locked In Together', description: 'Both banking fun money AND living under base, same 3 months.',
    hypeCopy: 'Fun money banked, household under base, three months straight, both of you. This is the whole game working at once.',
    icon: '🧩', tier: 'gold', category: 'couples', forwardOnly: true,
    evaluate: (c, b) => threshold(minSyncStreak(c), 3, baseMinSyncStreak(b), `${minSyncStreak(c)} / 3 each`),
  },
  {
    id: 'both-saved', name: 'Both Chipping In', description: 'Both partners promoted fun-money restraint into savings.',
    hypeCopy: 'Both of you skimmed real money from your own fun into savings. Nobody carried this one — you both did.',
    icon: '🤝', tier: 'bronze', category: 'couples',
    evaluate: (c) => {
      const both = c.funMoney.length >= 2 && c.funMoney.every((f) => (f.savedToDate ?? 0) > 0);
      return { earned: both, progress: c.funMoney.length ? c.funMoney.filter((f) => (f.savedToDate ?? 0) > 0).length / c.funMoney.length : 0 };
    },
  },

  // ── savings (forward-only rate + household saved) ──
  {
    id: 'savings-rate-10', name: 'Double Digits', description: 'Hit a 10% savings rate.',
    hypeCopy: 'Ten percent of gross, socked away. You just quietly beat most of the country.',
    icon: '🌱', tier: 'bronze', category: 'savings', forwardOnly: true,
    evaluate: (c, b) => threshold(c.savingsRate, 10, b?.savingsRate ?? null),
  },
  {
    id: 'savings-rate-20', name: 'Twenty Club', description: 'Hit a 20% savings rate.',
    hypeCopy: 'One in every five dollars, saved. That is not budgeting, that is a money-printing hobby.',
    icon: '💸', tier: 'silver', category: 'savings', forwardOnly: true,
    evaluate: (c, b) => threshold(c.savingsRate, 20, b?.savingsRate ?? null),
  },
  {
    id: 'savings-rate-30', name: 'Serious Money', description: 'Hit a 30% savings rate.',
    hypeCopy: 'Thirty percent. You are playing a completely different sport than the people around you.',
    icon: '🚀', tier: 'gold', category: 'savings', forwardOnly: true,
    evaluate: (c, b) => threshold(c.savingsRate, 30, b?.savingsRate ?? null),
  },
  {
    id: 'household-saved-25k', name: 'Quarter-Hundred', description: 'Household banked + saved crossed $25,000.',
    hypeCopy: 'Twenty-five grand moved into the ours pile. That is real, that is yours, that is the point.',
    icon: '🧱', tier: 'silver', category: 'savings', forwardOnly: true,
    evaluate: (c, b) => thresholdSince(householdSaved(c), b ? b.cumulativeBanked + b.funSaved : null, 25000),
  },

  // ── goals (completion events — counted only when crushed AFTER the start line) ──
  {
    id: 'first-crush', name: 'Goal Slayer', description: 'Crushed your first Want-To goal.',
    hypeCopy: 'You saved for it, you bought it in cash, you owe nobody. THAT is what winning feels like.',
    icon: '🗡️', tier: 'silver', category: 'goals',
    evaluate: (c, b) => { const n = crushedSince(c, b?.capturedAt).length; return { earned: n >= 1, progress: n >= 1 ? 1 : 0 }; },
  },
  {
    id: 'crush-3', name: 'Serial Finisher', description: 'Crushed three Want-To goals.',
    hypeCopy: 'Three goals set, three goals executed. You turned someday into a to-do list you actually finish.',
    icon: '🎖️', tier: 'gold', category: 'goals',
    evaluate: (c, b) => { const n = crushedSince(c, b?.capturedAt).length; return threshold(n, 3, null, `${n} / 3`); },
  },
  {
    id: 'crush-10', name: 'The Closer', description: 'Crushed ten Want-To goals.',
    hypeCopy: 'Ten dreams funded and cashed out, zero debt. You are not dreaming anymore, you are placing orders.',
    icon: '💎', tier: 'platinum', category: 'prestige',
    evaluate: (c, b) => { const n = crushedSince(c, b?.capturedAt).length; return threshold(n, 10, null, `${n} / 10`); },
  },
  {
    id: 'crush-big', name: 'Whale Hunter', description: 'Crushed a single Want-To worth $10,000+.',
    hypeCopy: 'A five-figure goal, paid in full, from savings. You harpooned the big one.',
    icon: '🐋', tier: 'gold', category: 'goals', secret: true,
    evaluate: (c, b) => ({ earned: crushSavedMaxSince(c, b?.capturedAt) >= 10000, progress: clamp01(crushSavedMaxSince(c, b?.capturedAt) / 10000) }),
  },
  {
    id: 'crush-patient', name: 'The Slow Cook', description: 'Crushed a goal that took 12+ months.',
    hypeCopy: 'A full year of chipping away, and you never blinked. Patience like that should be illegal.',
    icon: '🐢', tier: 'silver', category: 'goals', secret: true,
    evaluate: (c, b) => ({ earned: crushMonthsMaxSince(c, b?.capturedAt) >= 12, progress: clamp01(crushMonthsMaxSince(c, b?.capturedAt) / 12) }),
  },

  // ── netWorth (forward-only prestige; jumps on account connect → must be forward) ──
  {
    id: 'nw-up-100k', name: 'Uphill Climb', description: 'Grew net worth $100k after Iris started watching.',
    hypeCopy: 'A hundred grand of real growth on your watch. The line goes up.',
    icon: '📈', tier: 'gold', category: 'netWorth', forwardOnly: true,
    evaluate: (c, b) => thresholdSince(c.netWorth, b?.netWorth ?? null, 100000),
  },
  {
    id: 'three-mil-club', name: 'The Three Million Club', description: '$3,000,000 net worth.',
    hypeCopy: 'Three million dollars. This is the pie-in-the-sky, order-the-good-tequila tier. Absolute unit.',
    icon: '🛸', tier: 'platinum', category: 'prestige', forwardOnly: true, secret: true,
    evaluate: (c, b) => threshold(c.netWorth, 3_000_000, b ? b.netWorth : null),
  },

  // ── prestige (composed) ──
  {
    id: 'full-send', name: 'The Full Send', description: 'A 12-month streak AND a crushed goal.',
    hypeCopy: 'Perfect year on defense, a goal crushed on offense. You did not just play the game — you ran up the score.',
    icon: '🏅', tier: 'platinum', category: 'prestige', forwardOnly: true, secret: true,
    evaluate: (c, b) => {
      const crushed = crushedSince(c, b?.capturedAt).length;
      const earned = c.game.underBase.best >= 12 && crushed >= 1 && (b === null ? false : b.underBaseStreak < 12);
      return { earned, progress: clamp01(Math.min(c.game.underBase.best / 12, crushed)) };
    },
  },
];

// ─── Evaluation ───

export interface AchievementState {
  achievement: Achievement;
  earned: boolean;
  unlockedAt: string | null;   // from the persisted record when earned before
  progress: number;
  detail?: string;
  /** Forward-only achievement the user was ALREADY past at baseline — it can
   *  never unlock (they earned it before Iris started counting). Shown as
   *  "before Iris", not a misleading 100%-but-locked tile. */
  grandfathered?: boolean;
}

export interface EvaluateResult {
  states: AchievementState[];
  /** Achievements earned THIS evaluation that weren't already recorded. */
  newlyUnlocked: Achievement[];
}

/** Evaluate the whole catalog against context + baseline + prior unlocks.
 *  Once earned, an achievement stays earned (its recorded unlockedAt sticks even
 *  if the live metric later dips — a trophy is permanent). */
export function evaluateAchievements(
  ctx: AchievementContext,
  baseline: GamificationBaseline | null,
  unlocked: UnlockRecord[],
  now: Date = new Date(),
): EvaluateResult {
  const byId = new Map(unlocked.map((u) => [u.id, u]));
  const states: AchievementState[] = [];
  const newlyUnlocked: Achievement[] = [];

  for (const a of ACHIEVEMENTS) {
    const prior = byId.get(a.id);
    if (prior) {
      states.push({ achievement: a, earned: true, unlockedAt: prior.unlockedAt, progress: 1 });
      continue;
    }
    const res = a.evaluate(ctx, baseline);
    if (res.earned) {
      newlyUnlocked.push(a);
      states.push({ achievement: a, earned: true, unlockedAt: now.toISOString(), progress: 1, detail: res.detail });
    } else {
      // Forward-only + already at/over the bar means the user cleared it before
      // the baseline — it can never unlock. Flag it so the wall says so.
      const grandfathered = a.forwardOnly === true && res.progress >= 1;
      states.push({ achievement: a, earned: false, unlockedAt: null, progress: res.progress, detail: res.detail, grandfathered });
    }
  }

  return { states, newlyUnlocked };
}

/** Turn a freshly-unlocked achievement into a `celebration` Nudge so it renders
 *  through the existing NudgeCard — the "FUCK YEAH, LET'S GO" moment. */
export function achievementToNudge(a: Achievement): Nudge {
  return {
    id: `achievement:${a.id}`,
    severity: 'celebration',
    category: 'milestone',
    icon: a.icon,
    title: `Achievement unlocked — ${a.name}`,
    body: a.hypeCopy,
    oneShot: true,
  };
}

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export function achievementById(id: string): Achievement | undefined {
  return BY_ID.get(id);
}

/** Celebration nudges for every unlock the user hasn't acknowledged yet. Driven
 *  by the persisted records (not the transient "newly unlocked this run"), so the
 *  moment survives reloads/StrictMode and simply waits until dismissed. */
export function pendingCelebrationNudges(unlocked: UnlockRecord[]): Nudge[] {
  return unlocked
    .filter((u) => !u.celebrated)
    .map((u) => achievementById(u.id))
    .filter((a): a is Achievement => Boolean(a))
    .map(achievementToNudge);
}

/** Summary counts for the Trophy Wall header. */
export function achievementSummary(states: AchievementState[]): { earned: number; total: number; byTier: Record<AchievementTier, { earned: number; total: number }> } {
  const tiers: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum'];
  const byTier = Object.fromEntries(tiers.map((t) => [t, { earned: 0, total: 0 }])) as Record<AchievementTier, { earned: number; total: number }>;
  let earned = 0;
  for (const s of states) {
    byTier[s.achievement.tier].total++;
    if (s.earned) { earned++; byTier[s.achievement.tier].earned++; }
  }
  return { earned, total: states.length, byTier };
}

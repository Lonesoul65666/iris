// Moments engine — the REPEATABLE heartbeat layer. PURE, zero-AI, zero-IO.
//
// Achievements (see achievements.ts) are the permanent monument: one-and-done,
// tiered, the trophy wall. MOMENTS are the opposite by design — repeatable,
// mostly-monthly wins that recur, celebrate every time, tally over time, and
// (later) roll up into Achievements. This is the reward SUBSTRATE the future AI
// Quest Engine will hand out tasks against, which is why it's built first.
// See docs/moments-spec.md + project_iris_backlog (the "big swing").
//
// FORWARD-ONLY (same rule as achievements): months that completed BEFORE the
// baseline was captured seed the lifetime TALLY (counts are computed live from
// context, full history) but never fire a celebration — no retroactive flood.
// Only occurrences that complete AFTER the baseline are "newly earned".
//
// Tone note: copy/celebration lives with the celebration layer (phase 2); this
// module is pure state — what happened, how many times, current/best streak.

import type { Stash } from '../types/budget';
import type { Scorecard } from './savingsScorecard';
import { streakOf, type PersonMonthResults } from './gamification';
import type { Nudge } from './nudgeEngine';

export type MomentType = 'beat-the-clock' | 'both-banked' | 'held-the-line' | 'goal-crushed';

/** Catalog metadata — display name, icon, and who the win belongs to. The v1 set;
 *  Restraint Dividend is intentionally deferred (needs per-month skim tracking the
 *  cumulative savedToDate can't provide honestly). */
export const MOMENT_DEFS: Record<MomentType, { name: string; icon: string; scope: 'household' | 'couples' | 'person' | 'goal' }> = {
  'beat-the-clock':   { name: 'Beat the Clock',    icon: '⏱️', scope: 'household' },
  'both-banked':      { name: 'Both Banked',       icon: '🤝', scope: 'couples' },
  'held-the-line':    { name: 'Held the Line',     icon: '🛡️', scope: 'person' },
  'goal-crushed':     { name: 'Goal Crushed',      icon: '🗡️', scope: 'goal' },
};

export const MOMENT_TYPES = Object.keys(MOMENT_DEFS) as MomentType[];

/** A single qualifying win, derived from context. */
export interface MomentOccurrence {
  key: string;          // `${type}:${periodKey}:${person ?? ''}` — stable + idempotent
  type: MomentType;
  periodKey: string;    // 'YYYY-MM'
  person?: string;
  magnitude?: number;   // $ banked / goal size — for copy + sorting
  completedAt: string;  // ISO: month-end for monthly types, achievedAt for goals
  label: string;        // human label (month name / goal name) for display
}

/** Persisted record — only celebratable (post-baseline) occurrences land here,
 *  so the log stays small. Tallies do NOT depend on the log (computed live). */
export interface MomentRecord {
  key: string;
  type: MomentType;
  periodKey: string;
  person?: string;
  magnitude?: number;
  label: string;         // display label (month/goal name) — kept so celebrations survive reloads
  earnedAt: string;      // = the occurrence's completedAt
  celebrated?: boolean;  // acknowledged? (drives the celebration queue, like achievements)
}

export interface MomentTally {
  type: MomentType;
  count: number;         // lifetime qualifying occurrences (INCLUDING pre-baseline history)
  currentStreak: number; // trailing run of qualifying completed months (0 where streak N/A)
  bestStreak: number;
}

export interface MomentsContext {
  scorecard: Scorecard;
  funMonthly: PersonMonthResults[];
  stashes: Stash[];
  now: Date;
}

export interface MomentsBaseline { capturedAt: string; }

export function captureMomentsBaseline(atIso: string): MomentsBaseline {
  return { capturedAt: atIso };
}

// ─── helpers ───

/** Last millisecond of a 'YYYY-MM' month, ISO. periodKey month is 1-based, which
 *  as a 0-based Date month index points at the NEXT month — so day-0 of that is
 *  the last instant of the target month. */
function monthEndIso(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1) - 1).toISOString();
}

/** Chronological "both banked" flags: for each completed month with ≥2 partners
 *  tracked, did EVERY partner come in under their fun allowance. */
function bothBankedSeries(funMonthly: PersonMonthResults[]): boolean[] {
  const byMonth = new Map<string, { passed: number; total: number }>();
  for (const pr of funMonthly) {
    for (const mm of pr.months) {
      const e = byMonth.get(mm.periodKey) ?? { passed: 0, total: 0 };
      e.total += 1;
      if (mm.passed) e.passed += 1;
      byMonth.set(mm.periodKey, e);
    }
  }
  return [...byMonth.keys()].sort().map((k) => {
    const e = byMonth.get(k)!;
    return e.total >= 2 && e.passed === e.total;
  });
}

/** Every qualifying occurrence across all types, derived from context. */
export function momentOccurrences(ctx: MomentsContext): MomentOccurrence[] {
  const out: MomentOccurrence[] = [];
  const labelOf = new Map(ctx.scorecard.months.map((m) => [m.month, m.label]));

  // Beat the Clock — each completed (non-partial) month under base.
  for (const m of ctx.scorecard.months) {
    if (!m.partial && m.surplusVsBase >= 0) {
      out.push({
        key: `beat-the-clock:${m.month}`, type: 'beat-the-clock', periodKey: m.month,
        magnitude: m.banked, completedAt: monthEndIso(m.month), label: m.label,
      });
    }
  }

  // Held the Line (per person) + collect month coverage for Both Banked.
  const monthCoverage = new Map<string, { passed: number; total: number }>();
  for (const pr of ctx.funMonthly) {
    for (const mm of pr.months) {
      const cov = monthCoverage.get(mm.periodKey) ?? { passed: 0, total: 0 };
      cov.total += 1;
      if (mm.passed) {
        cov.passed += 1;
        out.push({
          key: `held-the-line:${mm.periodKey}:${pr.person}`, type: 'held-the-line',
          periodKey: mm.periodKey, person: pr.person, completedAt: monthEndIso(mm.periodKey),
          label: labelOf.get(mm.periodKey) ?? mm.periodKey,
        });
      }
      monthCoverage.set(mm.periodKey, cov);
    }
  }

  // Both Banked — months where ≥2 partners tracked and all passed.
  for (const [pk, cov] of monthCoverage) {
    if (cov.total >= 2 && cov.passed === cov.total) {
      out.push({
        key: `both-banked:${pk}`, type: 'both-banked', periodKey: pk,
        completedAt: monthEndIso(pk), label: labelOf.get(pk) ?? pk,
      });
    }
  }

  // Goal Crushed — each retired Want-To (event-style; keyed by goal id, once).
  for (const s of ctx.stashes) {
    if (s.achievedAt) {
      out.push({
        key: `goal-crushed:${s.id}`, type: 'goal-crushed', periodKey: s.achievedAt.slice(0, 7),
        magnitude: s.achievement?.savedAmount, completedAt: s.achievedAt, label: s.name,
      });
    }
  }

  return out;
}

function computeTallies(ctx: MomentsContext, occ: MomentOccurrence[]): MomentTally[] {
  const count = (t: MomentType) => occ.filter((o) => o.type === t).length;
  // Streaks over clean chronological month series. Per-person (held-the-line) and
  // event (goal-crushed) streaks aren't meaningful at the type level — count only.
  const btc = streakOf(ctx.scorecard.months.filter((m) => !m.partial).map((m) => m.surplusVsBase >= 0));
  const bb = streakOf(bothBankedSeries(ctx.funMonthly));
  return [
    { type: 'beat-the-clock', count: count('beat-the-clock'), currentStreak: btc.current, bestStreak: btc.best },
    { type: 'both-banked',    count: count('both-banked'),    currentStreak: bb.current,  bestStreak: bb.best },
    { type: 'held-the-line',  count: count('held-the-line'),  currentStreak: 0,           bestStreak: 0 },
    { type: 'goal-crushed',   count: count('goal-crushed'),   currentStreak: 0,           bestStreak: 0 },
  ];
}

export interface MomentsEvalResult {
  /** Merged log (existing + freshly-earned, celebratable occurrences). */
  log: MomentRecord[];
  /** Occurrences earned THIS eval (post-baseline, not previously logged), oldest first. */
  newlyEarned: MomentOccurrence[];
  /** Lifetime tallies (full history, independent of the log). */
  tallies: MomentTally[];
}

/** Evaluate the catalog against context + baseline + prior log. Forward-only:
 *  occurrences that completed before the baseline seed tallies (live) but never
 *  celebrate; only fresh, post-baseline occurrences are newlyEarned + logged. */
export function evaluateMoments(
  ctx: MomentsContext,
  baseline: MomentsBaseline | null,
  existingLog: MomentRecord[],
): MomentsEvalResult {
  const occ = momentOccurrences(ctx);
  const logged = new Set(existingLog.map((r) => r.key));
  const baseMs = baseline ? Date.parse(baseline.capturedAt) : null;

  const fresh = occ
    .filter((o) => !logged.has(o.key))
    .filter((o) => (baseMs === null ? true : Date.parse(o.completedAt) > baseMs))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  const additions: MomentRecord[] = fresh.map((o) => ({
    key: o.key, type: o.type, periodKey: o.periodKey, person: o.person,
    magnitude: o.magnitude, label: o.label, earnedAt: o.completedAt, celebrated: false,
  }));

  return {
    log: additions.length ? [...existingLog, ...additions] : existingLog,
    newlyEarned: fresh,
    tallies: computeTallies(ctx, occ),
  };
}

// ─── Celebration copy (phase 2) ───

const money = (n?: number) => (n == null ? '' : `$${Math.round(n).toLocaleString()}`);

/** The fields celebration copy needs — shared by fresh occurrences and persisted
 *  records so both render identically. */
type MomentCopyInput = { type: MomentType; label: string; person?: string; magnitude?: number };

/** Full-send coach copy for a Moment. Tone matches the achievements engine
 *  (emojis in the icon field, not the prose). */
function momentCopy(o: MomentCopyInput): { title: string; body: string } {
  switch (o.type) {
    case 'beat-the-clock':
      return {
        title: `Beat the Clock — ${o.label}`,
        body: `Came in under base for ${o.label}${o.magnitude ? `, ${money(o.magnitude)} banked` : ''}. That is a month you WON. Bank it and run it back.`,
      };
    case 'both-banked':
      return {
        title: `Both Banked — ${o.label}`,
        body: `Both of you under your fun money, same month, same team. That is not a household — that is a two-person heist crew.`,
      };
    case 'held-the-line':
      return {
        title: `Held the Line — ${o.label}`,
        body: `${o.person ?? 'You'} stayed under the fun-money number on purpose. Grown-up money behavior, and it looks good on you.`,
      };
    case 'goal-crushed':
      return {
        title: `Goal Crushed — ${o.label}`,
        body: `You saved for ${o.label}${o.magnitude ? ` (${money(o.magnitude)})` : ''} and bought it in cash. Owe nobody. THAT is what winning feels like.`,
      };
  }
}

/** Turn any Moment (fresh occurrence or persisted record) into a `celebration`
 *  Nudge for the existing NudgeCard — the quiet stacked win (routine Moments stay
 *  here; only achievements take over the full screen). id namespaced so dismissal
 *  maps back to the log key. */
function buildMomentNudge(o: MomentCopyInput & { key: string }): Nudge {
  const { title, body } = momentCopy(o);
  return {
    id: `moment:${o.key}`,
    severity: 'celebration',
    category: 'milestone',
    icon: MOMENT_DEFS[o.type].icon,
    title,
    body,
    oneShot: true,
  };
}

export function momentToNudge(o: MomentOccurrence): Nudge {
  return buildMomentNudge(o);
}

/** Celebration nudges for every not-yet-acknowledged Moment in the log — driven
 *  by the persisted records (like achievements' pending celebrations) so the win
 *  survives reloads and simply waits until dismissed. */
export function pendingMomentCelebrations(log: MomentRecord[]): Nudge[] {
  return log.filter((r) => !r.celebrated).map(buildMomentNudge);
}

// ─── Live current-month quest (phase 3) ───

/** Days remaining in the calendar month of `now`, inclusive of today. */
function daysLeftInMonth(now: Date): number {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(0, lastDay - now.getDate() + 1);
}

export interface LiveQuest {
  type: MomentType;
  name: string;
  icon: string;
  periodKey: string;    // current (in-progress) month
  label: string;        // 'July 2026'
  buffer: number;       // base − spend so far ( + = still under base )
  daysLeft: number;
  onTrack: boolean;
}

/** The current month's live "Beat the Clock" quest — the daily hook. Reads the
 *  in-progress (partial) scorecard month; null if there isn't one yet. Not a
 *  logged Moment — it's the live, still-winnable version shown with urgency. */
export function currentMonthQuest(ctx: MomentsContext): LiveQuest | null {
  const cur = ctx.scorecard.months.find((m) => m.partial);
  if (!cur) return null;
  return {
    type: 'beat-the-clock',
    name: MOMENT_DEFS['beat-the-clock'].name,
    icon: MOMENT_DEFS['beat-the-clock'].icon,
    periodKey: cur.month,
    label: cur.label,
    buffer: cur.surplusVsBase,
    daysLeft: daysLeftInMonth(ctx.now),
    onTrack: cur.surplusVsBase >= 0,
  };
}

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
import { currentMonthKey } from './transactionAnalysis';
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

  // ─── Amend policy (2026-08-20) ───
  // SETTLE_LAG_DAYS stops a month being judged too EARLY. These fields handle the
  // other half: data that lands AFTER judgement. `magnitude` above is the number
  // we actually celebrated, which makes this log its own snapshot — reconcile it
  // against the live occurrences and any movement is visible without a second
  // collection to keep in sync.
  /** Late data moved (or invalidated) this record. ISO of the reconcile. */
  amendedAt?: string;
  /** What the amendment did — drives the copy, and is stored rather than inferred
   *  because "magnitude changed" and "was revoked and came back" are otherwise
   *  indistinguishable on the record. */
  amendKind?: 'amended' | 'revoked' | 'reinstated';
  /** The figure first celebrated. Set ONCE, on the first amendment, so the record
   *  keeps saying what we originally told the user however many times it moves. */
  originalMagnitude?: number;
  /** Late data disqualified the month outright. The record is KEPT (superseded,
   *  not deleted) so the wall can be honest about taking one back. */
  revokedAt?: string;
  revokedReason?: string;
  /** Has the user been told about the amendment? Same acknowledge-once pattern as
   *  `celebrated`, so the correction survives reloads and then goes quiet. */
  amendAcknowledged?: boolean;
}

/** One judged Moment whose underlying month moved after the fact. */
export interface MomentAmendment {
  key: string;
  type: MomentType;
  label: string;
  kind: 'amended' | 'revoked' | 'reinstated';
  /** The magnitude we had stated (null where the type carries no magnitude). */
  from?: number;
  /** The magnitude now, for 'amended' / 'reinstated'. */
  to?: number;
  reason?: string;
}

/** Dollars a magnitude has to move before it's worth amending the record.
 *  Rounding noise is not news. */
export const AMEND_TOLERANCE = 1;

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
  /** Records whose judged month moved since we judged it (see reconcileMoments). */
  amendments: MomentAmendment[];
}

/** Why a record stopped qualifying — stated in the record so the copy can be
 *  specific about which kind of late money did it. */
function revokeReason(type: MomentType): string {
  switch (type) {
    case 'beat-the-clock': return 'Late charges pushed the month back over base.';
    case 'held-the-line':  return 'Late charges pushed the fun-money total over the allowance.';
    case 'both-banked':    return 'Once the late charges landed, one of you went over.';
    case 'goal-crushed':   return 'The goal is no longer marked as achieved.';
  }
}

/** Can we currently SEE the data this record was judged from?
 *
 *  Reconciliation must never fire off MISSING context. `funMonthly` is empty on a
 *  cold load, and a stash can be deleted outright — treating absence as
 *  disqualification would revoke the entire log the first time a query came back
 *  slow. So each type states what positive evidence looks like, and no evidence
 *  means leave the record exactly as it is. */
function hasEvidenceFor(ctx: MomentsContext, r: MomentRecord): boolean {
  switch (r.type) {
    case 'beat-the-clock': {
      // Only a SETTLED month is evidence: `partial` is precisely "these numbers
      // are still moving", which is the opposite of grounds for taking a win back.
      const m = ctx.scorecard.months.find((x) => x.month === r.periodKey);
      return !!m && !m.partial;
    }
    case 'held-the-line':
    case 'both-banked':
      return ctx.funMonthly.some((p) => p.months.some((mm) => mm.periodKey === r.periodKey));
    case 'goal-crushed':
      // A deleted stash is not late data — no stash, no opinion. (Deleting a goal
      // should not erase the trophy for having crushed it.)
      return ctx.stashes.some((s) => s.id === r.key.slice('goal-crushed:'.length));
  }
}

/**
 * The other half of the settle lag: data that lands AFTER judgement.
 *
 * SETTLE_LAG_DAYS holds a month for three days so it isn't judged while the
 * totals are still moving — but a $3k charge can still post on day five, and the
 * key that makes the log idempotent is also what would stop the record from ever
 * being corrected. So on every eval we compare each persisted record against the
 * live occurrence set and take one of three explicit actions:
 *
 *  - **amended**    — still a win, different number → update `magnitude`, keep
 *                     `originalMagnitude`, tell the user the figure moved.
 *  - **revoked**    — no longer a win → supersede (keep the row, mark it), pull
 *                     any pending celebration, tell the user we're taking it back.
 *  - **reinstated** — a revoked record qualifies again (a late refund cuts both
 *                     ways) → clear the revocation and put it back on the wall.
 *
 * Tallies need no repair: they're computed live from occurrences every time.
 */
export function reconcileMoments(
  ctx: MomentsContext,
  log: MomentRecord[],
  occ: MomentOccurrence[] = momentOccurrences(ctx),
): { log: MomentRecord[]; amendments: MomentAmendment[] } {
  const live = new Map(occ.map((o) => [o.key, o]));
  const nowIso = ctx.now.toISOString();
  const amendments: MomentAmendment[] = [];

  const next = log.map((r) => {
    const o = live.get(r.key);

    if (!o) {
      if (r.revokedAt) return r;              // already superseded — say it once
      if (!hasEvidenceFor(ctx, r)) return r;  // can't see the data — no opinion
      const reason = revokeReason(r.type);
      amendments.push({ key: r.key, type: r.type, label: r.label, kind: 'revoked', from: r.magnitude, reason });
      return {
        ...r, revokedAt: nowIso, revokedReason: reason,
        amendedAt: nowIso, amendKind: 'revoked' as const,
        originalMagnitude: r.originalMagnitude ?? r.magnitude,
        amendAcknowledged: false,
      };
    }

    if (r.revokedAt) {
      amendments.push({ key: r.key, type: r.type, label: r.label, kind: 'reinstated', from: r.magnitude, to: o.magnitude });
      return {
        ...r, magnitude: o.magnitude,
        revokedAt: undefined, revokedReason: undefined,
        amendedAt: nowIso, amendKind: 'reinstated' as const,
        originalMagnitude: r.originalMagnitude ?? r.magnitude,
        amendAcknowledged: false,
      };
    }

    const moved = Math.abs((o.magnitude ?? 0) - (r.magnitude ?? 0)) > AMEND_TOLERANCE;
    if (!moved) return r;
    amendments.push({ key: r.key, type: r.type, label: r.label, kind: 'amended', from: r.magnitude, to: o.magnitude });
    return {
      ...r, magnitude: o.magnitude,
      amendedAt: nowIso, amendKind: 'amended' as const,
      originalMagnitude: r.originalMagnitude ?? r.magnitude,
      amendAcknowledged: false,
    };
  });

  return { log: amendments.length > 0 ? next : log, amendments };
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
  // Repair what's already on the wall BEFORE looking for new wins, so a record
  // that late data revoked (or reinstated) is settled in one pass. `logged` is
  // built from the reconciled log and deliberately still contains revoked keys —
  // re-qualifying is the 'reinstated' path above, not a second append.
  const { log: reconciled, amendments } = reconcileMoments(ctx, existingLog, occ);
  const logged = new Set(reconciled.map((r) => r.key));
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
    log: additions.length ? [...reconciled, ...additions] : reconciled,
    newlyEarned: fresh,
    tallies: computeTallies(ctx, occ),
    amendments,
  };
}

// ─── Celebration copy (phase 2) ───

/** Signed money. A magnitude CAN be negative — an amended "banked" figure that
 *  was written from incomplete data reads as a loss — and "$-2,854" is not a
 *  number anyone renders on purpose. */
const money = (n?: number) => {
  if (n == null) return '';
  const r = Math.round(n);
  return `${r < 0 ? '−' : ''}$${Math.abs(r).toLocaleString()}`;
};

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
  // Revoked records never celebrate — including one whose card was still waiting
  // when the late charge landed. Congratulating you for a month you didn't
  // actually win is the exact failure the amend policy exists to prevent.
  return log.filter((r) => !r.celebrated && !r.revokedAt).map(buildMomentNudge);
}

// ─── Amendment copy (the honest correction) ───

/** Iris telling on herself: a number she already stated has moved. Warning
 *  severity, never celebration — this is a correction, and dressing it up as good
 *  news is how a wrong figure survives. oneShot, so it goes quiet once seen. */
function buildAmendmentNudge(r: MomentRecord): Nudge {
  const def = MOMENT_DEFS[r.type];
  const was = r.originalMagnitude;
  const now = r.magnitude;
  const kind = r.amendKind ?? (r.revokedAt ? 'revoked' : 'amended');

  let title: string;
  let body: string;
  if (kind === 'revoked') {
    title = `Taking one back — ${def.name}, ${r.label}`;
    body = `Charges landed after I called ${r.label} final${was ? ` at ${money(was)}` : ''}. ${r.revokedReason ?? ''} `
      + `I pulled the win rather than leave a number on the wall that stopped being true.`;
  } else if (kind === 'reinstated') {
    title = `Back on the wall — ${def.name}, ${r.label}`;
    body = `${r.label} qualifies again once the late money settled${now != null ? `, at ${money(now)}` : ''}. `
      + `I took it back before; I'm giving it back now. Late money cuts both ways.`;
  } else {
    title = `The number moved — ${def.name}, ${r.label}`;
    body = `${r.label} still counts, but late charges changed it${was != null && now != null ? `: ${money(was)} → ${money(now)}` : ''}. `
      + `The win stands. The figure I gave you didn't, so here's the real one.`;
  }

  return {
    id: `moment-amend:${r.key}`,
    severity: 'warning',
    category: 'milestone',
    icon: def.icon,
    title,
    body: body.trim().replace(/\s+/g, ' '),
    oneShot: true,
  };
}

/** Un-acknowledged amendments, oldest first. Driven off the persisted records (not
 *  the transient `amendments` array) so a correction survives a reload — the same
 *  reason celebrations are. */
export function pendingMomentAmendments(log: MomentRecord[]): Nudge[] {
  return log
    .filter((r) => r.amendedAt && !r.amendAcknowledged)
    .sort((a, b) => (a.amendedAt ?? '').localeCompare(b.amendedAt ?? ''))
    .map(buildAmendmentNudge);
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
  /** The number to stay under — the guaranteed base. The card showed a buffer
   *  and a countdown but never what the goal WAS, so it read as trivia.
   *  (Scott, 2026-08-19: "What's the fucking clock? What am I on track for?") */
  target: number;
  /** Spent so far this month, so the card can show progress toward the target
   *  rather than only the remainder. */
  spent: number;
}

/** The current month's live "Beat the Clock" quest — the daily hook. Reads the
 *  in-progress (partial) scorecard month; null if there isn't one yet. Not a
 *  logged Moment — it's the live, still-winnable version shown with urgency. */
export function currentMonthQuest(ctx: MomentsContext): LiveQuest | null {
  // Must be THIS month by key, not "the first partial month". Since the settle
  // lag landed there can be two partial months at once — the one that just ended
  // and the one in progress — and `find` would have returned the older of the
  // two, so for the first days of September the quest would have been about
  // August. (A month with income===0 was already enough to break it.)
  const key = currentMonthKey(ctx.now);
  const cur = ctx.scorecard.months.find((m) => m.month === key);
  if (!cur || !cur.partial) return null;
  return {
    type: 'beat-the-clock',
    name: MOMENT_DEFS['beat-the-clock'].name,
    icon: MOMENT_DEFS['beat-the-clock'].icon,
    periodKey: cur.month,
    label: cur.label,
    buffer: cur.surplusVsBase,
    daysLeft: daysLeftInMonth(ctx.now),
    onTrack: cur.surplusVsBase >= 0,
    target: ctx.scorecard.guaranteedBase,
    spent: cur.totalSpend,
  };
}

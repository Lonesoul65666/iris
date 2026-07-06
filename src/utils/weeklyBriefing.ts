import type { Insight, InsightSeverity } from './insightsEngine';
import type { Nudge } from './nudgeEngine';

/**
 * "This Week's Focus" — the top-of-dashboard action briefing.
 *
 * We do NOT detect anything new here: insightsEngine already computes the
 * budget conditions with real numbers (deficit, category spikes, over-budget,
 * unallocated surplus, …). This module is pure CURATION + a weekly FREEZE:
 *
 *   1. Filter the insight pool down to *actionable* items ("do this / watch
 *      this / move money here") — pure praise ('positive') belongs in the
 *      announcer / celebration lane, not the to-do list.
 *   2. Pick the top items by severity. Default 2; surface a 3rd ONLY when a
 *      genuine high-severity condition (critical/warning) is waiting. Hard
 *      cap 3. (Scott, 2026-07-06: "3 is enough… maybe default 2 unless there
 *      is a need for 3.")
 *   3. Freeze the selection for the calendar week so the list is stable — it
 *      doesn't churn on every render/refresh. It regenerates when the week
 *      rolls over, or drops an item early once you've actually resolved it.
 *
 * Zero-AI: the voice is templated (like the announcer). The optional LLM
 * "weigh in" lives one screen over at Budget → Ask Iris — user-initiated, so
 * no tokens are spent unless asked.
 */

/** Persisted freeze record — one week's chosen insight ids. */
export interface FrozenBriefing {
  /** Monday-anchored week key, e.g. "2026-07-06". */
  weekKey: string;
  /** Insight ids selected for this week, in display order. */
  ids: string[];
  /** Insight ids the user dismissed this week (hidden until next week). */
  dismissed?: string[];
}

const DEFAULT_MAX = 2;
const HARD_CAP = 3;

/** Severities that count as "a need" worth bumping the list to a 3rd item. */
const HIGH_SEVERITY: ReadonlySet<InsightSeverity> = new Set<InsightSeverity>(['critical', 'warning']);

/** Severity ranking for selection (lower = more urgent). */
const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
};

/**
 * Monday-anchored week key: the ISO date (YYYY-MM-DD) of the Monday that starts
 * the week containing `d`. Stable across a calendar week regardless of time of
 * day. Local time — the app is single-timezone per household.
 */
export function weekKeyOf(d: Date): string {
  const day = d.getDay(); // 0 = Sun … 6 = Sat
  const diffToMonday = (day + 6) % 7; // Mon->0, Tue->1, … Sun->6
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMonday);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** The actionable pool: drop pure praise; keep things that imply a to-do. */
function actionable(insights: Insight[]): Insight[] {
  return insights
    .filter((i) => i.severity !== 'positive')
    .slice()
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/**
 * Fresh selection (used when no valid freeze exists for the week). Default 2;
 * include a 3rd only if a 3rd actionable item exists AND it's high-severity.
 */
export function selectBriefingInsights(insights: Insight[]): Insight[] {
  const pool = actionable(insights);
  if (pool.length <= DEFAULT_MAX) return pool;
  const chosen = pool.slice(0, DEFAULT_MAX);
  const third = pool[DEFAULT_MAX];
  if (third && HIGH_SEVERITY.has(third.severity)) chosen.push(third);
  return chosen.slice(0, HARD_CAP);
}

export interface ResolvedBriefing {
  /** Insights to display, in frozen order, resolved against the current pool. */
  insights: Insight[];
  /** The freeze record to persist (null = nothing to show / clear). */
  frozen: FrozenBriefing | null;
  /** True when `frozen` differs from `stored` and the caller should persist it. */
  changed: boolean;
}

/**
 * Resolve this week's briefing against the current insight pool + any stored
 * freeze. Keeps a stable set for the week; refreshes numbers/text from the live
 * insights; drops items the user has since resolved (they fall off the pool).
 */
export function resolveWeeklyBriefing(
  insights: Insight[],
  stored: FrozenBriefing | null,
  weekKey: string,
): ResolvedBriefing {
  const byId = new Map(insights.map((i) => [i.id, i]));

  // A freeze from the current week is honored: keep the same ids (still live),
  // in order. This is what makes the list stable within the week.
  if (stored && stored.weekKey === weekKey) {
    // Ids still live — resolved items fall out of the pool, so drop from the freeze.
    const presentIds = stored.ids.filter((id) => byId.has(id));
    // Dismissed ids that are still live (clean up ones already resolved).
    const dismissed = (stored.dismissed ?? []).filter((id) => byId.has(id));
    const dismissedSet = new Set(dismissed);
    const shown = presentIds.filter((id) => !dismissedSet.has(id)).map((id) => byId.get(id)!);
    const changed =
      presentIds.length !== stored.ids.length ||
      dismissed.length !== (stored.dismissed?.length ?? 0);
    const frozen: FrozenBriefing | null = presentIds.length
      ? { weekKey, ids: presentIds, ...(dismissed.length ? { dismissed } : {}) }
      : null;
    return { insights: shown, frozen, changed };
  }

  // New week (or no freeze yet): pick fresh and freeze.
  const chosen = selectBriefingInsights(insights);
  if (!chosen.length) {
    return { insights: [], frozen: null, changed: stored !== null };
  }
  return { insights: chosen, frozen: { weekKey, ids: chosen.map((i) => i.id) }, changed: true };
}

// ─── Insight → Nudge (rendered through the canonical NudgeCard) ──────────────

/** Which Budget sub-tab a briefing item deep-links to when tapped. */
export type BriefingSection = 'overview' | 'monthly' | 'expenses' | 'actions';

function sectionFor(insight: Insight): BriefingSection {
  switch (insight.category) {
    case 'spending':
      return 'expenses';
    case 'saving':
    case 'goal':
      return 'overview';
    default:
      return 'monthly';
  }
}

const ICON_FOR: Record<Insight['category'], string> = {
  spending: '💸',
  saving: '🐷',
  investing: '📈',
  goal: '🎯',
  general: '📌',
};

function severityToNudge(s: InsightSeverity): Nudge['severity'] {
  switch (s) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'positive':
      return 'celebration';
    default:
      return 'info';
  }
}

function primaryLabel(insight: Insight): string {
  switch (insight.category) {
    case 'spending':
      return 'Review spending';
    case 'saving':
      return 'Put it to work';
    case 'goal':
      return 'Open budget';
    default:
      return 'Open budget';
  }
}

/**
 * Convert a briefing insight into a Nudge for NudgeCard. The Budget sub-tab is
 * encoded in the id (`briefing:<section>:<insightId>`) so the dashboard can
 * deep-link without adding a field to the shared Nudge type.
 */
export function insightToBriefingNudge(insight: Insight): Nudge {
  const section = sectionFor(insight);
  return {
    id: `briefing:${section}:${insight.id}`,
    severity: severityToNudge(insight.severity),
    category: 'budget',
    icon: ICON_FOR[insight.category] ?? '📌',
    title: insight.title,
    body: insight.description,
    primary: { label: primaryLabel(insight), view: 'budget' },
  };
}

/** Parse the Budget sub-tab back out of a briefing nudge id. */
export function sectionFromBriefingId(id: string): BriefingSection | null {
  const m = /^briefing:(overview|monthly|expenses|actions):/.exec(id);
  return m ? (m[1] as BriefingSection) : null;
}

/** Recover the underlying insight id from a briefing nudge id (for dismissal). */
export function insightIdFromBriefingId(id: string): string | null {
  const m = /^briefing:(?:overview|monthly|expenses|actions):(.+)$/.exec(id);
  return m ? m[1] : null;
}

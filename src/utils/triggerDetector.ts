import type {
  Expense,
  BudgetBucket,
  IncomeSource,
  NotificationPreferences,
  NotificationKey,
  NotificationTier,
} from '../types/budget';
import { monthlyEquivalent } from './incomeDetector';

/**
 * Trigger detector. Examines current state (expenses, buckets, income sources)
 * and emits a list of active triggers — actionable alerts the UI can render
 * as cards on Dashboard / Budget Overview.
 *
 * Pure function. Triggers are tier-classified per the locked architecture
 * (decision #8). UI filters by user preferences.
 *
 * Acid test for adding a new trigger: "What action does the user take?"
 * If the answer is "nothing" or "shrug" → noise, don't ship.
 */

export interface Trigger {
  key: NotificationKey;
  tier: NotificationTier;
  /** Brief headline. */
  title: string;
  /** One-line explanation. */
  detail?: string;
  /** Suggested actions. UI renders these as buttons. */
  actions: TriggerAction[];
  /** Stable id for dedup/dismiss. Same recurring trigger should generate same id. */
  id: string;
  /** Severity hint for visual prominence (independent of tier). */
  severity: 'info' | 'warning' | 'urgent' | 'success';
}

export interface TriggerAction {
  label: string;
  /** UI maps these to handlers. Pure function doesn't bind to state. */
  kind: 'sweep_now' | 'view_breakdown' | 'acknowledge' | 'snooze' | 'review' | 'navigate';
  /** Optional payload, e.g. category id, source id. */
  payload?: Record<string, unknown>;
}

export interface DetectTriggerOptions {
  /** Today's date. Default now. */
  now?: Date;
  /** Current month-of-year for pace calculations (1-12). */
  /** User's preferences — drives which triggers are emitted. */
  prefs: NotificationPreferences;
}

export function detectTriggers(
  state: {
    expenses: Expense[];
    buckets: BudgetBucket[];
    incomeSources: IncomeSource[];
  },
  opts: DetectTriggerOptions,
): Trigger[] {
  const now = opts.now ?? new Date();
  const triggers: Trigger[] = [];

  triggers.push(...paceTriggers(state.buckets, now, opts.prefs));
  triggers.push(...surplusAvailableTriggers(state.incomeSources, state.expenses, now, opts.prefs));
  triggers.push(...incomeClassificationTriggers(state.incomeSources, opts.prefs));

  // Sort: urgent → warning → info → success
  const order: Record<Trigger['severity'], number> = { urgent: 0, warning: 1, info: 2, success: 3 };
  triggers.sort((a, b) => order[a.severity] - order[b.severity]);
  return triggers;
}

// ── Trigger generators ─────────────────────────────────────────────────────

/**
 * Pace warnings: a budget bucket is X% spent before X% of the month is gone.
 * Fires once per threshold per month per bucket.
 */
function paceTriggers(buckets: BudgetBucket[], now: Date, prefs: NotificationPreferences): Trigger[] {
  const out: Trigger[] = [];
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthFraction = dayOfMonth / daysInMonth; // 0..1

  // Partition into flex groups vs per-bucket. Buckets in a flex group are
  // tracked at the group level; everything else is per-bucket as before.
  const flexGroups = new Map<string, BudgetBucket[]>();
  const standalone: BudgetBucket[] = [];
  for (const b of buckets) {
    if (b.group && b.groupFlex) {
      const arr = flexGroups.get(b.group) || [];
      arr.push(b);
      flexGroups.set(b.group, arr);
    } else {
      standalone.push(b);
    }
  }

  // Group-level pace evaluation
  for (const [groupName, members] of flexGroups) {
    const groupBudget = members.reduce((s, b) => s + b.monthlyBudget, 0);
    const groupActual = members.reduce((s, b) => s + b.monthlyActual, 0);
    if (groupBudget <= 0) continue;
    const spendPct = groupActual / groupBudget;
    if (spendPct < 0.8) continue;
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const tier = spendPct >= 1.0 ? 'pace_100' : spendPct >= 0.9 ? 'pace_90' : 'pace_80';
    if (!prefs[tier]) continue;
    const enabledTiers = (tier === 'pace_100') || (tier === 'pace_90' && monthFraction < 0.9) || (tier === 'pace_80' && monthFraction < 0.8);
    if (!enabledTiers) continue;
    out.push({
      key: tier,
      tier: 'helpful',
      id: `${tier}-group-${groupName}-${monthKey}`,
      severity: tier === 'pace_100' ? 'warning' : 'info',
      title: `${groupName} group ${tier === 'pace_100' ? 'over' : Math.round(spendPct * 100) + '% of'} budget`,
      detail: `Group total: $${Math.round(groupActual)} of $${Math.round(groupBudget)}. Flex enabled — buckets balance against each other.`,
      actions: [
        { label: 'See group breakdown', kind: 'view_breakdown', payload: { group: groupName } },
        { label: 'Acknowledge', kind: 'acknowledge' },
      ],
    });
  }

  for (const b of standalone) {
    if (b.monthlyBudget <= 0) continue;
    const spendPct = b.monthlyActual / b.monthlyBudget;
    // Fire only if spend rate is meaningfully ahead of calendar pace.
    // E.g., on day 10 of 30 (33%), fire 80% trigger if spend ≥ 80%.
    if (spendPct < 0.8) continue;
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (spendPct >= 1.0 && prefs.pace_100) {
      out.push({
        key: 'pace_100',
        tier: 'helpful',
        id: `pace100-${b.category}-${monthKey}`,
        severity: 'warning',
        title: `${b.label} over budget`,
        detail: `${formatPct(spendPct)} of $${Math.round(b.monthlyBudget)} budget — $${Math.round(b.monthlyActual - b.monthlyBudget)} over`,
        actions: [
          { label: 'See breakdown', kind: 'view_breakdown', payload: { category: b.category } },
          { label: 'Acknowledge', kind: 'acknowledge' },
        ],
      });
    } else if (spendPct >= 0.9 && prefs.pace_90 && monthFraction < 0.9) {
      out.push({
        key: 'pace_90',
        tier: 'helpful',
        id: `pace90-${b.category}-${monthKey}`,
        severity: 'warning',
        title: `${b.label} 90% spent on day ${dayOfMonth}`,
        detail: `Tracking to overshoot — only $${Math.round(b.monthlyBudget - b.monthlyActual)} left`,
        actions: [
          { label: 'See breakdown', kind: 'view_breakdown', payload: { category: b.category } },
          { label: 'Acknowledge', kind: 'acknowledge' },
        ],
      });
    } else if (spendPct >= 0.8 && prefs.pace_80 && monthFraction < 0.8) {
      out.push({
        key: 'pace_80',
        tier: 'helpful',
        id: `pace80-${b.category}-${monthKey}`,
        severity: 'info',
        title: `${b.label} 80% spent`,
        detail: `Day ${dayOfMonth} of ${daysInMonth}, $${Math.round(b.monthlyBudget - b.monthlyActual)} remaining`,
        actions: [
          { label: 'See breakdown', kind: 'view_breakdown', payload: { category: b.category } },
          { label: 'Acknowledge', kind: 'acknowledge' },
        ],
      });
    }
  }
  return out;
}

/**
 * Variable income surplus: a variable/bonus income source has unswept hits
 * recent enough to act on. Surfaces as "you have $X to sweep — do it now?"
 */
function surplusAvailableTriggers(
  sources: IncomeSource[],
  expenses: Expense[],
  now: Date,
  prefs: NotificationPreferences,
): Trigger[] {
  if (!prefs.surplus_available) return [];
  const out: Trigger[] = [];
  const ts30Ago = now.getTime() - 30 * 86_400_000;

  for (const s of sources) {
    if (s.status === 'dismissed') continue;
    if (s.includeInBudget) continue; // user opted to budget it — not surplus
    if (s.subtype !== 'variable' && s.subtype !== 'bonus') continue;
    if (s.sweepDestination === 'none') continue;

    // Find expenses in the last 30 days attributed to this source.
    const recentHits = s.expenseIds
      .map(id => expenses.find(e => e.id === id))
      .filter((e): e is Expense => !!e && new Date(e.date).getTime() >= ts30Ago);
    if (recentHits.length === 0) continue;

    const totalRecent = recentHits.reduce((sum, e) => sum + e.amount, 0);
    if (s.subtype === 'variable') {
      // For variable, surplus = recent variable amount above modal base
      // (the variable record's avgAmount is already the over-base portion).
      const surplus = recentHits.reduce((sum, _e) => {
        // crude: each hit contributes its full attributed variable amount
        return sum + s.avgAmount;
      }, 0);
      out.push({
        key: 'surplus_available',
        tier: 'helpful',
        id: `surplus-${s.id}-${now.toISOString().slice(0, 7)}`,
        severity: 'info',
        title: `Variable surplus: $${Math.round(surplus)} ready to sweep`,
        detail: `From ${recentHits.length} recent ${s.payerDisplay} ${recentHits.length === 1 ? 'check' : 'checks'} → ${sweepLabel(s.sweepDestination)}`,
        actions: [
          { label: 'Sweep now', kind: 'sweep_now', payload: { sourceId: s.id, amount: surplus } },
          { label: 'Skip this month', kind: 'snooze', payload: { sourceId: s.id } },
        ],
      });
    } else if (s.subtype === 'bonus') {
      out.push({
        key: 'surplus_available',
        tier: 'helpful',
        id: `surplus-${s.id}-${recentHits[0]?.id}`,
        severity: 'info',
        title: `Bonus landed: $${Math.round(totalRecent)}`,
        detail: `${s.payerDisplay} → ${sweepLabel(s.sweepDestination)}`,
        actions: [
          { label: 'Sweep now', kind: 'sweep_now', payload: { sourceId: s.id, amount: totalRecent } },
          { label: 'Skip', kind: 'snooze', payload: { sourceId: s.id } },
        ],
      });
    }
  }
  return out;
}

/**
 * Income classification needed: one or more inflows are sitting in 'unknown'
 * subtype awaiting user input. Mirrors what InflowQuestions component shows
 * inline, but as a Dashboard-level summary trigger.
 */
function incomeClassificationTriggers(sources: IncomeSource[], prefs: NotificationPreferences): Trigger[] {
  if (!prefs.income_classification_needed) return [];
  const unclassified = sources.filter(s => s.subtype === 'unknown' && s.status !== 'dismissed' && s.status !== 'confirmed');
  if (unclassified.length === 0) return [];
  return [{
    key: 'income_classification_needed',
    tier: 'helpful',
    id: `classify-${unclassified.map(s => s.id).sort().join(',')}`,
    severity: 'info',
    title: `${unclassified.length} ${unclassified.length === 1 ? 'deposit needs' : 'deposits need'} classification`,
    detail: 'Quick taps in the Budget tab to label each one',
    actions: [
      { label: 'Classify now', kind: 'navigate', payload: { view: 'budget' } },
      { label: 'Snooze', kind: 'snooze' },
    ],
  }];
}

function formatPct(n: number): string {
  return Math.round(n * 100) + '%';
}

function sweepLabel(d: string): string {
  switch (d) {
    case 'hysa': return 'HYSA';
    case 'sinking_fund': return 'Sinking fund';
    case 'investing': return 'Investing';
    case 'extra_payment': return 'Extra debt payment';
    case 'manual': return 'Manual';
    default: return 'no sweep';
  }
}

// Re-export for convenience.
export { monthlyEquivalent };

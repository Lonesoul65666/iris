import type { Account, PortfolioSnapshot } from '../types/portfolio';
import type { ActionItem } from '../components/ActionItems/ActionItems';
import type { View } from '../types/views';
import { generateXrayReport, findHiddenConcentrations } from './etfXray';

export type NudgeSeverity = 'celebration' | 'info' | 'warning' | 'critical';
export type NudgeCategory = 'portfolio' | 'budget' | 'action' | 'milestone' | 'cadence' | 'news';

export interface NudgeAction {
  label: string;
  view?: View;
  /** External URL — when set, primary action opens in a new tab instead of switching views. */
  href?: string;
}

export interface Nudge {
  /** Stable identifier — used as the dismiss key. Include an instance suffix where needed (e.g. "milestone:500000"). */
  id: string;
  severity: NudgeSeverity;
  category: NudgeCategory;
  icon: string;
  title: string;
  body: string;
  primary?: NudgeAction;
  /** How many days to suppress after "Remind me later". Default 3. */
  snoozeDays?: number;
  /** When true, this nudge should only ever show once — "Got it" is permanent. */
  oneShot?: boolean;
  /**
   * Optional Gemini prompt to fetch a one-sentence "why" explanation.
   * When set, NudgeCard renders a grounded news blurb under the body so the
   * user doesn't have to hunt through articles to understand the move.
   */
  whyPrompt?: string;
  /**
   * Cache key for the "why" text. Encode magnitude so material moves bust the
   * cache naturally (e.g. "holding_move:NVDA:up:12" vs "...up:18").
   */
  whyKey?: string;
}

export interface NudgeContext {
  accounts: Account[];
  snapshots: PortfolioSnapshot[];
  actionItems: ActionItem[];
  /** ISO timestamp from the *previous* session (if any). */
  prevVisitAt: string | null;
  /** Now, for testability. */
  now: Date;
}

export interface DismissState {
  dismissedAt: string; // ISO
  permanent: boolean;
  /** ID this record applies to. */
  id: string;
  /** Snapshot of the nudge title at dismiss time, so the management panel can show what was silenced. */
  title?: string;
  /** How many days the snooze lasts (copied from the nudge). Needed to display "snoozed until X" in the panel. */
  snoozeDays?: number;
}

// ─── Helpers ───

const fmt = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (abs >= 1000) return `$${Math.round(abs / 1000)}k`;
  return `$${Math.round(abs).toLocaleString()}`;
};

const signed = (n: number): string => (n >= 0 ? '+' : '−') + fmt(n);

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function findSnapshotNearDaysAgo(snapshots: PortfolioSnapshot[], daysAgo: number, now: Date): PortfolioSnapshot | null {
  if (snapshots.length === 0) return null;
  const target = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  let best: PortfolioSnapshot | null = null;
  let bestDist = Infinity;
  for (const s of snapshots) {
    const d = new Date(s.date);
    const dist = Math.abs(d.getTime() - target.getTime());
    if (dist < bestDist) { best = s; bestDist = dist; }
  }
  // Only return if within ±3 days of target
  return bestDist < 3 * 24 * 60 * 60 * 1000 ? best : null;
}

// ─── Generators ───

function detectWelcomeBack(ctx: NudgeContext): Nudge | null {
  if (!ctx.prevVisitAt) return null;
  const days = daysBetween(ctx.now, new Date(ctx.prevVisitAt));
  if (days < 7) return null;

  const liquid = ctx.accounts.reduce((s, a) => s + a.totalValue, 0);
  const prev = findSnapshotNearDaysAgo(ctx.snapshots, days, ctx.now);
  const pending = ctx.actionItems.filter(a => !a.completed).length;

  const parts: string[] = [];
  if (prev) {
    const delta = liquid - prev.totalLiquidNetWorth;
    parts.push(`Liquid net worth: ${fmt(liquid)} (${signed(delta)} since you left).`);
  } else {
    parts.push(`Liquid net worth sits at ${fmt(liquid)}.`);
  }
  if (pending > 0) parts.push(`${pending} action item${pending === 1 ? '' : 's'} still pending.`);

  return {
    id: 'welcome_back',
    severity: 'info',
    category: 'cadence',
    icon: '👋',
    title: `Welcome back — it's been ${days} days`,
    body: parts.join(' '),
    primary: pending > 0 ? { label: 'See what needs attention', view: 'dashboard' } : undefined,
    snoozeDays: 1,
  };
}

const MILESTONES = [250_000, 500_000, 750_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 5_000_000];

function detectNetWorthMilestone(ctx: NudgeContext): Nudge | null {
  // Use total net worth from latest snapshot (includes home equity) if available
  const latest = ctx.snapshots[ctx.snapshots.length - 1];
  if (!latest) return null;
  const current = latest.totalNetWorth;

  // Find the most recent snapshot from 30+ days ago to see if we've crossed a threshold
  const baseline = findSnapshotNearDaysAgo(ctx.snapshots, 30, ctx.now)
    ?? ctx.snapshots[0];
  if (!baseline) return null;

  const prior = baseline.totalNetWorth;
  // Find a milestone we've crossed — current is above it, prior was below.
  // Prefer the highest crossed milestone.
  const crossed = [...MILESTONES].reverse().find(m => current >= m && prior < m);
  if (!crossed) return null;

  return {
    id: `milestone:${crossed}`,
    severity: 'celebration',
    category: 'milestone',
    icon: '🎉',
    title: `You crossed ${fmt(crossed)} in net worth`,
    body: `Current total: ${fmt(current)}. That's ${signed(current - prior)} in the last 30 days. Worth a quiet moment of acknowledgement.`,
    oneShot: true,
  };
}

function detectCashDrag(ctx: NudgeContext): Nudge | null {
  const bankAccounts = ctx.accounts.filter(a => a.type === 'bank');
  if (bankAccounts.length === 0) return null;
  const totalCash = bankAccounts.reduce((s, a) => s + a.totalValue, 0);
  // Only nudge when meaningfully idle (> $50k in low-yield checking/savings)
  if (totalCash < 50_000) return null;

  // Rough: 4% HYSA vs ~0.05% typical BofA savings = ~4% gap.
  const foregoneAnnual = totalCash * 0.04;

  return {
    id: 'cash_drag',
    severity: 'warning',
    category: 'portfolio',
    icon: '💰',
    title: `${fmt(totalCash)} sitting in low-yield cash`,
    body: `A HYSA at ~4% APY would earn about ${fmt(foregoneAnnual)}/yr on that balance. Even a partial move captures most of the gap.`,
    primary: { label: 'Move it', view: 'portfolio' },
    snoozeDays: 14,
  };
}

function detectPortfolioMove(ctx: NudgeContext): Nudge | null {
  const liquid = ctx.accounts.reduce((s, a) => s + a.totalValue, 0);
  const weekAgo = findSnapshotNearDaysAgo(ctx.snapshots, 7, ctx.now);
  if (!weekAgo) return null;

  const prev = weekAgo.totalLiquidNetWorth;
  if (prev <= 0) return null;
  const delta = liquid - prev;
  const pct = (delta / prev) * 100;

  // Only surface meaningful moves
  if (Math.abs(pct) < 5) return null;

  const up = delta > 0;
  // Round magnitude into whole-percent buckets so minor fluctuations reuse the
  // cached explanation but a meaningful widening refetches.
  const magBucket = Math.round(Math.abs(pct));
  return {
    id: 'portfolio_move_weekly',
    severity: up ? 'info' : 'warning',
    category: 'portfolio',
    icon: up ? '📈' : '📉',
    title: `Portfolio ${up ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% this week`,
    body: `Liquid went from ${fmt(prev)} to ${fmt(liquid)} (${signed(delta)}). ${up ? 'Might be a moment to check concentration before re-adding.' : 'If this is signal not noise, rebalancing rules still apply — don\'t panic-sell.'}`,
    primary: { label: 'See holdings', view: 'portfolio' },
    snoozeDays: 3,
    whyKey: `portfolio_move:${up ? 'up' : 'down'}:${magBucket}`,
    whyPrompt: `In one sentence, why are US stock markets ${up ? 'up' : 'down'} around ${Math.abs(pct).toFixed(1)}% over the past week? Cite the specific macro or sector driver from recent news.`,
  };
}

function detectHoldingMove(ctx: NudgeContext): Nudge | null {
  // Look for per-holding moves of >15% over ~7 days. Requires snapshots with
  // the `holdings` field (introduced 2026-04-19) — older snapshots are ignored.
  const weekAgo = findSnapshotNearDaysAgo(ctx.snapshots, 7, ctx.now);
  if (!weekAgo?.holdings || weekAgo.holdings.length === 0) return null;

  // Current per-ticker price, consolidated across accounts. Also track conviction so we soften
  // upward-move copy — "time to trim" is wrong for a hold the user has declared locked.
  const currentPrice = new Map<string, { price: number; value: number; conviction: boolean }>();
  for (const a of ctx.accounts) {
    for (const h of a.holdings) {
      if (!h.ticker || h.ticker === 'CASH' || h.ticker === 'UNKNOWN') continue;
      const existing = currentPrice.get(h.ticker);
      if (existing) {
        existing.value += h.currentValue;
        if (h.conviction) existing.conviction = true;
      } else {
        currentPrice.set(h.ticker, { price: h.currentPrice, value: h.currentValue, conviction: !!h.conviction });
      }
    }
  }

  // Find the biggest mover (by %). Require meaningful dollar exposure — skip dust.
  let best: { ticker: string; pct: number; from: number; to: number; value: number; conviction: boolean } | null = null;
  for (const old of weekAgo.holdings) {
    const cur = currentPrice.get(old.ticker);
    if (!cur || cur.value < 1000 || old.price <= 0) continue;
    const pct = ((cur.price - old.price) / old.price) * 100;
    if (Math.abs(pct) < 15) continue;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) {
      best = { ticker: old.ticker, pct, from: old.price, to: cur.price, value: cur.value, conviction: cur.conviction };
    }
  }
  if (!best) return null;

  const up = best.pct > 0;
  const upBody = best.conviction
    ? `Nice run on a conviction hold. No trim suggested — you\'ve flagged this as locked.`
    : `Worth checking if this has pushed you overweight and it\'s time to trim.`;
  const magBucket = Math.round(Math.abs(best.pct) / 5) * 5; // 5-point buckets
  return {
    // Instance-keyed by ticker + direction so dismissing NVDA-up doesn't silence BTC-down.
    id: `holding_move:${best.ticker}:${up ? 'up' : 'down'}`,
    severity: up ? 'celebration' : 'warning',
    category: 'portfolio',
    icon: up ? '🚀' : '🩸',
    title: `${best.ticker} ${up ? 'up' : 'down'} ${Math.abs(best.pct).toFixed(1)}% this week${best.conviction ? ' ⭐' : ''}`,
    body: `${best.ticker} moved from $${best.from.toFixed(2)} to $${best.to.toFixed(2)}. Current position: ${fmt(best.value)}. ${up ? upBody : 'Before reacting, check whether the thesis changed or just the price.'}`,
    primary: { label: 'See portfolio', view: 'portfolio' },
    snoozeDays: 3,
    whyKey: `holding_move:${best.ticker}:${up ? 'up' : 'down'}:${magBucket}`,
    whyPrompt: `In one sentence, why is ${best.ticker} stock ${up ? 'up' : 'down'} about ${Math.abs(best.pct).toFixed(1)}% over the past week? Cite the specific news catalyst, earnings, or sector event.`,
  };
}

function detectMonthlyDCA(ctx: NudgeContext): Nudge | null {
  const day = ctx.now.getDate();
  // Only fire in the first 5 days of the month
  if (day > 5) return null;
  const monthKey = `${ctx.now.getFullYear()}-${String(ctx.now.getMonth() + 1).padStart(2, '0')}`;

  return {
    id: `monthly_dca:${monthKey}`,
    severity: 'info',
    category: 'cadence',
    icon: '🗓️',
    title: 'New month — time to deploy capital',
    body: 'First week of the month. If your monthly DCA hasn\'t gone in yet, now\'s the moment. Check Market Intelligence for this month\'s allocation call.',
    primary: { label: 'Open Intelligence', view: 'intelligence' },
    oneShot: true, // one per month
  };
}

function detectStaleActions(ctx: NudgeContext): Nudge | null {
  const pending = ctx.actionItems.filter(a => !a.completed);
  if (pending.length < 3) return null;
  const highPriority = pending.filter(a => a.priority === 'high').length;
  if (highPriority === 0) return null;

  return {
    id: 'stale_high_priority_actions',
    severity: 'warning',
    category: 'action',
    icon: '⚡',
    title: `${highPriority} high-priority action${highPriority === 1 ? '' : 's'} waiting`,
    body: `Action items pile up fast. ${pending.length} total pending, ${highPriority} flagged high priority. A 10-minute sweep would clear meaningful ground.`,
    primary: { label: 'Review actions', view: 'dashboard' },
    snoozeDays: 7,
  };
}

/**
 * Fire when a single underlying stock (direct + ETF-apportioned) exceeds a
 * threshold of total portfolio value. The X-Ray tab already shows the "hidden
 * concentrations" list at ≥1%; the nudge bar is higher (≥5%) so only genuinely
 * noteworthy exposures interrupt the user.
 *
 * Respects conviction: if the underlying is flagged as a conviction hold on
 * any source, severity drops to 'info' and copy becomes informational rather
 * than trim-oriented (Scott's "respect user intent" rule). Still surfaces,
 * because awareness is valuable even when the user has chosen the exposure.
 */
const CONCENTRATION_PCT_THRESHOLD = 5;

function detectConcentrationRisk(ctx: NudgeContext): Nudge | null {
  const totalValue = ctx.accounts.reduce((s, a) => s + a.totalValue, 0);
  if (totalValue < 10_000) return null; // tiny portfolios: no meaningful concentration signal

  const report = generateXrayReport(ctx.accounts);
  const concentrations = findHiddenConcentrations(report);
  if (concentrations.length === 0) return null;

  // Biggest concentration over the threshold wins. Only one per cycle so we
  // don't swamp the NudgeCenter — next biggest will surface after the first
  // is dismissed.
  const top = concentrations.find((c) => c.portfolioPct >= CONCENTRATION_PCT_THRESHOLD);
  if (!top) return null;

  // Bucket the pct so dismissing a 6% exposure doesn't suppress the same
  // ticker if it later crawls to 9% — material growth re-fires.
  const pctBucket = Math.floor(top.portfolioPct);
  const conviction = top.hasConviction === true;

  const fundsClause = top.fundCount === 1
    ? 'your direct position'
    : `${top.fundCount} source${top.fundCount === 1 ? '' : 's'}${top.funds.includes('Direct') ? ' (direct + funds)' : ''}`;

  return {
    id: `concentration:${top.ticker}`,
    severity: conviction ? 'info' : 'warning',
    category: 'portfolio',
    icon: conviction ? '⭐' : '🧿',
    title: conviction
      ? `${top.ticker} is ${top.portfolioPct.toFixed(1)}% of your portfolio ⭐`
      : `${top.ticker} is ${top.portfolioPct.toFixed(1)}% of your portfolio across ${fundsClause}`,
    body: conviction
      ? `You've flagged ${top.ticker} as a conviction hold, so this is intentional — but worth knowing the total exposure when sizing future buys. Current: ${fmt(top.totalValue)} combined.`
      : `${top.ticker} exposure adds up through ${fundsClause}: ${fmt(top.totalValue)} total. Most retail investors don't realize their ETFs overlap — this is worth a look before the next rebalance.`,
    primary: { label: 'See X-Ray breakdown', view: 'intelligence' },
    snoozeDays: 14, // concentration moves slowly; no point nagging weekly
    whyKey: `concentration:${top.ticker}:${pctBucket}`,
    whyPrompt: `In one sentence, what is ${top.ticker} (the company) and why does it appear in so many major US equity ETFs right now? Focus on market cap / index weight, not a price move.`,
  };
}

// ─── Main entrypoint ───

export function generateNudges(ctx: NudgeContext): Nudge[] {
  const candidates = [
    detectWelcomeBack(ctx),
    detectNetWorthMilestone(ctx),
    detectHoldingMove(ctx),
    detectConcentrationRisk(ctx),
    detectCashDrag(ctx),
    detectPortfolioMove(ctx),
    detectMonthlyDCA(ctx),
    detectStaleActions(ctx),
  ];
  return candidates.filter((n): n is Nudge => n !== null);
}

// ─── Dismiss state helpers ───

const SETTING_PREFIX = 'nudge_dismiss::';

export function dismissSettingKey(nudgeId: string): string {
  return SETTING_PREFIX + nudgeId;
}

export function isNudgeActive(nudge: Nudge, dismiss: DismissState | null, now: Date): boolean {
  if (!dismiss) return true;
  if (dismiss.permanent) return false;
  const snoozeDays = nudge.snoozeDays ?? 3;
  const snoozeMs = snoozeDays * 24 * 60 * 60 * 1000;
  return now.getTime() - new Date(dismiss.dismissedAt).getTime() >= snoozeMs;
}

/** Is a stored dismiss record still suppressing the nudge right now? */
export function dismissIsActive(dismiss: DismissState, now: Date): boolean {
  if (dismiss.permanent) return true;
  const snoozeMs = (dismiss.snoozeDays ?? 3) * 24 * 60 * 60 * 1000;
  return now.getTime() - new Date(dismiss.dismissedAt).getTime() < snoozeMs;
}

/** Friendly label when the dismiss record has no stored title (legacy records). */
export function prettyNudgeId(id: string): string {
  const map: Record<string, string> = {
    welcome_back: 'Welcome back summary',
    cash_drag: 'Cash-drag reminder',
    portfolio_move_weekly: 'Weekly portfolio move',
    stale_high_priority_actions: 'Stale high-priority actions',
  };
  if (map[id]) return map[id];
  if (id.startsWith('milestone:')) return `Net-worth milestone (${id.slice('milestone:'.length)})`;
  if (id.startsWith('monthly_dca:')) return `Monthly DCA reminder (${id.slice('monthly_dca:'.length)})`;
  if (id.startsWith('holding_move:')) return `Holding move: ${id.slice('holding_move:'.length)}`;
  if (id.startsWith('concentration:')) return `Concentration: ${id.slice('concentration:'.length)}`;
  return id;
}

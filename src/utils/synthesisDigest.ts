/**
 * Synthesis Digest — "the one thing to read today."
 *
 * Philosophy: NudgeCenter renders individual alert cards. This renders ONE
 * combined card — 2-5 bullets synthesizing signal from every engine we've
 * built (snapshots, news scanner, watchlist alerts, action items, X-Ray).
 * Goal: 30-second read, respects Scott's time, skips empty sections rather
 * than padding with filler.
 *
 * No LLM on the hot path. Everything here is deterministic over the caller's
 * pre-computed inputs. An optional Phase-2 "why this matters" LLM enrichment
 * can layer on top — gated by the rate-limit circuit breaker — without
 * touching this module.
 */

import type { Account, PortfolioSnapshot } from '../types/portfolio';
import type { WatchlistEntry } from '../types/watchlist';
import type { IntelligenceReport } from './portfolioIntelligence';
import type { XrayReport } from './etfXray';
import type { ActionItem } from '../components/ActionItems/ActionItems';
import { evaluateWatchlist, type WatchlistAlert } from './watchlistAlerts';
import { scanNews } from './newsScanner';
import { findHiddenConcentrations } from './etfXray';
import type { NewsItem } from '../types/news';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DigestTone = 'positive' | 'negative' | 'warning' | 'neutral' | 'info';

export interface DigestEntry {
  /** Stable key so React can reconcile. */
  id: string;
  emoji: string;
  /** Short noun-phrase (e.g. "Portfolio pulse", "NVDA earnings beat"). */
  heading: string;
  /** One sentence explaining what happened + why it matters. */
  body: string;
  tone: DigestTone;
  /** Optional CTA — inline "Open Watchlist →" style. */
  cta?: { label: string; view?: string; href?: string };
}

export interface SynthesisDigest {
  /** ISO timestamp of when this digest was computed. */
  generatedAt: string;
  /** Human-friendly day label (e.g. "Monday, Apr 20"). */
  dayLabel: string;
  /** 2-5 entries, sorted highest-priority first. Always includes a market-pulse line. */
  entries: DigestEntry[];
  /** Headline one-liner — render large above the entries. */
  headline: string;
  /** Overall tone — drives banner color. */
  tone: DigestTone;
}

export interface SynthesisInput {
  accounts: Account[];
  watchlist: WatchlistEntry[];
  snapshots: PortfolioSnapshot[];
  newsItems: NewsItem[];
  actionItems: ActionItem[];
  /** Pre-computed X-Ray report (pass from caller to avoid recomputing). */
  xrayReport: XrayReport | null;
  /** Pre-computed intelligence report (optional). */
  intelReport: IntelligenceReport | null;
  /** Live price lookup — used by watchlist alert evaluation. */
  priceLookup: (ticker: string) => number | null;
  /** Now, for deterministic tests. */
  now: Date;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtPct = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const fmtDollar = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${Math.round(abs / 100) / 10}k`;
  return `$${Math.round(abs).toLocaleString()}`;
};

function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Find today's snapshot + yesterday's (or closest within 4 days). */
function pickDailyPair(
  snapshots: PortfolioSnapshot[],
  now: Date,
): { today: PortfolioSnapshot | null; prior: PortfolioSnapshot | null } {
  if (snapshots.length === 0) return { today: null, prior: null };
  // Sort most-recent first
  const sorted = [...snapshots].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const today = sorted[0];
  const todayT = new Date(today.date).getTime();
  let prior: PortfolioSnapshot | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const dt = new Date(sorted[i].date).getTime();
    const daysOld = (todayT - dt) / (24 * 60 * 60 * 1000);
    if (daysOld >= 0.5 && daysOld <= 5) { prior = sorted[i]; break; }
  }
  // If we don't have a same-day snapshot yet, `today` might be yesterday — that's fine;
  // the delta will still be meaningful.
  if (Math.abs(new Date(today.date).getTime() - now.getTime()) > 2 * 24 * 60 * 60 * 1000) {
    return { today: null, prior: null };
  }
  return { today, prior };
}

interface HoldingMove {
  ticker: string;
  priorPrice: number;
  currentPrice: number;
  pctChange: number;
  valueDelta: number;
  currentValue: number;
}

function computeHoldingMoves(pair: { today: PortfolioSnapshot | null; prior: PortfolioSnapshot | null }): HoldingMove[] {
  const { today, prior } = pair;
  if (!today?.holdings || !prior?.holdings) return [];
  const priorMap = new Map<string, { price: number; value: number }>();
  for (const h of prior.holdings) priorMap.set(h.ticker, { price: h.price, value: h.value });
  const moves: HoldingMove[] = [];
  for (const h of today.holdings) {
    const p = priorMap.get(h.ticker);
    if (!p || p.price <= 0) continue;
    const pct = ((h.price - p.price) / p.price) * 100;
    if (!Number.isFinite(pct) || Math.abs(pct) < 0.01) continue;
    moves.push({
      ticker: h.ticker,
      priorPrice: p.price,
      currentPrice: h.price,
      pctChange: pct,
      valueDelta: h.value - p.value,
      currentValue: h.value,
    });
  }
  return moves.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
}

// ─── Section builders ───────────────────────────────────────────────────────

/**
 * Always-present section. Reads snapshot pair and delivers either:
 *   - "Your portfolio moved +X% (+$Y)" with top mover call-out
 *   - "All holdings quiet" when nothing meaningful happened
 *   - "Too early" when we don't have enough snapshots
 */
function portfolioPulseEntry(input: SynthesisInput): DigestEntry {
  const pair = pickDailyPair(input.snapshots, input.now);
  if (!pair.today || !pair.prior) {
    return {
      id: 'pulse',
      emoji: '📊',
      heading: 'Portfolio pulse',
      body: 'Not enough snapshots yet to compute a daily delta. Check back tomorrow for move-on-move comparison.',
      tone: 'neutral',
    };
  }
  const nwDelta = pair.today.totalLiquidNetWorth - pair.prior.totalLiquidNetWorth;
  const nwPct = pair.prior.totalLiquidNetWorth > 0
    ? (nwDelta / pair.prior.totalLiquidNetWorth) * 100
    : 0;
  const moves = computeHoldingMoves(pair);
  const bigMovers = moves.filter(m => Math.abs(m.pctChange) >= 3);

  if (Math.abs(nwPct) < 0.5 && bigMovers.length === 0) {
    return {
      id: 'pulse',
      emoji: '😌',
      heading: 'Portfolio pulse — quiet',
      body: `Your liquid net worth is flat (${fmtPct(nwPct)}, ${fmtDollar(nwDelta)}). No holding moved more than 3%. Nothing demands action today.`,
      tone: 'neutral',
    };
  }

  const tone: DigestTone = nwPct >= 1 ? 'positive' : nwPct <= -1 ? 'negative' : 'neutral';
  const emoji = tone === 'positive' ? '📈' : tone === 'negative' ? '📉' : '📊';
  const top = bigMovers.slice(0, 2);
  const moverClause = top.length > 0
    ? ` Biggest move${top.length > 1 ? 's' : ''}: ${top.map(m => `${m.ticker} ${fmtPct(m.pctChange)}`).join(', ')}.`
    : '';
  return {
    id: 'pulse',
    emoji,
    heading: 'Portfolio pulse',
    body: `Liquid net worth ${nwDelta >= 0 ? 'up' : 'down'} ${fmtDollar(nwDelta)} (${fmtPct(nwPct)}) vs. yesterday.${moverClause}`,
    tone,
    cta: { label: 'Open Portfolio', view: 'portfolio' },
  };
}

/**
 * News flash — top critical/warning news item. Skipped entirely if nothing matched.
 * Uses the same scanner the NudgeCenter uses so the two surfaces can't disagree.
 */
function newsEntry(input: SynthesisInput): DigestEntry | null {
  if (input.newsItems.length === 0) return null;
  const { alerts } = scanNews({
    accounts: input.accounts,
    watchlist: input.watchlist,
    newsItems: input.newsItems,
    firedIds: new Set(),
    windowHours: 72,
    maxAlerts: 1,
    includeInfo: false,
  });
  const top = alerts[0];
  if (!top) return null;
  const tone: DigestTone = top.severity === 'critical' ? 'negative' : 'warning';
  const emoji = top.severity === 'critical' ? '🚨' : '📰';
  return {
    id: `news:${top.item.id}`,
    emoji,
    heading: `${top.item.ticker} — ${top.severity === 'critical' ? 'critical news' : 'material news'}`,
    body: `${top.item.title}. ${top.reason} (${top.item.publisher})`,
    tone,
    cta: { label: 'Read story', href: top.item.link },
  };
}

/**
 * Watchlist pulse — surface a newly-hit anchor. This is the "don't miss another
 * Micron" section. If nothing's hit, skip rather than pad.
 */
function watchlistEntry(input: SynthesisInput): DigestEntry | null {
  const active = input.watchlist.filter(e => e.status === 'active');
  if (active.length === 0) return null;
  const alerts: WatchlistAlert[] = evaluateWatchlist(active, input.priceLookup);
  const newlyHit = alerts.find(a => a.newlyHit);
  const hit = newlyHit ?? alerts[0];
  if (!hit) return null;
  const anchor = hit.entry.priceAnchor!;
  const direction = anchor.direction;
  const isBuy = direction.startsWith('buy');
  const tone: DigestTone = newlyHit ? (isBuy ? 'positive' : 'warning') : 'info';
  return {
    id: `watchlist:${hit.entry.id}`,
    emoji: isBuy ? '🎯' : '💰',
    heading: `${hit.entry.ticker} ${newlyHit ? 'hit your' : 'still at your'} ${direction.replace('-', ' ')} target`,
    body: `${hit.entry.ticker} is $${hit.currentPrice.toFixed(2)} — your trigger was $${anchor.targetPrice.toFixed(2)}. ${
      hit.entry.thesis?.text ? `Your thesis: "${hit.entry.thesis.text}"` : 'Decide now — convert, walk, or snooze with intent.'
    }`,
    tone,
    cta: { label: 'Open Watchlist', view: 'watchlist' },
  };
}

/**
 * Focus line — the highest-priority action item, OR a top portfolioIntelligence
 * signal when no action items are pending. Falls back to "no urgent decisions".
 */
function focusEntry(input: SynthesisInput): DigestEntry {
  // Prefer user's own pending high-priority action items — these reflect prior intent.
  const pending = input.actionItems.filter(a => !a.completed);
  const critical = pending.find(a => a.priority === 'high');
  if (critical) {
    return {
      id: `focus:action:${critical.id}`,
      emoji: '⚡',
      heading: 'Focus action',
      body: critical.text,
      tone: 'warning',
      cta: { label: 'Review actions', view: 'dashboard' },
    };
  }
  // Fall back to portfolioIntelligence — a now-urgent signal.
  const nowSignals = input.intelReport?.signals?.filter(s => s.urgency === 'now') ?? [];
  const top = nowSignals[0];
  if (top) {
    return {
      id: `focus:signal:${top.ticker}`,
      emoji: '⚡',
      heading: `${top.ticker} — ${top.type} (now)`,
      body: top.reasoning,
      tone: top.type === 'sell' ? 'warning' : 'info',
      cta: { label: 'Open Intelligence', view: 'intelligence' },
    };
  }
  return {
    id: 'focus:none',
    emoji: '✅',
    heading: 'No urgent decisions',
    body: 'Nothing requires attention today. Your next scheduled review is your monthly deployment brief.',
    tone: 'positive',
  };
}

/**
 * Hidden concentration callout — only fires when X-Ray surfaces ≥1 exposure
 * ≥7% and the user HASN'T flagged it as a conviction hold. Respects intent.
 */
function concentrationEntry(input: SynthesisInput): DigestEntry | null {
  if (!input.xrayReport) return null;
  const concentrations = findHiddenConcentrations(input.xrayReport);
  if (concentrations.length === 0) return null;

  // Build the set of conviction tickers — don't nag about declared bets.
  const convictionTickers = new Set<string>();
  for (const a of input.accounts) {
    for (const h of a.holdings) {
      if (h.conviction) convictionTickers.add(h.ticker.toUpperCase());
    }
  }

  // findHiddenConcentrations already flags hasConviction — filter that *plus*
  // respect any direct-holding conviction the user set after the X-Ray was
  // last computed (belt-and-suspenders).
  const material = concentrations
    .filter(c => c.portfolioPct >= 7)
    .filter(c => !c.hasConviction && !convictionTickers.has(c.ticker.toUpperCase()));

  const top = material[0];
  if (!top) return null;

  return {
    id: `concentration:${top.ticker}`,
    emoji: '🔍',
    heading: `Hidden concentration: ${top.ticker}`,
    body: `${top.ticker} is ${top.portfolioPct.toFixed(1)}% of your portfolio across ${top.fundCount} source${top.fundCount > 1 ? 's' : ''} (${top.funds.slice(0, 3).join(', ')}${top.funds.length > 3 ? '…' : ''}). Not flagged as a conviction hold — check whether the exposure is intentional.`,
    tone: 'warning',
    cta: { label: 'Open X-Ray', view: 'intelligence' },
  };
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Compose the digest. Always returns 2-5 entries:
 *   1. Portfolio pulse (always)
 *   2. News flash OR watchlist (whichever fires; news takes priority when both do)
 *   3. Focus (always)
 *   4. Hidden concentration (only when material & non-conviction)
 *
 * `headline` synthesizes the top-level tone into one sentence so the user
 * knows within 2 seconds whether this is a quiet day or not.
 */
export function synthesizeDigest(input: SynthesisInput): SynthesisDigest {
  const entries: DigestEntry[] = [];

  const pulse = portfolioPulseEntry(input);
  entries.push(pulse);

  // Prefer news if available; show watchlist underneath only if it's a newly-hit anchor.
  const news = newsEntry(input);
  const watch = watchlistEntry(input);
  if (news) entries.push(news);
  if (watch && (!news || watch.id.startsWith('watchlist:') && news.tone !== 'negative')) {
    // Keep watchlist only when news isn't already a critical/negative headline.
    if (!news || news.tone !== 'negative') entries.push(watch);
  }

  const concentration = concentrationEntry(input);
  if (concentration) entries.push(concentration);

  entries.push(focusEntry(input));

  // Cap at 5 to keep it a 30-second read.
  const capped = entries.slice(0, 5);

  // Headline: summarize the loudest signal in one sentence.
  const tone = deriveOverallTone(capped);
  const headline = deriveHeadline(capped, tone);

  return {
    generatedAt: input.now.toISOString(),
    dayLabel: dayLabel(input.now),
    entries: capped,
    headline,
    tone,
  };
}

function deriveOverallTone(entries: DigestEntry[]): DigestTone {
  // Worst-case wins — if anything's negative/warning, that dominates the banner.
  if (entries.some(e => e.tone === 'negative')) return 'negative';
  if (entries.some(e => e.tone === 'warning')) return 'warning';
  if (entries.some(e => e.tone === 'positive')) return 'positive';
  return 'neutral';
}

function deriveHeadline(entries: DigestEntry[], tone: DigestTone): string {
  // Pick the loudest entry that isn't pulse (pulse is already summary-level).
  const loudest = entries.find(e => e.tone === tone && e.id !== 'pulse') ?? entries[0];
  if (tone === 'negative') return `Attention — ${loudest.heading.toLowerCase()}.`;
  if (tone === 'warning') return `Heads-up on ${loudest.heading.toLowerCase()}.`;
  if (tone === 'positive') return `Good news — ${loudest.heading.toLowerCase()}.`;
  return 'Quiet day — nothing demands action.';
}

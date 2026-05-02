/**
 * News Scanner — classifies tier-1 news into severity-ranked Nudges.
 *
 * Philosophy: deterministic keyword scoring first. No LLM calls on the hot
 * path — the rate-limiter is there, but we don't want to burn cloud credits
 * on a pipeline that runs every dashboard refresh. Phase 2 can layer an LLM
 * "why this matters" enrichment gated behind a user opt-in.
 *
 * Dedup: caller tracks `firedIds` in the settings keyspace. We return the
 * updated set alongside the new nudges so the layer above can persist it.
 */

import type { Account } from '../types/portfolio';
import type { WatchlistEntry } from '../types/watchlist';
import type { NewsItem, NewsAlert, NewsSeverity } from '../types/news';
import type { Nudge } from './nudgeEngine';

// Critical keywords = material corporate events that can move the stock a lot.
const CRITICAL_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(acquires?|acquisition|to acquire|buyout|takeover|merger)\b/i,
    reason: 'M&A event — price will reprice immediately.' },
  { re: /\b(bankruptcy|chapter 11|insolven|liquidat)/i,
    reason: 'Existential risk — bankruptcy / insolvency headline.' },
  { re: /\b(SEC (investigation|probe|charges?|subpoena|action)|DOJ (probe|investigation))\b/i,
    reason: 'Regulator action — historically precedes big drawdowns.' },
  { re: /\bfraud|accounting scandal|restate(s|d|ment)\b/i,
    reason: 'Fraud / restatement — thesis-breaking signal.' },
  // Allow the exec's name (or "steps down" phrasing) between role + verb:
  //   "CEO Tim Cook steps down" / "Founder Musk ousted" / "CFO resigns"
  { re: /\b(CEO|CFO|COO|CTO|founder)\b[^.]{0,40}\b(resign|step(s|ped) down|fired|ousted|departs?|forced out)\b/i,
    reason: 'Executive shake-up — re-check your thesis today.' },
  { re: /\bearnings (beat|miss|surprise)\b/i,
    reason: 'Earnings surprise — volatility spike likely.' },
  { re: /\b(guidance (cut|raise|slash|lower|raised)|warns? on|cuts forecast|raises forecast)\b/i,
    reason: 'Forward guidance changed — analysts will reprice.' },
  { re: /\b(buyback|share repurchase|tender offer|special dividend)\b/i,
    reason: 'Capital return event — typically short-term positive.' },
  { re: /\bdividend (cut|suspen|eliminat)/i,
    reason: 'Dividend cut — income thesis broken.' },
  { re: /\b(FDA approval|phase 3|clinical trial (results|data)|breakthrough designation)\b/i,
    reason: 'Binary biotech event — asymmetric move ahead.' },
  { re: /\b(recall|product recall|class action|wrongful death|settlement|settles?.{0,20}(lawsuit|suit|claim|case))\b/i,
    reason: 'Legal / product liability event.' },
  { re: /\blawsuit|sued\b/i,
    reason: 'Legal action filed — read the specifics.' },
  { re: /\b(stock split|spin-?off|reverse split)\b/i,
    reason: 'Corporate-action event — affects position mechanics.' },
  { re: /\b(delisted|going private|taken private)\b/i,
    reason: 'Listing-status change — position may force-close.' },
];

// Warning keywords = material but not existential.
const WARNING_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(downgrade|downgraded|cut rating|lowered price target)\b/i,
    reason: 'Sell-side downgrade.' },
  { re: /\b(upgrade|upgraded|raised price target|top pick)\b/i,
    reason: 'Sell-side upgrade.' },
  { re: /\b(partnership|deal with|teams up|strategic alliance)\b/i,
    reason: 'New partnership — check if thesis adjacent.' },
  { re: /\b(layoffs?|job cuts|workforce reduction|restructuring)\b/i,
    reason: 'Cost-cutting mode — read into margin pressure.' },
  { re: /\b(new|incoming|named|appointed|hired) (CEO|CFO|COO|CTO|president)\b/i,
    reason: 'New leadership — watch early signaling.' },
  { re: /\b(CEO|CFO|COO|CTO) (appointed|named|hired|takes over|succeeds)\b/i,
    reason: 'New leadership — watch early signaling.' },
];

function classifyNews(item: NewsItem): NewsAlert {
  const title = item.title;
  const matched: string[] = [];

  for (const p of CRITICAL_PATTERNS) {
    if (p.re.test(title)) {
      matched.push(p.re.source);
      return { item, severity: 'critical', reason: p.reason, matchedKeywords: matched };
    }
  }
  for (const p of WARNING_PATTERNS) {
    if (p.re.test(title)) {
      matched.push(p.re.source);
      return { item, severity: 'warning', reason: p.reason, matchedKeywords: matched };
    }
  }
  return {
    item,
    severity: 'info',
    reason: 'Tier-1 coverage on a position you hold.',
    matchedKeywords: matched,
  };
}

function tickersFromAccounts(accounts: Account[]): Set<string> {
  const s = new Set<string>();
  for (const a of accounts) {
    for (const h of a.holdings) s.add(h.ticker.toUpperCase());
  }
  return s;
}

function tickersFromWatchlist(entries: WatchlistEntry[]): Set<string> {
  const s = new Set<string>();
  for (const e of entries) {
    if (e.status === 'active') s.add(e.ticker.toUpperCase());
  }
  return s;
}

export interface ScanInput {
  accounts: Account[];
  watchlist: WatchlistEntry[];
  newsItems: NewsItem[];
  firedIds: Set<string>;
  /** Only fire for news published within this window (hours). Default 72. */
  windowHours?: number;
  /** Max alerts to return. Default 5 — don't drown the dashboard. */
  maxAlerts?: number;
  /** Only include info-tier news if true. Default false (critical/warning only). */
  includeInfo?: boolean;
}

export interface ScanResult {
  alerts: NewsAlert[];
  nudges: Nudge[];
  newFiredIds: Set<string>;
}

/**
 * Scan fresh news items against user context. Drops anything:
 *   - for a ticker the user doesn't hold or watch
 *   - older than windowHours
 *   - already-fired (id in firedIds)
 *   - info-tier when includeInfo=false
 * Sorts by severity (critical > warning > info) then by publishedAt desc.
 */
export function scanNews(input: ScanInput): ScanResult {
  const windowHours = input.windowHours ?? 72;
  const maxAlerts = input.maxAlerts ?? 5;
  const includeInfo = input.includeInfo ?? false;

  const relevantTickers = new Set<string>([
    ...tickersFromAccounts(input.accounts),
    ...tickersFromWatchlist(input.watchlist),
  ]);

  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const alerts: NewsAlert[] = [];

  for (const item of input.newsItems) {
    if (!relevantTickers.has(item.ticker)) continue;
    if (input.firedIds.has(item.id)) continue;
    const t = new Date(item.publishedAt).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;

    const alert = classifyNews(item);
    if (!includeInfo && alert.severity === 'info') continue;
    alerts.push(alert);
  }

  alerts.sort((a, b) => {
    const rank: Record<NewsSeverity, number> = { critical: 0, warning: 1, info: 2 };
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return new Date(b.item.publishedAt).getTime() - new Date(a.item.publishedAt).getTime();
  });

  // Cross-ticker dedup: a single story mentioning 3 AI stocks shouldn't fire 3
  // identical cards. Keep the highest-severity (i.e. first after sort) per
  // normalized title.
  const seenTitles = new Set<string>();
  const deduped: NewsAlert[] = [];
  for (const a of alerts) {
    const key = a.item.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    deduped.push(a);
  }

  const chosen = deduped.slice(0, maxAlerts);
  const nudges = chosen.map(buildNewsNudge);

  const newFiredIds = new Set(input.firedIds);
  for (const a of chosen) newFiredIds.add(a.item.id);

  return { alerts: chosen, nudges, newFiredIds };
}

function buildNewsNudge(alert: NewsAlert): Nudge {
  const { item, severity, reason } = alert;
  const icon = severity === 'critical' ? '🚨' : severity === 'warning' ? '📰' : '📰';
  const publishedAgo = humanAgo(item.publishedAt);
  const title = `${item.ticker}: ${item.title}`;
  const body = `${reason} — ${item.publisher}, ${publishedAgo}. Tap through to read, then decide if your thesis needs to change.`;

  return {
    id: `news:${item.id}`,
    severity,
    category: 'news',
    icon,
    title,
    body,
    primary: {
      label: 'Read story',
      href: item.link,
    },
    snoozeDays: severity === 'critical' ? 1 : 3,
    oneShot: true,
  };
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins || 1}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Persistence helpers for firedIds — keep last N to cap settings size.

export function pruneFiredIds(ids: Set<string>, maxKeep = 300): Set<string> {
  if (ids.size <= maxKeep) return ids;
  // Arbitrary pruning — Set has no order guarantee for eviction, so we just
  // take the last N insertions (Sets preserve insertion order in practice).
  const arr = Array.from(ids);
  return new Set(arr.slice(arr.length - maxKeep));
}

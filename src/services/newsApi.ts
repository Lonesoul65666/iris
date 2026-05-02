/**
 * News fetcher — Yahoo Finance v1 search endpoint via existing /api/yf proxy.
 *
 * Yahoo returns JSON per-ticker with a `news` array. Free, no API key. This
 * keeps the dependency surface minimal — if someone runs Iris offline or
 * wants to swap in Finnhub/Marketaux later, they plug in alongside.
 *
 * Tier-1 publisher whitelist — we only trust establishment outlets for the
 * Holy-shit News Scanner. Tabloid "AI bot" writeups get dropped. If the user
 * wants broader coverage later, flip STRICT_TIER1 off.
 */

import type { NewsItem } from '../types/news';

const STRICT_TIER1 = true;

/** Case-insensitive match inside publisher names. */
const TIER1_PUBLISHERS = [
  'bloomberg',
  'reuters',
  'wsj', 'wall street journal', 'dow jones',
  'financial times',
  'cnbc',
  'barron', 'barrons',
  'marketwatch',
  'associated press', ' ap ',
  'new york times', 'nyt',
  'washington post',
  'the economist',
  'forbes',
  'business insider',
  'yahoo finance',    // Yahoo's own editorial desk — reliable
  'motley fool',      // marginal tier-1 but Scott follows them
  'investor',         // investor.com / investors business daily
  'investopedia',
  'seeking alpha',
];

function isTier1(publisher: string): boolean {
  if (!STRICT_TIER1) return true;
  const p = publisher.toLowerCase();
  return TIER1_PUBLISHERS.some(t => p.includes(t));
}

function normalizeTitle(title: string): string {
  return title.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function dedupKey(ticker: string, title: string): string {
  return `${ticker.toUpperCase()}:${normalizeTitle(title)}`;
}

interface YahooNewsRaw {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime?: number;  // unix seconds
  type?: string;  // STORY / VIDEO
}

/**
 * Fetch news for a single ticker from Yahoo. Returns [] on any failure —
 * news is nice-to-have, should never crash the dashboard.
 */
async function fetchNewsForTicker(ticker: string, maxItems = 10): Promise<NewsItem[]> {
  try {
    const url = `/api/yf/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=${maxItems}&quotesCount=0&enableFuzzyQuery=false`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as { news?: YahooNewsRaw[] };
    const raw = Array.isArray(data.news) ? data.news : [];
    const out: NewsItem[] = [];
    for (const n of raw) {
      if (!n.title || !n.link) continue;
      if (n.type && n.type !== 'STORY') continue;   // skip videos
      if (!isTier1(n.publisher ?? '')) continue;
      const publishedAt = n.providerPublishTime
        ? new Date(n.providerPublishTime * 1000).toISOString()
        : new Date().toISOString();
      out.push({
        id: dedupKey(ticker, n.title),
        providerId: n.uuid,
        ticker: ticker.toUpperCase(),
        title: n.title,
        publisher: n.publisher ?? 'Unknown',
        link: n.link,
        publishedAt,
      });
    }
    return out;
  } catch (err) {
    console.warn(`[newsApi] fetch failed for ${ticker}`, err);
    return [];
  }
}

/**
 * Fetch news across a list of tickers, flatten, dedup by id, sort desc.
 * Bounds concurrency to 4 so we don't hammer the proxy.
 */
export async function fetchNewsForTickers(
  tickers: string[],
  opts?: { maxItemsPerTicker?: number },
): Promise<NewsItem[]> {
  const maxItems = opts?.maxItemsPerTicker ?? 8;
  const unique = Array.from(new Set(tickers.map(t => t.toUpperCase())));

  const all: NewsItem[] = [];
  // Simple batch-of-4 concurrency
  for (let i = 0; i < unique.length; i += 4) {
    const batch = unique.slice(i, i + 4);
    const results = await Promise.all(batch.map(t => fetchNewsForTicker(t, maxItems)));
    for (const r of results) all.push(...r);
  }

  // Dedup by id — same story fetched for two tickers keeps the first seen.
  const byId = new Map<string, NewsItem>();
  for (const n of all) {
    if (!byId.has(n.id)) byId.set(n.id, n);
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

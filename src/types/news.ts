/**
 * News domain types — shared by the fetcher and the scanner.
 */

export type NewsSeverity = 'critical' | 'warning' | 'info';

export interface NewsItem {
  /** Stable dedup key: `ticker:normalized-title-first-80-chars`. */
  id: string;
  /** Provider-level unique id (Yahoo uuid) — used as tiebreaker. */
  providerId: string;
  ticker: string;
  title: string;
  publisher: string;  // "Reuters", "Bloomberg", "CNBC", etc.
  link: string;
  publishedAt: string;  // ISO
}

export interface NewsAlert {
  item: NewsItem;
  severity: NewsSeverity;
  reason: string;      // why this matters — one sentence
  matchedKeywords: string[];
}

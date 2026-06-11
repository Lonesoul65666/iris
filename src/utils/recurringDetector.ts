import type { Expense, ExpenseCategory } from '../types/budget';

/**
 * Detect recurring charges from transaction history.
 * Monarch-parity feature: finds subscriptions, utilities, mortgage payments,
 * and anything else that hits on a regular cadence. Users can confirm / dismiss.
 *
 * Pure function — no IndexedDB, no React. Feeds the RecurringBills UI and
 * (eventually) cash-flow forecast + budget-aware nudges.
 */

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular';

export interface RecurringCandidate {
  /** Stable id derived from normalized merchant + cadence — usable as confirm/dismiss key. */
  id: string;
  merchant: string;             // user-facing name (first-seen casing)
  normalizedKey: string;        // grouping key
  cadence: Cadence;
  avgIntervalDays: number;
  avgAmount: number;            // positive
  amountVariancePct: number;    // 0 = dead stable, e.g. 5 = ±5%
  occurrences: number;
  firstDate: string;            // ISO date
  lastDate: string;             // ISO date
  nextExpectedDate: string;     // ISO date — lastDate + avgInterval
  daysUntilNext: number;        // relative to today, can be negative if overdue
  category: ExpenseCategory;    // dominant category
  flow: 'inflow' | 'outflow';
  confidence: number;           // 0..1 — blends cadence regularity + amount stability + sample size
  /** Matching expense ids for traceability. */
  expenseIds: string[];
}

// ── Merchant normalization ──────────────────────────────────────

/**
 * Fold merchant descriptions into a grouping key.
 * Strips trailing digits, dates, order numbers, location suffixes, noise tokens.
 * Goal: "NETFLIX.COM 11/15" and "NETFLIX.COM LOS GATOS CA" both → "netflix".
 */
export function normalizeMerchant(desc: string | null | undefined): string {
  // Defensive: not every transaction carries a description (some inflows /
  // transfers / imported rows have none). A pure normalizer must never throw —
  // an empty key signals "skip" to detectRecurring's `if (!key) continue`.
  if (!desc) return '';
  let s = desc.toLowerCase().trim();

  // Strip common payment-processor prefixes
  s = s.replace(/^(sq\s*\*|sp\s+|tst\*|py\s*\*|ach\s+|pos\s+|pmt\s+|pur\s+|chkcard\s+|debit\s+card\s+purchase\s+|online\s+|visa\s+|recurring\s+)/i, '');

  // Strip trailing location (city, state abbr)
  s = s.replace(/\s+[a-z\s]+\s+[a-z]{2}\s*$/i, '');

  // Strip phone numbers, dates, trailing digits / order ids
  s = s.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '');
  s = s.replace(/\b\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?\b/g, '');
  s = s.replace(/#\s*\w+/g, '');
  s = s.replace(/\s+\d{4,}\s*$/g, '');
  s = s.replace(/\s+\d+\s*$/g, '');

  // Collapse runs of whitespace / punctuation
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();

  // Drop noise tokens so the SAME merchant doesn't fragment into many lines:
  //  - all-digit tokens, and
  //  - transaction-id-like tokens (2+ digits mixed with letters), e.g. Peacock's
  //    "1f674", Oculus "wvr6j5zda2", Prime Video "b03q60vi0". Single-digit brand
  //    tokens survive (e.g. "7eleven", "level3"); "365" is caught by all-digit.
  const tokens = s.split(' ').filter(t => {
    if (!t || /^\d+$/.test(t)) return false;
    if ((t.match(/\d/g) || []).length >= 2) return false;
    return true;
  });

  // Keep the first 2–3 meaningful tokens — that's almost always the merchant brand
  return tokens.slice(0, 3).join(' ');
}

// ── Cadence classification ─────────────────────────────────────

function classifyCadence(avgDays: number): Cadence {
  if (avgDays >= 5 && avgDays <= 9) return 'weekly';
  if (avgDays >= 12 && avgDays <= 17) return 'biweekly';
  if (avgDays >= 26 && avgDays <= 35) return 'monthly';
  if (avgDays >= 85 && avgDays <= 100) return 'quarterly';
  if (avgDays >= 355 && avgDays <= 380) return 'yearly';
  return 'irregular';
}

function cadenceToExpectedDays(c: Cadence): number {
  switch (c) {
    case 'weekly': return 7;
    case 'biweekly': return 14;
    case 'monthly': return 30;
    case 'quarterly': return 91;
    case 'yearly': return 365;
    default: return 0;
  }
}

// ── Stats helpers ──────────────────────────────────────────────

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  return Math.abs(b - a) / (24 * 60 * 60 * 1000);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdDev(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

function mode<T extends string>(xs: T[]): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) || 0) + 1);
  let best: T = xs[0];
  let bestCount = 0;
  for (const [k, v] of counts) {
    if (v > bestCount) { best = k; bestCount = v; }
  }
  return best;
}

// ── Main detector ──────────────────────────────────────────────

export interface DetectOptions {
  /** Minimum occurrences to consider (default 3). 2 is possible but very noisy. */
  minOccurrences?: number;
  /** Only return candidates with confidence ≥ this (default 0.4). */
  minConfidence?: number;
  /** Cap on returned candidates (default unlimited). */
  limit?: number;
  /** Only consider expenses from last N days (default 180 — 6 months catches quarterly, not yearly). */
  lookbackDays?: number;
  /** Today's date for nextExpectedDate math. Default now. Useful for tests. */
  now?: Date;
}

export function detectRecurring(
  expenses: Expense[],
  opts: DetectOptions = {},
): RecurringCandidate[] {
  const minOccurrences = opts.minOccurrences ?? 3;
  const minConfidence = opts.minConfidence ?? 0.4;
  const lookbackDays = opts.lookbackDays ?? 180;
  const now = opts.now ?? new Date();
  const lookbackCutoff = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  // Group by normalized merchant.
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (e.transactionType === 'transfer') continue;            // CC payments etc. aren't bills
    if (new Date(e.date) < lookbackCutoff) continue;
    const key = normalizeMerchant(e.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const candidates: RecurringCandidate[] = [];

  for (const [normalizedKey, group] of groups) {
    if (group.length < minOccurrences) continue;

    // Sort by date ascending.
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));

    // Intervals between consecutive charges.
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    const medianInterval = median(intervals);
    const cadence = classifyCadence(medianInterval);
    if (cadence === 'irregular') continue;                     // skip — ad-hoc spending

    const avgInterval = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    const intervalStd = stdDev(intervals, avgInterval);
    const expectedDays = cadenceToExpectedDays(cadence);

    // Amount stats.
    const amounts = sorted.map(e => e.amount);
    const avgAmount = amounts.reduce((s, x) => s + x, 0) / amounts.length;
    const amountStd = stdDev(amounts, avgAmount);
    const amountVariancePct = avgAmount > 0 ? (amountStd / avgAmount) * 100 : 0;

    // Confidence scoring. Three signals, each 0..1, averaged.
    const cadenceConfidence = Math.max(0, 1 - (intervalStd / expectedDays));           // tight cadence → high
    const amountConfidence = Math.max(0, 1 - (amountVariancePct / 50));                // 50% variance → 0, 0% → 1
    const sampleSizeConfidence = Math.min(1, (sorted.length - minOccurrences + 1) / 4); // 3 → 0.25, 6 → 1
    const confidence = (cadenceConfidence + amountConfidence + sampleSizeConfidence) / 3;

    if (confidence < minConfidence) continue;

    const lastDate = sorted[sorted.length - 1].date;
    const nextTs = new Date(lastDate).getTime() + avgInterval * 24 * 60 * 60 * 1000;
    const nextDate = new Date(nextTs);
    const nextExpectedDate = nextDate.toISOString().slice(0, 10);
    const daysUntilNext = Math.round((nextTs - now.getTime()) / (24 * 60 * 60 * 1000));

    // First-seen casing for display.
    const merchant = sorted[0].description.length > 40
      ? sorted[0].description.slice(0, 40).trim() + '…'
      : sorted[0].description.trim();

    const category = mode(sorted.map(e => e.category)) as ExpenseCategory;
    const flow = mode(sorted.map(e => e.flow || 'outflow'));

    candidates.push({
      id: `recur-${normalizedKey.replace(/\s+/g, '-')}-${cadence}`,
      merchant,
      normalizedKey,
      cadence,
      avgIntervalDays: Math.round(avgInterval * 10) / 10,
      avgAmount: Math.round(avgAmount * 100) / 100,
      amountVariancePct: Math.round(amountVariancePct * 10) / 10,
      occurrences: sorted.length,
      firstDate: sorted[0].date,
      lastDate,
      nextExpectedDate,
      daysUntilNext,
      category,
      flow,
      confidence: Math.round(confidence * 100) / 100,
      expenseIds: sorted.map(e => e.id),
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence || b.avgAmount - a.avgAmount);
  return opts.limit ? candidates.slice(0, opts.limit) : candidates;
}

/**
 * Summarize the monthly impact of all detected recurring bills.
 * Normalizes every cadence to a monthly equivalent so users see
 * "you have $X / month in recurring bills" at a glance.
 */
export function monthlyRecurringLoad(candidates: RecurringCandidate[]): {
  outflow: number;
  inflow: number;
  net: number;
} {
  let outflow = 0;
  let inflow = 0;
  for (const c of candidates) {
    const perMonth = c.cadence === 'weekly' ? c.avgAmount * 4.345
                   : c.cadence === 'biweekly' ? c.avgAmount * 2.1725
                   : c.cadence === 'monthly' ? c.avgAmount
                   : c.cadence === 'quarterly' ? c.avgAmount / 3
                   : c.cadence === 'yearly' ? c.avgAmount / 12
                   : 0;
    if (c.flow === 'inflow') inflow += perMonth;
    else outflow += perMonth;
  }
  return { outflow, inflow, net: inflow - outflow };
}

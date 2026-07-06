import type { Cadence, RecurringCandidate } from './recurringDetector';
import type { ExpenseCategory } from '../types/budget';

/**
 * Forward cash-flow calendar — "what's hitting when."
 *
 * Pure projection over the recurring bills that recurringDetector already
 * finds (built but, until now, unsurfaced). For each confident RECURRING
 * OUTFLOW we roll its nextExpectedDate forward through a horizon window
 * (default 30 days), using calendar-accurate stepping so a monthly bill keeps
 * its day-of-month. The result is grouped by day with running totals — the
 * "aha" surface competitors lead with.
 *
 * Outflows only in v1: recurring income (the paycheck) is modeled elsewhere.
 * Confidence-filtered so ad-hoc noise never shows up as a "bill."
 */

export interface ForecastItem {
  /** ISO date (yyyy-mm-dd, local) this occurrence lands on. */
  date: string;
  merchant: string;
  amount: number;
  cadence: Cadence;
  category: ExpenseCategory;
  confidence: number;
}

export interface ForecastDay {
  date: string;
  items: ForecastItem[];
  total: number;
}

export interface CashflowForecast {
  days: ForecastDay[];
  /** Sum of every projected outflow in the window. */
  total: number;
  /** Number of individual bill occurrences in the window. */
  count: number;
  horizonDays: number;
}

export interface ForecastOptions {
  now: Date;
  /** Days to project forward. Default 30. */
  horizonDays?: number;
  /** Only include bills at/above this confidence. Default 0.5. */
  minConfidence?: number;
}

// ─── date helpers (local, date-only — no TZ drift) ───────────────────────────

/** Parse an ISO date (yyyy-mm-dd) as local midnight. */
function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Local midnight of a Date. */
function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Add n calendar months, clamping day-of-month (Jan 31 + 1mo → Feb 28/29). */
function addMonths(d: Date, n: number): Date {
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

/** Advance one occurrence forward by the candidate's cadence. */
function advance(d: Date, cadence: Cadence): Date {
  switch (cadence) {
    case 'weekly':
      return addDays(d, 7);
    case 'biweekly':
      return addDays(d, 14);
    case 'monthly':
      return addMonths(d, 1);
    case 'quarterly':
      return addMonths(d, 3);
    case 'yearly':
      return addMonths(d, 12);
    default:
      // 'irregular' never reaches here (filtered), but keep the loop terminating.
      return addDays(d, 3650);
  }
}

const MAX_STEPS = 500; // guard: no candidate produces this many hits in a sane window

export function forecastCashflow(
  candidates: RecurringCandidate[],
  opts: ForecastOptions,
): CashflowForecast {
  const horizonDays = opts.horizonDays ?? 30;
  const minConfidence = opts.minConfidence ?? 0.5;
  const today = midnight(opts.now);
  const end = addDays(today, horizonDays);

  const byDate = new Map<string, ForecastItem[]>();
  let total = 0;
  let count = 0;

  for (const c of candidates) {
    if (c.flow !== 'outflow') continue; // bills only
    if (c.cadence === 'irregular') continue;
    if (c.confidence < minConfidence) continue;

    let occ = parseISODate(c.nextExpectedDate);
    let steps = 0;
    // Roll an overdue/stale expected date forward to the genuinely-next one.
    while (occ < today && steps++ < MAX_STEPS) occ = advance(occ, c.cadence);
    // Emit every occurrence inside the window.
    while (occ <= end && steps++ < MAX_STEPS) {
      const iso = toISO(occ);
      const item: ForecastItem = {
        date: iso,
        merchant: c.merchant,
        amount: Math.round(c.avgAmount),
        cadence: c.cadence,
        category: c.category,
        confidence: c.confidence,
      };
      const arr = byDate.get(iso);
      if (arr) arr.push(item);
      else byDate.set(iso, [item]);
      total += item.amount;
      count += 1;
      occ = advance(occ, c.cadence);
    }
  }

  const days: ForecastDay[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      items: items.sort((x, y) => y.amount - x.amount),
      total: items.reduce((s, it) => s + it.amount, 0),
    }));

  return { days, total, count, horizonDays };
}

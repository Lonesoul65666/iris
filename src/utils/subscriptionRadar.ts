import type { Cadence, RecurringCandidate } from './recurringDetector';
import type { ExpenseCategory } from '../types/budget';

/**
 * Subscription & recurring-charge radar — the "creep" hit-list.
 *
 * Same source as the cash-flow calendar (recurringDetector), different framing:
 * instead of "what hits when," this ranks every confident recurring OUTFLOW by
 * its MONTHLY-EQUIVALENT cost so you can see the standing load and cancel what
 * you don't use — the Rocket-Money move. Pure + testable.
 */

export interface RadarItem {
  merchant: string;
  /** Monthly-equivalent cost (weekly/biweekly annualized down, yearly/quarterly up). */
  monthlyCost: number;
  /** The actual per-charge amount. */
  chargeAmount: number;
  cadence: Cadence;
  category: ExpenseCategory;
  confidence: number;
  lastDate: string;
}

export interface SubscriptionRadar {
  /** Ranked by monthlyCost, highest first. */
  items: RadarItem[];
  totalMonthly: number;
  totalAnnual: number;
  count: number;
}

/** Normalize a cadence's per-charge amount to a monthly-equivalent cost. */
export function monthlyEquivalent(amount: number, cadence: Cadence): number {
  switch (cadence) {
    case 'weekly':
      return amount * 4.345;
    case 'biweekly':
      return amount * 2.1725;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    default:
      return 0; // irregular — not a standing charge
  }
}

export interface RadarOptions {
  /** Only include recurring charges at/above this confidence. Default 0.5. */
  minConfidence?: number;
}

export function buildSubscriptionRadar(
  candidates: RecurringCandidate[],
  opts: RadarOptions = {},
): SubscriptionRadar {
  const minConfidence = opts.minConfidence ?? 0.5;

  const kept = candidates.filter(
    (c) => c.flow === 'outflow' && c.cadence !== 'irregular' && c.confidence >= minConfidence,
  );

  // Aggregate from the RAW monthly-equivalents, then round once — so the totals
  // don't accumulate per-item rounding drift (and totalAnnual isn't 12× a
  // rounded figure). Per-item displayed costs stay rounded to whole dollars.
  const rawMonthly = kept.reduce((s, c) => s + monthlyEquivalent(c.avgAmount, c.cadence), 0);

  const items: RadarItem[] = kept
    .map((c) => ({
      merchant: c.merchant,
      monthlyCost: Math.round(monthlyEquivalent(c.avgAmount, c.cadence)),
      chargeAmount: Math.round(c.avgAmount),
      cadence: c.cadence,
      category: c.category,
      confidence: c.confidence,
      lastDate: c.lastDate,
    }))
    .sort((a, b) => b.monthlyCost - a.monthlyCost);

  return {
    items,
    totalMonthly: Math.round(rawMonthly),
    totalAnnual: Math.round(rawMonthly * 12),
    count: items.length,
  };
}

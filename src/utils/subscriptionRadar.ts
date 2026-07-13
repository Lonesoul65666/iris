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

/** User-set state for a recurring charge. 'active' is the implicit default. */
export type SubStatus = 'active' | 'canceled' | 'ignored';
export interface SubStatusEntry { status: SubStatus; canceledOn?: string }
export type SubscriptionStatusMap = Record<string, SubStatusEntry>;

/** Stable key for a merchant across the status map + nudges (trim + lowercase). */
export function subKey(merchant: string): string {
  return merchant.trim().toLowerCase();
}

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
  status: SubStatus;
  /** True when a canceled charge has billed again AFTER its cancel date. */
  resurrected: boolean;
}

export interface SubscriptionRadar {
  /** ACTIVE charges, ranked by monthlyCost, highest first. */
  items: RadarItem[];
  /** Marked canceled by the user (with resurrection flags). */
  canceled: RadarItem[];
  /** Marked "not a subscription" — hidden from the active list + forecast. */
  ignored: RadarItem[];
  /** Totals reflect ACTIVE charges only. */
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
  /** User cancel/ignore state, keyed by subKey(merchant). */
  statusMap?: SubscriptionStatusMap;
}

export function buildSubscriptionRadar(
  candidates: RecurringCandidate[],
  opts: RadarOptions = {},
): SubscriptionRadar {
  const minConfidence = opts.minConfidence ?? 0.5;
  const statusMap = opts.statusMap ?? {};

  const kept = candidates.filter(
    (c) => c.flow === 'outflow' && c.cadence !== 'irregular' && c.confidence >= minConfidence,
  );

  const all: RadarItem[] = kept
    .map((c) => {
      const entry = statusMap[subKey(c.merchant)];
      const status: SubStatus = entry?.status ?? 'active';
      // Resurrection: a canceled charge that billed again AFTER the cancel date.
      const resurrected = status === 'canceled' && !!entry?.canceledOn && c.lastDate > entry.canceledOn;
      return {
        merchant: c.merchant,
        monthlyCost: Math.round(monthlyEquivalent(c.avgAmount, c.cadence)),
        chargeAmount: Math.round(c.avgAmount),
        cadence: c.cadence,
        category: c.category,
        confidence: c.confidence,
        lastDate: c.lastDate,
        status,
        resurrected,
        // keep the raw monthly for accurate active totals (rounded once below)
        _rawMonthly: monthlyEquivalent(c.avgAmount, c.cadence),
      } as RadarItem & { _rawMonthly: number };
    })
    .sort((a, b) => b.monthlyCost - a.monthlyCost);

  const byCost = (a: RadarItem, b: RadarItem) => b.monthlyCost - a.monthlyCost;
  const active = all.filter((i) => i.status === 'active').sort(byCost);
  const canceled = all.filter((i) => i.status === 'canceled').sort(byCost);
  const ignored = all.filter((i) => i.status === 'ignored').sort(byCost);

  // Totals from ACTIVE raw monthly-equivalents, rounded once (no drift).
  const rawMonthly = active.reduce((s, i) => s + (i as RadarItem & { _rawMonthly: number })._rawMonthly, 0);
  const strip = (i: RadarItem & { _rawMonthly?: number }): RadarItem => {
    const { _rawMonthly, ...rest } = i; void _rawMonthly; return rest;
  };

  return {
    items: active.map(strip),
    canceled: canceled.map(strip),
    ignored: ignored.map(strip),
    totalMonthly: Math.round(rawMonthly),
    totalAnnual: Math.round(rawMonthly * 12),
    count: active.length,
  };
}

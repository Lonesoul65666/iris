/**
 * Conviction utility — single source of truth for conviction-hold logic.
 *
 * A "conviction hold" is a position the user has explicitly declared as locked:
 * don't trim it, don't tell them to reduce it, don't count it in rebalance math.
 *
 * Historical note: conviction logic used to be spread across portfolioIntelligence,
 * nextDeploymentBrief, etfXray, and nudgeEngine. This module centralizes the common
 * patterns so there's ONE place to change behavior when the model evolves (e.g.
 * when Conviction Watchlist adds price-anchor + thesis-anchor dimensions).
 */
import type { Account, Holding } from '../types/portfolio';
import { getSector } from './calculations';

// ─── Type predicates ────────────────────────────────────────────────────────

/** True if this holding has been flagged as a conviction hold by the user. */
export function isConviction(h: Pick<Holding, 'conviction'>): boolean {
  return h.conviction === true;
}

/** Return only the holdings NOT flagged as conviction. Used when picking trim targets. */
export function nonConviction<T extends Pick<Holding, 'conviction'>>(holdings: T[]): T[] {
  return holdings.filter((h) => !isConviction(h));
}

/** Return only the holdings flagged as conviction. */
export function convictionHoldings<T extends Pick<Holding, 'conviction'>>(holdings: T[]): T[] {
  return holdings.filter(isConviction);
}

// ─── Aggregation ────────────────────────────────────────────────────────────

export interface SectorConviction {
  /** Dollar value in this sector flagged as conviction. */
  value: number;
  /** That value as a % of the whole portfolio. */
  pct: number;
}

/**
 * Walk every account and aggregate conviction dollars per sector. Pass in
 * `totalValue` so we can compute pct in one go.
 *
 * Returns a Record keyed by sector; sectors with zero conviction are omitted.
 */
export function aggregateConvictionBySector(
  accounts: Account[],
  totalValue: number,
): Record<string, SectorConviction> {
  const out: Record<string, SectorConviction> = {};
  if (totalValue <= 0) return out;
  for (const account of accounts) {
    for (const h of account.holdings) {
      if (!isConviction(h)) continue;
      const sector = getSector(h.ticker);
      const cur = out[sector] ?? { value: 0, pct: 0 };
      cur.value += h.currentValue;
      cur.pct = (cur.value / totalValue) * 100;
      out[sector] = cur;
    }
  }
  return out;
}

/**
 * Flatten all conviction holdings across accounts into a single list. Useful
 * for surfaces that want to display "here are your locked positions."
 */
export function listAllConvictions(accounts: Account[]): Array<Holding & { accountName: string }> {
  const out: Array<Holding & { accountName: string }> = [];
  for (const account of accounts) {
    for (const h of account.holdings) {
      if (isConviction(h)) out.push({ ...h, accountName: account.name });
    }
  }
  return out;
}

/** Total $ value of all conviction holdings across accounts. */
export function totalConvictionValue(accounts: Account[]): number {
  let sum = 0;
  for (const account of accounts) {
    for (const h of account.holdings) {
      if (isConviction(h)) sum += h.currentValue;
    }
  }
  return sum;
}

// ─── Messaging helpers ──────────────────────────────────────────────────────

/**
 * Standard parenthetical to append to rebalance/deposit copy when conviction $
 * is being carved out of the math. Returns empty string when pct <= 0 so you
 * can inline it unconditionally: `${reason}${convictionNote(pct)}`.
 */
export function convictionNote(pct: number): string {
  if (pct <= 0) return '';
  return ` (excluding ${pct.toFixed(1)}% conviction)`;
}

/**
 * Variant note used when the conviction is in a DIFFERENT sector than the one
 * being recommended (i.e. "don't tell me to add more X — I already bet on X").
 */
export function convictionInSectorNote(pct: number): string {
  if (pct <= 0) return '';
  return ` (excluding your ${pct.toFixed(1)}% conviction in this sector)`;
}

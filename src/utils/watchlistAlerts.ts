/**
 * Watchlist Alert Engine — turns WatchlistEntry price hits into Nudges.
 *
 * Pure function over entries + a price-lookup. Orchestration (reading the
 * store, persisting firstHitAt, re-rendering) happens in the Dashboard layer.
 *
 * Philosophy: one nudge per entry that's newly hit. If the user already hit
 * the anchor (firstHitAt set) but hasn't converted/archived, we still surface
 * it — BUT at lower severity — so it doesn't disappear and we avoid another
 * Micron-regret loop. After a few visits we let the nudge system's own snooze
 * handle fade-out.
 */

import type { WatchlistEntry } from '../types/watchlist';
import type { Nudge } from './nudgeEngine';
import { checkAnchorHit } from '../stores/watchlistStore';

export interface WatchlistAlert {
  entry: WatchlistEntry;
  currentPrice: number;
  newlyHit: boolean;   // first time this anchor has fired
  stillHit: boolean;   // previously hit and still in-range (persistent reminder)
  nudge: Nudge;
}

/** Look up the live price for a ticker. Return null if we don't have it. */
export type PriceLookup = (ticker: string) => number | null;

export function evaluateWatchlist(
  entries: WatchlistEntry[],
  getCurrentPrice: PriceLookup,
): WatchlistAlert[] {
  const out: WatchlistAlert[] = [];

  for (const entry of entries) {
    if (entry.status === 'archived' || entry.status === 'converted') continue;
    if (!entry.priceAnchor) continue;

    const price = getCurrentPrice(entry.ticker);
    if (price == null || !Number.isFinite(price)) continue;

    const hitsNow = checkAnchorHit(entry.priceAnchor.direction, entry.priceAnchor.targetPrice, price);
    if (!hitsNow) continue;

    const alreadyHit = !!entry.priceAnchor.firstHitAt;
    const newlyHit = !alreadyHit;
    const stillHit = alreadyHit;

    out.push({
      entry,
      currentPrice: price,
      newlyHit,
      stillHit,
      nudge: buildNudge(entry, price, newlyHit),
    });
  }

  return out;
}

function buildNudge(entry: WatchlistEntry, currentPrice: number, newlyHit: boolean): Nudge {
  const anchor = entry.priceAnchor!;
  const verb = directionVerb(anchor.direction);
  const isBuy = anchor.direction.startsWith('buy');

  // Severity mapping:
  //   newly-hit BUY          → critical (this is exactly the Micron moment)
  //   newly-hit SELL         → warning
  //   still-hit (persistent) → info
  const severity: Nudge['severity'] = newlyHit ? (isBuy ? 'critical' : 'warning') : 'info';
  const icon = isBuy ? '🎯' : '💰';

  const movePct = anchor.priceAtCreate > 0
    ? ((currentPrice - anchor.priceAtCreate) / anchor.priceAtCreate) * 100
    : 0;
  const moveText = Number.isFinite(movePct) && Math.abs(movePct) >= 0.5
    ? ` (${movePct >= 0 ? '+' : ''}${movePct.toFixed(1)}% from when you set it)`
    : '';

  const title = newlyHit
    ? `${entry.ticker} hit your ${verb} $${anchor.targetPrice.toFixed(2)} target`
    : `${entry.ticker} still at your ${verb} zone`;

  const bodyLines: string[] = [];
  bodyLines.push(
    `${entry.ticker} is now $${currentPrice.toFixed(2)}${moveText}. You set a ${verb} trigger at $${anchor.targetPrice.toFixed(2)}.`,
  );
  if (entry.thesis?.text) {
    bodyLines.push(`Your thesis: "${entry.thesis.text}"`);
  }
  if (newlyHit) {
    bodyLines.push(isBuy
      ? 'This is the moment you told yourself not to miss. Decide now — convert, walk, or snooze with intent.'
      : 'Check whether anything has changed in your thesis before acting.');
  }

  return {
    id: `watchlist:${entry.id}`,
    severity,
    category: 'portfolio',
    icon,
    title,
    body: bodyLines.join(' '),
    primary: {
      label: 'Open Watchlist',
      view: 'watchlist',
    },
    snoozeDays: newlyHit ? 1 : 3,
    oneShot: false,
  };
}

function directionVerb(d: 'buy-below' | 'buy-above' | 'sell-above' | 'sell-below'): string {
  switch (d) {
    case 'buy-below':
      return 'buy-below';
    case 'buy-above':
      return 'buy-above';
    case 'sell-above':
      return 'sell-above';
    case 'sell-below':
      return 'sell-below';
  }
}

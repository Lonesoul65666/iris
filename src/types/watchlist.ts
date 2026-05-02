/**
 * Conviction Watchlist — the "don't miss the next Micron" layer.
 *
 * This is deliberately separate from `Holding.conviction` on the portfolio side.
 * A watchlist entry is a ticker you DON'T yet own (or own small) with a specific
 * trigger you want to be alerted on. The trigger model is:
 *
 *   (A) Price anchor  — primary mechanism: "alert me when MU hits $82"
 *   (B) Thesis anchor — secondary: "track news around the RAM→AI narrative"
 *
 * When an entry hits its anchor, it produces a Nudge that renders through the
 * canonical NudgeCard. The entry stays in the watchlist (marked `hit`) so the
 * regret/validation history is preserved even after you act on it.
 */

export type PriceAnchorDirection = 'buy-below' | 'buy-above' | 'sell-above' | 'sell-below';

export interface PriceAnchor {
  /** Which direction the user cares about. "buy-below" = alert when price drops to/below target. */
  direction: PriceAnchorDirection;
  /** Target trigger price. */
  targetPrice: number;
  /** Snapshot of the price when the anchor was set — used to show "alert was $82, now $45" context. */
  priceAtCreate: number;
  /** ISO timestamp of the first time this anchor was hit. Persists across refreshes so we can reference the regret arc. */
  firstHitAt?: string;
  /** Last recorded price observation while still not-yet-acted-on. */
  lastObservedPrice?: number;
  /** ISO timestamp of the last price observation. */
  lastObservedAt?: string;
}

export interface ThesisAnchor {
  /** The user's one-liner thesis. Kept short on purpose — readable on a card. */
  text: string;
  /**
   * Optional keywords the news-scanner layer uses to check whether thesis is validating.
   * e.g. ["DRAM", "HBM", "AI inference memory"]. Keep a handful — this isn't a DSL.
   */
  keywords?: string[];
}

export type WatchlistStatus =
  | 'active'      // being watched
  | 'snoozed'     // triggered, user clicked "remind me later"
  | 'archived'    // user explicitly archived
  | 'converted';  // user bought it — kept as a "you did act" record

export interface WatchlistEntry {
  id: string;               // uuid
  ticker: string;           // "MU"
  name: string;             // "Micron Technology"
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
  status: WatchlistStatus;
  /** Free-form context: "I knew Wall St missed the RAM→AI pivot before Huang said it." */
  note?: string;
  priceAnchor?: PriceAnchor;
  thesis?: ThesisAnchor;
  /** Optional category so the UI can group. e.g. "Semiconductors", "Energy transition". */
  tag?: string;
}

/** Shape stored in IndexedDB under settings key `watchlist_entries`. Versioned for future migrations. */
export interface WatchlistStoreShape {
  version: 1;
  entries: WatchlistEntry[];
}

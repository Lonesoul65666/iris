/**
 * Watchlist store — CRUD over the Conviction Watchlist. Backed by the existing
 * `settings` keyspace (single JSON blob) so we avoid an IndexedDB schema bump.
 *
 * If the watchlist grows past ~100 entries (unlikely for a personal app) we'll
 * migrate to a dedicated object store. For now, read-whole / write-whole is fine.
 */

import { getSetting, saveSetting } from './portfolioStore';
import type { WatchlistEntry, WatchlistStatus, WatchlistStoreShape, PriceAnchor, ThesisAnchor } from '../types/watchlist';

const SETTING_KEY = 'watchlist_entries';

function emptyShape(): WatchlistStoreShape {
  return { version: 1, entries: [] };
}

async function loadShape(): Promise<WatchlistStoreShape> {
  const raw = await getSetting(SETTING_KEY);
  if (!raw) return emptyShape();
  try {
    const parsed = JSON.parse(raw) as WatchlistStoreShape;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) return emptyShape();
    return parsed;
  } catch {
    return emptyShape();
  }
}

async function saveShape(shape: WatchlistStoreShape): Promise<void> {
  await saveSetting(SETTING_KEY, JSON.stringify(shape));
}

function uid(): string {
  // Good-enough uid for local use — crypto.randomUUID exists in all target browsers.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function listWatchlist(): Promise<WatchlistEntry[]> {
  const shape = await loadShape();
  return shape.entries;
}

export async function listActiveWatchlist(): Promise<WatchlistEntry[]> {
  const all = await listWatchlist();
  return all.filter((e) => e.status === 'active' || e.status === 'snoozed');
}

export interface CreateWatchlistInput {
  ticker: string;
  name: string;
  note?: string;
  tag?: string;
  priceAnchor?: Omit<PriceAnchor, 'firstHitAt' | 'lastObservedPrice' | 'lastObservedAt'>;
  thesis?: ThesisAnchor;
}

export async function addWatchlistEntry(input: CreateWatchlistInput): Promise<WatchlistEntry> {
  const shape = await loadShape();
  const now = new Date().toISOString();
  const entry: WatchlistEntry = {
    id: uid(),
    ticker: input.ticker.toUpperCase().trim(),
    name: input.name.trim(),
    createdAt: now,
    updatedAt: now,
    status: 'active',
    note: input.note?.trim() || undefined,
    tag: input.tag?.trim() || undefined,
    priceAnchor: input.priceAnchor,
    thesis: input.thesis,
  };
  shape.entries.unshift(entry);
  await saveShape(shape);
  return entry;
}

export async function updateWatchlistEntry(id: string, patch: Partial<WatchlistEntry>): Promise<WatchlistEntry | null> {
  const shape = await loadShape();
  const idx = shape.entries.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const next = { ...shape.entries[idx], ...patch, id, updatedAt: new Date().toISOString() };
  shape.entries[idx] = next;
  await saveShape(shape);
  return next;
}

export async function setWatchlistStatus(id: string, status: WatchlistStatus): Promise<void> {
  await updateWatchlistEntry(id, { status });
}

export async function deleteWatchlistEntry(id: string): Promise<void> {
  const shape = await loadShape();
  shape.entries = shape.entries.filter((e) => e.id !== id);
  await saveShape(shape);
}

/**
 * Record a price observation against a price-anchored entry. Called by the
 * watchlist alert engine when a fresh price comes in. Sets `firstHitAt` the
 * first time the anchor is crossed, and always updates `lastObserved*`.
 *
 * Returns `{ newlyHit: true }` if this observation crossed the threshold for
 * the first time — the caller uses that to decide whether to spawn a nudge.
 */
export async function recordPriceObservation(
  id: string,
  observedPrice: number,
): Promise<{ newlyHit: boolean; entry: WatchlistEntry | null }> {
  const shape = await loadShape();
  const idx = shape.entries.findIndex((e) => e.id === id);
  if (idx < 0) return { newlyHit: false, entry: null };
  const entry = shape.entries[idx];
  if (!entry.priceAnchor) return { newlyHit: false, entry };

  const anchor = entry.priceAnchor;
  const wasAlreadyHit = !!anchor.firstHitAt;
  const hitsNow = checkAnchorHit(anchor.direction, anchor.targetPrice, observedPrice);

  const nowIso = new Date().toISOString();
  const nextAnchor: PriceAnchor = {
    ...anchor,
    lastObservedPrice: observedPrice,
    lastObservedAt: nowIso,
    firstHitAt: anchor.firstHitAt ?? (hitsNow ? nowIso : undefined),
  };
  shape.entries[idx] = { ...entry, priceAnchor: nextAnchor, updatedAt: nowIso };
  await saveShape(shape);

  return { newlyHit: !wasAlreadyHit && hitsNow, entry: shape.entries[idx] };
}

/** Pure helper — does `observed` satisfy the anchor's trigger direction + price? */
export function checkAnchorHit(direction: PriceAnchor['direction'], target: number, observed: number): boolean {
  switch (direction) {
    case 'buy-below':
      return observed <= target;
    case 'buy-above':
      return observed >= target;
    case 'sell-above':
      return observed >= target;
    case 'sell-below':
      return observed <= target;
  }
}

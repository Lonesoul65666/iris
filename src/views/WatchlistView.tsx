/**
 * Conviction Watchlist — "Don't miss the next Micron."
 *
 * Scott's Micron regret: knew about the RAM→AI pivot before Wall St did, told
 * himself to buy at $82, didn't, watched it hit $450. This view exists so that
 * moment of conviction doesn't evaporate next time.
 *
 * Core loop:
 *   1. Add a ticker + price anchor ("alert me when MU hits $82") + optional thesis note
 *   2. Price refresh runs, anchor hits → Nudge surfaces on Dashboard
 *   3. User acts — convert (bought it), archive (thesis broke), or snooze
 *   4. Hit events persist as regret/validation history
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addWatchlistEntry,
  deleteWatchlistEntry,
  listWatchlist,
  recordPriceObservation,
  setWatchlistStatus,
} from '../stores/watchlistStore';
import { fetchPricesForTickers, type PriceResult } from '../services/marketDataApi';
import type { PriceAnchorDirection, WatchlistEntry } from '../types/watchlist';
import { useAppData } from '../context/AppDataContext';

type FilterTab = 'active' | 'hit' | 'archive';

export default function WatchlistView() {
  const { accounts } = useAppData();
  const [entries, setEntries] = useState<WatchlistEntry[] | null>(null);
  const [prices, setPrices] = useState<Map<string, PriceResult>>(new Map());
  const [priceStatus, setPriceStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('active');

  const load = useCallback(async () => {
    setEntries(await listWatchlist());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Compose a price lookup: prefer watchlist fetched prices, fall back to portfolio holdings.
  const getPrice = useCallback(
    (ticker: string): number | null => {
      const up = ticker.toUpperCase();
      const fromWatch = prices.get(up);
      if (fromWatch && Number.isFinite(fromWatch.price)) return fromWatch.price;
      for (const account of accounts) {
        for (const h of account.holdings) {
          if (h.ticker.toUpperCase() === up && Number.isFinite(h.currentPrice)) return h.currentPrice;
        }
      }
      return null;
    },
    [prices, accounts],
  );

  // Refresh prices whenever the active-entry set changes. Cheap: one batched call.
  useEffect(() => {
    if (!entries) return;
    const active = entries.filter((e) => e.status === 'active' || e.status === 'snoozed');
    if (active.length === 0) return;

    const tickers = Array.from(new Set(active.map((e) => e.ticker)));
    let cancelled = false;
    setPriceStatus('loading');
    (async () => {
      try {
        const fetched = await fetchPricesForTickers(tickers);
        if (cancelled) return;
        const next = new Map<string, PriceResult>();
        for (const p of fetched) next.set(p.ticker.toUpperCase(), p);
        setPrices(next);
        setPriceStatus(fetched.length > 0 ? 'idle' : 'error');

        // Persist hit state for any entry whose anchor just fired.
        for (const entry of active) {
          const px = next.get(entry.ticker.toUpperCase())?.price;
          if (px != null) await recordPriceObservation(entry.id, px);
        }
        await load();
      } catch {
        if (!cancelled) setPriceStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries?.length, load]);

  // ─── Derived: which tab an entry belongs to ───
  const bucketed = useMemo(() => {
    const active: WatchlistEntry[] = [];
    const hit: WatchlistEntry[] = [];
    const archive: WatchlistEntry[] = [];
    for (const e of entries ?? []) {
      if (e.status === 'archived' || e.status === 'converted') archive.push(e);
      else if (e.priceAnchor?.firstHitAt) hit.push(e);
      else active.push(e);
    }
    return { active, hit, archive };
  }, [entries]);

  const visible = bucketed[filter];

  // ─── Handlers ───
  const handleAdd = async (draft: AddDraft) => {
    const createPayload = {
      ticker: draft.ticker.toUpperCase().trim(),
      name: draft.name.trim() || draft.ticker.toUpperCase().trim(),
      note: draft.note || undefined,
      tag: draft.tag || undefined,
      priceAnchor: draft.enablePriceAnchor
        ? {
            direction: draft.direction,
            targetPrice: draft.targetPrice,
            priceAtCreate: draft.priceAtCreate,
          }
        : undefined,
      thesis: draft.thesis ? { text: draft.thesis } : undefined,
    };
    await addWatchlistEntry(createPayload);
    setShowAddForm(false);
    await load();
  };

  const handleStatusChange = async (id: string, status: WatchlistEntry['status']) => {
    await setWatchlistStatus(id, status);
    await load();
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this watchlist entry? This does not un-buy the position if you already acted.')) return;
    await deleteWatchlistEntry(id);
    await load();
  };

  // ─── Render ───
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Hero header — different visual weight than a card. Addresses "every view feels flat". */}
      <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 via-accent/5 to-transparent p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="term-label">
                Conviction Watchlist
              </span>
            </div>
            <h1 className="text-3xl font-bold text-text-primary mt-1">Don't miss the next Micron.</h1>
            <p className="text-sm text-text-secondary leading-relaxed mt-2 max-w-2xl">
              Anchor the tickers you have a real thesis on. When price hits your trigger, Iris drops a nudge —
              so the conviction you had at 2am doesn't evaporate by the time the move actually happens.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors shrink-0"
          >
            {showAddForm ? 'Cancel' : '+ Add to Watchlist'}
          </button>
        </div>
      </div>

      {showAddForm && <AddForm onSubmit={handleAdd} getCurrentPrice={getPrice} onCancel={() => setShowAddForm(false)} />}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-glass-border">
        {(
          [
            { id: 'active', label: 'Active', count: bucketed.active.length },
            { id: 'hit', label: 'Hit / Triggered', count: bucketed.hit.length },
            { id: 'archive', label: 'Archive', count: bucketed.archive.length },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              filter === t.id
                ? 'text-accent-light border-accent'
                : 'text-text-muted border-transparent hover:text-text-secondary'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-text-muted mono-num">({t.count})</span>
          </button>
        ))}
        <div className="ml-auto text-[11px] text-text-muted pr-1 mono-num">
          {priceStatus === 'loading' && 'Fetching prices…'}
          {priceStatus === 'error' && 'Price feed unavailable — using last-known'}
          {priceStatus === 'idle' && prices.size > 0 && `${prices.size} price${prices.size === 1 ? '' : 's'} fresh`}
        </div>
      </div>

      {/* List */}
      {entries === null ? (
        <div className="text-text-muted text-sm">Loading watchlist…</div>
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} onOpenAdd={() => setShowAddForm(true)} />
      ) : (
        <div className="space-y-3">
          {visible.map((entry) => (
            <WatchlistCard
              key={entry.id}
              entry={entry}
              currentPrice={getPrice(entry.ticker)}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add form ─────────────────────────────────────────────────────────────

interface AddDraft {
  ticker: string;
  name: string;
  note: string;
  tag: string;
  thesis: string;
  enablePriceAnchor: boolean;
  direction: PriceAnchorDirection;
  targetPrice: number;
  priceAtCreate: number;
}

function AddForm({
  onSubmit,
  onCancel,
  getCurrentPrice,
}: {
  onSubmit: (draft: AddDraft) => void;
  onCancel: () => void;
  getCurrentPrice: (ticker: string) => number | null;
}) {
  const [draft, setDraft] = useState<AddDraft>({
    ticker: '',
    name: '',
    note: '',
    tag: '',
    thesis: '',
    enablePriceAnchor: true,
    direction: 'buy-below',
    targetPrice: 0,
    priceAtCreate: 0,
  });
  const [lookingUp, setLookingUp] = useState(false);

  const handleTickerBlur = async () => {
    if (!draft.ticker) return;
    setLookingUp(true);
    try {
      const cached = getCurrentPrice(draft.ticker);
      if (cached != null) {
        setDraft((d) => ({ ...d, priceAtCreate: d.priceAtCreate || cached, targetPrice: d.targetPrice || cached }));
        return;
      }
      const [result] = await fetchPricesForTickers([draft.ticker]);
      if (result) {
        setDraft((d) => ({
          ...d,
          priceAtCreate: d.priceAtCreate || result.price,
          targetPrice: d.targetPrice || result.price,
        }));
      }
    } finally {
      setLookingUp(false);
    }
  };

  const canSubmit = draft.ticker.trim().length > 0 && (!draft.enablePriceAnchor || draft.targetPrice > 0);

  return (
    <div className="glass-card p-5 border border-glass-border space-y-4">
      <h3 className="text-sm font-bold text-text-primary">New watchlist entry</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <LabeledInput
          label="Ticker"
          value={draft.ticker}
          onChange={(v) => setDraft((d) => ({ ...d, ticker: v.toUpperCase() }))}
          onBlur={handleTickerBlur}
          placeholder="MU"
        />
        <LabeledInput
          label="Name (optional)"
          value={draft.name}
          onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
          placeholder="Micron Technology"
        />
        <LabeledInput
          label="Tag (optional)"
          value={draft.tag}
          onChange={(v) => setDraft((d) => ({ ...d, tag: v }))}
          placeholder="Semiconductors"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
        <input
          type="checkbox"
          checked={draft.enablePriceAnchor}
          onChange={(e) => setDraft((d) => ({ ...d, enablePriceAnchor: e.target.checked }))}
          className="accent-accent"
        />
        Set a price anchor (alerts you when this trigger hits)
      </label>

      {draft.enablePriceAnchor && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-6 border-l-2 border-accent/30">
          <LabeledSelect
            label="Trigger"
            value={draft.direction}
            onChange={(v) => setDraft((d) => ({ ...d, direction: v as PriceAnchorDirection }))}
            options={[
              { value: 'buy-below', label: 'Buy if it drops to / below' },
              { value: 'buy-above', label: 'Buy on breakout above' },
              { value: 'sell-above', label: 'Sell if it climbs above' },
              { value: 'sell-below', label: 'Sell if it drops below' },
            ]}
          />
          <LabeledInput
            label="Target price"
            type="number"
            value={draft.targetPrice.toString()}
            onChange={(v) => setDraft((d) => ({ ...d, targetPrice: parseFloat(v) || 0 }))}
            placeholder="82.00"
          />
          <LabeledInput
            label="Price when set"
            type="number"
            value={draft.priceAtCreate.toString()}
            onChange={(v) => setDraft((d) => ({ ...d, priceAtCreate: parseFloat(v) || 0 }))}
            placeholder={lookingUp ? 'Looking up…' : 'Current'}
          />
        </div>
      )}

      <LabeledInput
        label="Thesis — one line, your voice (e.g. RAM→AI pivot, Wall St hasn’t caught up)"
        value={draft.thesis}
        onChange={(v) => setDraft((d) => ({ ...d, thesis: v }))}
        placeholder="Why you believe in this"
      />

      <LabeledInput
        label="Notes (optional) — what you want to remember if/when this triggers"
        value={draft.note}
        onChange={(v) => setDraft((d) => ({ ...d, note: v }))}
        placeholder="Don't chicken out this time."
      />

      <div className="flex items-center gap-3">
        <button
          onClick={() => canSubmit && onSubmit(draft)}
          disabled={!canSubmit}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          Save
        </button>
        <button onClick={onCancel} className="text-sm text-text-muted hover:text-text-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: 'text' | 'number';
}) {
  return (
    <label className="block">
      <span className="block term-label mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-glass-border text-sm text-text-primary focus:outline-none focus:border-accent"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block term-label mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-surface-0 border border-glass-border text-sm text-text-primary focus:outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Cards + empty state ──────────────────────────────────────────────────

function WatchlistCard({
  entry,
  currentPrice,
  onStatusChange,
  onDelete,
}: {
  entry: WatchlistEntry;
  currentPrice: number | null;
  onStatusChange: (id: string, status: WatchlistEntry['status']) => void;
  onDelete: (id: string) => void;
}) {
  const anchor = entry.priceAnchor;
  const isHit = !!anchor?.firstHitAt;
  const severity = isHit && anchor.direction.startsWith('buy') ? 'critical' : isHit ? 'warning' : 'info';

  const borderByTone: Record<string, string> = {
    critical: 'border-negative/40',
    warning: 'border-warning/30',
    info: 'border-glass-border',
  };
  const badgeByTone: Record<string, string> = {
    critical: 'bg-negative/20 text-negative',
    warning: 'bg-warning/20 text-warning',
    info: 'bg-accent/15 text-accent-light',
  };

  return (
    <div className={`glass-card p-5 border ${borderByTone[severity]}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-bold text-text-primary">{entry.ticker}</h3>
            <span className="text-xs text-text-muted">{entry.name}</span>
            {entry.tag && (
              <span className="cyber-chip">
                {entry.tag}
              </span>
            )}
            {isHit && (
              <span className={`cyber-chip ${badgeByTone[severity]}`}>
                {anchor!.direction.startsWith('buy') ? '▼' : '▲'} {anchor!.direction} triggered
              </span>
            )}
          </div>

          {/* Price line */}
          {anchor && (
            <div className="flex items-center gap-6 mt-3 text-sm flex-wrap">
              <PriceStat label="Target" value={`$${anchor.targetPrice.toFixed(2)}`} />
              <PriceStat
                label="Current"
                value={currentPrice != null ? `$${currentPrice.toFixed(2)}` : '—'}
                emphasize
              />
              <PriceStat
                label="Since you set it"
                value={
                  currentPrice != null && anchor.priceAtCreate > 0
                    ? `${(((currentPrice - anchor.priceAtCreate) / anchor.priceAtCreate) * 100).toFixed(1)}%`
                    : '—'
                }
                color={
                  currentPrice != null && anchor.priceAtCreate > 0
                    ? currentPrice >= anchor.priceAtCreate
                      ? 'text-positive'
                      : 'text-negative'
                    : undefined
                }
              />
              {anchor.firstHitAt && (
                <PriceStat
                  label="First hit"
                  value={new Date(anchor.firstHitAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                />
              )}
            </div>
          )}

          {entry.thesis?.text && (
            <p className="text-xs text-text-secondary italic leading-relaxed mt-3 pt-3 border-t border-white/5">
              <span className="term-label not-italic mr-2">
                Thesis
              </span>
              {entry.thesis.text}
            </p>
          )}

          {entry.note && (
            <p className="text-xs text-text-muted leading-relaxed mt-2">{entry.note}</p>
          )}

          {/* Action row */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            {entry.status !== 'converted' && (
              <button
                onClick={() => onStatusChange(entry.id, 'converted')}
                className="px-3 py-1 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent-light text-xs font-semibold transition-colors"
              >
                I bought it
              </button>
            )}
            {entry.status !== 'archived' && (
              <button
                onClick={() => onStatusChange(entry.id, 'archived')}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Archive (thesis broke)
              </button>
            )}
            {(entry.status === 'archived' || entry.status === 'converted') && (
              <button
                onClick={() => onStatusChange(entry.id, 'active')}
                className="text-xs text-text-muted hover:text-accent transition-colors"
              >
                Reactivate
              </button>
            )}
            <button
              onClick={() => onDelete(entry.id)}
              className="text-xs text-text-muted hover:text-negative transition-colors ml-auto"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceStat({
  label,
  value,
  color,
  emphasize,
}: {
  label: string;
  value: string;
  color?: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <div className="term-label">{label}</div>
      <div className={`mt-0.5 mono-num ${emphasize ? 'text-base font-bold' : 'text-sm font-medium'} ${color ?? 'text-text-primary'}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ filter, onOpenAdd }: { filter: FilterTab; onOpenAdd: () => void }) {
  if (filter === 'hit') {
    return (
      <div className="glass-card p-8 text-center border border-glass-border">
        <p className="text-sm text-text-secondary">Nothing triggered yet. When a price anchor fires, it lands here.</p>
      </div>
    );
  }
  if (filter === 'archive') {
    return (
      <div className="glass-card p-8 text-center border border-glass-border">
        <p className="text-sm text-text-secondary">Archived and converted entries show up here.</p>
      </div>
    );
  }
  return (
    <div className="glass-card p-8 text-center border border-glass-border">
      <div className="text-3xl mb-2">🎯</div>
      <h3 className="text-base font-bold text-text-primary">Your watchlist is empty.</h3>
      <p className="text-sm text-text-secondary max-w-md mx-auto mt-2 leading-relaxed">
        Add the tickers you have a real thesis on — the ones you'd kick yourself for missing. Set a price
        anchor and Iris will nudge you at the moment, not after.
      </p>
      <button
        onClick={onOpenAdd}
        className="mt-4 px-4 py-2 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors"
      >
        + Add your first
      </button>
    </div>
  );
}

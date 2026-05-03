import { useEffect, useMemo, useState } from 'react';
import type { Expense, IncomeSource } from '../../types/budget';
import { formatCurrency } from '../../utils/format';
import { getIncomeSources } from '../../stores/budgetStore';
import { getSetting, saveSetting } from '../../stores/portfolioStore';

interface Props {
  expenses: Expense[];
  now?: Date;
}

type SweepDest = 'hysa' | 'extra_payment' | 'sinking_fund' | 'investing' | 'manual';

const DEST_LABELS: Record<SweepDest, string> = {
  hysa: 'High-Yield Savings',
  extra_payment: 'Extra Mortgage Payment',
  sinking_fund: 'Stash',
  investing: 'Investing',
  manual: 'Manual / decide later',
};

const SETTING_FLOOR_OVERRIDE = 'variable_pay_floor_override';
const SETTING_SWEEP_DEST = 'variable_pay_sweep_dest';

export default function VariableSurplusCard({ expenses, now = new Date() }: Props) {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [floorOverride, setFloorOverride] = useState<number | null>(null);
  const [sweepDest, setSweepDest] = useState<SweepDest>('hysa');
  const [editingFloor, setEditingFloor] = useState(false);
  const [floorDraft, setFloorDraft] = useState('');

  useEffect(() => {
    getIncomeSources().then(setSources);
  }, [expenses]);

  useEffect(() => {
    (async () => {
      const stored = await getSetting<string>(SETTING_FLOOR_OVERRIDE);
      if (stored) setFloorOverride(Number(stored) || null);
      const dest = await getSetting<SweepDest>(SETTING_SWEEP_DEST);
      if (dest) setSweepDest(dest);
    })();
  }, []);

  // Find the largest base-subtype source (the user's primary paycheck stream).
  const baseSource = useMemo(() => {
    const bases = sources.filter(s => s.subtype === 'base' && s.status !== 'dismissed');
    return bases.sort((a, b) => b.avgAmount - a.avgAmount)[0] ?? null;
  }, [sources]);

  // Pull all paycheck-shaped inflows linked to the base source.
  const paychecks = useMemo(() => {
    if (!baseSource) return [] as Expense[];
    const ids = new Set(baseSource.expenseIds);
    return expenses
      .filter(e => ids.has(e.id))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [baseSource, expenses]);

  // Detect the current pay band: walk from the most recent paycheck backward,
  // grouping consecutive paychecks that are within ~6% of each other.
  // The most recent band = current pay rate. A raise (or pay-band change)
  // breaks the chain and we treat post-change paychecks as the new normal.
  //
  // We require the proposed new band to contain at least MIN_BAND_SIZE
  // paychecks before declaring a pay change. A 1–2 paycheck "band" is almost
  // always a bonus, RSU vest, commission spike, or off-cycle true-up — not a
  // sustained pay-rate change. If the new band is too small, we keep walking
  // backward to look for an earlier real change.
  const currentBand = useMemo(() => {
    if (paychecks.length === 0) return { paychecks: [] as Expense[], startDate: null as string | null };
    if (paychecks.length < 3) return { paychecks, startDate: paychecks[0]?.date ?? null };
    const sorted = paychecks; // already asc
    const MIN_BAND_SIZE = 3;
    let bandStartIdx = 0;
    for (let i = sorted.length - 1; i > 0; i--) {
      const cur = sorted[i].amount;
      const prev = sorted[i - 1].amount;
      const diff = Math.abs(cur - prev) / Math.min(cur, prev);
      // 6% threshold — wider than commission swings (~1-3%) but tight enough
      // to catch typical raises/role changes (5–20%).
      if (diff > 0.06) {
        const newBandSize = sorted.length - i;
        if (newBandSize >= MIN_BAND_SIZE) {
          bandStartIdx = i;
          break;
        }
        // Otherwise keep walking — this jump is too recent to confirm.
      }
    }
    return {
      paychecks: sorted.slice(bandStartIdx),
      startDate: bandStartIdx > 0 ? sorted[bandStartIdx].date : null,
    };
  }, [paychecks]);

  // Detected floor = min of current band. Override wins if user set one.
  const detectedFloor = useMemo(() => {
    if (currentBand.paychecks.length === 0) return baseSource?.amountMin ?? 0;
    return Math.min(...currentBand.paychecks.map(e => e.amount));
  }, [currentBand, baseSource]);
  const effectiveFloor = floorOverride ?? detectedFloor;

  // Compute above-floor totals across windows. Only count paychecks in the
  // current pay band — pre-raise paychecks aren't relevant once you've moved
  // to a new role / pay rate.
  const surplus = useMemo(() => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ninetyAgo = new Date(now.getTime() - 90 * 86_400_000);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const sumAboveFloor = (from: Date) =>
      currentBand.paychecks
        .filter(e => new Date(e.date) >= from)
        .reduce((s, e) => s + Math.max(0, e.amount - effectiveFloor), 0);

    return {
      thisMonth: sumAboveFloor(monthStart),
      last90: sumAboveFloor(ninetyAgo),
      ytd: sumAboveFloor(yearStart),
      bandCount: currentBand.paychecks.length,
      bandStart: currentBand.startDate,
    };
  }, [currentBand, effectiveFloor, now]);

  if (!baseSource || effectiveFloor <= 0) return null;

  const startEditFloor = () => {
    setFloorDraft(String(effectiveFloor));
    setEditingFloor(true);
  };

  const saveFloor = async () => {
    const n = Number(floorDraft);
    if (!Number.isFinite(n) || n < 0) {
      setEditingFloor(false);
      return;
    }
    setFloorOverride(n);
    await saveSetting(SETTING_FLOOR_OVERRIDE, String(n));
    setEditingFloor(false);
  };

  const clearFloorOverride = async () => {
    setFloorOverride(null);
    await saveSetting(SETTING_FLOOR_OVERRIDE, '');
    setEditingFloor(false);
  };

  const changeDest = async (d: SweepDest) => {
    setSweepDest(d);
    await saveSetting(SETTING_SWEEP_DEST, d);
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <div className="term-label">Variable Pay (Above Base)</div>
          <h2 className="text-lg font-semibold text-text-primary mt-0.5">Live on base, sweep the rest</h2>
          <p className="text-xs text-text-muted mt-1">
            Every paycheck above your true base goes here. Use this to size what should leave your spending account each month.
          </p>
        </div>
      </div>

      {/* Base floor row */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/[0.03] border border-glass-border mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted">Your base paycheck</div>
          {editingFloor ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-text-muted text-sm">$</span>
              <input
                type="number"
                step="0.01"
                value={floorDraft}
                onChange={e => setFloorDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveFloor(); if (e.key === 'Escape') setEditingFloor(false); }}
                autoFocus
                className="w-32 bg-surface-2 border border-glass-border rounded px-2 py-1 text-sm text-text-primary"
              />
              <button onClick={saveFloor} className="px-2 py-1 rounded bg-accent text-white text-xs font-semibold">Save</button>
              <button onClick={() => setEditingFloor(false)} className="px-2 py-1 rounded bg-surface-2 text-text-muted text-xs">Cancel</button>
              {floorOverride !== null && (
                <button onClick={clearFloorOverride} className="px-2 py-1 rounded text-xs text-text-muted hover:text-warning">Reset to detected</button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="mono-num text-base font-semibold text-text-primary">{formatCurrency(effectiveFloor)}</span>
              <span className="text-[10px] text-text-muted">
                {floorOverride !== null
                  ? '(your override)'
                  : surplus.bandStart
                    ? `(detected from ${surplus.bandCount} paychecks since ${surplus.bandStart} — pay change detected)`
                    : `(detected from ${surplus.bandCount} paychecks)`}
              </span>
              <button onClick={startEditFloor} className="text-[11px] text-accent hover:text-accent-light">edit</button>
            </div>
          )}
        </div>
      </div>

      {/* Above-base totals */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {[
          { label: 'This month', value: surplus.thisMonth },
          { label: 'Last 90 days', value: surplus.last90 },
          { label: 'Year to date', value: surplus.ytd },
        ].map((w, i) => (
          <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-glass-border">
            <div className="text-text-muted text-[10px] uppercase tracking-wider">{w.label}</div>
            <div className="text-lg font-bold text-positive mt-0.5 mono-num">+{formatCurrency(w.value)}</div>
            <div className="text-[10px] text-text-muted mt-0.5">above base</div>
          </div>
        ))}
      </div>

      {/* Sweep destination */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-glass-border/40">
        <div className="text-xs text-text-secondary">
          <strong>Send extras to:</strong>
          <span className="text-text-muted ml-1">where this surplus goes when you sweep manually</span>
        </div>
        <select
          value={sweepDest}
          onChange={e => changeDest(e.target.value as SweepDest)}
          className="bg-surface-2 border border-glass-border rounded px-2 py-1 text-sm text-text-primary outline-none focus:border-accent/50"
        >
          {(Object.keys(DEST_LABELS) as SweepDest[]).map(d => (
            <option key={d} value={d}>{DEST_LABELS[d]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

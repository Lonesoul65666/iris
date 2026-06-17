import { useEffect, useMemo, useState } from 'react';
import type { Expense, IncomeSource } from '../../types/budget';
import { formatCurrency } from '../../utils/format';
import { getIncomeSources } from '../../stores/budgetStore';
import { getSetting, saveSetting } from '../../stores/portfolioStore';
import { parseLocalDate, isRealExpense } from '../../utils/transactionAnalysis';
import { computeRecurringPaycheckFloor } from '../../utils/savingsScorecard';
import { laneOf, totalReserveSetAside } from '../../utils/budgetLanes';

interface Props {
  expenses: Expense[];
  now?: Date;
}

// Plain-language destination labels. The keys stay legacy ('hysa' /
// 'extra_payment' / 'sinking_fund' / 'investing') so existing user settings
// keep working without migration; only the human-readable labels changed.
// 'custom' is new — lets the user type their own destination when none of
// the defaults fit (e.g. "Vacation fund", "Wife's car", "Kids' 529").
type SweepDest = 'hysa' | 'extra_payment' | 'sinking_fund' | 'investing' | 'custom' | 'manual';

const DEST_LABELS: Record<SweepDest, string> = {
  hysa: 'Savings',
  extra_payment: 'Pay down debt',
  sinking_fund: 'Goal',
  investing: 'Invest',
  custom: 'Custom...',
  manual: 'Decide later',
};

const SETTING_FLOOR_OVERRIDE = 'variable_pay_floor_override';
const SETTING_SWEEP_DEST = 'variable_pay_sweep_dest';
const SETTING_SWEEP_DEST_CUSTOM = 'variable_pay_sweep_dest_custom_label';

export default function VariableSurplusCard({ expenses, now = new Date() }: Props) {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [floorOverride, setFloorOverride] = useState<number | null>(null);
  const [sweepDest, setSweepDest] = useState<SweepDest>('hysa');
  const [customLabel, setCustomLabel] = useState<string>('');
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
      const custom = await getSetting<string>(SETTING_SWEEP_DEST_CUSTOM);
      if (custom) setCustomLabel(custom);
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

  // Recurring base floor = the MODAL paycheck (rounded to $50), robust to the
  // semi-monthly base / base+variable alternation. The old approach walked
  // consecutive paychecks and "detected a pay change" whenever two adjacent
  // checks differed >6% — but Scott's mid-month check (~base) always alternates
  // with his end-month check (base+variable), so nearly every pair tripped it,
  // truncating YTD to the last ~3 paychecks and discarding most real surplus.
  const detectedFloor = useMemo(() => {
    const modal = computeRecurringPaycheckFloor(paychecks);
    return modal > 0 ? modal : (baseSource?.amountMin ?? 0);
  }, [paychecks, baseSource]);
  const effectiveFloor = floorOverride ?? detectedFloor;

  // Above-floor totals across windows — summed over ALL paychecks (no band
  // truncation). Each paycheck contributes max(0, amount - floor): a base-only
  // check contributes ~0, a base+variable check contributes the variable part.
  const surplus = useMemo(() => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ninetyAgo = new Date(now.getTime() - 90 * 86_400_000);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const sumAboveFloor = (from: Date) =>
      paychecks
        .filter(e => parseLocalDate(e.date) >= from)
        .reduce((s, e) => s + Math.max(0, e.amount - effectiveFloor), 0);

    return {
      thisMonth: sumAboveFloor(monthStart),
      last90: sumAboveFloor(ninetyAgo),
      ytd: sumAboveFloor(yearStart),
      paycheckCount: paychecks.length,
    };
  }, [paychecks, effectiveFloor, now]);

  // ── System 2 reconciliation: what's genuinely FREE to deploy ───────────────
  // The overage isn't all spendable — some already covered lumpy taxes/travel
  // beyond what the monthly set-aside (stashes) put away. Free to deploy =
  // overage YTD − max(0, lumpy spend YTD − set-aside accrued YTD). This is the
  // honest "fast-forward the vacation / the reno / invest it" number.
  const deploy = useMemo(() => {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const monthsElapsed = now.getMonth() + 1; // Jan → 1
    const lumpyYtd = expenses
      .filter(e => isRealExpense(e) && e.category !== 'travel_work'
        && laneOf(e.category) === 'reserve' && parseLocalDate(e.date) >= yearStart)
      .reduce((s, e) => s + Math.abs(e.amount), 0);
    const setAsideYtd = totalReserveSetAside() * monthsElapsed;
    const lumpyBeyondSetAside = Math.max(0, lumpyYtd - setAsideYtd);
    const free = Math.max(0, surplus.ytd - lumpyBeyondSetAside);
    return { lumpyBeyondSetAside, free };
  }, [expenses, surplus.ytd, now]);

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

  const changeCustomLabel = async (label: string) => {
    setCustomLabel(label);
    await saveSetting(SETTING_SWEEP_DEST_CUSTOM, label);
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
                  : `(recurring base across ${surplus.paycheckCount} paychecks)`}
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

      {/* Free to deploy — the honest, spendable slice of the overage (System 2's
          payoff): YTD above base, minus the lumpy taxes/travel it already had to
          cover beyond your set-aside. This is the "fast-forward a goal" number. */}
      <div className="p-4 rounded-lg bg-gradient-to-br from-accent/10 to-transparent border border-accent/20 mb-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Free to deploy (YTD)</div>
            <div className="text-2xl font-black text-accent mono-num mt-0.5">{formatCurrency(deploy.free)}</div>
          </div>
          <div className="text-[11px] text-text-secondary text-right max-w-[55%]">
            Fast-forward a goal — a vacation, the reno, or straight into investments.
          </div>
        </div>
        {deploy.lumpyBeyondSetAside > 0 && (
          <div className="text-[10px] text-text-muted mt-2 pt-2 border-t border-glass-border/40">
            {formatCurrency(surplus.ytd)} above base − {formatCurrency(deploy.lumpyBeyondSetAside)} that already
            covered taxes/travel beyond your set-aside = what's genuinely free.
          </div>
        )}
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

      {/* Inline label input — only when "Custom..." is the selected destination.
          Lets the user name where the surplus goes ("Vacation fund", "Wife's
          car", "Kids' 529") without forcing them into one of our defaults. */}
      {sweepDest === 'custom' && (
        <div className="flex items-center justify-end mt-2">
          <input
            type="text"
            value={customLabel}
            onChange={e => changeCustomLabel(e.target.value)}
            placeholder="Where should it go?"
            maxLength={40}
            className="bg-surface-2 border border-glass-border rounded px-2 py-1 text-sm text-text-primary outline-none focus:border-accent/50 w-64"
          />
        </div>
      )}
    </div>
  );
}

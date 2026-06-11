// Stashes — saving pots for lumpy life (taxes, trips, remodels, December).
// Lives on the Budget OVERVIEW (daily-visible, not buried in edit mode).
// Balances are DERIVED from contributions minus linked-category spend — see
// docs/stashes-design.md. Editing saves directly (same pattern as the old grid).
import { useMemo, useState } from 'react';
import type { Expense, Stash } from '../../types/budget';
import { formatCurrency } from '../../utils/format';
import { computeAllStashes, totalStashContributions } from '../../utils/stashMath';
import { currentMonthKey } from '../../utils/transactionAnalysis';
import { defaultBudgetBuckets } from '../../stores/budgetDefaults';

interface Props {
  stashes: Stash[];
  expenses: Expense[];
  onChange: (next: Stash[]) => void;
}

const STASH_COLORS = ['#0ea5e9', '#f59e0b', '#ef4444', '#10b981', '#a855f7', '#ec4899'];

// Category picker options (id/label/icon) — sourced from the bucket catalog so
// labels match everywhere. travel_work excluded (always reserve, never linkable).
const CATEGORY_OPTIONS = defaultBudgetBuckets
  .filter(b => b.category !== 'travel_work')
  .map(b => ({ id: b.category, label: b.label, icon: b.icon }));

function catMeta(id: string) {
  return CATEGORY_OPTIONS.find(c => c.id === id) ?? { id, label: id, icon: '📦' };
}

function monthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const mon = new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  return `${mon} '${String(y).slice(2)}`; // "Jun '26" — never mistakable for a day-of-month
}

export default function StashesCard({ stashes, expenses, onChange }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const statuses = useMemo(() => computeAllStashes(stashes, expenses), [stashes, expenses]);
  const totalMonthly = totalStashContributions(stashes);

  const update = (id: string, patch: Partial<Stash>) => {
    onChange(stashes.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addStash = () => {
    const id = `stash-${Date.now()}`;
    onChange([...stashes, {
      id,
      name: 'New stash',
      targetAmount: 0,
      currentBalance: 0,
      monthlyContribution: 0,
      color: STASH_COLORS[stashes.length % STASH_COLORS.length],
      categories: [],
      startMonth: currentMonthKey(),
      openingBalance: 0,
    }]);
    setExpanded(id);
  };

  const removeStash = (id: string, name: string) => {
    if (!window.confirm(`Delete the "${name}" stash? (Transactions are untouched — only the pot goes away.)`)) return;
    onChange(stashes.filter(s => s.id !== id));
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Stashes</h2>
          <p className="text-xs text-text-muted">
            Saving pots for lumpy bills — taxes, trips, remodels, December. The bill draws the stash down instead of busting the month.
          </p>
        </div>
        <button onClick={addStash}
          className="px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/40 text-accent text-xs font-semibold hover:bg-accent/25 transition-colors flex-shrink-0">
          + New stash
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {statuses.map(({ stash: sf, balance, derived, drawn, monthsAccrued, biggestDraw, targetProgress }) => {
          const isOpen = expanded === sf.id;
          const negative = balance < 0;
          return (
            <div key={sf.id} className={`p-4 rounded-xl bg-white/[0.03] border ${negative ? 'border-negative/40' : 'border-glass-border'}`}>
              {/* Name + contribution */}
              <div className="flex items-center justify-between mb-1 gap-2">
                <input value={sf.name} onChange={e => update(sf.id, { name: e.target.value })}
                  className="text-sm font-medium text-text-primary bg-transparent border border-transparent hover:border-glass-border focus:border-accent/50 rounded px-1 py-0.5 outline-none min-w-0 flex-1" />
                <div className="flex items-center gap-0.5 flex-shrink-0 text-xs text-text-muted">
                  <span>$</span>
                  <input type="number" value={sf.monthlyContribution}
                    onChange={e => update(sf.id, { monthlyContribution: Number(e.target.value) || 0 })}
                    className="w-16 bg-transparent border border-transparent hover:border-glass-border focus:border-accent/50 rounded px-1 py-0.5 text-right outline-none" />
                  <span>/mo</span>
                </div>
              </div>

              {/* Balance */}
              <div className={`text-2xl font-black mono-num ${negative ? 'text-negative' : 'text-positive'}`}>
                {negative ? '−' : ''}{formatCurrency(Math.abs(balance))}
              </div>
              <div className="text-[10px] text-text-muted mb-2">
                {derived
                  ? negative
                    ? 'Spent before it was saved — raise the contribution or the opening balance'
                    : `funded ${monthsAccrued} month${monthsAccrued === 1 ? '' : 's'}${drawn > 0 ? ` · ${formatCurrency(drawn)} drawn` : ''}`
                  : 'manual balance — open to start auto-tracking'}
              </div>

              {/* Target bar */}
              {targetProgress !== null && (
                <div className="w-full bg-white/10 rounded-full h-1.5 mb-2">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.round(targetProgress * 100)}%`, background: sf.color }} />
                </div>
              )}

              {/* Linked categories */}
              <div className="flex flex-wrap gap-1 mb-1">
                {(sf.categories ?? []).map(c => {
                  const meta = catMeta(c);
                  return (
                    <span key={c} className="cyber-chip border bg-white/5 border-white/15 text-text-secondary text-[10px]">
                      {meta.icon} {meta.label}
                      <button onClick={() => update(sf.id, { categories: (sf.categories ?? []).filter(x => x !== c) })}
                        className="ml-0.5 text-text-muted hover:text-negative" title="Unlink category">×</button>
                    </span>
                  );
                })}
                {biggestDraw && (
                  <span className="text-[10px] text-text-muted self-center">biggest hit {formatCurrency(biggestDraw.amount)} in {monthShort(biggestDraw.month)}</span>
                )}
              </div>

              {/* Expand / collapse */}
              <button onClick={() => setExpanded(isOpen ? null : sf.id)} className="text-[10px] text-accent hover:underline">
                {isOpen ? 'Done' : 'Settings'}
              </button>

              {isOpen && (
                <div className="mt-2 pt-2 border-t border-glass-border/40 space-y-2 text-xs text-text-muted">
                  {!derived && (
                    <button
                      onClick={() => update(sf.id, { startMonth: currentMonthKey(), openingBalance: sf.currentBalance || 0 })}
                      className="px-2 py-1 rounded bg-positive/15 border border-positive/40 text-positive text-[11px] font-semibold hover:bg-positive/25 transition-colors">
                      Start auto-tracking from this month
                    </button>
                  )}
                  {derived && (
                    <div className="flex items-center justify-between gap-2">
                      <span>Opening balance (what was already set aside in {monthShort(sf.startMonth!)})</span>
                      <span className="flex items-center gap-0.5">$
                        <input type="number" value={sf.openingBalance ?? 0}
                          onChange={e => update(sf.id, { openingBalance: Number(e.target.value) || 0 })}
                          className="w-20 bg-transparent border border-glass-border focus:border-accent/50 rounded px-1 py-0.5 text-right outline-none" />
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span>Goal (optional)</span>
                    <span className="flex items-center gap-0.5">$
                      <input type="number" value={sf.targetAmount}
                        onChange={e => update(sf.id, { targetAmount: Number(e.target.value) || 0 })}
                        className="w-20 bg-transparent border border-glass-border focus:border-accent/50 rounded px-1 py-0.5 text-right outline-none" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Cover a category</span>
                    <select
                      value=""
                      onChange={e => {
                        const c = e.target.value;
                        if (c && !(sf.categories ?? []).includes(c)) update(sf.id, { categories: [...(sf.categories ?? []), c] });
                      }}
                      className="bg-surface-2 border border-glass-border rounded px-1.5 py-1 text-[11px] text-text-secondary outline-none max-w-[160px]">
                      <option value="">choose…</option>
                      {CATEGORY_OPTIONS.filter(c => !(sf.categories ?? []).includes(c.id)).map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={() => removeStash(sf.id, sf.name)} className="text-[10px] text-negative/80 hover:text-negative">
                    Delete stash
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-text-muted">
        Total monthly stash contributions: <strong className="text-text-primary">{formatCurrency(totalMonthly)}</strong>
        <span className="text-text-muted/70"> — set aside off the top of Safe to Spend</span>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { BudgetBucket } from '../../types/budget';
import { formatCurrency } from '../../utils/format';

interface Props {
  buckets: BudgetBucket[];
  /** Today's date — defaults to now. Injected for testability. */
  now?: Date;
  /** Click a row to drill into the category. */
  onCategoryClick?: (category: string) => void;
}

type Status = 'over' | 'pacing' | 'ontrack' | 'untouched' | 'nobudget';

const STATUS_META: Record<Status, { label: string; pillCls: string; activePillCls: string; dotCls: string; barCls: string }> = {
  over:      { label: 'OVER',      pillCls: 'bg-negative/15 border-negative/40 text-negative',     activePillCls: 'bg-negative/30 border-negative text-negative ring-1 ring-negative/50',  dotCls: 'bg-negative',  barCls: 'bg-gradient-to-r from-red-500 to-rose-400' },
  pacing:    { label: 'PACING',    pillCls: 'bg-warning/15 border-warning/40 text-warning',         activePillCls: 'bg-warning/30 border-warning text-warning ring-1 ring-warning/50',     dotCls: 'bg-warning',   barCls: 'bg-gradient-to-r from-amber-500 to-yellow-400' },
  ontrack:   { label: 'ON TRACK',  pillCls: 'bg-positive/15 border-positive/40 text-positive',     activePillCls: 'bg-positive/30 border-positive text-positive ring-1 ring-positive/50', dotCls: 'bg-positive',  barCls: 'bg-gradient-to-r from-emerald-500 to-green-400' },
  untouched: { label: 'UNTOUCHED', pillCls: 'bg-white/5 border-white/15 text-text-muted',          activePillCls: 'bg-white/20 border-white/40 text-text-primary ring-1 ring-white/30',  dotCls: 'bg-white/30',  barCls: 'bg-white/20' },
  nobudget:  { label: 'NO BUDGET', pillCls: 'bg-accent/10 border-accent/30 text-accent-light',     activePillCls: 'bg-accent/30 border-accent text-accent-light ring-1 ring-accent/50',   dotCls: 'bg-accent',    barCls: 'bg-gradient-to-r from-indigo-500 to-blue-400' },
};

const STATUS_ORDER: Record<Status, number> = { over: 0, pacing: 1, ontrack: 2, untouched: 3, nobudget: 4 };
const ALL_STATUSES: Status[] = ['over', 'pacing', 'ontrack', 'untouched', 'nobudget'];

function classify(b: BudgetBucket, monthFraction: number): Status {
  if (b.monthlyBudget <= 0) return 'nobudget';
  if (b.monthlyActual <= 0) return 'untouched';
  if (b.monthlyActual > b.monthlyBudget) return 'over';
  // Exactly at budget = capped (fixed deposits like investing, autopay bills hit
  // their full amount and won't overshoot). PACING is only meaningful when
  // there's still headroom to overshoot.
  if (b.monthlyActual >= b.monthlyBudget) return 'ontrack';
  // PACING fires on EITHER condition: spending faster than calendar pace, OR
  // already burned through enough of the cap that the bucket needs attention.
  const expected = monthFraction * b.monthlyBudget;
  const overPace = b.monthlyActual > expected * 1.05;
  const nearCap = b.monthlyActual >= 0.85 * b.monthlyBudget;
  if (overPace || nearCap) return 'pacing';
  return 'ontrack';
}

export default function BudgetPulse({ buckets, now = new Date(), onCategoryClick }: Props) {
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthFraction = dayOfMonth / daysInMonth;

  const [activeFilters, setActiveFilters] = useState<Set<Status>>(new Set());

  const allRows = useMemo(() => {
    return buckets
      .map(b => ({ b, status: classify(b, monthFraction) }))
      .sort((x, y) => {
        const s = STATUS_ORDER[x.status] - STATUS_ORDER[y.status];
        if (s !== 0) return s;
        return y.b.monthlyActual - x.b.monthlyActual;
      });
  }, [buckets, monthFraction]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { over: 0, pacing: 0, ontrack: 0, untouched: 0, nobudget: 0 };
    for (const r of allRows) c[r.status]++;
    return c;
  }, [allRows]);

  const visibleRows = useMemo(() => {
    if (activeFilters.size === 0) return allRows;
    return allRows.filter(r => activeFilters.has(r.status));
  }, [allRows, activeFilters]);

  const toggleFilter = (s: Status) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const clearFilters = () => setActiveFilters(new Set());

  const totalBudget = buckets.reduce((s, b) => s + b.monthlyBudget, 0);
  const totalActual = buckets.reduce((s, b) => s + b.monthlyActual, 0);
  const totalOver = buckets
    .filter(b => b.monthlyBudget > 0 && b.monthlyActual > b.monthlyBudget)
    .reduce((s, b) => s + (b.monthlyActual - b.monthlyBudget), 0);

  if (allRows.length === 0) return null;

  const filtering = activeFilters.size > 0;

  return (
    <div className="glass-card p-6 cyber-scanlines relative">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="term-label">Budget Pulse</div>
          <h2 className="text-lg font-semibold text-text-primary mt-0.5">How the month is going</h2>
        </div>
        <div className="text-right">
          <div className="term-label">Day {dayOfMonth} / {daysInMonth}</div>
          <div className="mono-num text-sm text-text-secondary mt-0.5">
            {formatCurrency(totalActual)} <span className="text-text-muted">/ {formatCurrency(totalBudget)}</span>
          </div>
        </div>
      </div>

      {/* Summary chips — clickable filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {ALL_STATUSES.map(s => {
          const n = counts[s];
          if (n === 0) return null;
          const m = STATUS_META[s];
          const isActive = activeFilters.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleFilter(s)}
              className={`cyber-chip border transition-all ${isActive ? m.activePillCls : m.pillCls} hover:brightness-125 cursor-pointer`}
              aria-pressed={isActive}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${m.dotCls}`} />
              {n} {m.label}
            </button>
          );
        })}
        {filtering && (
          <button
            type="button"
            onClick={clearFilters}
            className="cyber-chip border bg-white/5 border-white/20 text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors"
          >
            × Clear
          </button>
        )}
        {filtering && (
          <span className="term-label ml-1">
            Showing {visibleRows.length} of {allRows.length}
          </span>
        )}
      </div>

      {/* Rows */}
      <div className="divide-y divide-glass-border/30">
        {visibleRows.map(({ b, status }) => {
          const pct = b.monthlyBudget > 0 ? Math.min(100, (b.monthlyActual / b.monthlyBudget) * 100) : 0;
          const expectedPct = monthFraction * 100;
          const m = STATUS_META[status];
          return (
            <button
              key={b.category}
              type="button"
              onClick={() => onCategoryClick?.(b.category)}
              className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-white/[0.03] rounded transition-colors text-left"
            >
              <span className="text-lg w-7 text-center flex-shrink-0">{b.icon}</span>
              <span className="text-sm text-text-secondary w-36 truncate flex-shrink-0">{b.label}</span>
              <span className="mono-num text-xs text-text-primary w-36 text-right whitespace-nowrap flex-shrink-0">
                {formatCurrency(b.monthlyActual)}
                <span className="text-text-muted"> / {b.monthlyBudget > 0 ? formatCurrency(b.monthlyBudget) : '—'}</span>
              </span>
              <div className="flex-1 bg-white/5 rounded-full h-2 relative overflow-hidden min-w-[60px]">
                {b.monthlyBudget > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-white/40 z-10"
                    style={{ left: `${expectedPct}%` }}
                    title={`Calendar pace: day ${dayOfMonth}/${daysInMonth}`}
                  />
                )}
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${m.barCls}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`cyber-chip border ${m.pillCls} flex-shrink-0 text-[10px]`}>
                <span className={`w-1 h-1 rounded-full ${m.dotCls}`} />
                {m.label}
              </span>
            </button>
          );
        })}
        {visibleRows.length === 0 && (
          <div className="text-center text-text-muted text-sm py-6">
            No buckets match the active filter.
          </div>
        )}
      </div>

      {/* Footer summary */}
      {totalOver > 0 && (
        <div className="mt-4 pt-3 border-t border-glass-border/40 flex items-center justify-between">
          <span className="term-label">Pulse summary</span>
          <span className="text-xs text-negative font-medium mono-num">
            +{formatCurrency(totalOver)} over across {counts.over} {counts.over === 1 ? 'category' : 'categories'}
          </span>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center gap-3 text-[10px] text-text-muted">
        <span className="flex items-center gap-1"><span className="w-px h-2.5 bg-white/40 inline-block" /> calendar pace tick</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning" /> over pace OR ≥85% of cap</span>
      </div>
    </div>
  );
}

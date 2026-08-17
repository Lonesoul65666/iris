import { useMemo, useState } from 'react';
import type { BudgetBucket } from '../../types/budget';
import { formatCurrency } from '../../utils/format';
import { laneOf, FIXED_OVER_TOLERANCE } from '../../utils/budgetLanes';
import type { StashCommitRun } from '../../utils/stashMath';

interface Props {
  buckets: BudgetBucket[];
  /** Today's date — defaults to now. Injected for testability. */
  now?: Date;
  /** Click a row to drill into the category. */
  onCategoryClick?: (category: string) => void;
  /** Net take-home — enables the "on pace for $X vs watermark" projection. */
  watermark?: number;
  /** The month is closed (viewing a past month). Freezes the read: no pace
   *  ticks, projections, or "trending to" — just the final over/under verdicts.
   *  This is what lets the Pulse persist across every month for continuity. */
  complete?: boolean;
  /** Month label ("June 2026") — shown instead of "Day N / M" when complete. */
  monthLabel?: string;
  /** Committed stash moves for the month (funded pots). Folded into the
   *  full-base view so the Pulse reflects the WHOLE watermark ($15,800): free =
   *  base − everyday − investing − committed. Climbs from $0 as pots are funded. */
  reserveSetAside?: number;
  /** The month's commit run — per-pot ask + commit state + the totals. Computed
   *  once in stashMath (computeCommitRun) so this footer and the Have-To's /
   *  Want-To's card can never show different numbers for the same month. */
  commitRun?: StashCommitRun;
  /** Commit/undo a stash's monthly move. Absent for the 'avg' view. */
  onCommitStash?: (stashId: string, amount: number) => void;
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

function classify(b: BudgetBucket, monthFraction: number, complete: boolean): Status {
  if (b.monthlyBudget <= 0) return 'nobudget';
  if (b.monthlyActual <= 0) return 'untouched';
  // FIXED-lane bills land once at (about) their full amount — daily-pace logic
  // is pure noise there (a mortgage paid on the 1st is not "pacing", it's the
  // bill landing as expected). Same tolerance the lane model uses everywhere.
  if (laneOf(b.category) === 'fixed') {
    return b.monthlyActual > b.monthlyBudget * FIXED_OVER_TOLERANCE ? 'over' : 'ontrack';
  }
  if (b.monthlyActual > b.monthlyBudget) return 'over';
  // Exactly at budget = capped (fixed deposits like investing, autopay bills hit
  // their full amount and won't overshoot). PACING is only meaningful when
  // there's still headroom to overshoot.
  if (b.monthlyActual >= b.monthlyBudget) return 'ontrack';
  // A CLOSED month has no "pacing" — it either busted its cap or it didn't.
  // Under budget at month-end is simply ON TRACK (the final verdict).
  if (complete) return 'ontrack';
  // PACING fires on EITHER condition: spending faster than calendar pace, OR
  // already burned through enough of the cap that the bucket needs attention.
  const expected = monthFraction * b.monthlyBudget;
  const overPace = b.monthlyActual > expected * 1.05;
  const nearCap = b.monthlyActual >= 0.85 * b.monthlyBudget;
  if (overPace || nearCap) return 'pacing';
  return 'ontrack';
}

export default function BudgetPulse({ buckets, now = new Date(), onCategoryClick, watermark, complete = false, monthLabel, reserveSetAside = 0, commitRun, onCommitStash }: Props) {
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // A closed month is fully elapsed — fraction 1 so pace logic reads as final.
  const monthFraction = complete ? 1 : dayOfMonth / daysInMonth;

  // Month-end projection — the "how am I TRENDING" number. Fixed bills count
  // once at max(budget, actual) — housing paid on the 1st must not project
  // ×2.7. Flexible spend projects linearly at the current daily pace. Reserve
  // lanes are excluded (lumpy by design, funded by set-asides). Suppressed for
  // closed months — there's nothing left to trend.
  const projection = useMemo(() => {
    if (complete || !watermark || watermark <= 0 || monthFraction >= 1) return null;
    let fixed = 0;
    let flexActual = 0;
    for (const b of buckets) {
      const lane = laneOf(b.category);
      // Lumpy (reserve) and uncapped (no-budget) money counts at what ALREADY
      // happened — never extrapolated (a $13k April tax payment would project
      // x2.7) and never skipped either, which is what used to make "trending to"
      // understate the month by everything unbudgeted.
      if (lane === 'reserve' || b.monthlyBudget <= 0) fixed += Math.max(0, b.monthlyActual);
      else if (lane === 'fixed') fixed += Math.max(b.monthlyBudget, b.monthlyActual);
      else flexActual += Math.max(0, b.monthlyActual);
    }
    const projected = fixed + flexActual / Math.max(monthFraction, 0.03);
    return { projected, under: projected <= watermark, delta: Math.abs(watermark - projected) };
  }, [buckets, watermark, monthFraction]);

  const [activeFilters, setActiveFilters] = useState<Set<Status>>(new Set());

  const allRows = useMemo(() => {
    return buckets
      .map(b => ({ b, status: classify(b, monthFraction, complete) }))
      .sort((x, y) => {
        const s = STATUS_ORDER[x.status] - STATUS_ORDER[y.status];
        if (s !== 0) return s;
        return y.b.monthlyActual - x.b.monthlyActual;
      });
  }, [buckets, monthFraction, complete]);

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
  // Headline "spent" = EVERY dollar, reserve included. That's the honest number.
  const totalActual = buckets.reduce((s, b) => s + b.monthlyActual, 0);
  // ⚠️ But HEADROOM must exclude reserve spend, or the same dollar is charged
  // twice: once as the committed set-aside (reserveSetAside) and again as the
  // payment. safeToSpend.ts is the canonical model —
  //   takeHome − fixedCommitment − reserveSetAside − flexSpent
  // — and its flexSpent counts only flexible-lane categories. Including reserve
  // actual here made April read "$0 still free" and "~$13k OVER" while
  // Safe-to-Spend on the same page said something else entirely.
  // So: reserve money is VISIBLE (its own row, and in the headline) but is not
  // subtracted from what's free. Including bucket-less FLEXIBLE spend, which
  // safeToSpend already counted, was the genuine half of that fix and stays.
  const reserveActual = buckets.reduce((s, b) => s + (laneOf(b.category) === 'reserve' ? b.monthlyActual : 0), 0);
  const nonReserveActual = totalActual - reserveActual;
  // Reflect the WHOLE base ($15,800), not just operating caps. Everyday spend +
  // reserves set-aside + what's still free = the full watermark. Falls back to
  // the operating-cap total only when no watermark is supplied.
  const hasBase = !!watermark && watermark > 0;
  const base = hasBase ? watermark! : totalBudget;
  // NOT clamped at zero any more. The clamp meant a busted month could only ever
  // say "$0 still free" — and for a CLOSED month the projection line is suppressed
  // by design, so that was the only headline a $14k overrun got. Say it plainly.
  const freeOfBase = hasBase ? watermark! - nonReserveActual - reserveSetAside : 0;
  const totalOver = buckets
    .filter(b => b.monthlyBudget > 0 && b.monthlyActual > b.monthlyBudget)
    .reduce((s, b) => s + (b.monthlyActual - b.monthlyBudget), 0);

  if (allRows.length === 0) return null;

  const filtering = activeFilters.size > 0;

  return (
    <div className="glass-card p-6 relative">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-2xl font-black text-accent-light leading-tight">Make Every Dolla Holla</h2>
          <div className="text-sm text-text-secondary mt-0.5">{complete ? 'How the month went' : "How's the month going"}</div>
        </div>
        <div className="text-right">
          <div className="term-label">{complete ? (monthLabel ?? 'Final') : `Day ${dayOfMonth} / ${daysInMonth}`}</div>
          <div className="mono-num text-sm text-text-secondary mt-0.5">
            {formatCurrency(totalActual)} <span className="text-text-muted">/ {formatCurrency(base)}</span>
          </div>
          {hasBase && (
            <div className="mono-num text-[11px] text-text-muted mt-0.5">
              {reserveSetAside > 0 && <>{formatCurrency(reserveSetAside)} committed · </>}
              {reserveActual > 0 && <>{formatCurrency(reserveActual)} lumpy · </>}
              {freeOfBase >= 0
                ? <>{formatCurrency(freeOfBase)} still free</>
                : <span className="text-negative font-semibold">{formatCurrency(Math.abs(freeOfBase))} OVER base</span>}
            </div>
          )}
          {projection && (
            <div className={`text-[11px] mt-0.5 mono-num font-medium ${projection.under ? 'text-positive' : 'text-negative'}`}>
              trending to ~{formatCurrency(projection.projected)} · {projection.under ? `${formatCurrency(projection.delta)} under` : `${formatCurrency(projection.delta)} OVER`} your watermark
            </div>
          )}
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
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer hover:brightness-125 ${isActive ? m.activePillCls : m.pillCls}`}
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
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold border bg-white/5 border-white/20 text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors"
          >
            × Clear
          </button>
        )}
        {filtering && (
          <span className="text-[11px] text-text-muted ml-1">
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
          // Where this category LANDS at the current daily pace — flexible
          // lanes only (fixed bills land once; reserves are lumpy by design).
          // Suppressed in the first ~3 days (one coffee would project wildly).
          const trendTo = !complete && laneOf(b.category) === 'flexible' && b.monthlyActual > 0 && b.monthlyBudget > 0
            && monthFraction >= 0.1 && monthFraction < 0.97
            ? b.monthlyActual / monthFraction
            : null;
          return (
            <button
              key={b.category}
              type="button"
              onClick={() => onCategoryClick?.(b.category)}
              className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-white/[0.03] rounded transition-colors text-left"
            >
              <span className="text-sm text-text-secondary w-36 truncate flex-shrink-0">{b.label}</span>
              <span className="mono-num text-xs text-text-primary w-36 text-right whitespace-nowrap flex-shrink-0">
                {formatCurrency(b.monthlyActual)}
                <span className="text-text-muted"> / {b.monthlyBudget > 0 ? formatCurrency(b.monthlyBudget) : '—'}</span>
              </span>
              <span
                className={`mono-num text-[10px] w-24 text-right whitespace-nowrap flex-shrink-0 ${trendTo !== null && trendTo > b.monthlyBudget ? 'text-negative' : 'text-text-muted'}`}
                title={trendTo !== null ? `At today's pace this lands at ${formatCurrency(trendTo)} by month end` : undefined}
              >
                {trendTo !== null ? `→ ${formatCurrency(trendTo)}` : ''}
              </span>
              <div className="flex-1 bg-white/5 rounded-full h-2 relative overflow-hidden min-w-[60px]">
                {!complete && b.monthlyBudget > 0 && (
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
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${m.pillCls} flex-shrink-0`}>
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

      {/* Have To's / Want To's — the commit run. Each row shows what the pot is
          ASKING for this month (computed from its live balance over the moves it
          has left), and once committed it shows what was ACTUALLY moved — the two
          used to be the same field, so a $640 move against a $240 plan reported
          $240 in the total Scott transfers from checking. */}
      {commitRun && commitRun.rows.length > 0 && onCommitStash && (
        <div className="mt-4 pt-4 border-t border-glass-border/40">
          <div className="flex items-baseline justify-between mb-3">
            <span className="term-label">Have To's / Want To's</span>
            {commitRun.pendingCount > 0 && (
              <span className="text-[11px] text-text-muted">
                {commitRun.pendingCount} still to commit · <span className="mono-num text-accent-light font-semibold">{formatCurrency(commitRun.remainingAsk)}</span>
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {commitRun.rows.map(({ stash: s, ask, committed, isCommitted }) => {
              const isHave = (s.kind ?? 'want_to') === 'have_to';
              const kc = isHave ? '#f59e0b' : '#a855f7';
              const amount = isCommitted ? committed : ask;
              return (
                <div key={s.id} className="flex items-center gap-3 py-1">
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: kc + '22', color: kc }}>{isHave ? 'Have' : 'Want'}</span>
                  <span className="text-sm text-text-secondary flex-1 truncate">{s.name}</span>
                  <span className={`mono-num text-sm ${isCommitted ? 'text-positive' : 'text-text-primary'}`}>{formatCurrency(amount)}</span>
                  <button
                    type="button"
                    onClick={() => amount > 0 && onCommitStash(s.id, amount)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors flex-shrink-0 ${isCommitted ? 'bg-positive/15 border-positive/40 text-positive hover:bg-negative/10 hover:text-negative hover:border-negative/30' : 'bg-accent/15 border-accent/40 text-accent-light hover:bg-accent/25'} ${amount <= 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title={isCommitted ? `Committed ${formatCurrency(committed)} — click to undo` : `Mark ${formatCurrency(ask)} moved to savings`}>
                    {isCommitted ? '✓ Committed · undo' : 'Commit'}
                  </button>
                </div>
              );
            })}
          </div>
          {/* THE number Scott transfers from checking into the special savings. */}
          <div className="mt-3 pt-2.5 border-t border-glass-border/30 flex items-baseline justify-between gap-3">
            <span className="text-xs text-text-secondary">
              Total committed — move this from checking
            </span>
            <span className="mono-num text-lg font-black text-positive">{formatCurrency(commitRun.committedTotal)}</span>
          </div>
          {commitRun.pendingCount > 0 && (
            <div className="text-[10px] text-text-muted mt-1 text-right">
              {formatCurrency(commitRun.committedTotal + commitRun.remainingAsk)} if you commit all {commitRun.pendingCount} remaining
            </div>
          )}
        </div>
      )}

      {/* Footer summary */}
      {totalOver > 0 && (
        <div className="mt-4 pt-3 border-t border-glass-border/40 flex items-center justify-between">
          <span className="term-label">Pulse summary</span>
          <span className="text-xs text-negative font-medium mono-num">
            +{formatCurrency(totalOver)} over across {counts.over} {counts.over === 1 ? 'category' : 'categories'}
          </span>
        </div>
      )}

      {/* Legend — pace/trend cues are meaningless for a closed month. */}
      <div className="mt-3 flex items-center gap-3 text-[10px] text-text-muted">
        {complete ? (
          <span>Final for {monthLabel ?? 'the month'} — locked to the targets that were set then.</span>
        ) : (
          <>
            <span className="flex items-center gap-1"><span className="w-px h-2.5 bg-white/40 inline-block" /> calendar pace tick</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning" /> over pace OR ≥85% of cap</span>
            <span className="flex items-center gap-1"><span className="mono-num">→</span> where it lands at today's pace (flexible spending)</span>
          </>
        )}
      </div>
    </div>
  );
}

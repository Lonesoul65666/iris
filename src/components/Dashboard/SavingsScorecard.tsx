import { useMemo } from 'react';
import { useAppData, formatCurrency } from '../../context/AppDataContext';
import { computeScorecard } from '../../utils/savingsScorecard';

/**
 * "Living under the base" — System 1 of the two-system model (Phase 1 V1).
 *
 * Did WE (joint, no-blame) keep our TOTAL real spend — everyday PLUS the lumpy
 * taxes/travel — under the guaranteed base each month? Bars show the raw truth:
 * a $26k tax/travel month towers over base in red; green only when total spend
 * genuinely came in under base. Variable pay covers the overage (System 2 — the
 * overage card), but this chart doesn't hide behind it. The solvency line states
 * the average and how much leans on the variable. The gamification skin (streaks,
 * milestones, confetti) is deliberately V2.
 */
export default function SavingsScorecard() {
  const { rawExpenses } = useAppData();
  const sc = useMemo(() => computeScorecard(rawExpenses || []), [rawExpenses]);

  if (sc.guaranteedBase === 0 || sc.months.length === 0) return null;

  const banked = sc.cumulativeBanked;
  const firstLabel = sc.months[0]?.label ?? '';
  const trendTxt = sc.trend === 'better' ? 'spending less ↓' : sc.trend === 'worse' ? 'spending more ↑' : 'about flat';
  const trendCls = sc.trend === 'better' ? 'text-positive' : sc.trend === 'worse' ? 'text-negative' : 'text-text-secondary';
  // Scale bar height to the worst month so the big tax/travel months tower and
  // the under-base months sit short — the visceral over/under picture.
  const maxAbs = Math.max(1, ...sc.months.map((m) => Math.abs(m.surplusVsBase)));

  return (
    <div className="glass-card p-6 relative overflow-hidden">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="min-w-0">
          <div className="term-label">Living under the base</div>
          <div className="text-xs text-text-muted mt-1">
            Base <span className="text-text-secondary font-medium mono-num">{formatCurrency(sc.guaranteedBase)}/mo</span>
            <span className="text-text-muted/70"> · green = total spend under base · variable covers the rest</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="term-label">Banked since {firstLabel}</div>
          <div className={`text-xl font-black mono-num ${banked >= 0 ? 'text-positive' : 'text-negative'}`}>
            {banked >= 0 ? '+' : '−'}{formatCurrency(Math.abs(banked))}
          </div>
        </div>
      </div>

      {/* Month strip — green = total spend under base, red = over (taller = further
          over). Tooltip breaks total into everyday + taxes/travel. Partial dimmed. */}
      <div className="flex items-end gap-1 h-20">
        {sc.months.map((m) => {
          const under = m.surplusVsBase >= 0;
          const mag = Math.abs(m.surplusVsBase) / maxAbs;
          const h = 14 + Math.round(mag * 58);
          return (
            <div
              key={m.month}
              className="flex-1 flex flex-col items-center justify-end relative group"
              title={`${m.label}: spent ${formatCurrency(m.totalSpend)} (${formatCurrency(m.spend)} everyday${m.reserveSpend > 0 ? ` + ${formatCurrency(m.reserveSpend)} taxes/travel` : ''}) — ${under ? 'under' : 'over'} base by ${formatCurrency(Math.abs(m.surplusVsBase))}${m.partial ? ' · in progress' : ''}`}
            >
              <div
                className={`w-full rounded-t transition-all ${m.partial ? 'opacity-40' : ''} ${under ? 'bg-positive' : 'bg-negative'}`}
                style={{ height: `${h}px` }}
              />
              <div className="text-[8px] text-text-muted mt-1 tabular-nums">{m.month.slice(5)}</div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted mt-3 pt-3 border-t border-glass-border">
        <span>Under base <span className="text-text-secondary font-medium">{sc.monthsUnderBase}/{sc.fullMonthCount}</span> months</span>
        {sc.lastFull && sc.priorFull && (
          <span>
            Total spend: <span className={trendCls}>{trendTxt}</span>
            <span className="text-text-muted/70"> ({formatCurrency(sc.lastFull.totalSpend)} vs {formatCurrency(sc.priorFull.totalSpend)})</span>
          </span>
        )}
      </div>

      {/* Solvency line — calm, never an alarm. The bars already show the raw truth;
          this states the average total spend vs base and the variable lean. */}
      {sc.fullMonthCount > 0 && sc.solvency.avgTotalSpend > 0 && (
        <div className="text-[11px] leading-relaxed text-text-muted/80 mt-3 pt-3 border-t border-glass-border/60">
          You spend about{' '}
          <span className="text-text-secondary font-medium mono-num">{formatCurrency(sc.solvency.avgTotalSpend)}/mo</span>{' '}
          on average (everyday + taxes/travel) against a{' '}
          <span className="text-text-secondary font-medium mono-num">{formatCurrency(sc.solvency.base)}/mo</span> base
          {sc.solvency.variableLean > 0 ? (
            <> — about <span className="text-text-secondary font-medium mono-num">{formatCurrency(sc.solvency.variableLean)}/mo</span> over guaranteed income, covered by variable pay.</>
          ) : (
            <> — under guaranteed income on average.</>
          )}
        </div>
      )}
    </div>
  );
}

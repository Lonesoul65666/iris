import { useMemo } from 'react';
import { useAppData, formatCurrency } from '../../context/AppDataContext';
import { computeScorecard } from '../../utils/savingsScorecard';

/**
 * "Living under the guarantee" — the Budget Engine's payoff (Phase 1 V1).
 *
 * Are we spending under our GUARANTEED base income each month, and what have we
 * banked? Base = steady paychecks (variable/RSU = surplus, not counted). Honest,
 * functional V1 — green/red month strip + cumulative banked + trend. The
 * gamification skin (streaks, milestones, confetti) is deliberately V2.
 */
export default function SavingsScorecard() {
  const { rawExpenses } = useAppData();
  const sc = useMemo(() => computeScorecard(rawExpenses || []), [rawExpenses]);

  if (sc.guaranteedBase === 0 || sc.months.length === 0) return null;

  const banked = sc.cumulativeBanked;
  const firstLabel = sc.months[0]?.label ?? '';
  const trendTxt = sc.trend === 'better' ? 'spending less ↓' : sc.trend === 'worse' ? 'spending more ↑' : 'about flat';
  const trendCls = sc.trend === 'better' ? 'text-positive' : sc.trend === 'worse' ? 'text-negative' : 'text-text-secondary';

  return (
    <div className="glass-card p-6 relative overflow-hidden">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="min-w-0">
          <div className="term-label">Living under the guarantee</div>
          <div className="text-xs text-text-muted mt-1">
            Guaranteed base <span className="text-text-secondary font-medium mono-num">{formatCurrency(sc.guaranteedBase)}/mo</span>
            <span className="text-text-muted/70"> · variable/RSU = surplus</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="term-label">Banked since {firstLabel}</div>
          <div className={`text-xl font-black mono-num ${banked >= 0 ? 'text-positive' : 'text-negative'}`}>
            {banked >= 0 ? '+' : '−'}{formatCurrency(Math.abs(banked))}
          </div>
        </div>
      </div>

      {/* Month strip — green = lived under base, red = over. Partial month dimmed. */}
      <div className="flex items-end gap-1 h-16">
        {sc.months.map((m) => {
          const under = m.surplusVsBase >= 0;
          const mag = Math.min(1, Math.abs(m.surplusVsBase) / 10000);
          const h = 18 + Math.round(mag * 46);
          return (
            <div
              key={m.month}
              className="flex-1 flex flex-col items-center justify-end relative group"
              title={`${m.label}: spent ${formatCurrency(m.spend)}${m.reserveSpend > 0 ? ` (+${formatCurrency(m.reserveSpend)} from reserves)` : ''} — ${under ? 'under' : 'over'} base by ${formatCurrency(Math.abs(m.surplusVsBase))}${m.partial ? ' · in progress' : ''}`}
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
            Trend: <span className={trendCls}>{trendTxt}</span>
            <span className="text-text-muted/70"> ({formatCurrency(sc.lastFull.spend)} vs {formatCurrency(sc.priorFull.spend)})</span>
          </span>
        )}
      </div>
    </div>
  );
}

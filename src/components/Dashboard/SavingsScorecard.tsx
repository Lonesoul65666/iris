import { useMemo } from 'react';
import { useAppData, formatCurrency } from '../../context/AppDataContext';
import { computeScorecard } from '../../utils/savingsScorecard';
import { totalReserveSetAside } from '../../utils/budgetLanes';

/**
 * "Living under the base" — System 1 of the two-system model (Phase 1 V1).
 *
 * Did WE (joint, no-blame) keep our everyday spending under the guaranteed base
 * AFTER setting aside for the lumpy stuff (taxes/travel)? Base = steady paychecks;
 * variable/RSU is System 2 (the overage card), not counted here. The lumpy spend
 * the set-aside funds draws the stash/overage, so a planned tax payment never
 * paints a month red — but the solvency line keeps this winnable headline honest
 * about how much of the FULL life leans on the variable. The gamification skin
 * (streaks, milestones, confetti) is deliberately V2.
 */
export default function SavingsScorecard() {
  const { rawExpenses } = useAppData();
  const setAside = totalReserveSetAside();
  const sc = useMemo(
    () => computeScorecard(rawExpenses || [], { setAside }),
    [rawExpenses, setAside],
  );

  if (sc.guaranteedBase === 0 || sc.months.length === 0) return null;

  const banked = sc.cumulativeBanked;
  const firstLabel = sc.months[0]?.label ?? '';
  const trendTxt = sc.trend === 'better' ? 'spending less ↓' : sc.trend === 'worse' ? 'spending more ↑' : 'about flat';
  const trendCls = sc.trend === 'better' ? 'text-positive' : sc.trend === 'worse' ? 'text-negative' : 'text-text-secondary';

  return (
    <div className="glass-card p-6 relative overflow-hidden">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="min-w-0">
          <div className="term-label">Living under the base</div>
          <div className="text-xs text-text-muted mt-1">
            Base <span className="text-text-secondary font-medium mono-num">{formatCurrency(sc.guaranteedBase)}/mo</span>
            {sc.setAside > 0 && (
              <span className="text-text-muted/70"> − {formatCurrency(sc.setAside)} set aside</span>
            )}
            <span className="text-text-muted/70"> · variable = System 2</span>
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
            Everyday spend: <span className={trendCls}>{trendTxt}</span>
            <span className="text-text-muted/70"> ({formatCurrency(sc.lastFull.spend)} vs {formatCurrency(sc.priorFull.spend)})</span>
          </span>
        )}
      </div>

      {/* Solvency truth — calm, never an alarm. Keeps the winnable headline above
          honest about how much of the FULL life the guaranteed base really carries. */}
      {sc.fullMonthCount > 0 && sc.solvency.trueLifeCost > 0 && (
        <div className="text-[11px] leading-relaxed text-text-muted/80 mt-3 pt-3 border-t border-glass-border/60">
          {sc.solvency.overhead >= 0 ? (
            <>Base{sc.setAside > 0 ? ' + set-aside' : ''} covers the everyday with about{' '}
            <span className="text-text-secondary font-medium mono-num">{formatCurrency(sc.solvency.overhead)}/mo</span> to spare. </>
          ) : (
            <>Everyday spend runs about{' '}
            <span className="text-text-secondary font-medium mono-num">{formatCurrency(Math.abs(sc.solvency.overhead))}/mo</span> over base{sc.setAside > 0 ? ' after the set-aside' : ''}. </>
          )}
          Full life averages{' '}
          <span className="text-text-secondary font-medium mono-num">{formatCurrency(sc.solvency.trueLifeCost)}/mo</span>{' '}
          (taxes &amp; travel included)
          {sc.solvency.variableLean > 0 && (
            <> — about <span className="text-text-secondary font-medium mono-num">{formatCurrency(sc.solvency.variableLean)}/mo</span> of it leans on variable pay.</>
          )}
          {sc.solvency.variableLean === 0 && <>.</>}
        </div>
      )}
    </div>
  );
}

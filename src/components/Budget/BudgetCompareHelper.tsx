// "Don't plan blind" helper — sits atop the budget editor. Shows how LAST month
// actually landed vs your plan and suggests adapting each category's OWN target
// toward reality — meet the plan and the actual in the middle. No cross-bucket
// transfers, and it never touches the untouchable fun-money pots. (Scott, 2026-07-05)
import { formatCurrency } from '../../utils/format';
import type { BudgetComparison } from '../../utils/budgetComparison';

interface Props {
  comparison: BudgetComparison;
  /** Set ONE category's planned target to the suggested value. */
  onApplyTweak: (category: string, newTarget: number) => void;
  onApplyAll: () => void;
}

export default function BudgetCompareHelper({ comparison, onApplyTweak, onApplyAll }: Props) {
  const { hasHistory, lastMonthLabel, rows, suggestions } = comparison;
  if (!hasHistory) return null;

  const over = rows.filter(r => r.status === 'over').sort((a, b) => b.deltaVsTarget - a.deltaVsTarget);
  const under = rows.filter(r => r.status === 'under').sort((a, b) => a.deltaVsTarget - b.deltaVsTarget);
  if (over.length === 0 && under.length === 0) return null;

  return (
    <div className="glass-card p-5 mb-4 border border-accent/30">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-bold text-text-primary">How {lastMonthLabel} actually landed</h2>
          <p className="text-xs text-text-muted mt-0.5">Adapt each target toward what really happened — meet last month in the middle.</p>
        </div>
        {suggestions.length > 0 && (
          <button onClick={onApplyAll}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-light text-white transition-colors flex-shrink-0">
            Apply all {suggestions.length}
          </button>
        )}
      </div>

      {/* Over / under columns — informational, neutral framing (nothing gets raided) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg border border-negative/25 bg-negative/[0.06] p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-negative mb-1.5">Over plan</div>
          {over.length === 0
            ? <div className="text-[11px] text-text-muted italic">Nothing over — nice.</div>
            : over.map(r => (
              <div key={r.category} className="flex items-center justify-between gap-2 text-xs py-0.5">
                <span className="text-text-secondary truncate">{r.icon} {r.label}</span>
                <span className="mono-num text-negative font-semibold flex-shrink-0">
                  +{formatCurrency(r.deltaVsTarget)} <span className="text-text-muted font-normal">({formatCurrency(r.lastMonthActual)})</span>
                </span>
              </div>
            ))}
        </div>
        <div className="rounded-lg border border-positive/25 bg-positive/[0.06] p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-positive mb-1.5">Under plan</div>
          {under.length === 0
            ? <div className="text-[11px] text-text-muted italic">Nothing left on the table.</div>
            : under.map(r => (
              <div key={r.category} className="flex items-center justify-between gap-2 text-xs py-0.5">
                <span className="text-text-secondary truncate">{r.icon} {r.label}</span>
                <span className="mono-num text-positive font-semibold flex-shrink-0">
                  {formatCurrency(r.deltaVsTarget)} <span className="text-text-muted font-normal">({formatCurrency(r.lastMonthActual)})</span>
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Per-category target tweaks — meet in the middle */}
      {suggestions.length > 0 && (
        <div>
          <div className="term-label mb-1.5">Suggested targets — meet in the middle</div>
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <div key={s.category}
                className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] border border-glass-border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-text-primary">
                    {s.label}: <span className="mono-num text-text-muted">{formatCurrency(s.currentTarget)}</span>
                    <span className="text-text-muted"> → </span>
                    <span className={`mono-num font-semibold ${s.kind === 'raise' ? 'text-accent-light' : 'text-positive'}`}>{formatCurrency(s.suggestedTarget)}</span>
                  </div>
                  <div className="text-[10px] text-text-muted truncate">{s.reason}</div>
                </div>
                <button onClick={() => onApplyTweak(s.category, s.suggestedTarget)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-accent/15 hover:bg-accent/25 text-accent transition-colors flex-shrink-0">
                  Apply
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

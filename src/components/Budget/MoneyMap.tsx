import { formatCurrency } from '../../utils/format';

/**
 * Money Map — "how's the month going" against the guaranteed BASE ($15,800).
 * Zero-based and ACTUAL (not allocation): the base is carved into where money
 * REALLY went this month — everyday SPENT + investing + reserves set aside —
 * and whatever's left is the WIN. Land near $0 = every dollar got a job; come in
 * under = you beat the base → deploy the winnings (invest more, fund a trip,
 * enjoy it). Variable/commission pay is System 2 (separate card), not counted
 * here. This is the headline frame — the bucket-by-bucket Pulse below is detail.
 *
 * Investing is CONFIRMABLE, not inferred: the $1,000 is a PLAN until Scott taps
 * ✓ (Fidelity alerts him the transfer landed). Confirming doesn't change the
 * math — it turns the slice from "planned" (dashed) into trusted "confirmed".
 */
interface Props {
  income: number;             // base net take-home (the $15,800)
  everydayBudget: number;     // operating budget, excl. investing (the target)
  everydaySpent: number;      // operating actual so far, excl. investing
  investing: number;          // planned monthly investing
  investingConfirmed: boolean;// has Scott confirmed it moved this month?
  onToggleInvesting?: () => void;
  reserveSetAside: number;    // stash contributions (taxes + trips)
  inProgress: boolean;        // is this the live, not-yet-complete month?
}

export default function MoneyMap({
  income, everydayBudget, everydaySpent, investing, investingConfirmed,
  onToggleInvesting, reserveSetAside, inProgress,
}: Props) {
  if (income <= 0) return null;
  // Zero-based on ACTUALS: what's left of the base after where money really went.
  const deployed = everydaySpent + investing + reserveSetAside;
  const leftover = Math.round(income - deployed);
  const win = leftover >= 0;

  const segs = [
    { key: 'everyday',  label: 'Everyday',  amt: Math.round(everydaySpent),   cls: 'from-rose-500 to-pink-500',     dashed: false,
      note: `spent · ${formatCurrency(everydayBudget)} budget` },
    { key: 'investing', label: 'Investing', amt: Math.round(investing),        cls: 'from-violet-500 to-indigo-500', dashed: !investingConfirmed,
      note: investingConfirmed ? '✓ confirmed in' : 'planned — confirm it' },
    { key: 'reserves',  label: 'Reserves',  amt: Math.round(reserveSetAside),  cls: 'from-amber-500 to-yellow-400',  dashed: false,
      note: 'taxes + trips set aside' },
    { key: 'free',      label: win ? 'Free' : 'Over base', amt: Math.abs(leftover),
      cls: win ? 'from-emerald-500 to-teal-400' : 'from-red-600 to-red-500', dashed: false,
      note: win ? (inProgress ? 'still in play' : 'the win — deploy it') : 'trim to fit' },
  ];
  // Bar denominator: income, unless actual deployment has run past it.
  const denom = Math.max(income, deployed, 1);

  return (
    <div className="glass-card p-6">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <div>
          <div className="term-label">How the month's going · vs your {formatCurrency(income)} base</div>
          <h2 className="text-lg font-semibold text-text-primary mt-0.5">Where your {formatCurrency(income)} went</h2>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="term-label">{win ? (inProgress ? 'Free so far' : 'You beat the base by') : 'Over base'}</div>
          <div className={`text-2xl font-black mono-num ${win ? 'text-positive' : 'text-negative'}`}>
            {win ? '' : '−'}{formatCurrency(Math.abs(leftover))}
          </div>
        </div>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Your base, carved into where it really went. Land near <span className="text-text-secondary">$0</span> and every dollar had a job; come in under and the <span className="text-positive">green</span> is yours to deploy — invest more, fund a trip, or just enjoy it.
      </p>

      <div className="flex h-9 rounded-lg overflow-hidden bg-surface-2 border border-glass-border">
        {segs.filter(s => s.amt > 0).map(s => (
          <div key={s.key}
            className={`bg-gradient-to-r ${s.cls} border-l border-black/20 first:border-l-0 transition-all ${s.dashed ? 'opacity-50' : ''}`}
            style={{ width: `${(s.amt / denom) * 100}%`, ...(s.dashed ? { backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 6px, transparent 6px 12px)' } : {}) }}
            title={`${s.label}: ${formatCurrency(s.amt)}`} />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {segs.map(s => (
          <div key={s.key}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`w-2.5 h-2.5 rounded-sm bg-gradient-to-r ${s.cls} ${s.dashed ? 'opacity-50' : ''}`} />
              <span className="text-[11px] text-text-muted uppercase tracking-wider">{s.label}</span>
            </div>
            <div className="mono-num text-text-primary font-semibold">{formatCurrency(s.amt)}</div>
            <div className={`text-[10px] ${s.key === 'investing' && investingConfirmed ? 'text-positive/80' : 'text-text-muted'}`}>{s.note}</div>
            {s.key === 'investing' && investing > 0 && onToggleInvesting && (
              <button
                onClick={onToggleInvesting}
                className={`mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                  investingConfirmed
                    ? 'border-positive/30 text-positive/80 hover:bg-negative/10 hover:text-negative hover:border-negative/30'
                    : 'border-violet-400/40 text-violet-300 hover:bg-violet-500/15'
                }`}
                title={investingConfirmed ? 'Undo — mark as not yet moved' : 'Mark this month’s investment as moved (Fidelity confirmed)'}
              >
                {investingConfirmed ? '✓ Confirmed — undo' : 'Confirm deposit'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

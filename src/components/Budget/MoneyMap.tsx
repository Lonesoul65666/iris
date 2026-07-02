import { formatCurrency } from '../../utils/format';

/**
 * Money Map — "how's the month going" against the guaranteed BASE ($15,800).
 * Zero-based and ACTUAL (not allocation): the base is carved into where money
 * REALLY went this month — everyday SPENT + investing + reserves set aside —
 * and whatever's left is the WIN. Land near $0 = every dollar got a job; come in
 * under = you beat the base → deploy the winnings. Variable/commission pay is
 * System 2 (separate card), not counted here.
 *
 * Investing is REAL-only (Scott: "don't pull it until it's real"): it counts
 * toward "deployed" ONLY when the feed saw the transfer (status 'feed') or Scott
 * checked it off ('confirmed'). While 'planned', it is NOT deployed — the $1,000
 * stays in your Free until it actually moves — and shows a greyed "planned"
 * amount with a Confirm button.
 */
type InvestingStatus = 'feed' | 'confirmed' | 'planned';

interface Props {
  income: number;             // base net take-home (the $15,800)
  everydayBudget: number;     // operating budget, excl. investing (the target)
  everydaySpent: number;      // operating actual so far, excl. investing
  investing: number;          // investing that COUNTS (real: feed or confirmed; else 0)
  investingPlanned: number;   // the intended monthly investing (Settings)
  investingStatus: InvestingStatus;
  onToggleInvesting?: () => void;
  reserveSetAside: number;    // stash contributions (taxes + trips)
  inProgress: boolean;        // is this the live, not-yet-complete month?
}

export default function MoneyMap({
  income, everydayBudget, everydaySpent, investing, investingPlanned, investingStatus,
  onToggleInvesting, reserveSetAside, inProgress,
}: Props) {
  if (income <= 0) return null;
  // Zero-based on ACTUALS: what's left of the base after where money really went.
  // Investing only counts when real, so a planned-but-not-moved deposit stays in Free.
  const deployed = everydaySpent + investing + reserveSetAside;
  const leftover = Math.round(income - deployed);
  const win = leftover >= 0;

  const investNote = investingStatus === 'feed' ? '✓ in — from Fidelity'
    : investingStatus === 'confirmed' ? '✓ confirmed in'
    : 'planned — not moved yet';

  const segs = [
    { key: 'everyday',  label: 'Everyday',  amt: Math.round(everydaySpent),   legendAmt: Math.round(everydaySpent),
      cls: 'from-rose-500 to-pink-500',     note: `spent · ${formatCurrency(everydayBudget)} budget` },
    { key: 'investing', label: 'Investing', amt: Math.round(investing),
      // Bar/leftover use the real (counted) amount; the legend shows the planned
      // figure while it's pending so you can see the intent + confirm it.
      legendAmt: investingStatus === 'planned' ? Math.round(investingPlanned) : Math.round(investing),
      cls: 'from-violet-500 to-indigo-500', note: investNote },
    { key: 'reserves',  label: 'Reserves',  amt: Math.round(reserveSetAside),  legendAmt: Math.round(reserveSetAside),
      cls: 'from-amber-500 to-yellow-400',  note: 'taxes + trips set aside' },
    { key: 'free',      label: win ? 'Free' : 'Over base', amt: Math.abs(leftover), legendAmt: Math.abs(leftover),
      cls: win ? 'from-emerald-500 to-teal-400' : 'from-red-600 to-red-500',
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
            className={`bg-gradient-to-r ${s.cls} border-l border-black/20 first:border-l-0 transition-all`}
            style={{ width: `${(s.amt / denom) * 100}%` }}
            title={`${s.label}: ${formatCurrency(s.amt)}`} />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {segs.map(s => {
          const pending = s.key === 'investing' && investingStatus === 'planned';
          const isRealInvest = s.key === 'investing' && (investingStatus === 'feed' || investingStatus === 'confirmed');
          return (
            <div key={s.key}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-2.5 h-2.5 rounded-sm bg-gradient-to-r ${s.cls} ${pending ? 'opacity-40' : ''}`} />
                <span className="text-[11px] text-text-muted uppercase tracking-wider">{s.label}</span>
              </div>
              <div className={`mono-num font-semibold ${pending ? 'text-text-muted' : 'text-text-primary'}`}>{formatCurrency(s.legendAmt)}</div>
              <div className={`text-[10px] ${isRealInvest ? 'text-positive/80' : 'text-text-muted'}`}>{s.note}</div>
              {s.key === 'investing' && investingPlanned > 0 && onToggleInvesting && (
                <button
                  onClick={onToggleInvesting}
                  className={`mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                    investingStatus === 'confirmed'
                      ? 'border-positive/30 text-positive/80 hover:bg-negative/10 hover:text-negative hover:border-negative/30'
                      : 'border-violet-400/40 text-violet-300 hover:bg-violet-500/15'
                  }`}
                  title={investingStatus === 'confirmed' ? 'Undo — mark as not yet moved' : 'Mark this month’s investment as moved'}
                >
                  {investingStatus === 'confirmed' ? '✓ Confirmed — undo' : 'Confirm deposit'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

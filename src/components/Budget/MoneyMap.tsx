import { formatCurrency } from '../../utils/format';

/**
 * Money Map — "where your $15,800 goes." Every dollar of the guaranteed BASE,
 * given a job: everyday spending + investing + reserve set-asides + what's left.
 * The whole bar sums to income, so you can actually track where it all lands.
 * Leftover is the WIN — money to deploy (invest more, add to a trip, enjoy it).
 * The goal: trim "everyday" over time → the Free slice grows. Variable pay is
 * separate (System 2) — this is the base picture.
 */
interface Props {
  income: number;          // base net take-home (the $15,800)
  everydayBudget: number;  // operating budget, excl. investing
  everydaySpent: number;   // operating actual so far, excl. investing
  investing: number;       // monthly investing
  reserveSetAside: number; // stash contributions (taxes + trips)
}

export default function MoneyMap({ income, everydayBudget, everydaySpent, investing, reserveSetAside }: Props) {
  if (income <= 0) return null;
  const leftover = Math.round(income - everydayBudget - investing - reserveSetAside);
  const segs = [
    { key: 'everyday',  label: 'Everyday',  amt: Math.round(everydayBudget),   cls: 'from-rose-500 to-pink-500',     note: `${formatCurrency(everydaySpent)} spent so far` },
    { key: 'investing', label: 'Investing', amt: Math.round(investing),        cls: 'from-violet-500 to-indigo-500', note: 'to investments' },
    { key: 'reserves',  label: 'Reserves',  amt: Math.round(reserveSetAside),  cls: 'from-amber-500 to-yellow-400',  note: 'taxes + trips set aside' },
    { key: 'free',      label: leftover >= 0 ? 'Free' : 'Over-allocated', amt: Math.abs(leftover),
      cls: leftover >= 0 ? 'from-emerald-500 to-teal-400' : 'from-red-600 to-red-500',
      note: leftover >= 0 ? 'give it a job' : 'trim to fit' },
  ];
  // Bar denominator: income, unless the user has over-allocated past it.
  const allocated = everydayBudget + investing + reserveSetAside;
  const denom = Math.max(income, allocated, 1);

  return (
    <div className="glass-card p-6">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <div>
          <div className="term-label">Your money at work</div>
          <h2 className="text-lg font-semibold text-text-primary mt-0.5">Where your {formatCurrency(income)} goes</h2>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="term-label">{leftover >= 0 ? 'Free to deploy' : 'Over-allocated'}</div>
          <div className={`text-xl font-black mono-num ${leftover >= 0 ? 'text-positive' : 'text-negative'}`}>
            {leftover >= 0 ? '' : '−'}{formatCurrency(Math.abs(leftover))}
          </div>
        </div>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Every dollar of your base, given a job. Trim <span className="text-text-secondary">everyday</span> over time → the <span className="text-positive">Free</span> slice grows: invest more, fund a trip, or just enjoy it.
      </p>

      <div className="flex h-9 rounded-lg overflow-hidden bg-surface-2 border border-glass-border">
        {segs.filter(s => s.amt > 0).map(s => (
          <div key={s.key} className={`bg-gradient-to-r ${s.cls} border-l border-black/20 first:border-l-0 transition-all`}
            style={{ width: `${(s.amt / denom) * 100}%` }} title={`${s.label}: ${formatCurrency(s.amt)}`} />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {segs.map(s => (
          <div key={s.key}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`w-2.5 h-2.5 rounded-sm bg-gradient-to-r ${s.cls}`} />
              <span className="text-[11px] text-text-muted uppercase tracking-wider">{s.label}</span>
            </div>
            <div className="mono-num text-text-primary font-semibold">{formatCurrency(s.amt)}</div>
            <div className="text-[10px] text-text-muted">{s.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

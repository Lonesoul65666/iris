// OTE over base — a take-home metric, not a target chase. Since the Feb-2026
// role change, each month's SECOND (end-of-month) check pays over the regular
// base check; that overage is the extra cash that lands in checking and needs
// deploying. We show the total brought home + a month-by-month bar of overages.
// Net dollars only (what actually hits the account) — Scott reconciles gross /
// taxes at year-end himself.
import { useMemo } from 'react';
import type { Expense } from '../../types/budget';
import { computeOteStatus } from '../../utils/oteEarnings';
import { formatCurrency } from '../../utils/format';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Group by the EMPLOYER (the part before "DES:") so one employer's deposits stay
// together even as the DES: memo changes (PAYROLL### / XXXXX### / EDIPYMENTS),
// and a spouse's separate income stays out of it.
const payerKey = (desc: string) => {
  const d = (desc || '').toLowerCase();
  const employer = (d.includes('des:') ? d.split('des:')[0] : d).replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim();
  return employer.slice(0, 20) || d.slice(0, 20);
};

export default function OnTargetEarnings({ expenses, now = new Date() }: { expenses: Expense[]; now?: Date }) {
  // Dominant employer income stream, straight from the transactions.
  const paycheckExpenses = useMemo(() => {
    const income = expenses.filter(e => (e.flow || 'outflow') === 'inflow' && e.transactionType === 'income');
    const byPayer = new Map<string, { sum: number; rows: Expense[] }>();
    for (const e of income) {
      const k = payerKey(e.description);
      const g = byPayer.get(k) ?? { sum: 0, rows: [] };
      g.sum += e.amount; g.rows.push(e); byPayer.set(k, g);
    }
    let top: Expense[] = []; let best = 0;
    for (const { sum, rows } of byPayer.values()) if (sum > best) { best = sum; top = rows; }
    return top;
  }, [expenses]);

  // Base check at the CURRENT level — modal amount (rounded to the dollar) over
  // the last ~5 months, so near-identical base checks map to ~$0 overage.
  const floorNet = useMemo(() => {
    const cutoff = new Date(now.getTime() - 150 * 86_400_000);
    const recent = paycheckExpenses.filter(e => new Date(`${e.date}T00:00:00`) >= cutoff);
    const pool = recent.length ? recent : paycheckExpenses;
    const counts = new Map<number, number>();
    for (const e of pool) { const a = Math.round(Math.abs(e.amount)); counts.set(a, (counts.get(a) || 0) + 1); }
    let modal = 0, best = 0;
    for (const [a, c] of counts) if (c > best) { best = c; modal = a; }
    return modal;
  }, [paycheckExpenses, now]);

  // Raise date = first check that hit the current base level (the role change).
  const raiseDate = useMemo(() => {
    if (!floorNet) return undefined;
    const first = paycheckExpenses
      .filter(e => Math.round(Math.abs(e.amount)) === floorNet)
      .map(e => e.date).sort()[0];
    return first ? new Date(`${first}T00:00:00`) : undefined;
  }, [paycheckExpenses, floorNet]);

  // Reuse the OTE helper purely for its net split + month-by-month overage.
  // No target (0) — this card doesn't chase a number.
  const ote = useMemo(
    () => computeOteStatus(paycheckExpenses.map(e => ({ date: e.date, amount: e.amount })), floorNet, 0, now, raiseDate),
    [paycheckExpenses, floorNet, now, raiseDate],
  );

  if (paycheckExpenses.length === 0 || !floorNet) return null;

  const sinceLabel = raiseDate
    ? raiseDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${now.getFullYear()}`;
  const totalOverage = ote.commissionYtd;
  // Only months that actually paid an overage count toward the average.
  const overageMonths = ote.byMonth.filter(m => m.commission > 1);
  const avg = overageMonths.length ? totalOverage / overageMonths.length : 0;
  const maxBar = Math.max(...ote.byMonth.map(m => m.commission), 1);

  return (
    <div className="glass-card p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <div className="term-label">OTE over base · take-home since {sinceLabel}</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl md:text-4xl font-black text-positive mono-num leading-none">{formatCurrency(totalOverage)}</span>
            <span className="text-sm text-text-muted">brought home over base</span>
          </div>
          <div className="text-xs text-text-muted mt-1">on top of your ~{formatCurrency(floorNet)}/check regular pay</div>
        </div>
        {avg > 0 && (
          <div className="flex-shrink-0 text-right">
            <div className="term-label">avg / month</div>
            <div className="text-xl font-black text-text-primary mono-num mt-0.5">{formatCurrency(avg)}</div>
          </div>
        )}
      </div>

      {/* The graph — each month's overage (the second, end-of-month check above base) */}
      <div className="mt-5">
        <div className="flex items-end gap-3 h-32">
          {ote.byMonth.map(m => {
            const mi = Number(m.month.slice(5, 7)) - 1;
            const hasOver = m.commission > 1;
            const h = (m.commission / maxBar) * 100;
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className={`text-[10px] mono-num ${hasOver ? 'text-positive font-semibold' : 'text-text-muted/50'}`}>
                  {hasOver ? formatCurrency(m.commission) : '—'}
                </span>
                <div className="w-full rounded-t bg-gradient-to-t from-emerald-600 to-teal-400 transition-[height] duration-700"
                  style={{ height: `${hasOver ? Math.max(h, 3) : 0}%` }}
                  title={`${MONTH_ABBR[mi]}: ${formatCurrency(m.commission)} over base`} />
                <span className="text-[10px] text-text-muted">{MONTH_ABBR[mi]}</span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-text-muted mt-4">
        Every dollar here landed on top of your base — extra take-home to move out of checking and put to work.
      </p>
    </div>
  );
}

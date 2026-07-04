import { useEffect, useMemo, useState } from 'react';
import type { Expense, IncomeSource } from '../../types/budget';
import { formatCurrency } from '../../utils/format';
import { getIncomeSources } from '../../stores/budgetStore';
import { parseLocalDate } from '../../utils/transactionAnalysis';

interface Props {
  expenses: Expense[];
  /** Today's date — defaults to now. Injected for testability. */
  now?: Date;
  /** Click "see transactions" jumps user to the Transactions sub-tab. */
  onViewTransactions?: () => void;
}

function isWorkExpense(e: Expense): boolean {
  return e.isWorkExpense || e.category === 'travel_work';
}

/**
 * Build the canonical "this expense ID is a reimbursement inflow" set from
 * IncomeSources — the user-facing source of truth for income classification.
 */
function buildReimbursementIds(sources: IncomeSource[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sources) {
    if (s.subtype === 'reimbursement' && s.status !== 'dismissed') {
      for (const eid of s.expenseIds) ids.add(eid);
    }
  }
  return ids;
}

function isReimbursementInflow(e: Expense, reimbIds: Set<string>): boolean {
  return (
    reimbIds.has(e.id) ||
    e.transactionType === 'reimbursement' ||
    (e.flow === 'inflow' && e.category === 'travel_work')
  );
}

function ymOf(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function ymLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function WorkReimbursementsCard({ expenses, now = new Date(), onViewTransactions }: Props) {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [monthsOpen, setMonthsOpen] = useState(false);
  useEffect(() => { getIncomeSources().then(setSources); }, [expenses]);

  const reimbIds = useMemo(() => buildReimbursementIds(sources), [sources]);

  const stats = useMemo(() => {
    const allWork = expenses.filter(e =>
      (e.flow || 'outflow') === 'outflow' &&
      (e.transactionType || 'expense') === 'expense' &&
      isWorkExpense(e),
    );
    const allReimb = expenses.filter(e => isReimbursementInflow(e, reimbIds));
    if (allWork.length === 0 && allReimb.length === 0) return null;

    // Month-by-month IN / OUT ledger — the "am I floating work money?" view.
    const byMonth = new Map<string, { spent: number; reimbursed: number }>();
    const bump = (ym: string, k: 'spent' | 'reimbursed', amt: number) => {
      const m = byMonth.get(ym) ?? { spent: 0, reimbursed: 0 };
      m[k] += amt; byMonth.set(ym, m);
    };
    for (const e of allWork) bump(ymOf(e.date), 'spent', e.amount);
    for (const e of allReimb) bump(ymOf(e.date), 'reimbursed', e.amount);

    const months = [...byMonth.entries()]
      .map(([ym, v]) => ({ ym, ...v, net: v.spent - v.reimbursed }))
      .sort((a, b) => b.ym.localeCompare(a.ym)); // most recent first

    const lifetimeSpent = allWork.reduce((s, e) => s + e.amount, 0);
    const lifetimeReimb = allReimb.reduce((s, e) => s + e.amount, 0);
    const floating = lifetimeSpent - lifetimeReimb; // + = work still owes you

    return { months, lifetimeSpent, lifetimeReimb, floating };
  }, [expenses, now, reimbIds]);

  if (!stats) return null;
  const { months, lifetimeSpent, lifetimeReimb, floating } = stats;
  const floatingTone = floating > 100 ? 'text-warning' : floating < -100 ? 'text-positive' : 'text-text-muted';

  return (
    <div className="glass-card p-6">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <div className="term-label">Work — money in / out</div>
          <h2 className="text-lg font-semibold text-text-primary mt-0.5">The Work Float</h2>
          <p className="text-xs text-text-muted mt-1">
            Real money out until it comes back. Kept out of your base budget — tracked here so nothing hides.
          </p>
        </div>
        {onViewTransactions && (
          <button type="button" onClick={onViewTransactions}
            className="text-[11px] text-accent hover:text-accent-light whitespace-nowrap flex-shrink-0 mt-1 underline underline-offset-2">
            See transactions →
          </button>
        )}
      </div>

      {/* Floating hero — what work still owes you (or you're ahead on) */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4 p-4 rounded-xl bg-white/[0.03] border border-glass-border">
        <div>
          <div className="term-label">{floating >= 0 ? 'Currently floating' : 'Reimbursed ahead'}</div>
          <div className={`text-3xl font-black mono-num mt-0.5 ${floatingTone}`}>
            {floating < 0 ? '−' : ''}{formatCurrency(Math.abs(floating))}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {floating >= 0 ? 'work spend still awaiting payback' : 'reimbursements are ahead of spend'}
          </div>
        </div>
        <div className="text-right text-xs text-text-muted space-y-0.5">
          <div><span className="mono-num text-text-secondary">{formatCurrency(lifetimeSpent)}</span> out, all-time</div>
          <div><span className="mono-num text-positive">{formatCurrency(lifetimeReimb)}</span> paid back</div>
        </div>
      </div>

      {/* Month-by-month IN / OUT — collapsed by default; the top stats carry the
          story, this is the drill-down for when you want the month-over-month. */}
      <button onClick={() => setMonthsOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform ${monthsOpen ? 'rotate-90' : ''}`}><path d="M9 6l6 6-6 6" /></svg>
        Monthly breakdown
        <span className="text-text-muted font-normal">· {months.length} mo</span>
      </button>
      {monthsOpen && (
      <div className="space-y-1 mt-3">
        <div className="flex items-center gap-3 px-1 pb-1 text-[10px] uppercase tracking-wider text-text-muted">
          <span className="w-14">Month</span>
          <span className="flex-1 text-right">Out</span>
          <span className="flex-1 text-right">Back</span>
          <span className="w-24 text-right">Net</span>
        </div>
        {months.map(m => (
          <div key={m.ym} className="flex items-center gap-3 px-1 py-1.5 rounded hover:bg-white/[0.02]">
            <span className="w-14 text-xs font-mono text-text-secondary">{ymLabel(m.ym)}</span>
            <span className="flex-1 text-right mono-num text-xs text-text-primary">{m.spent > 0 ? formatCurrency(m.spent) : '—'}</span>
            <span className="flex-1 text-right mono-num text-xs text-positive">{m.reimbursed > 0 ? formatCurrency(m.reimbursed) : '—'}</span>
            <span className={`w-24 text-right mono-num text-xs font-semibold ${m.net > 50 ? 'text-warning' : m.net < -50 ? 'text-positive' : 'text-text-muted'}`}>
              {m.net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(m.net))}
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

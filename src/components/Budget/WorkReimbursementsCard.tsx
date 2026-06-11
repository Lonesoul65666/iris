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
 * IncomeSources. The IncomeSource layer is the user-facing source of truth
 * for income classification — the auto-classifier on the expense itself
 * frequently falls back to `transactionType: 'income'` and misses reimburse-
 * ments.
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

interface WindowStats {
  label: string;
  spent: number;
  reimbursed: number;
  net: number;
}

export default function WorkReimbursementsCard({ expenses, now = new Date(), onViewTransactions }: Props) {
  const [sources, setSources] = useState<IncomeSource[]>([]);
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

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ninetyAgo = new Date(now.getTime() - 90 * 86_400_000);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const sumFrom = (arr: Expense[], from: Date) =>
      arr.filter(e => parseLocalDate(e.date) >= from).reduce((s, e) => s + e.amount, 0);

    const mkWindow = (label: string, from: Date): WindowStats => {
      const spent = sumFrom(allWork, from);
      const reimbursed = sumFrom(allReimb, from);
      return { label, spent, reimbursed, net: spent - reimbursed };
    };

    return {
      thisMonth: mkWindow('This month', monthStart),
      last90: mkWindow('Last 90 days', ninetyAgo),
      ytd: mkWindow('Year to date', yearStart),
      hasAnyData: allWork.length > 0 || allReimb.length > 0,
    };
  }, [expenses, now, reimbIds]);

  if (!stats?.hasAnyData) return null;

  const ytdBalanced = Math.abs(stats.ytd.net) < 50;

  return (
    <div className="glass-card p-6">
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <div className="term-label">Work Expenses & Reimbursements</div>
          <h2 className="text-lg font-semibold text-text-primary mt-0.5">
            {ytdBalanced ? '✓ Reimbursements roughly balanced' : 'Work spend vs reimbursements'}
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Totals only. Coupa or your equivalent handles the line items — Iris just shows whether the cash in roughly matches the cash out.
          </p>
        </div>
        {onViewTransactions && (
          <button
            type="button"
            onClick={onViewTransactions}
            className="text-[11px] text-accent hover:text-accent-light whitespace-nowrap flex-shrink-0 mt-1 underline underline-offset-2"
          >
            See transactions →
          </button>
        )}
      </div>

      {/* Three windows */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[stats.thisMonth, stats.last90, stats.ytd].map((w, i) => (
          <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-glass-border">
            <div className="text-text-muted text-[10px] uppercase tracking-wider">{w.label}</div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-sm font-bold text-text-primary mono-num">{formatCurrency(w.spent)}</span>
              <span className="text-[10px] text-text-muted">spent</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-positive mono-num">{formatCurrency(w.reimbursed)}</span>
              <span className="text-[10px] text-text-muted">reimbursed</span>
            </div>
            <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-glass-border/50">
              <span className={`text-sm font-bold mono-num ${w.net > 50 ? 'text-warning' : w.net < -50 ? 'text-positive' : 'text-text-muted'}`}>
                {w.net >= 0 ? '+' : ''}{formatCurrency(w.net)}
              </span>
              <span className="text-[10px] text-text-muted">{w.net > 0 ? 'pending' : w.net < 0 ? 'ahead' : 'even'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Fun Money — per-person no-judgment pots, daily-visible on the Budget
// OVERVIEW (was buried in edit mode). Spent is DERIVED from this calendar
// month's transactions in each pot's category; budgets are set in Edit Budget.
import { useMemo } from 'react';
import type { Expense, FunMoney } from '../../types/budget';
import { formatCurrency } from '../../utils/format';
import { computeFunMoneySpent } from '../../utils/funMoney';

interface Props {
  funMoney: FunMoney[];
  expenses: Expense[];
  /** Jump into Edit Budget — shown when a pot has no budget yet. */
  onEditBudgets: () => void;
}

export default function FunMoneyCard({ funMoney, expenses, onEditBudgets }: Props) {
  // Recompute from transactions on render — never trust a stored spent value.
  const pots = useMemo(() => computeFunMoneySpent(funMoney, expenses), [funMoney, expenses]);

  if (pots.length === 0) return null;

  return (
    <div className="glass-card p-6">
      <div className="mb-1">
        <h2 className="text-lg font-semibold text-text-primary">Fun Money</h2>
        <p className="text-xs text-text-muted">
          No-judgment spending — each person gets a pot. This is what stops the money fights.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {pots.map(fm => {
          const hasBudget = fm.monthlyBudget > 0;
          const over = hasBudget && fm.monthlySpent > fm.monthlyBudget;
          const remaining = fm.monthlyBudget - fm.monthlySpent;
          const pct = hasBudget ? Math.min(100, (fm.monthlySpent / fm.monthlyBudget) * 100) : 0;
          return (
            <div key={fm.earnerId ?? fm.person}
              className={`p-4 rounded-xl bg-white/[0.03] border ${over ? 'border-negative/40' : 'border-glass-border'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-text-primary">{fm.emoji ?? '🎯'} {fm.person}</span>
                {hasBudget ? (
                  <span className="text-xs text-text-muted">
                    <strong className={`mono-num ${over ? 'text-negative' : 'text-text-primary'}`}>{formatCurrency(fm.monthlySpent)}</strong>
                    {' '}of {formatCurrency(fm.monthlyBudget)}
                  </span>
                ) : (
                  <button onClick={onEditBudgets}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-accent/15 border border-accent/40 text-accent font-semibold hover:bg-accent/25 transition-colors">
                    Set a budget
                  </button>
                )}
              </div>

              {hasBudget ? (
                <>
                  <div className="w-full bg-white/10 rounded-full h-2 mb-1">
                    <div
                      className={`h-2 rounded-full transition-all ${over ? 'bg-negative' : 'bg-gradient-to-r from-indigo-500 to-violet-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className={`text-xs ${over ? 'text-negative' : 'text-text-muted'}`}>
                    {over
                      ? `${formatCurrency(Math.abs(remaining))} over this month — it happens`
                      : `${formatCurrency(remaining)} left this month`}
                  </div>
                </>
              ) : (
                <div className="text-xs text-text-muted">
                  {fm.monthlySpent > 0
                    ? `${formatCurrency(fm.monthlySpent)} spent this month — no budget set yet`
                    : 'Nothing spent this month'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

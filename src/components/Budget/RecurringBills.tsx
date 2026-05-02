import { useEffect, useMemo, useState } from 'react';
import type { Expense } from '../../types/budget';
import { detectRecurring, monthlyRecurringLoad, type RecurringCandidate, type Cadence } from '../../utils/recurringDetector';
import {
  getRecurringDecisions,
  saveRecurringDecision,
  clearRecurringDecision,
  type RecurringDecision,
} from '../../stores/budgetStore';
import { formatCurrency } from '../../utils/format';

interface Props {
  expenses: Expense[];
  /** Hard cap on rows rendered (default 12). */
  limit?: number;
  /** Minimum confidence to surface (default 0.4). */
  minConfidence?: number;
}

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  irregular: 'Irregular',
};

const CADENCE_COLOR: Record<Cadence, string> = {
  weekly: 'bg-accent/20 text-accent-light',
  biweekly: 'bg-accent/20 text-accent-light',
  monthly: 'bg-positive/20 text-positive',
  quarterly: 'bg-warning/20 text-warning',
  yearly: 'bg-warning/20 text-warning',
  irregular: 'bg-surface-3 text-text-muted',
};

function relativeDay(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days}d`;
  return `${Math.abs(days)}d overdue`;
}

function confidenceLabel(c: number): { label: string; className: string } {
  if (c >= 0.8) return { label: 'High', className: 'text-positive' };
  if (c >= 0.6) return { label: 'Medium', className: 'text-accent-light' };
  return { label: 'Low', className: 'text-text-muted' };
}

export default function RecurringBills({ expenses, limit = 12, minConfidence = 0.4 }: Props) {
  const [decisions, setDecisions] = useState<Map<string, RecurringDecision>>(new Map());
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const rows = await getRecurringDecisions();
      const m = new Map<string, RecurringDecision>();
      for (const d of rows) m.set(d.id, d);
      setDecisions(m);
    })();
  }, []);

  const candidates = useMemo(
    () => detectRecurring(expenses, { minConfidence, lookbackDays: 180 }),
    [expenses, minConfidence],
  );

  const { visible, dismissed } = useMemo(() => {
    const visible: RecurringCandidate[] = [];
    const dismissed: RecurringCandidate[] = [];
    for (const c of candidates) {
      const status = decisions.get(c.id)?.status;
      if (status === 'dismissed') dismissed.push(c);
      else visible.push(c);
    }
    // Confirmed first, then by daysUntilNext asc (overdue + soon bubble up)
    visible.sort((a, b) => {
      const aConf = decisions.get(a.id)?.status === 'confirmed' ? 0 : 1;
      const bConf = decisions.get(b.id)?.status === 'confirmed' ? 0 : 1;
      if (aConf !== bConf) return aConf - bConf;
      return a.daysUntilNext - b.daysUntilNext;
    });
    return { visible: visible.slice(0, limit), dismissed };
  }, [candidates, decisions, limit]);

  const load = useMemo(() => monthlyRecurringLoad(visible), [visible]);

  const setStatus = async (id: string, status: 'confirmed' | 'dismissed') => {
    const d: RecurringDecision = { id, status, updatedAt: new Date().toISOString() };
    await saveRecurringDecision(d);
    setDecisions(prev => new Map(prev).set(id, d));
  };

  const unDismiss = async (id: string) => {
    await clearRecurringDecision(id);
    setDecisions(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  if (candidates.length === 0) {
    return (
      <div className="glass-card p-5 border border-glass-border">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🔁</div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">Recurring Bills</h3>
            <p className="text-xs text-text-muted mt-1">
              No recurring patterns detected yet. Import more transaction history (3+ hits of the same
              merchant) and they'll show up here automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <details className="glass-card p-0 border border-glass-border group">
      <summary className="cursor-pointer p-5 list-none hover:bg-surface-2 transition-colors rounded-2xl">
        {/* Header + monthly load */}
        <div className="flex items-start gap-3 mb-4">
          <div className="text-2xl flex-shrink-0">🔁</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-text-primary">Recurring Bills</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/20 text-accent-light uppercase tracking-wider">
                {visible.length} detected
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Auto-detected from your transaction history. Expand to confirm or dismiss each one.
            </p>
          </div>
          <span className="text-[10px] text-text-muted whitespace-nowrap flex-shrink-0">
            <span className="group-open:hidden">Show list ▾</span>
            <span className="hidden group-open:inline">Hide list ▴</span>
          </span>
        </div>

        {/* Monthly load summary — always visible */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-2 rounded-lg p-3 border border-glass-border">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Outflow / mo</div>
            <div className="text-base font-bold text-negative mt-0.5">
              {formatCurrency(Math.round(load.outflow))}
            </div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 border border-glass-border">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Inflow / mo</div>
            <div className="text-base font-bold text-positive mt-0.5">
              {formatCurrency(Math.round(load.inflow))}
            </div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 border border-glass-border">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Net / mo</div>
            <div className={`text-base font-bold mt-0.5 ${load.net >= 0 ? 'text-positive' : 'text-negative'}`}>
              {formatCurrency(Math.round(load.net))}
            </div>
          </div>
        </div>
      </summary>

      <div className="px-5 pb-5 pt-1 space-y-4">
      {/* Candidate list */}
      <div className="space-y-1.5">
        {visible.map(c => {
          const decision = decisions.get(c.id);
          const isConfirmed = decision?.status === 'confirmed';
          const conf = confidenceLabel(c.confidence);
          const dueSoon = c.daysUntilNext <= 3;
          return (
            <div
              key={c.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                isConfirmed
                  ? 'bg-positive/5 border-positive/30'
                  : 'bg-surface-2 border-glass-border hover:border-accent/30'
              }`}
            >
              {/* Cadence badge */}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 ${CADENCE_COLOR[c.cadence]}`}>
                {CADENCE_LABEL[c.cadence]}
              </span>

              {/* Merchant + meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary truncate">{c.merchant}</span>
                  {isConfirmed && (
                    <span className="text-[10px] text-positive font-semibold">✓ confirmed</span>
                  )}
                </div>
                <div className="text-[11px] text-text-muted flex items-center gap-2 flex-wrap mt-0.5">
                  <span>{c.occurrences} hits · ±{c.amountVariancePct}%</span>
                  <span>·</span>
                  <span className={dueSoon ? 'text-warning font-semibold' : ''}>
                    next {c.nextExpectedDate} ({relativeDay(c.daysUntilNext)})
                  </span>
                  <span>·</span>
                  <span className={conf.className}>{conf.label} conf</span>
                </div>
              </div>

              {/* Amount */}
              <div className={`text-sm font-bold flex-shrink-0 ${c.flow === 'inflow' ? 'text-positive' : 'text-text-primary'}`}>
                {c.flow === 'inflow' ? '+' : ''}{formatCurrency(c.avgAmount)}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {!isConfirmed && (
                  <button
                    onClick={() => setStatus(c.id, 'confirmed')}
                    className="px-2.5 py-1 rounded-md bg-positive/15 hover:bg-positive/25 text-positive text-[11px] font-semibold transition-colors"
                    title="Mark as a real recurring bill"
                  >
                    Confirm
                  </button>
                )}
                <button
                  onClick={() => setStatus(c.id, 'dismissed')}
                  className="px-2.5 py-1 rounded-md bg-surface-3 hover:bg-negative/15 text-text-muted hover:text-negative text-[11px] font-semibold transition-colors"
                  title="Not a recurring bill — hide from this list"
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dismissed footer */}
      {dismissed.length > 0 && (
        <div className="pt-2 border-t border-glass-border">
          <button
            onClick={() => setShowDismissed(v => !v)}
            className="text-[11px] text-text-muted hover:text-accent"
          >
            {showDismissed ? '− Hide' : '+ Show'} {dismissed.length} dismissed
          </button>
          {showDismissed && (
            <div className="mt-2 space-y-1">
              {dismissed.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-[11px] text-text-muted px-2 py-1">
                  <span className="flex-1 truncate">
                    {c.merchant} · {CADENCE_LABEL[c.cadence]} · {formatCurrency(c.avgAmount)}
                  </span>
                  <button
                    onClick={() => unDismiss(c.id)}
                    className="text-accent hover:underline"
                  >
                    restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </details>
  );
}

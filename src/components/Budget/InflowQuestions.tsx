import { useEffect, useMemo, useState } from 'react';
import type { Expense, IncomeSource, IncomeSubtype, InflowDecision } from '../../types/budget';
import {
  getIncomeSources,
  saveIncomeSource,
  getInflowDecisions,
  saveInflowDecision,
} from '../../stores/budgetStore';
import { formatCurrency } from '../../utils/format';

interface Props {
  expenses: Expense[];
  /** Compact variant for Dashboard (smaller card, fewer details). */
  compact?: boolean;
  /** When all questions are resolved (or none exist), invoke optional callback. */
  onResolved?: () => void;
}

const SNOOZE_DAYS = 30;

interface Question {
  source: IncomeSource;       // the unknown-subtype source surfacing the question
  expense?: Expense;          // the underlying inflow transaction (for one-off cases)
}

const ACTIONS: Array<{ key: IncomeSubtype; label: string; icon: string }> = [
  { key: 'side',          label: 'Side income',   icon: '💰' },
  { key: 'reimbursement', label: 'Reimbursement', icon: '✈️' },
  { key: 'gift',          label: 'Gift',          icon: '🎁' },
  { key: 'sale',          label: 'Sale of stuff', icon: '🏷️' },
  { key: 'bonus',         label: 'Bonus',         icon: '⭐' },
];

export default function InflowQuestions({ expenses, compact = false, onResolved }: Props) {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [decisions, setDecisions] = useState<InflowDecision[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, d] = await Promise.all([getIncomeSources(), getInflowDecisions()]);
      setSources(s);
      setDecisions(d);
      setLoaded(true);
    })();
  }, []);

  const expenseById = useMemo(() => {
    const m = new Map<string, Expense>();
    for (const e of expenses) m.set(e.id, e);
    return m;
  }, [expenses]);

  const decisionByExpense = useMemo(() => {
    const m = new Map<string, InflowDecision>();
    for (const d of decisions) m.set(d.expenseId, d);
    return m;
  }, [decisions]);

  const questions: Question[] = useMemo(() => {
    if (!loaded) return [];
    const now = new Date();
    return sources
      .filter(s => s.subtype === 'unknown' && s.status !== 'dismissed')
      .filter(s => {
        // Hide if every linked expense has an active (unexpired) decision/snooze.
        return s.expenseIds.some(id => {
          const d = decisionByExpense.get(id);
          if (!d) return true;
          if (d.classification === 'snoozed' && d.snoozeUntil) {
            return new Date(d.snoozeUntil) <= now;
          }
          return false; // already classified
        });
      })
      .map(s => ({
        source: s,
        expense: s.expenseIds[0] ? expenseById.get(s.expenseIds[0]) : undefined,
      }));
  }, [loaded, sources, decisionByExpense, expenseById]);

  // Fire onResolved when count drops to 0
  useEffect(() => {
    if (loaded && questions.length === 0) onResolved?.();
  }, [loaded, questions.length, onResolved]);

  const classify = async (q: Question, sub: IncomeSubtype) => {
    // Mark every linked expense with a decision
    const ts = new Date().toISOString();
    for (const id of q.source.expenseIds) {
      await saveInflowDecision({ expenseId: id, classification: sub, decidedAt: ts });
    }
    // Update the IncomeSource: reclassify + confirm
    const next: IncomeSource = {
      ...q.source,
      subtype: sub,
      status: 'confirmed',
      // Adjust budgeting defaults for the new classification
      includeInBudget: sub === 'side' || sub === 'bonus' ? sub === 'side' : false,
      sweepDestination: sub === 'bonus' ? 'hysa' : 'none',
      updatedAt: ts,
    };
    await saveIncomeSource(next);
    setSources(prev => prev.map(x => x.id === next.id ? next : x));
    // Refresh decisions
    setDecisions(await getInflowDecisions());
  };

  const snooze = async (q: Question) => {
    const ts = new Date().toISOString();
    const until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString();
    for (const id of q.source.expenseIds) {
      await saveInflowDecision({ expenseId: id, classification: 'snoozed', decidedAt: ts, snoozeUntil: until });
    }
    setDecisions(await getInflowDecisions());
  };

  const dismiss = async (q: Question) => {
    const next: IncomeSource = { ...q.source, status: 'dismissed', updatedAt: new Date().toISOString() };
    await saveIncomeSource(next);
    setSources(prev => prev.map(x => x.id === next.id ? next : x));
  };

  if (!loaded || questions.length === 0) return null;

  return (
    <div className={`glass-card border border-accent/30 ${compact ? 'p-3' : 'p-5'}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={compact ? 'text-xl flex-shrink-0' : 'text-2xl flex-shrink-0'}>💬</div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-text-primary ${compact ? 'text-xs' : 'text-sm'}`}>
            We saw {questions.length} {questions.length === 1 ? 'deposit we couldn\'t classify' : 'deposits we couldn\'t classify'}
          </h3>
          {!compact && (
            <p className="text-xs text-text-muted mt-1">
              One tap each — gets your budget accurate. Snooze if you'll figure it out later.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {questions.map(q => {
          const e = q.expense;
          const date = e?.date || q.source.firstSeen;
          return (
            <div
              key={q.source.id}
              className="bg-surface-2 rounded-lg p-3 border border-glass-border"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text-primary truncate">
                    {formatCurrency(q.source.avgAmount)} from {q.source.payerDisplay}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {date} · {q.source.expenseIds.length === 1 ? 'one-off' : `${q.source.expenseIds.length} similar`}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ACTIONS.map(a => (
                  <button
                    key={a.key}
                    onClick={() => classify(q, a.key)}
                    className="px-2.5 py-1.5 rounded-md bg-surface-3 hover:bg-accent/20 hover:text-accent-light text-text-secondary text-[11px] font-semibold transition-colors flex items-center gap-1"
                  >
                    <span>{a.icon}</span>
                    <span>{a.label}</span>
                  </button>
                ))}
                <button
                  onClick={() => snooze(q)}
                  className="px-2.5 py-1.5 rounded-md bg-surface-3 hover:bg-warning/20 hover:text-warning text-text-muted text-[11px] font-semibold transition-colors flex items-center gap-1"
                  title={`Hide for ${SNOOZE_DAYS} days`}
                >
                  <span>🤷</span>
                  <span>Snooze</span>
                </button>
                <button
                  onClick={() => dismiss(q)}
                  className="px-2.5 py-1.5 rounded-md bg-surface-3 hover:bg-negative/15 hover:text-negative text-text-muted text-[11px] font-semibold transition-colors ml-auto"
                  title="Not income — dismiss permanently"
                >
                  Not income
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

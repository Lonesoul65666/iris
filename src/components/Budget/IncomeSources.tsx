import { useEffect, useMemo, useState } from 'react';
import type { Expense, IncomeSource, IncomeSubtype, IncomeCadence, SweepDestination } from '../../types/budget';
import {
  detectIncomeSources,
  monthlyBudgetableIncome,
  monthlyEquivalent,
  type DetectedIncomeSource,
} from '../../utils/incomeDetector';
import {
  getIncomeSources,
  saveIncomeSource,
  saveIncomeSources,
  deleteIncomeSource,
  saveExpense,
} from '../../stores/budgetStore';
import { matchAllReimbursements, type ReimbursementMatch } from '../../utils/reimbursementMatcher';
import { formatCurrency } from '../../utils/format';

interface Props {
  expenses: Expense[];
  /** Fired when the merged source list changes (so parent can recompute totals). */
  onSourcesChange?: (sources: IncomeSource[]) => void;
}

const SUBTYPE_META: Record<IncomeSubtype, { icon: string; label: string; tone: string }> = {
  base:          { icon: '💼', label: 'Base',          tone: 'bg-positive/20 text-positive' },
  variable:      { icon: '💰', label: 'Variable',      tone: 'bg-accent/20 text-accent-light' },
  bonus:         { icon: '🎁', label: 'Bonus',         tone: 'bg-warning/20 text-warning' },
  side:          { icon: '🛠️', label: 'Side income',   tone: 'bg-accent/20 text-accent-light' },
  dividend:      { icon: '📈', label: 'Dividend',      tone: 'bg-positive/20 text-positive' },
  reimbursement: { icon: '✈️', label: 'Work Reimbursement', tone: 'bg-surface-3 text-text-secondary' },
  gift:          { icon: '🎉', label: 'Gift',          tone: 'bg-surface-3 text-text-muted' },
  sale:          { icon: '🏷️', label: 'Refund / Sale', tone: 'bg-surface-3 text-text-muted' },
  unknown:       { icon: '❓', label: 'Unclassified',  tone: 'bg-surface-3 text-text-muted' },
};

const CADENCE_LABEL: Record<IncomeCadence, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  semimonthly: 'Semimonthly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  irregular: 'Irregular',
};

// Plain-language labels — keys stay the same so existing per-source settings
// keep working without migration.
const SWEEP_LABEL: Record<SweepDestination, string> = {
  hysa: 'Savings',
  sinking_fund: 'Goal',
  investing: 'Invest',
  extra_payment: 'Pay down debt',
  manual: 'Decide later',
  none: 'No sweep',
};

const SUBTYPE_OPTIONS: IncomeSubtype[] = ['base', 'variable', 'bonus', 'side', 'dividend', 'reimbursement', 'gift', 'sale'];
const SWEEP_OPTIONS: SweepDestination[] = ['none', 'hysa', 'sinking_fund', 'investing', 'extra_payment', 'manual'];

function mergeSources(
  detected: DetectedIncomeSource[],
  saved: IncomeSource[],
  now: Date,
): IncomeSource[] {
  const savedById = new Map(saved.map(s => [s.id, s]));
  const detectedById = new Map(detected.map(d => [d.id, d]));
  const out: IncomeSource[] = [];
  const ts = now.toISOString();

  for (const d of detected) {
    const prior = savedById.get(d.id);
    if (prior) {
      // Preserve user-edited fields; refresh detection-derived stats.
      out.push({
        ...prior,
        cadence: d.cadence,
        avgAmount: d.avgAmount,
        amountMin: d.amountMin,
        amountMax: d.amountMax,
        occurrences: d.occurrences,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
        nextExpectedDate: d.nextExpectedDate,
        confidence: d.confidence,
        expenseIds: d.expenseIds,
        updatedAt: ts,
      });
    } else {
      // Brand-new detection — apply defaults from detector hints.
      out.push({
        id: d.id,
        payer: d.payer,
        payerDisplay: d.payerDisplay,
        subtype: d.subtype,
        earnerId: d.earnerId,
        cadence: d.cadence,
        avgAmount: d.avgAmount,
        amountMin: d.amountMin,
        amountMax: d.amountMax,
        occurrences: d.occurrences,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
        nextExpectedDate: d.nextExpectedDate,
        confidence: d.confidence,
        status: 'detected',
        includeInBudget: d.suggestedIncludeInBudget,
        sweepDestination: d.suggestedSweep,
        sweepDestinationId: undefined,
        expenseIds: d.expenseIds,
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }

  // Saved sources without recent detection — keep them visible (user may want to confirm
  // they're truly stale or just paused).
  for (const s of saved) {
    if (!detectedById.has(s.id)) out.push(s);
  }

  // Sort: confirmed first, then by monthly contribution desc.
  out.sort((a, b) => {
    const aConf = a.status === 'confirmed' ? 0 : 1;
    const bConf = b.status === 'confirmed' ? 0 : 1;
    if (aConf !== bConf) return aConf - bConf;
    return monthlyEquivalent(b.avgAmount, b.cadence) - monthlyEquivalent(a.avgAmount, a.cadence);
  });

  return out;
}

function confidenceLabel(c: number): { label: string; className: string } {
  if (c >= 0.8) return { label: 'High', className: 'text-positive' };
  if (c >= 0.6) return { label: 'Medium', className: 'text-accent-light' };
  if (c >= 0.4) return { label: 'Low', className: 'text-warning' };
  return { label: 'Tentative', className: 'text-text-muted' };
}

export default function IncomeSources({ expenses, onSourcesChange }: Props) {
  const [saved, setSaved] = useState<IncomeSource[]>([]);
  const [view, setView] = useState<'simple' | 'detailed'>('detailed');
  const [showDismissed, setShowDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const rows = await getIncomeSources();
      setSaved(rows);
      setLoaded(true);
    })();
  }, []);

  const detected = useMemo(
    () => detectIncomeSources(expenses, { lookbackDays: 365 }),
    [expenses],
  );

  const merged = useMemo(
    () => loaded ? mergeSources(detected, saved, new Date()) : [],
    [detected, saved, loaded],
  );

  // Run reimbursement matching for every confirmed/detected reimbursement source.
  // Auto-apply matches with confidence 'exact' or 'high'; surface medium/partial for user.
  const reimbursementMatches = useMemo(() => {
    if (!loaded) return new Map<string, ReimbursementMatch[]>();
    const expById = new Map(expenses.map(e => [e.id, e]));
    const submittedOutflows = expenses.filter(e =>
      e.isWorkExpense && e.reimbursementStatus === 'submitted'
      && (e.flow || 'outflow') === 'outflow',
    );
    const out = new Map<string, ReimbursementMatch[]>();
    for (const src of merged.filter(s => s.subtype === 'reimbursement' && s.status !== 'dismissed')) {
      const inflows = src.expenseIds.map(id => expById.get(id)).filter((e): e is Expense => !!e);
      if (inflows.length === 0) continue;
      const matches = matchAllReimbursements(inflows, submittedOutflows);
      out.set(src.id, matches);
    }
    return out;
  }, [loaded, merged, expenses]);

  // Apply auto-match: mark matched expenses as 'reimbursed' for high+ confidence.
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      const expById = new Map(expenses.map(e => [e.id, e]));
      let appliedCount = 0;
      for (const matches of reimbursementMatches.values()) {
        for (const m of matches) {
          if (m.confidence !== 'exact' && m.confidence !== 'high') continue;
          for (const id of m.matchedExpenseIds) {
            const e = expById.get(id);
            if (!e || e.reimbursementStatus === 'reimbursed') continue;
            await saveExpense({ ...e, reimbursementStatus: 'reimbursed' });
            appliedCount += 1;
          }
        }
      }
      if (appliedCount > 0) {
        // Hint: parent should reload expenses. We don't trigger reload here to
        // avoid re-render storm — the orchestrator/parent will pick up next sync.
      }
    })();
  }, [loaded, reimbursementMatches, expenses]);

  // Auto-persist newly detected sources (so the orchestrator stops re-creating them).
  useEffect(() => {
    if (!loaded || merged.length === 0) return;
    const newOnes = merged.filter(m => !saved.find(s => s.id === m.id));
    if (newOnes.length === 0) return;
    (async () => {
      await saveIncomeSources(newOnes);
      setSaved(prev => [...prev, ...newOnes]);
    })();
  }, [loaded, merged, saved]);

  // Notify parent when merged changes
  useEffect(() => {
    onSourcesChange?.(merged);
  }, [merged, onSourcesChange]);

  // 'unknown' subtype sources live in the InflowQuestions prompt, not here.
  const visible = useMemo(
    () => {
      const filtered = merged.filter(s => s.subtype !== 'unknown');
      return showDismissed ? filtered : filtered.filter(s => s.status !== 'dismissed');
    },
    [merged, showDismissed],
  );

  const dismissedCount = merged.filter(s => s.status === 'dismissed').length;

  // Headline numbers
  const totalMonthlyBudgetable = useMemo(() => monthlyBudgetableIncome(visible), [visible]);
  const totalMonthlyAll = useMemo(
    () => visible.reduce((s, x) => s + (x.subtype === 'reimbursement' ? 0 : monthlyEquivalent(x.avgAmount, x.cadence)), 0),
    [visible],
  );
  const variableSurplus = totalMonthlyAll - totalMonthlyBudgetable;

  // Action handlers
  const updateSource = async (s: IncomeSource, patch: Partial<IncomeSource>) => {
    const next = { ...s, ...patch, updatedAt: new Date().toISOString() };
    await saveIncomeSource(next);
    setSaved(prev => prev.map(x => x.id === next.id ? next : x));
  };

  const confirm = (s: IncomeSource) => updateSource(s, { status: 'confirmed' });
  const dismiss = (s: IncomeSource) => updateSource(s, { status: 'dismissed' });
  const restore = (s: IncomeSource) => updateSource(s, { status: 'detected' });
  const toggleInclude = (s: IncomeSource) => updateSource(s, { includeInBudget: !s.includeInBudget });
  const setSweep = (s: IncomeSource, dest: SweepDestination) => updateSource(s, { sweepDestination: dest });
  const reclassify = (s: IncomeSource, sub: IncomeSubtype) => updateSource(s, { subtype: sub });
  const remove = async (s: IncomeSource) => {
    if (!confirm0(`Permanently remove "${s.payerDisplay}"? It'll re-detect next time if hits keep coming in.`)) return;
    await deleteIncomeSource(s.id);
    setSaved(prev => prev.filter(x => x.id !== s.id));
  };

  if (!loaded) {
    return (
      <div className="glass-card p-5 border border-glass-border">
        <div className="text-xs text-text-muted">Loading income sources…</div>
      </div>
    );
  }

  if (merged.length === 0) {
    return (
      <div className="glass-card p-5 border border-glass-border">
        <div className="flex items-start gap-3">
          <div className="text-2xl">💰</div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">Income Sources</h3>
            <p className="text-xs text-text-muted mt-1">
              No inflows detected yet. Once transactions import (or you add them manually), Iris will identify your
              paychecks, side income, dividends, and reimbursements automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 border border-glass-border space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="text-2xl flex-shrink-0">💰</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-text-primary">Income Sources</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/20 text-accent-light uppercase tracking-wider">
              {visible.length} {visible.length === 1 ? 'source' : 'sources'}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Auto-detected from your transaction history. Variable income defaults to surplus (sweep elsewhere) — flip the toggle to budget against it.
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px] flex-shrink-0">
          <button
            onClick={() => setView('simple')}
            className={`px-2 py-1 rounded-md transition-colors ${view === 'simple' ? 'bg-accent/20 text-accent-light' : 'text-text-muted hover:text-text-secondary'}`}
          >
            Simple
          </button>
          <button
            onClick={() => setView('detailed')}
            className={`px-2 py-1 rounded-md transition-colors ${view === 'detailed' ? 'bg-accent/20 text-accent-light' : 'text-text-muted hover:text-text-secondary'}`}
          >
            Detailed
          </button>
        </div>
      </div>

      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-surface-2 rounded-lg p-3 border border-glass-border">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">Budgetable / mo</div>
          <div className="text-lg font-bold text-positive mt-0.5">
            {formatCurrency(Math.round(totalMonthlyBudgetable))}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">Sources you've opted into</div>
        </div>
        <div className="bg-surface-2 rounded-lg p-3 border border-glass-border">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">Variable surplus / mo</div>
          <div className="text-lg font-bold text-accent-light mt-0.5">
            {formatCurrency(Math.round(variableSurplus))}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">Avg variable + bonus, swept</div>
        </div>
        <div className="bg-surface-2 rounded-lg p-3 border border-glass-border col-span-2 md:col-span-1">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">Total / mo</div>
          <div className="text-lg font-bold text-text-primary mt-0.5">
            {formatCurrency(Math.round(totalMonthlyAll))}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">Budgetable + variable, ex. reimb</div>
        </div>
      </div>

      {/* Source list */}
      <div className="space-y-2">
        {visible.filter(s => s.status !== 'dismissed').map(s => {
          const meta = SUBTYPE_META[s.subtype];
          const conf = confidenceLabel(s.confidence);
          const isConfirmed = s.status === 'confirmed';
          const isDetected = s.status === 'detected';
          const monthly = monthlyEquivalent(s.avgAmount, s.cadence);
          const showSweep = !s.includeInBudget && s.subtype !== 'reimbursement' && s.subtype !== 'gift' && s.subtype !== 'sale' && s.subtype !== 'unknown';

          return (
            <div
              key={s.id}
              className={`px-3 py-3 rounded-lg border transition-colors ${
                isConfirmed
                  ? 'bg-positive/5 border-positive/30'
                  : 'bg-surface-2 border-glass-border hover:border-accent/30'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Subtype badge */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                  <div className="text-xl">{meta.icon}</div>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${meta.tone}`}>
                    {meta.label}
                  </span>
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary truncate">{s.payerDisplay}</span>
                    {isConfirmed && (
                      <span className="text-[10px] text-positive font-semibold">✓ confirmed</span>
                    )}
                  </div>
                  <div className="text-[11px] text-text-muted flex items-center gap-2 flex-wrap mt-1">
                    <span>{CADENCE_LABEL[s.cadence]}</span>
                    <span>·</span>
                    <span>{s.occurrences} {s.occurrences === 1 ? 'hit' : 'hits'}</span>
                    {view === 'detailed' && (
                      <>
                        <span>·</span>
                        <span className={conf.className}>{conf.label} confidence</span>
                        {s.amountMin !== s.amountMax && (
                          <>
                            <span>·</span>
                            <span>range {formatCurrency(s.amountMin)}–{formatCurrency(s.amountMax)}</span>
                          </>
                        )}
                        {s.nextExpectedDate && (
                          <>
                            <span>·</span>
                            <span>next ~{s.nextExpectedDate}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* Reimbursement match summary */}
                  {s.subtype === 'reimbursement' && reimbursementMatches.get(s.id) && (() => {
                    const matches = reimbursementMatches.get(s.id)!;
                    const exact = matches.filter(m => m.confidence === 'exact' || m.confidence === 'high');
                    const partial = matches.filter(m => m.confidence === 'medium' || m.confidence === 'partial');
                    const unmatched = matches.filter(m => m.confidence === 'none');
                    const matchedExpenseCount = exact.reduce((s, m) => s + m.matchedExpenseIds.length, 0);
                    if (matches.length === 0) return null;
                    return (
                      <div className="mt-2 space-y-1">
                        {exact.length > 0 && (
                          <div className="text-[11px] text-positive">
                            ✓ {matchedExpenseCount} expense{matchedExpenseCount === 1 ? '' : 's'} matched
                            {' '}({formatCurrency(exact.reduce((s, m) => s + m.matchedTotal, 0))})
                            {' — auto-marked reimbursed'}
                          </div>
                        )}
                        {partial.length > 0 && (
                          <div className="text-[11px] text-warning">
                            ⚠ {partial.length} partial match{partial.length === 1 ? '' : 'es'} need confirmation
                          </div>
                        )}
                        {unmatched.length > 0 && (
                          <div className="text-[11px] text-text-muted">
                            ? {unmatched.length} reimbursement{unmatched.length === 1 ? '' : 's'} couldn't be matched to submitted expenses
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Detailed-view extras: include toggle + sweep destination + reclassify */}
                  {view === 'detailed' && (
                    <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={s.includeInBudget}
                          onChange={() => toggleInclude(s)}
                          className="rounded border-glass-border bg-surface-3 text-accent w-3 h-3"
                        />
                        <span className={s.includeInBudget ? 'text-text-secondary' : 'text-text-muted'}>
                          Include in budget
                        </span>
                      </label>

                      {showSweep && (
                        <>
                          <span className="text-text-muted">·</span>
                          <label className="flex items-center gap-1">
                            <span className="text-text-muted">Sweep to:</span>
                            <select
                              value={s.sweepDestination}
                              onChange={e => setSweep(s, e.target.value as SweepDestination)}
                              className="bg-surface-3 border border-glass-border rounded px-1.5 py-0.5 text-text-secondary"
                            >
                              {SWEEP_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{SWEEP_LABEL[opt]}</option>
                              ))}
                            </select>
                          </label>
                        </>
                      )}

                      <span className="text-text-muted">·</span>
                      <label className="flex items-center gap-1">
                        <span className="text-text-muted">Type:</span>
                        <select
                          value={s.subtype}
                          onChange={e => reclassify(s, e.target.value as IncomeSubtype)}
                          className="bg-surface-3 border border-glass-border rounded px-1.5 py-0.5 text-text-secondary"
                        >
                          {SUBTYPE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{SUBTYPE_META[opt].label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div className="flex-shrink-0 text-right">
                  <div className={`text-base font-bold ${s.subtype === 'reimbursement' ? 'text-text-secondary' : s.includeInBudget ? 'text-positive' : 'text-text-primary'}`}>
                    {formatCurrency(s.avgAmount)}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    ≈ {formatCurrency(Math.round(monthly))}/mo
                  </div>
                </div>
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-1 flex-wrap mt-2 pt-2 border-t border-glass-border/50">
                {isDetected && (
                  <button
                    onClick={() => confirm(s)}
                    className="px-2.5 py-1 rounded-md bg-positive/15 hover:bg-positive/25 text-positive text-[11px] font-semibold transition-colors"
                  >
                    Confirm
                  </button>
                )}
                <button
                  onClick={() => dismiss(s)}
                  className="px-2.5 py-1 rounded-md bg-surface-3 hover:bg-negative/15 text-text-muted hover:text-negative text-[11px] font-semibold transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => remove(s)}
                  className="px-2.5 py-1 rounded-md bg-surface-3 hover:bg-negative/15 text-text-muted hover:text-negative text-[11px] font-semibold transition-colors ml-auto"
                  title="Delete this source — it'll re-detect on next sync if the pattern continues"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dismissed footer */}
      {dismissedCount > 0 && (
        <div className="pt-2 border-t border-glass-border">
          <button
            onClick={() => setShowDismissed(v => !v)}
            className="text-[11px] text-text-muted hover:text-accent"
          >
            {showDismissed ? '− Hide' : '+ Show'} {dismissedCount} dismissed
          </button>
          {showDismissed && (
            <div className="mt-2 space-y-1">
              {merged.filter(s => s.status === 'dismissed').map(s => (
                <div key={s.id} className="flex items-center gap-2 text-[11px] text-text-muted px-2 py-1">
                  <span className="flex-1 truncate">
                    {SUBTYPE_META[s.subtype].icon} {s.payerDisplay} · {SUBTYPE_META[s.subtype].label} · {formatCurrency(s.avgAmount)}
                  </span>
                  <button onClick={() => restore(s)} className="text-accent hover:underline">restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Avoids JSX-name collision with the `confirm` action handler above.
function confirm0(msg: string): boolean {
  return window.confirm(msg);
}

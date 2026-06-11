// Paycheck & watermark editor — the missing surface two screens already
// pointed at ("Set your paycheck in Settings"). Before this, the paycheck was
// only writable by the one-shot auto-derive (which runs ONLY when everything
// is zero), so the watermark would silently go stale after a job change.
//
// Four load-bearing numbers:
//   netTakeHome  → THE watermark: Safe to Spend, budget surplus, "stay under it"
//   grossMonthly → housing ratio + savings-rate denominators
//   401k / HSA   → savings rate (paycheck-deducted, never visible in bank flow)
import { useEffect, useState } from 'react';
import type { PaycheckBreakdown } from '../../types/budget';
import { getPaycheck, savePaycheck, getExpenses } from '../../stores/budgetStore';
import { defaultPaycheck } from '../../stores/budgetDefaults';
import { computeGuaranteedBase } from '../../utils/savingsScorecard';
import { formatCurrency } from '../../utils/format';

export default function PaycheckPanel() {
  const [paycheck, setPaycheck] = useState<PaycheckBreakdown | null>(null);
  const [draft, setDraft] = useState<PaycheckBreakdown | null>(null);
  const [status, setStatus] = useState('');
  const [deriving, setDeriving] = useState(false);

  useEffect(() => {
    void getPaycheck().then(p => {
      const loaded = p ?? defaultPaycheck;
      setPaycheck(loaded);
      setDraft(loaded);
    });
  }, []);

  if (!draft || !paycheck) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(paycheck);
  const set = (field: keyof PaycheckBreakdown, value: number) =>
    setDraft({ ...draft, [field]: value });

  const save = async () => {
    await savePaycheck(draft);
    setPaycheck(draft);
    setStatus('Saved — the watermark updates everywhere on the next view.');
  };

  const rederive = async () => {
    setDeriving(true);
    setStatus('');
    try {
      const expenses = await getExpenses();
      const base = computeGuaranteedBase(expenses);
      if (base <= 0) {
        setStatus('No paycheck deposits found to derive from — sync your accounts first.');
        return;
      }
      setDraft({
        ...draft,
        netTakeHome: Math.round(base),
        // Same gross-up heuristic the original auto-derive used (~28% deductions).
        grossMonthly: Math.round(base / 0.72),
      });
      setStatus(`Derived ${formatCurrency(base)}/mo from your steady paycheck deposits — review and Save.`);
    } finally {
      setDeriving(false);
    }
  };

  // Plain render helper, NOT a nested component — a nested component is a new
  // type every render, which remounts the <input> and drops focus per keystroke.
  const renderField = (label: string, hint: string, field: keyof PaycheckBreakdown) => (
    <div key={field}>
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-text-muted">$</span>
        <input
          type="number"
          value={draft[field] || 0}
          onChange={e => set(field, Number(e.target.value) || 0)}
          className="w-full bg-surface-2 border border-glass-border focus:border-accent/50 rounded-lg px-2 py-1.5 text-sm text-text-primary mono-num text-right outline-none"
        />
        <span className="text-xs text-text-muted whitespace-nowrap">/mo</span>
      </div>
      <p className="text-[10px] text-text-muted mt-1 leading-tight">{hint}</p>
    </div>
  );

  return (
    <div className="glass-card p-6">
      <h2 className="text-lg font-semibold text-text-primary mb-1">Paycheck & Watermark</h2>
      <p className="text-xs text-text-muted mb-4">
        The numbers the whole budget hangs off. Changing jobs? Let a couple of new paychecks land, then hit re-derive.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderField('Net take-home (the watermark)',
          "Guaranteed monthly deposits you can always count on. Drives Safe to Spend, the budget surplus, and 'stay under it'. Variable/RSU never goes here — that's surplus.",
          'netTakeHome')}
        {renderField('Gross monthly',
          'Pre-tax. Only used for the housing-ratio and savings-rate percentages.',
          'grossMonthly')}
        {renderField('401k contribution',
          "Your per-month payroll deduction. Never shows in the bank, so Iris can't detect it — this is the only place it's counted (savings rate).",
          'retirement401k')}
        {renderField('HSA contribution',
          'Same deal as the 401k — payroll-deducted, counted into your savings rate.',
          'hsaContribution')}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button onClick={() => void save()} disabled={!dirty}
          className="px-4 py-2 rounded-lg bg-accent/20 border border-accent/50 text-accent text-sm font-semibold hover:bg-accent/30 disabled:opacity-30 transition-colors">
          Save
        </button>
        {dirty && (
          <button onClick={() => { setDraft(paycheck); setStatus(''); }}
            className="px-3 py-2 rounded-lg bg-surface-2 border border-glass-border text-text-secondary text-sm hover:bg-surface-3 transition-colors">
            Discard
          </button>
        )}
        <button onClick={() => void rederive()} disabled={deriving}
          className="px-3 py-2 rounded-lg bg-surface-2 border border-glass-border text-text-secondary text-sm hover:bg-surface-3 disabled:opacity-50 transition-colors">
          {deriving ? 'Looking at your deposits…' : '↻ Re-derive from bank deposits'}
        </button>
      </div>
      {status && <p className="text-xs text-positive mt-2">{status}</p>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { Earner, IncomeCadence } from '../../types/budget';
import { getEarners, saveEarner, deleteEarner } from '../../stores/budgetStore';

const PAY_SHAPES: { value: NonNullable<Earner['payShape']>; label: string; helper: string }[] = [
  { value: 'salary',            label: 'Salary',                    helper: 'Same paycheck every period' },
  { value: 'salary_bonus',      label: 'Salary + bonus',            helper: 'Steady checks, plus annual lump' },
  { value: 'salary_commission', label: 'Salary + commission',       helper: 'Steady base, variable on top' },
  { value: 'hourly',            label: 'Hourly',                    helper: 'Hours × rate' },
  { value: 'self_employed',     label: 'Self-employed / 1099',      helper: 'Irregular, you pay your own taxes' },
  { value: 'mix',               label: 'Mix of multiple',           helper: 'Multiple sources, hard to pin down' },
];

const CADENCE_OPTIONS: { value: IncomeCadence; label: string }[] = [
  { value: 'weekly',      label: 'Weekly' },
  { value: 'biweekly',    label: 'Biweekly (every 2 weeks)' },
  { value: 'semimonthly', label: 'Semimonthly (15th + end)' },
  { value: 'monthly',     label: 'Monthly' },
  { value: 'irregular',   label: 'Irregular' },
];

function emptyEarner(idx: number): Earner {
  return {
    id: `earner-${Date.now()}-${idx}`,
    name: '',
    isWorking: true,
    payShape: 'salary',
    submitWorkExpenses: false,
    seedCheckCadence: 'biweekly',
  };
}

export default function HouseholdEarners() {
  const [earners, setEarners] = useState<Earner[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const rows = await getEarners();
      setEarners(rows);
      setLoaded(true);
    })();
  }, []);

  const update = async (e: Earner, patch: Partial<Earner>) => {
    const next = { ...e, ...patch };
    await saveEarner(next);
    setEarners(prev => prev.map(x => x.id === e.id ? next : x));
  };

  const add = async () => {
    const next = emptyEarner(earners.length);
    await saveEarner(next);
    setEarners(prev => [...prev, next]);
  };

  const remove = async (e: Earner) => {
    if (!window.confirm(`Remove ${e.name || 'this earner'}? Their detected income sources stay; only the profile is deleted.`)) return;
    await deleteEarner(e.id);
    setEarners(prev => prev.filter(x => x.id !== e.id));
  };

  if (!loaded) return null;

  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="text-2xl">👥</div>
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary">Household Income Setup</h3>
          <p className="text-xs text-text-muted mt-1">
            One quick profile per earner. Iris uses this as a starting point — once your bank data flows in, detection refines these numbers automatically.
          </p>
        </div>
      </div>

      {earners.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-text-muted mb-3">No earners set up yet. Add yourself first; you can add a partner after.</p>
          <button
            onClick={add}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors"
          >
            + Add primary earner
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {earners.map((e, idx) => (
            <EarnerCard
              key={e.id}
              earner={e}
              ordinal={idx + 1}
              onUpdate={(patch) => update(e, patch)}
              onRemove={() => remove(e)}
              showRemove={earners.length > 1}
            />
          ))}
          <button
            onClick={add}
            className="w-full px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 border border-glass-border text-sm text-text-secondary hover:text-accent transition-colors"
          >
            + Add another earner
          </button>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  earner: Earner;
  ordinal: number;
  showRemove: boolean;
  onUpdate: (patch: Partial<Earner>) => void;
  onRemove: () => void;
}

function EarnerCard({ earner, ordinal, showRemove, onUpdate, onRemove }: CardProps) {
  const variableShapes: NonNullable<Earner['payShape']>[] = ['salary_bonus', 'salary_commission', 'hourly', 'self_employed', 'mix'];
  const showCommissionHint = earner.payShape && variableShapes.includes(earner.payShape);

  return (
    <div className="bg-surface-2 rounded-xl p-4 border border-glass-border space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">👤</span>
          <span className="text-xs text-text-muted">Earner {ordinal}</span>
        </div>
        {showRemove && (
          <button
            onClick={onRemove}
            className="text-[11px] text-text-muted hover:text-negative px-2 py-1"
          >
            Remove
          </button>
        )}
      </div>

      {/* Name + Company */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-text-muted text-[11px] block mb-1">Name</label>
          <input
            type="text"
            value={earner.name}
            onChange={e => onUpdate({ name: e.target.value })}
            placeholder="Their first name"
            className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
          />
        </div>
        <div>
          <label className="text-text-muted text-[11px] block mb-1">Company {!earner.isWorking && <span className="text-text-muted">(optional)</span>}</label>
          <input
            type="text"
            value={earner.company || ''}
            onChange={e => onUpdate({ company: e.target.value })}
            placeholder="Employer name"
            disabled={!earner.isWorking}
            className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Working toggle */}
      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={earner.isWorking}
          onChange={e => onUpdate({ isWorking: e.target.checked })}
          className="rounded border-glass-border bg-surface-3 text-accent w-4 h-4"
        />
        <span className="text-text-secondary">Currently working</span>
      </label>

      {/* Working-only fields */}
      {earner.isWorking && (
        <>
          {/* Pay shape */}
          <div>
            <label className="text-text-muted text-[11px] block mb-1.5">How are you paid?</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PAY_SHAPES.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdate({ payShape: opt.value })}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    earner.payShape === opt.value
                      ? 'bg-accent/15 border-accent/40 text-accent-light'
                      : 'bg-surface-3 border-glass-border text-text-secondary hover:border-accent/30'
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{opt.helper}</div>
                </button>
              ))}
            </div>
            {showCommissionHint && (
              <p className="text-[10px] text-text-muted mt-1.5 italic">
                Variable / commission / bonus pay defaults to budget surplus (sweep destination configurable). You can flip individual sources to "include in budget" later if you'd rather live at OTE pace.
              </p>
            )}
          </div>

          {/* Take-home + cadence */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-text-muted text-[11px] block mb-1">Typical take-home per check</label>
              <input
                type="number"
                step="0.01"
                value={earner.seedTakeHomePerCheck ?? ''}
                onChange={e => onUpdate({ seedTakeHomePerCheck: e.target.value ? (parseFloat(e.target.value) || 0) : undefined })}
                placeholder="$"
                className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="text-text-muted text-[11px] block mb-1">Pay cadence</label>
              <select
                value={earner.seedCheckCadence || 'biweekly'}
                onChange={e => onUpdate({ seedCheckCadence: e.target.value as IncomeCadence })}
                className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
              >
                {CADENCE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-text-muted -mt-1">
            We use this as a placeholder until your bank import takes over. Your detected paychecks always win — this is just a starting line.
          </p>

          {/* Reimbursements */}
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={earner.submitWorkExpenses ?? false}
              onChange={e => onUpdate({ submitWorkExpenses: e.target.checked })}
              className="rounded border-glass-border bg-surface-3 text-accent w-4 h-4"
            />
            <span className="text-text-secondary">Submit work expenses for reimbursement</span>
          </label>
          {earner.submitWorkExpenses && (
            <p className="text-[10px] text-text-muted -mt-2 ml-6">
              Iris will auto-match incoming reimbursement deposits against your submitted expenses.
            </p>
          )}
        </>
      )}
    </div>
  );
}

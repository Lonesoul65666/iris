// Renders a form for any ActionTemplate, driven by its `inputs` array.
// Replaces the hardcoded per-action form rendering in ActionItems.tsx.
// New action types get a form for free just by defining their template.

import { useEffect, useState } from 'react';
import type { ActionTemplate, InputField } from '../../types/actions';
import type { Account } from '../../types/portfolio';
import type { FunMoney } from '../../types/budget';
import { getFunMoney } from '../../stores/budgetStore';

interface Props {
  template: ActionTemplate;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  accounts: Account[];
}

export default function DynamicActionForm({ template, value, onChange, accounts }: Props) {
  const [funMoney, setFunMoney] = useState<FunMoney[]>([]);

  useEffect(() => {
    if (template.inputs.some(f => f.type === 'household-budget')) {
      getFunMoney().then(setFunMoney).catch(() => setFunMoney([]));
    }
  }, [template.inputs]);

  const setField = (key: string, v: string) =>
    onChange({ ...value, [key]: v });

  const fieldValue = (field: InputField): string => {
    const v = value[field.key];
    if (v !== undefined && v !== '') return v;
    if (field.default !== undefined) return String(field.default);
    return '';
  };

  return (
    <div className="space-y-3">
      {template.inputs.map(field => (
        <FieldRow
          key={field.key}
          field={field}
          value={fieldValue(field)}
          onChange={v => setField(field.key, v)}
          accounts={accounts}
          funMoney={funMoney}
        />
      ))}
    </div>
  );
}

interface FieldRowProps {
  field: InputField;
  value: string;
  onChange: (v: string) => void;
  accounts: Account[];
  funMoney: FunMoney[];
}

function FieldRow({ field, value, onChange, accounts, funMoney }: FieldRowProps) {
  const labelText = `${field.label}${field.required ? ' *' : ''}`;
  const baseInput =
    'w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50';

  switch (field.type) {
    case 'number':
    case 'currency':
      return (
        <div>
          <label className="text-xs text-text-muted mb-1 block">{labelText}</label>
          <div className="relative">
            {field.type === 'currency' && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
            )}
            <input
              type="number"
              step={field.type === 'currency' ? '0.01' : 'any'}
              value={value}
              onChange={e => onChange(e.target.value)}
              className={`${baseInput} ${field.type === 'currency' ? 'pl-6' : ''}`}
              placeholder={field.label}
            />
          </div>
        </div>
      );

    case 'date':
      return (
        <div>
          <label className="text-xs text-text-muted mb-1 block">{labelText}</label>
          <input
            type="date"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={baseInput}
          />
        </div>
      );

    case 'ticker':
      return (
        <div>
          <label className="text-xs text-text-muted mb-1 block">{labelText}</label>
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value.toUpperCase())}
            className={`${baseInput} uppercase`}
            placeholder="e.g. VOO"
            maxLength={8}
          />
        </div>
      );

    case 'account-picker': {
      const filtered = accounts.filter(a => {
        if (a.status === 'closed') return false;
        if (field.accountFilter?.type && a.type !== field.accountFilter.type) return false;
        return true;
      });
      return (
        <div>
          <label className="text-xs text-text-muted mb-1 block">{labelText}</label>
          <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className={baseInput}
          >
            <option value="">Select account…</option>
            {filtered.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.institution}) — ${a.totalValue.toLocaleString()}
              </option>
            ))}
          </select>
          {filtered.length === 0 && (
            <p className="text-[10px] text-text-muted mt-1">
              No accounts available{field.accountFilter?.type ? ` of type ${field.accountFilter.type}` : ''}.
            </p>
          )}
        </div>
      );
    }

    case 'household-budget': {
      const defaultEntries: FunMoney[] =
        funMoney.length > 0
          ? funMoney
          : [
              { person: 'Primary', monthlyBudget: 400, monthlySpent: 0 },
              { person: 'Spouse', monthlyBudget: 400, monthlySpent: 0 },
            ];

      let entries: FunMoney[];
      try {
        entries = value ? JSON.parse(value) : defaultEntries;
        if (!Array.isArray(entries)) entries = defaultEntries;
      } catch {
        entries = defaultEntries;
      }

      const updateEntry = (idx: number, patch: Partial<FunMoney>) => {
        const next = entries.map((e, i) => (i === idx ? { ...e, ...patch } : e));
        onChange(JSON.stringify(next));
      };

      const addPerson = () => {
        const next = [
          ...entries,
          { person: `Person ${entries.length + 1}`, monthlyBudget: 0, monthlySpent: 0 },
        ];
        onChange(JSON.stringify(next));
      };

      const removePerson = (idx: number) => {
        if (entries.length <= 1) return;
        const next = entries.filter((_, i) => i !== idx);
        onChange(JSON.stringify(next));
      };

      return (
        <div>
          <label className="text-xs text-text-muted mb-1 block">{labelText}</label>
          <div className="space-y-2">
            {entries.map((entry, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={entry.person}
                  onChange={e => updateEntry(idx, { person: e.target.value })}
                  className={`${baseInput} flex-1`}
                  placeholder="Name"
                />
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={entry.monthlyBudget}
                    onChange={e =>
                      updateEntry(idx, { monthlyBudget: parseFloat(e.target.value) || 0 })
                    }
                    className={`${baseInput} pl-6`}
                    placeholder="Monthly"
                  />
                </div>
                {entries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePerson(idx)}
                    className="text-text-muted hover:text-negative text-sm px-2"
                    aria-label="Remove person"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addPerson}
              className="text-xs text-accent hover:text-accent-light"
            >
              + Add person
            </button>
          </div>
        </div>
      );
    }

    case 'string':
    default:
      return (
        <div>
          <label className="text-xs text-text-muted mb-1 block">{labelText}</label>
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={baseInput}
            placeholder={field.label}
          />
        </div>
      );
  }
}

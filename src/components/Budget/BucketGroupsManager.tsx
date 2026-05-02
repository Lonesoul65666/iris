import { useState, useMemo } from 'react';
import type { BudgetBucket } from '../../types/budget';
import { saveBudgetBuckets } from '../../stores/budgetStore';
import { formatCurrency } from '../../utils/format';

interface Props {
  buckets: BudgetBucket[];
  onChange: (buckets: BudgetBucket[]) => void;
}

interface GroupSummary {
  name: string;
  buckets: BudgetBucket[];
  totalBudget: number;
  totalActual: number;
  isFlex: boolean;          // every member has groupFlex=true
  isPartialFlex: boolean;   // some have it, some don't (inconsistent)
}

const UNGROUPED = '__ungrouped__';

export default function BucketGroupsManager({ buckets, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const groups: GroupSummary[] = useMemo(() => {
    const m = new Map<string, BudgetBucket[]>();
    for (const b of buckets) {
      const key = b.group || UNGROUPED;
      const arr = m.get(key) || [];
      arr.push(b);
      m.set(key, arr);
    }
    const out: GroupSummary[] = [];
    for (const [name, members] of m) {
      const flexCount = members.filter(b => b.groupFlex).length;
      out.push({
        name,
        buckets: members,
        totalBudget: members.reduce((s, b) => s + b.monthlyBudget, 0),
        totalActual: members.reduce((s, b) => s + b.monthlyActual, 0),
        isFlex: flexCount === members.length && members.length > 1,
        isPartialFlex: flexCount > 0 && flexCount < members.length,
      });
    }
    // Real groups first (named), then ungrouped at bottom; within each, alpha by name.
    out.sort((a, b) => {
      if (a.name === UNGROUPED) return 1;
      if (b.name === UNGROUPED) return -1;
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [buckets]);

  const realGroups = groups.filter(g => g.name !== UNGROUPED);
  const ungrouped = groups.find(g => g.name === UNGROUPED);

  const persist = async (next: BudgetBucket[]) => {
    onChange(next);
    await saveBudgetBuckets(next);
  };

  const setBucketGroup = async (category: string, group: string | undefined) => {
    const next = buckets.map(b =>
      b.category === category
        ? { ...b, group: group || undefined, groupFlex: group ? b.groupFlex : false }
        : b
    );
    await persist(next);
  };

  const toggleGroupFlex = async (groupName: string, on: boolean) => {
    const next = buckets.map(b => b.group === groupName ? { ...b, groupFlex: on } : b);
    await persist(next);
  };

  const renameGroup = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return;
    const next = buckets.map(b => b.group === oldName ? { ...b, group: newName.trim() } : b);
    await persist(next);
  };

  const createGroup = async (name: string, bucketCategories: string[]) => {
    if (!name.trim() || bucketCategories.length === 0) return;
    const next = buckets.map(b =>
      bucketCategories.includes(b.category) ? { ...b, group: name.trim() } : b
    );
    await persist(next);
    setNewGroupName('');
  };

  return (
    <details open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)} className="glass-card">
      <summary className="cursor-pointer p-5 list-none flex items-start gap-3 hover:bg-surface-2 transition-colors rounded-2xl">
        <div className="text-xl mt-0.5">🗂️</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-text-primary">Bucket Groups</h3>
            {realGroups.length > 0 && (
              <span className="text-[10px] text-text-muted">
                {realGroups.length} {realGroups.length === 1 ? 'group' : 'groups'} · {realGroups.filter(g => g.isFlex).length} flex
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">
            Group related buckets (e.g. Groceries + Dining → Food). Optionally enable <strong>flex budgeting</strong>: instead of enforcing each bucket separately, the group has one combined budget and individual buckets balance against each other.
          </p>
        </div>
        <div className={`text-text-muted text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</div>
      </summary>

      <div className="px-5 pb-5 space-y-4">
        {/* Existing groups */}
        {realGroups.map(g => (
          <div key={g.name} className="bg-surface-2 rounded-xl p-4 border border-glass-border">
            <div className="flex items-center justify-between gap-2 mb-3">
              <input
                type="text"
                defaultValue={g.name}
                onBlur={e => renameGroup(g.name, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="text-sm font-semibold bg-transparent border border-transparent hover:border-glass-border focus:border-accent/50 rounded px-2 py-1 outline-none text-text-primary flex-1"
              />
              <div className="text-xs text-text-muted">
                {formatCurrency(Math.round(g.totalActual))} / {formatCurrency(Math.round(g.totalBudget))}
              </div>
            </div>

            <div className="space-y-1 mb-3">
              {g.buckets.map(b => (
                <div key={b.category} className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-3">
                  <span className="text-base">{b.icon}</span>
                  <span className="text-xs text-text-primary flex-1 truncate">{b.label}</span>
                  <span className="text-[11px] text-text-muted">{formatCurrency(b.monthlyBudget)}</span>
                  <button
                    onClick={() => setBucketGroup(b.category, undefined)}
                    className="text-[10px] text-text-muted hover:text-negative px-1.5"
                    title="Remove from group"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {g.buckets.length >= 2 && (
              <label className="flex items-start gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={g.isFlex}
                  ref={el => { if (el) el.indeterminate = g.isPartialFlex; }}
                  onChange={e => toggleGroupFlex(g.name, e.target.checked)}
                  className="mt-0.5 rounded border-glass-border bg-surface-3 text-accent w-3.5 h-3.5"
                />
                <div>
                  <div className={g.isFlex ? 'text-text-primary font-semibold' : 'text-text-secondary'}>
                    Flex budget — let buckets balance against each other
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {g.isFlex
                      ? `Group total $${Math.round(g.totalBudget)} enforced; over/under per bucket is fine as long as group stays in budget.`
                      : 'Each bucket enforced separately (default). Toggle on to use one combined budget.'}
                  </div>
                </div>
              </label>
            )}
            {g.buckets.length < 2 && (
              <p className="text-[10px] text-text-muted italic">Add a second bucket to enable flex budgeting.</p>
            )}
          </div>
        ))}

        {/* Create new group */}
        {ungrouped && ungrouped.buckets.length >= 2 && (
          <NewGroupForm
            ungrouped={ungrouped.buckets}
            value={newGroupName}
            onChange={setNewGroupName}
            onCreate={createGroup}
          />
        )}

        {/* Ungrouped buckets list — short list, lets user move into existing groups */}
        {ungrouped && ungrouped.buckets.length > 0 && realGroups.length > 0 && (
          <div className="bg-surface-3 rounded-xl p-4 border border-glass-border">
            <div className="text-xs font-semibold text-text-muted mb-2">Ungrouped buckets</div>
            <div className="space-y-1">
              {ungrouped.buckets.map(b => (
                <div key={b.category} className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-2">
                  <span className="text-base">{b.icon}</span>
                  <span className="text-xs text-text-primary flex-1 truncate">{b.label}</span>
                  <select
                    onChange={e => setBucketGroup(b.category, e.target.value || undefined)}
                    defaultValue=""
                    className="text-[11px] bg-surface-3 border border-glass-border rounded px-1.5 py-0.5 text-text-secondary"
                  >
                    <option value="">Add to group…</option>
                    {realGroups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

interface NewGroupFormProps {
  ungrouped: BudgetBucket[];
  value: string;
  onChange: (v: string) => void;
  onCreate: (name: string, bucketCategories: string[]) => void;
}

function NewGroupForm({ ungrouped, value, onChange, onCreate }: NewGroupFormProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (cat: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const submit = () => {
    if (!value.trim() || selected.size < 2) return;
    onCreate(value, Array.from(selected));
    setSelected(new Set());
  };

  return (
    <div className="bg-surface-2/50 rounded-xl p-4 border border-dashed border-glass-border">
      <div className="text-xs font-semibold text-text-secondary mb-2">+ Create a new group</div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Group name (e.g. Food, Transportation)"
        className="w-full bg-surface-3 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50 mb-2"
      />
      <div className="text-[11px] text-text-muted mb-2">Pick 2+ buckets to add:</div>
      <div className="grid grid-cols-2 gap-1 mb-3 max-h-40 overflow-y-auto">
        {ungrouped.map(b => (
          <label key={b.category} className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-3 cursor-pointer hover:border-accent/30 border border-transparent">
            <input
              type="checkbox"
              checked={selected.has(b.category)}
              onChange={() => toggle(b.category)}
              className="rounded border-glass-border bg-surface-3 text-accent w-3 h-3"
            />
            <span className="text-base">{b.icon}</span>
            <span className="text-[11px] text-text-primary truncate">{b.label}</span>
          </label>
        ))}
      </div>
      <button
        onClick={submit}
        disabled={!value.trim() || selected.size < 2}
        className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Create group ({selected.size} selected)
      </button>
    </div>
  );
}

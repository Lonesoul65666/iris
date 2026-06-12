import { useEffect, useState } from 'react';
import type { Earner, SourceOwner } from '../../types/budget';
import { getEarners, getSourceOwners, saveSourceOwner } from '../../stores/budgetStore';
import { ACCOUNT_META, ACCOUNT_ORDER } from '../../utils/txDisplay';
import { JOINT } from '../../utils/attribution';

// Account owners — the attribution default (couples model). A card in one
// person's name is theirs; the joint checking is 'ours'. Per-transaction
// spender overrides (Expense Manager) beat this; unmapped accounts resolve
// to 'ours' so nothing is ever silently attributed to one person.
export default function AccountOwners() {
  const [earners, setEarners] = useState<Earner[]>([]);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [e, rows] = await Promise.all([getEarners(), getSourceOwners()]);
      setEarners(e);
      const map: Record<string, string> = {};
      for (const r of rows) map[r.source] = r.owner;
      setOwners(map);
      setLoaded(true);
    })();
  }, []);

  const setOwner = async (source: string, owner: string) => {
    setOwners(prev => ({ ...prev, [source]: owner }));
    await saveSourceOwner({ source, owner } satisfies SourceOwner);
  };

  if (!loaded || earners.length === 0) return null;

  const choices = [
    ...earners.map(e => ({ id: e.id, label: e.name || 'Unnamed' })),
    { id: JOINT, label: 'Ours' },
  ];

  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="text-2xl">🏷️</div>
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary">Account Owners</h3>
          <p className="text-xs text-text-muted mt-1">
            Whose spending is it by default? Transactions inherit their account's owner — you can still flip any single transaction in the Expense Manager. Unset accounts count as shared.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {ACCOUNT_ORDER.map(src => {
          const meta = ACCOUNT_META[src];
          const current = owners[src] ?? JOINT;
          return (
            <div key={src} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-glass-border">
              <div className="flex items-center gap-2 min-w-0">
                <span>{meta.icon}</span>
                <span className="text-sm text-text-primary truncate">{meta.name}</span>
                {meta.last4 && <span className="text-[10px] text-text-muted">···{meta.last4}</span>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {choices.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setOwner(src, c.id)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                      current === c.id
                        ? 'bg-accent/20 text-accent'
                        : 'bg-white/5 text-text-muted hover:bg-accent/10 hover:text-accent'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

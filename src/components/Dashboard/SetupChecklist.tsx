import { useEffect, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { getSetting, saveSetting } from '../../stores/portfolioStore';
import { defaultAccounts } from '../../stores/defaultData';
import type { Account } from '../../types/portfolio';

interface SetupItem {
  key: string;
  label: string;
  done: boolean;
  action: () => void;
}

export default function SetupChecklist() {
  const { accounts, profile, llmReady, setView } = useAppData();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [lastDismissedAt, setLastDismissedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const d = await getSetting('setup_checklist_dismissed_forever');
      const ts = await getSetting('setup_checklist_dismissed_at');
      setDismissed(d === 'true');
      setLastDismissedAt(ts ?? null);
    })();
  }, []);

  if (dismissed === null) return null; // still loading dismiss state
  if (dismissed) return null;

  // Re-suppress for 24h after a soft dismiss
  if (lastDismissedAt) {
    const ageMs = Date.now() - new Date(lastDismissedAt).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) return null;
  }

  const items: SetupItem[] = [
    {
      key: 'provider',
      label: 'Connect an AI provider',
      done: llmReady,
      action: () => setView('settings'),
    },
    {
      key: 'portfolio',
      label: 'Load your real portfolio',
      done: accounts.length > 0 && !isDefaultPortfolio(accounts),
      action: () => setView('portfolio'),
    },
    {
      key: 'profile',
      label: 'Personalize your profile',
      done: !!profile?.name && profile.name.trim().length > 0,
      action: () => setView('settings'),
    },
  ];

  const remaining = items.filter(i => !i.done);
  if (remaining.length === 0) return null;

  const softDismiss = async () => {
    await saveSetting('setup_checklist_dismissed_at', new Date().toISOString());
    setLastDismissedAt(new Date().toISOString());
  };

  const permaDismiss = async () => {
    await saveSetting('setup_checklist_dismissed_forever', 'true');
    setDismissed(true);
  };

  return (
    <div className="glass-card p-5 border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent">
      <div className="flex items-start gap-4">
        <div className="text-3xl">🧭</div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-text-primary">Finish setting up Iris</h3>
            <span className="text-xs text-text-muted">{items.length - remaining.length}/{items.length} done</span>
          </div>
          <p className="text-xs text-text-secondary mb-4">
            You've got {remaining.length} step{remaining.length === 1 ? '' : 's'} left to get the most out of Iris.
          </p>
          <ul className="space-y-2 mb-4">
            {items.map(item => (
              <li key={item.key} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.done ? 'bg-positive/20 text-positive' : 'border-2 border-text-muted'
                }`}>
                  {item.done && <span className="text-xs">✓</span>}
                </div>
                <span className={`text-sm flex-1 ${item.done ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                  {item.label}
                </span>
                {!item.done && (
                  <button onClick={item.action}
                    className="text-xs text-accent hover:text-accent-light transition-colors font-medium">
                    Go &rarr;
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => setView('onboarding')}
              className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-xs font-semibold transition-colors">
              Resume setup
            </button>
            <button onClick={softDismiss}
              className="text-xs text-text-muted hover:text-accent transition-colors">
              Remind me later
            </button>
            <button onClick={permaDismiss}
              className="text-xs text-text-muted hover:text-negative transition-colors ml-auto">
              Don't show again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Detect whether the user is still looking at Scott's seeded sample portfolio
 * vs. their own real data. Content-based — compares structure (account IDs,
 * holding tickers, share counts) against the bundled defaults. Prices aren't
 * compared because live-quote refresh mutates them legitimately.
 *
 * This works for ANY user, not just Scott: the defaults are the defaults.
 * Any structural divergence (added ticker, removed account, different shares,
 * a SimpleFIN sync) flips the result to "real portfolio."
 */
export function isDefaultPortfolio(accounts: Account[] | { id: string; holdings?: { ticker: string; shares: number }[] }[]): boolean {
  if (accounts.length === 0) return true;
  if (accounts.length !== defaultAccounts.length) return false;

  const defaultById = new Map(defaultAccounts.map((a) => [a.id, a]));
  for (const a of accounts) {
    const def = defaultById.get(a.id);
    if (!def) return false; // Unknown account ID → real portfolio.
    const holdings = (a as Account).holdings ?? [];
    if (holdings.length !== def.holdings.length) return false;

    const defByTicker = new Map(def.holdings.map((h) => [h.ticker, h]));
    for (const h of holdings) {
      const d = defByTicker.get(h.ticker);
      if (!d) return false; // New ticker → real.
      if (Math.abs(h.shares - d.shares) > 0.001) return false; // Different shares → real.
    }
  }
  return true;
}

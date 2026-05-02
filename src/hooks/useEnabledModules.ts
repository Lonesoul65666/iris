import { useEffect, useState } from 'react';
import { getSetting } from '../stores/portfolioStore';

/**
 * Iris is modular. Users pick what they're tracking during onboarding (and
 * can change later in Settings). Sidebar tabs, dashboard widgets, action
 * items, and intelligence panels all gate on these flags so a user who only
 * wants budgeting doesn't get pelted with "rebalance your portfolio" prompts.
 *
 * Budget is always on — the app's foundational use case.
 */
export type IrisModule = 'budget' | 'investments' | 'equity' | 'wealth';

export interface EnabledModules {
  budget: boolean;          // always true
  investments: boolean;     // portfolio, health, watchlist, intelligence
  equity: boolean;          // RSU/options/private-co equity
  wealth: boolean;          // home, vehicles, other physical assets
  loaded: boolean;          // false on first render until IndexedDB read completes
}

const DEFAULT: EnabledModules = {
  budget: true,
  investments: false,
  equity: false,
  wealth: false,
  loaded: false,
};

export function useEnabledModules(): EnabledModules {
  const [modules, setModules] = useState<EnabledModules>(DEFAULT);

  useEffect(() => {
    (async () => {
      const stored = await getSetting<IrisModule[]>('enabled_modules');
      if (stored && Array.isArray(stored)) {
        setModules({
          budget: true, // always on
          investments: stored.includes('investments'),
          equity: stored.includes('equity'),
          wealth: stored.includes('wealth'),
          loaded: true,
        });
      } else {
        // No selection yet — assume all on so existing users don't lose tabs
        // mid-flight. The onboarding wizard writes this setting on completion.
        setModules({ budget: true, investments: true, equity: true, wealth: true, loaded: true });
      }
    })();
  }, []);

  return modules;
}

/** List the views (sidebar tabs) that should be visible given the enabled modules. */
export function visibleViews(modules: EnabledModules): Set<string> {
  const visible = new Set<string>(['dashboard', 'chat', 'settings', 'first-report', 'onboarding']);
  if (modules.budget) visible.add('budget');
  if (modules.investments) {
    visible.add('portfolio');
    visible.add('health');
    visible.add('watchlist');
    visible.add('intelligence');
  }
  if (modules.equity) visible.add('equity');
  return visible;
}

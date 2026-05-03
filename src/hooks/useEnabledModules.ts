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
  investments: boolean;     // portfolio, health, watchlist, intelligence, chat, first-report
  equity: boolean;          // RSU/options/private-co equity
  wealth: boolean;          // home, vehicles, other physical assets
  loaded: boolean;          // false on first render until IndexedDB read completes
}

/**
 * Phase-1 lock. While true, ignore the user's stored module preferences and
 * force budget-only. The deferred views (Investments, Health Check, Equity,
 * Watchlist, Intelligence, Ask Iris, First Report) stay in the codebase but
 * are hidden from the sidebar per ADR-0001. Their stored preferences are
 * preserved untouched — when ADR-0002 opens Phase 2, flip this to false and
 * the user's modules light up again.
 *
 * See: docs/adr/0001-phase-1-scope.md
 */
const PHASE_1_LOCK = true;

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
    if (PHASE_1_LOCK) {
      // Skip the IndexedDB read entirely. Budget-only, immediately. The user's
      // stored preferences are not touched — we just don't honor them today.
      setModules({ budget: true, investments: false, equity: false, wealth: false, loaded: true });
      return;
    }
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
  // Always-visible: the structural views every user needs regardless of
  // module selection. Onboarding is the entry point; settings is where you
  // control everything; dashboard is the home surface.
  const visible = new Set<string>(['dashboard', 'settings', 'onboarding']);
  if (modules.budget) visible.add('budget');
  if (modules.investments) {
    // Ask Iris (chat) and the First Report are part of the investment-intelligence
    // tier — they depend on portfolio data. They re-enable when investments do.
    visible.add('portfolio');
    visible.add('health');
    visible.add('watchlist');
    visible.add('intelligence');
    visible.add('chat');
    visible.add('first-report');
  }
  if (modules.equity) visible.add('equity');
  return visible;
}

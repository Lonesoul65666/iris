import { useMemo } from 'react';
import { useAppData } from '../context/AppDataContext';
import { isDefaultPortfolio } from '../components/Dashboard/SetupChecklist';

/**
 * Single source of truth for "is this a fresh user with no real data yet?"
 *
 * Every dashboard widget, action item, and intelligence panel should gate
 * its computed/recommended output on `hasAnyRealData`. If false, the widget
 * should render an empty state ("Connect data to see X") instead of running
 * its calculation on zeros and emitting confident-looking placeholder numbers.
 *
 * Granular flags exist so widgets can refine the gate (e.g. an investment
 * widget cares about `hasPortfolio`; a budget widget cares about `hasExpenses`).
 */
export interface RealDataFlags {
  hasPortfolio: boolean;       // user has accounts that aren't the bundled defaults
  hasProfile: boolean;         // profile.name or annualIncome is set
  hasExpenses: boolean;        // any transactions ingested (real or imported)
  hasEquity: boolean;          // equity profile with non-zero shares
  hasIncome: boolean;          // paycheck or annualIncome > 0
  hasAnyRealData: boolean;     // true if ANY of the above is true
}

export function useHasRealData(): RealDataFlags {
  const { accounts, profile, equity, rawExpenses, dashPaycheck } = useAppData();

  return useMemo<RealDataFlags>(() => {
    const hasPortfolio = accounts.length > 0 && !isDefaultPortfolio(accounts);
    const hasProfile = !!(profile?.name?.trim() || (profile?.annualIncome ?? 0) > 0);
    const hasExpenses = Array.isArray(rawExpenses) && rawExpenses.length > 0;
    const hasEquity = !!(equity && (equity.totalShares ?? 0) > 0);
    const hasIncome = !!(
      (profile?.annualIncome ?? 0) > 0 ||
      (dashPaycheck?.grossMonthly ?? 0) > 0
    );
    return {
      hasPortfolio,
      hasProfile,
      hasExpenses,
      hasEquity,
      hasIncome,
      hasAnyRealData: hasPortfolio || hasProfile || hasExpenses || hasEquity || hasIncome,
    };
  }, [accounts, profile, equity, rawExpenses, dashPaycheck]);
}

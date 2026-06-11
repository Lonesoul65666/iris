import { useEffect, useMemo, useState } from 'react';
import type { Expense, BudgetBucket, IncomeSource, NotificationPreferences } from '../../types/budget';
import { defaultNotificationPreferences } from '../../types/budget';
import { detectTriggers, type Trigger, type TriggerAction } from '../../utils/triggerDetector';
import { getSetting, saveSetting } from '../../stores/portfolioStore';
import { getIncomeSources } from '../../stores/budgetStore';
import { notificationPrefsStoreKey } from '../Settings/NotificationSettings';
import { currentMonthKey } from '../../utils/transactionAnalysis';

interface Props {
  expenses: Expense[];
  buckets: BudgetBucket[];
  /** Compact variant for Dashboard. */
  compact?: boolean;
  /** Wires "See breakdown" to the category drilldown. */
  onViewCategory?: (category: string) => void;
}

// Dismissals persist (keyed by trigger id → month dismissed) so an
// acknowledged alert stays gone for the rest of that month instead of
// resurrecting on every page load. A new month re-evaluates honestly.
const DISMISSALS_KEY = 'trigger_dismissals';

/** Only render actions that actually DO something. "Sweep now" and "Classify
 *  now" had no handlers anywhere — a button that does nothing on click is how
 *  users learn to distrust the whole app. They return when the features exist. */
function isActionable(a: TriggerAction, onViewCategory?: (c: string) => void): boolean {
  if (a.kind === 'acknowledge' || a.kind === 'snooze') return true;
  if (a.kind === 'view_breakdown') return Boolean(onViewCategory && typeof a.payload?.category === 'string');
  return false;
}

const SEVERITY_STYLES: Record<Trigger['severity'], string> = {
  urgent:  'bg-negative/10 border-negative/40 text-negative',
  warning: 'bg-warning/10 border-warning/30 text-warning',
  info:    'bg-accent/10 border-accent/30 text-accent-light',
  success: 'bg-positive/10 border-positive/30 text-positive',
};

const SEVERITY_ICON: Record<Trigger['severity'], string> = {
  urgent: '⚠️',
  warning: '⚡',
  info: '💡',
  success: '✓',
};

export default function TriggerCenter({ expenses, buckets, compact = false, onViewCategory }: Props) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getSetting<NotificationPreferences>(notificationPrefsStoreKey);
      const incomeSources = await getIncomeSources();
      const storedDismissals = await getSetting<Record<string, string>>(DISMISSALS_KEY);
      if (stored) setPrefs({ ...defaultNotificationPreferences, ...stored });
      if (storedDismissals) setDismissed(storedDismissals);
      setSources(incomeSources);
      setLoaded(true);
    })();
  }, []);

  const triggers: Trigger[] = useMemo(() => {
    if (!loaded) return [];
    const thisMonth = currentMonthKey();
    return detectTriggers(
      { expenses, buckets, incomeSources: sources },
      { prefs },
    )
      .filter(t => dismissed[t.id] !== thisMonth)
      // Bucket-level pace alerts are now surfaced by BudgetPulse. Keep group-level
      // (id contains "-group-") and all non-pace triggers (surplus, classify, etc).
      .filter(t => {
        const isPaceKey = t.key === 'pace_80' || t.key === 'pace_90' || t.key === 'pace_100';
        const isGroupLevel = t.id.includes('-group-');
        return !isPaceKey || isGroupLevel;
      });
  }, [loaded, expenses, buckets, sources, prefs, dismissed]);

  const handleAction = (t: Trigger, a: TriggerAction) => {
    if (a.kind === 'acknowledge' || a.kind === 'snooze') {
      const next = { ...dismissed, [t.id]: currentMonthKey() };
      setDismissed(next);
      void saveSetting(DISMISSALS_KEY, next);
      return;
    }
    if (a.kind === 'view_breakdown' && typeof a.payload?.category === 'string') {
      onViewCategory?.(a.payload.category);
    }
  };

  if (!loaded || triggers.length === 0) return null;

  return (
    <div className={`space-y-2 ${compact ? '' : ''}`}>
      {triggers.map(t => {
        const style = SEVERITY_STYLES[t.severity];
        return (
          <div
            key={t.id}
            className={`glass-card border p-3 ${style.includes('bg-') ? style.split(' ').filter(c => !c.startsWith('text-')).join(' ') : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className={`text-lg flex-shrink-0 ${style.split(' ').find(c => c.startsWith('text-')) ?? ''}`}>
                {SEVERITY_ICON[t.severity]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary">{t.title}</div>
                {t.detail && <div className="text-xs text-text-muted mt-0.5">{t.detail}</div>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {t.actions.filter(a => isActionable(a, onViewCategory)).map((a, i) => (
                    <button
                      key={i}
                      onClick={() => handleAction(t, a)}
                      className="px-2.5 py-1 rounded-md bg-surface-2 hover:bg-surface-3 border border-glass-border text-text-secondary hover:text-accent text-[11px] font-semibold transition-colors"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

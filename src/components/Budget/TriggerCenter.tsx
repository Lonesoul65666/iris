import { useEffect, useMemo, useState } from 'react';
import type { Expense, BudgetBucket, IncomeSource, NotificationPreferences } from '../../types/budget';
import { defaultNotificationPreferences } from '../../types/budget';
import { detectTriggers, type Trigger, type TriggerAction } from '../../utils/triggerDetector';
import { getSetting } from '../../stores/portfolioStore';
import { getIncomeSources } from '../../stores/budgetStore';
import { notificationPrefsStoreKey } from '../Settings/NotificationSettings';

interface Props {
  expenses: Expense[];
  buckets: BudgetBucket[];
  /** Compact variant for Dashboard. */
  compact?: boolean;
  /** Optional handler when actions fire — UI binds, e.g. navigate to budget category. */
  onAction?: (trigger: Trigger, action: TriggerAction) => void;
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

export default function TriggerCenter({ expenses, buckets, compact = false, onAction }: Props) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getSetting<NotificationPreferences>(notificationPrefsStoreKey);
      const incomeSources = await getIncomeSources();
      if (stored) setPrefs({ ...defaultNotificationPreferences, ...stored });
      setSources(incomeSources);
      setLoaded(true);
    })();
  }, []);

  const triggers: Trigger[] = useMemo(() => {
    if (!loaded) return [];
    return detectTriggers(
      { expenses, buckets, incomeSources: sources },
      { prefs },
    )
      .filter(t => !dismissed.has(t.id))
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
      setDismissed(prev => new Set(prev).add(t.id));
    }
    onAction?.(t, a);
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
                  {t.actions.map((a, i) => (
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

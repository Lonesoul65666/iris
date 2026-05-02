import { useEffect, useState } from 'react';
import type { NotificationPreferences } from '../../types/budget';
import { defaultNotificationPreferences } from '../../types/budget';
import { getSetting, saveSetting } from '../../stores/portfolioStore';

const STORE_KEY = 'notification_prefs';

interface ToggleRow {
  key: keyof NotificationPreferences;
  label: string;
  helper: string;
}

const HELPFUL_ROWS: ToggleRow[] = [
  { key: 'pace_80',                      label: 'Pace warning at 80%',         helper: 'Heads-up before you blow the budget' },
  { key: 'pace_90',                      label: 'Pace warning at 90%',         helper: 'Last-call warning' },
  { key: 'pace_100',                     label: 'Over-budget alert',           helper: 'You crossed the line' },
  { key: 'reimbursement_matched',        label: 'Reimbursement matched',       helper: 'When work expenses get paid back' },
  { key: 'surplus_available',            label: 'Variable surplus ready',      helper: 'When commission/bonus lands and is ready to sweep' },
  { key: 'subscription_confirmed',       label: 'Recurring bill detected',     helper: 'When a new subscription pattern emerges' },
  { key: 'income_classification_needed', label: 'Classification needed',       helper: 'When an inflow needs a one-tap label' },
];

const NICE_ROWS: ToggleRow[] = [
  { key: 'weekly_summary', label: 'Weekly summary',           helper: 'Saturday recap of the week' },
  { key: 'monthly_trends', label: 'Monthly category trends',  helper: 'Where you spent more or less than usual' },
  { key: 'goal_pace_check', label: 'Goal-pace check-in',      helper: 'Are your stashes on track?' },
];

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getSetting<NotificationPreferences>(STORE_KEY);
      if (stored) setPrefs({ ...defaultNotificationPreferences, ...stored });
      setLoaded(true);
    })();
  }, []);

  const toggle = async (key: keyof NotificationPreferences) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await saveSetting(STORE_KEY, next);
  };

  if (!loaded) return null;

  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="text-2xl">🔔</div>
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary">Notifications</h3>
          <p className="text-xs text-text-muted mt-1">
            Three tiers. Critical never goes silent. Helpful is the daily-useful stuff. Nice-to-know is opt-in for ambient monitoring.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Critical — always on */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-negative">Critical</span>
            <span className="text-[10px] text-text-muted">— always on</span>
          </div>
          <div className="space-y-1.5">
            <FixedRow label="Bill won't clear" helper="Cash flow says you'll be short before a bill date" />
            <FixedRow label="Paycheck didn't land" helper="Expected deposit didn't show up on time" />
            <FixedRow label="Suspicious / unusual charge" helper="Outlier transactions get flagged" />
          </div>
        </div>

        {/* Helpful — toggleable, default on */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent-light">Helpful</span>
            <span className="text-[10px] text-text-muted">— on by default</span>
          </div>
          <div className="space-y-1.5">
            {HELPFUL_ROWS.map(row => (
              <ToggleRowEl key={row.key} row={row} active={prefs[row.key]} onToggle={() => toggle(row.key)} />
            ))}
          </div>
        </div>

        {/* Nice-to-know — opt-in */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Nice-to-know</span>
            <span className="text-[10px] text-text-muted">— opt-in</span>
          </div>
          <div className="space-y-1.5">
            {NICE_ROWS.map(row => (
              <ToggleRowEl key={row.key} row={row} active={prefs[row.key]} onToggle={() => toggle(row.key)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRowEl({ row, active, onToggle }: { row: ToggleRow; active: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer p-2.5 rounded-lg hover:bg-surface-2 transition-colors">
      <input
        type="checkbox"
        checked={active}
        onChange={onToggle}
        className="mt-0.5 rounded border-glass-border bg-surface-3 text-accent w-4 h-4"
      />
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${active ? 'text-text-primary' : 'text-text-muted'}`}>{row.label}</div>
        <div className="text-[11px] text-text-muted mt-0.5">{row.helper}</div>
      </div>
    </label>
  );
}

function FixedRow({ label, helper }: { label: string; helper: string }) {
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg bg-negative/5 border border-negative/15">
      <div className="mt-0.5 w-4 h-4 rounded-full bg-negative/30 flex items-center justify-center text-negative text-[10px] flex-shrink-0">●</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary">{label}</div>
        <div className="text-[11px] text-text-muted mt-0.5">{helper}</div>
      </div>
    </div>
  );
}

export { STORE_KEY as notificationPrefsStoreKey };

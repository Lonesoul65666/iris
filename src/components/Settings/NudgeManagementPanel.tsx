import { useEffect, useState } from 'react';
import { listNudgeDismisses, deleteNudgeDismiss, clearAllNudgeDismisses } from '../../stores/portfolioStore';
import { dismissIsActive, prettyNudgeId, type DismissState } from '../../utils/nudgeEngine';

export default function NudgeManagementPanel() {
  const [records, setRecords] = useState<DismissState[] | null>(null);
  const [now, setNow] = useState(new Date());

  const reload = async () => {
    const raw = await listNudgeDismisses();
    const valid = raw.filter((r): r is DismissState =>
      !!r && typeof r === 'object' && typeof (r as DismissState).id === 'string'
    );
    // Only show records still suppressing a nudge. Expired snoozes = already self-resetting.
    const n = new Date();
    setNow(n);
    setRecords(valid.filter(r => dismissIsActive(r, n)));
  };

  useEffect(() => { reload(); }, []);

  if (records === null) return null;

  const reset = async (id: string) => {
    await deleteNudgeDismiss(id);
    await reload();
  };

  const resetAll = async () => {
    if (!confirm('Bring back every dismissed and snoozed nudge?')) return;
    await clearAllNudgeDismisses();
    await reload();
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-text-primary mb-1">Notifications</h3>
          <p className="text-xs text-text-muted">
            Nudges you've dismissed or snoozed from the Dashboard. Resetting brings a nudge back immediately — it'll resurface if the underlying condition still holds.
          </p>
        </div>
        {records.length > 1 && (
          <button
            onClick={resetAll}
            className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-glass-border text-xs text-text-secondary hover:text-accent transition-colors whitespace-nowrap"
          >
            Reset all
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-glass-border text-xs text-text-muted">
          No nudges silenced right now. Dismissed snoozes disappear from this list once they expire.
        </div>
      ) : (
        <ul className="space-y-2">
          {records.map(r => {
            const label = r.title ?? prettyNudgeId(r.id);
            const dismissedAt = new Date(r.dismissedAt);
            let status: string;
            if (r.permanent) {
              status = `Permanently dismissed · ${formatRelative(dismissedAt, now)}`;
            } else {
              const until = new Date(dismissedAt.getTime() + (r.snoozeDays ?? 3) * 24 * 60 * 60 * 1000);
              status = `Snoozed until ${formatShort(until)}`;
            }
            return (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 p-3 rounded-lg bg-white/[0.02] border border-glass-border"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-text-primary truncate">{label}</div>
                  <div className={`text-[11px] mt-0.5 ${r.permanent ? 'text-negative/80' : 'text-text-muted'}`}>
                    {status}
                  </div>
                </div>
                <button
                  onClick={() => reset(r.id)}
                  className="px-3 py-1 rounded-lg text-xs font-medium text-accent hover:bg-accent/10 transition-colors whitespace-nowrap"
                >
                  Reset
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatRelative(date: Date, now: Date): string {
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

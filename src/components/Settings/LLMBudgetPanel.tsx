/**
 * LLM Budget Panel — daily cap control + live usage bar.
 *
 * Protects Scott (and future paying users) from runaway LLM spend. Shows
 * today's cloud calls against a user-tuneable cap with a "reset today" escape
 * hatch. Local (Ollama) calls are displayed too but never count against the
 * cap since they're free.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  getDailyCap,
  setDailyCap,
  usageSummary,
  resetUsageToday,
  subscribeUsage,
  DEFAULT_DAILY_CAP,
} from '../../services/llm';

interface Summary {
  cap: number;
  used: number;
  remaining: number;
  local: number;
  percent: number;
  dangerZone: boolean;
}

export default function LLMBudgetPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [capInput, setCapInput] = useState<string>(String(DEFAULT_DAILY_CAP));
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [s, cap] = await Promise.all([usageSummary(), getDailyCap()]);
    setSummary(s);
    setCapInput(String(cap));
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribeUsage(() => { refresh(); });
    return () => { unsub(); };
  }, [refresh]);

  const saveCap = async () => {
    const n = parseInt(capInput, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setSavedMsg('Cap must be a positive number.');
      setTimeout(() => setSavedMsg(null), 2500);
      return;
    }
    await setDailyCap(n);
    await refresh();
    setSavedMsg('Saved.');
    setTimeout(() => setSavedMsg(null), 2000);
  };

  const resetToday = async () => {
    await resetUsageToday();
    await refresh();
    setResetMsg("Today's counter cleared.");
    setTimeout(() => setResetMsg(null), 2000);
  };

  if (!summary) {
    return (
      <div className="glass-card p-6">
        <h3 className="font-semibold text-text-primary mb-1">LLM Daily Budget</h3>
        <p className="text-xs text-text-muted">Loading usage…</p>
      </div>
    );
  }

  const barColor = summary.dangerZone
    ? 'bg-negative'
    : summary.percent >= 60
    ? 'bg-yellow-500'
    : 'bg-accent';

  return (
    <div className="glass-card p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-text-primary mb-1">LLM Daily Budget</h3>
        <p className="text-xs text-text-muted">
          Cloud calls cost real money. Iris caps daily cloud usage so a runaway
          loop can't burn through your API credit overnight. Local (Ollama)
          calls are free and not counted.
        </p>
      </div>

      {/* Usage bar */}
      <div>
        <div className="flex items-end justify-between mb-1.5">
          <div className="text-sm text-text-primary font-medium">
            {summary.used} / {summary.cap}{' '}
            <span className="text-xs text-text-muted font-normal">cloud calls today</span>
          </div>
          <div className={`text-xs font-medium ${summary.dangerZone ? 'text-negative' : 'text-text-muted'}`}>
            {summary.remaining} left{summary.dangerZone ? ' — getting close' : ''}
          </div>
        </div>
        <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-300`}
            style={{ width: `${summary.percent}%` }}
          />
        </div>
        {summary.local > 0 && (
          <div className="text-xs text-text-muted mt-1.5">
            + {summary.local} local call{summary.local === 1 ? '' : 's'} today (free, uncapped)
          </div>
        )}
      </div>

      {/* Cap tuner */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs text-text-muted mb-1 block">Daily cap (cloud calls)</label>
          <input
            type="number"
            min={1}
            step={1}
            value={capInput}
            onChange={e => setCapInput(e.target.value)}
            className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
          />
        </div>
        <button
          onClick={saveCap}
          className="px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors"
        >
          Save Cap
        </button>
        <button
          onClick={resetToday}
          className="px-4 py-2 bg-surface-2 hover:bg-surface-3 border border-glass-border rounded-lg text-sm font-medium text-text-primary transition-colors"
          title="Clear today's counter — useful after adding a new key or recovering from a flood of test calls"
        >
          Reset Today
        </button>
        {savedMsg && <span className="text-xs text-positive self-center">{savedMsg}</span>}
        {resetMsg && <span className="text-xs text-positive self-center">{resetMsg}</span>}
      </div>

      {summary.remaining === 0 && (
        <div className="rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
          Cap hit for today. Iris will route to local (Ollama) only until midnight
          or until you raise the cap / reset the counter.
        </div>
      )}
    </div>
  );
}

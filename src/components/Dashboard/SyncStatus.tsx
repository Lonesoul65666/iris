// Account-freshness indicator + one-click refresh for the dashboard HUD.
//
// Two doorways to the same delta sync (see syncTellerTransactions):
//   • Fresh (<48h): a quiet "Updated 3h ago · ↻" — information, not a chore.
//     Hover shows what the last pull changed.
//   • Stale (>48h) or never synced: a pulsing amber "Refresh your accounts"
//     button that's hard to miss — so the non-power-user just taps once.
// No auto-sync, no polling: it only hits Teller on a human click (debounced).
import { useCallback, useEffect, useState } from 'react';
import { getLastTellerSync, getLastSyncSummary, syncTellerTransactions, STALE_HOURS, type SyncSummary } from '../../lib/syncTellerTransactions';

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / 3_600_000;
  if (h < 1) { const m = Math.max(1, Math.round(ms / 60_000)); return `${m} min ago`; }
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "7 new · 50 updated · through Jun 10" — the human-readable "what synced".
function describe(s: SyncSummary): string {
  const parts: string[] = [];
  parts.push(`${s.txNew} new`);
  if (s.txUpdated) parts.push(`${s.txUpdated} updated`);
  if (s.incomeNew) parts.push(`${s.incomeNew} income`);
  let out = parts.join(' · ');
  if (s.through) out += ` · through ${fmtDate(s.through)}`;
  return out;
}

type Phase = 'idle' | 'syncing' | 'done' | 'error' | 'ratelimited';

export default function SyncStatus() {
  const [lastSync, setLastSync] = useState<string | null | undefined>(undefined); // undefined = still loading
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState('');

  useEffect(() => {
    void getLastTellerSync().then(setLastSync);
    void getLastSyncSummary().then(setSummary);
  }, []);

  const onSync = useCallback(async () => {
    setPhase('syncing');
    try {
      const r = await syncTellerTransactions();
      if (r.rateLimited) { setPhase('ratelimited'); setNote('Banks are busy — try again in a few minutes.'); return; }
      if (!r.ok || !r.summary) { setPhase('error'); setNote('Couldn’t refresh. Try again shortly.'); return; }
      if (!r.summary.partial) setLastSync(r.summary.syncedAt);
      setSummary(r.summary);
      setPhase(r.summary.partial ? 'error' : 'done');
      if (r.skipped) { setPhase('done'); setNote('Already up to date ✓'); return; }
      const issues: string[] = [];
      if (r.summary.brokenBanks.length) issues.push(`${r.summary.brokenBanks.join(', ')} needs reconnecting`);
      if (r.summary.failedBanks.length) issues.push(`${r.summary.failedBanks.join(', ')} didn't respond — data may be incomplete`);
      setNote(`${r.summary.partial ? '⚠ Partial sync: ' : '✓ '}${describe(r.summary)}${issues.length ? ` — ${issues.join('; ')}` : ''}`);
      // Let them read the summary, then refresh the numbers — whenever anything
      // actually changed, even on a partial sync (imported data must show up;
      // the warning re-renders from the persisted summary after reload).
      const changed = r.summary.txNew + r.summary.txUpdated + r.summary.incomeNew > 0;
      if (changed) setTimeout(() => window.location.reload(), r.summary.partial ? 5000 : 2600);
    } catch {
      setPhase('error');
      setNote('Couldn’t refresh. Try again shortly.');
    }
  }, []);

  if (lastSync === undefined) return null; // loading — show nothing rather than flicker

  if (phase === 'syncing') {
    return (
      <span className="cyber-chip" style={{ color: 'var(--color-cyber-cyan)' }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-cyber-cyan)' }} />
        Updating accounts…
      </span>
    );
  }
  if (phase === 'done' || phase === 'error' || phase === 'ratelimited') {
    return <span className={`text-xs font-medium ${phase === 'done' ? 'text-positive' : 'text-warning'}`}>{note}</span>;
  }

  const hours = lastSync ? (Date.now() - new Date(lastSync).getTime()) / 3_600_000 : Infinity;
  const stale = hours >= STALE_HOURS;
  const lastPull = summary ? `Last pull: ${describe(summary)}` : 'Click to refresh accounts now';

  if (stale) {
    return (
      <button onClick={() => void onSync()} title={lastPull}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warning/15 border border-warning/40 text-warning text-xs font-semibold hover:bg-warning/25 transition-colors animate-pulse">
        ↻ Refresh your accounts {lastSync ? `· ${ago(lastSync)}` : '· never synced'}
      </button>
    );
  }
  return (
    <button onClick={() => void onSync()} title={lastPull}
      className="inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-accent-light text-xs font-semibold hover:bg-accent/20 transition-colors">
      <span className="w-1.5 h-1.5 rounded-full bg-positive" />
      ↻ Update
      <span className="text-text-muted font-normal">· updated {lastSync ? ago(lastSync) : 'never'}</span>
    </button>
  );
}

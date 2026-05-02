import { useState } from 'react';
import { loadSampleData, clearAllUserData } from '../../services/sampleData';

interface Props {
  /** Called after a load or clear so the parent can refresh state. */
  onDataChanged?: () => void;
}

export default function SampleDataPanel({ onDataChanged }: Props) {
  const [busy, setBusy] = useState<'idle' | 'load' | 'clear'>('idle');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    if (!confirm('Load sample data? This will overwrite any existing budget buckets, stashes, and accounts with the bundled sample set.')) return;
    setBusy('load');
    setError(null);
    setResult(null);
    try {
      const r = await loadSampleData();
      setResult(`Loaded ${r.buckets} budget buckets, ${r.sinkingFunds} stashes, ${r.accounts} accounts, ${r.expenses} sample transactions.`);
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('idle');
    }
  };

  const handleClear = async () => {
    if (!confirm('Wipe ALL data and start fresh? This deletes every transaction, budget bucket, account holding, stash, recurring decision, income source, and earner profile in this browser. Cannot be undone.')) return;
    if (!confirm('Last chance — really wipe everything?')) return;
    setBusy('clear');
    setError(null);
    setResult(null);
    try {
      await clearAllUserData();
      setResult('All data cleared. Reloading…');
      onDataChanged?.();
      // Force a full reload — the only way to reset module-level caches and
      // React state. Brief delay so the success message paints first.
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('idle');
    }
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="text-2xl">🧪</div>
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary">Sample data</h3>
          <p className="text-xs text-text-muted mt-1">
            Drop in a fully-populated dataset to explore how Iris feels with real numbers. You can clear it later and start fresh — or import your actual transactions over it.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleLoad}
          disabled={busy !== 'idle'}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dim text-white text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {busy === 'load' ? 'Loading…' : '⬇ Load sample data'}
        </button>
        <button
          onClick={handleClear}
          disabled={busy !== 'idle'}
          className="px-4 py-2 rounded-lg bg-surface-2 hover:bg-negative/15 border border-glass-border text-xs text-text-muted hover:text-negative font-semibold transition-colors disabled:opacity-50"
        >
          {busy === 'clear' ? 'Clearing…' : '✕ Clear all data'}
        </button>
      </div>

      {result && (
        <div className="mt-3 text-[11px] text-positive p-2.5 rounded-lg bg-positive/10 border border-positive/20">
          ✓ {result}
        </div>
      )}
      {error && (
        <div className="mt-3 text-[11px] text-negative p-2.5 rounded-lg bg-negative/10 border border-negative/20">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

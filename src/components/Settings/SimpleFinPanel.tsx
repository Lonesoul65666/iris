import { useEffect, useState } from 'react';
import {
  exchangeSetupToken,
  saveSimpleFinAccessUrl,
  syncAllFromSimpleFin,
  getSimpleFinStatus,
  disconnectSimpleFin,
  type SimpleFinStatus,
  type SyncResult,
  type TransactionSyncResult,
} from '../../services/simplefin';

interface CombinedResult {
  accounts: SyncResult;
  transactions: TransactionSyncResult;
}

interface Props {
  /** When true, render a compact layout for onboarding. */
  compact?: boolean;
  onSynced?: (result: CombinedResult) => void;
}

/**
 * SimpleFIN connect/sync panel. Used in onboarding step 3 and Settings → Data.
 * Token-paste flow — user is directed to sign up at beta-bridge.simplefin.org first.
 */
export default function SimpleFinPanel({ compact = false, onSynced }: Props) {
  const [status, setStatus] = useState<SimpleFinStatus | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'idle' | 'exchange' | 'sync'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CombinedResult | null>(null);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    (async () => setStatus(await getSimpleFinStatus()))();
  }, []);

  const connect = async () => {
    setError(null);
    setBusy('exchange');
    try {
      const accessUrl = await exchangeSetupToken(token);
      await saveSimpleFinAccessUrl(accessUrl);
      setToken('');
      setStatus(await getSimpleFinStatus());
      // Auto-run a first sync.
      await runSync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('idle');
    }
  };

  const runSync = async () => {
    setError(null);
    setBusy('sync');
    try {
      const result = await syncAllFromSimpleFin({ daysBack: 90 });
      setLastResult(result);
      setStatus(await getSimpleFinStatus());
      onSynced?.(result);
      const allErrors = [...result.accounts.errors, ...result.transactions.errors];
      if (allErrors.length) setError(allErrors.join(' · '));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('idle');
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect SimpleFIN? Your accounts in Iris stay — this only removes the auto-sync link.')) return;
    await disconnectSimpleFin();
    setStatus(await getSimpleFinStatus());
    setLastResult(null);
  };

  const connected = status?.connected;

  return (
    <div className={`glass-card ${compact ? 'p-4' : 'p-5'} border border-glass-border`}>
      <div className="flex items-start gap-3 mb-3">
        <div className="text-2xl flex-shrink-0">🔗</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-text-primary">Auto-sync via SimpleFIN</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/20 text-accent-light uppercase tracking-wider">
              $15/yr
            </span>
            {connected && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-positive/20 text-positive uppercase tracking-wider">
                Connected
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1 leading-relaxed">
            One low-cost service that pulls holdings & balances from Fidelity, Bank of America, Coinbase, and 20,000+ other institutions into Iris.
            You pay SimpleFIN directly — Iris never sees your bank credentials.
          </p>
        </div>
      </div>

      {!connected && (
        <>
          <ol className="text-xs text-text-secondary space-y-1.5 mb-3 pl-4 list-decimal">
            <li>
              Sign up at{' '}
              <a
                href="https://beta-bridge.simplefin.org/"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                beta-bridge.simplefin.org
              </a>{' '}
              (~2 min).
            </li>
            <li>Connect your institutions there (pay the $15/yr fee to SimpleFIN).</li>
            <li>Generate a <span className="font-semibold text-text-primary">Setup Token</span> and paste below.</li>
          </ol>

          <div className="space-y-2">
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your SimpleFIN setup token"
                className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 pr-16 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 font-mono"
                disabled={busy !== 'idle'}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted hover:text-accent px-2 py-1"
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <button
              onClick={connect}
              disabled={!token.trim() || busy !== 'idle'}
              className="w-full px-4 py-2 rounded-lg bg-accent hover:bg-accent-dim text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'exchange' ? 'Connecting…' : busy === 'sync' ? 'Importing accounts…' : 'Connect & import'}
            </button>
          </div>
        </>
      )}

      {connected && (
        <div className="space-y-3">
          <div className="text-xs text-text-muted">
            Host: <span className="text-text-secondary font-mono">{status.host || 'simplefin'}</span>
            {status.lastSync && (
              <>
                {' · '}Last sync: <span className="text-text-secondary">{new Date(status.lastSync).toLocaleString()}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={runSync}
              disabled={busy !== 'idle'}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dim text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              onClick={disconnect}
              disabled={busy !== 'idle'}
              className="px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 border border-glass-border text-xs text-text-muted hover:text-negative transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {lastResult && !error && (
        <div className="mt-3 text-[11px] text-positive p-2.5 rounded-lg bg-positive/10 border border-positive/20">
          ✓ Synced {lastResult.accounts.addedAccounts + lastResult.accounts.updatedAccounts} account
          {lastResult.accounts.addedAccounts + lastResult.accounts.updatedAccounts === 1 ? '' : 's'}
          {lastResult.accounts.addedAccounts > 0 && ` (${lastResult.accounts.addedAccounts} new)`}
          {' · '}${lastResult.accounts.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} total
          <div className="mt-1 text-text-secondary">
            {lastResult.transactions.imported > 0 && (
              <>📥 {lastResult.transactions.imported} new transaction
                {lastResult.transactions.imported === 1 ? '' : 's'}</>
            )}
            {lastResult.transactions.imported > 0 && lastResult.transactions.skipped > 0 && ' · '}
            {lastResult.transactions.skipped > 0 && (
              <>{lastResult.transactions.skipped} updated</>
            )}
            {lastResult.transactions.pending > 0 && (
              <> · {lastResult.transactions.pending} pending (not imported)</>
            )}
            {lastResult.transactions.imported === 0 && lastResult.transactions.skipped === 0 && lastResult.transactions.pending === 0 && (
              <>No transactions in this window (last 90 days)</>
            )}
          </div>
          {lastResult.accounts.warnings.length > 0 && (
            <div className="mt-1 text-warning">
              {lastResult.accounts.warnings.length} warning{lastResult.accounts.warnings.length === 1 ? '' : 's'}: {lastResult.accounts.warnings[0]}
            </div>
          )}
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

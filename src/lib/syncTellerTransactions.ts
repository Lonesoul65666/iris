// On-demand delta sync for Teller transactions + income.
//
// Design (verified against Teller docs, 2026-06-11):
//   • No published rate-limit number on the dev tier — Teller returns 429 and
//     expects back-off. So we never poll; we sync only on a human click (button
//     or the 48h staleness banner), and debounce rapid re-clicks. That pattern
//     is well inside Teller's "normal usage rarely hits limits".
//   • The import endpoints are idempotent (upsert on teller_<txnId>), so we can
//     safely re-pull a trailing window every time — it refreshes pending→cleared
//     changes and inserts only what's new. No duplicates; the server reports the
//     new-vs-refreshed split via the (xmax = 0) trick.
//   • The scarce resource is ENROLLMENTS (100 lifetime on dev tier), not requests.
//     Syncing with existing tokens costs zero enrollments — only re-connecting a
//     bank does. So a dead token surfaces as "needs reconnect" and is never retried
//     automatically.
import { getSetting, saveSetting } from '../stores/portfolioStore';

const LAST_SYNC_KEY = 'last_teller_sync';
const SUMMARY_KEY = 'last_teller_sync_summary';
const DELTA_DAYS = 14;        // trailing window to re-pull (catches cleared/pending)
const DEBOUNCE_MIN = 5;       // a click within this window won't re-hit Teller
export const STALE_HOURS = 48; // older than this → show the refresh prompt

/** What a sync changed — persisted so the indicator survives a reload. */
export interface SyncSummary {
  syncedAt: string;            // ISO
  txNew: number;
  txUpdated: number;
  incomeNew: number;
  through: string;             // latest transaction date pulled ('YYYY-MM-DD'), '' if none
  brokenBanks: string[];       // institutions whose token is dead → Scott reconnects
}

export interface TellerSyncOutcome {
  ok: boolean;
  skipped?: boolean;           // debounced — already fresh, no call made
  rateLimited?: boolean;       // Teller 429 — back off and try later
  error?: string;
  summary?: SyncSummary;       // present when ok
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export async function getLastTellerSync(): Promise<string | null> {
  return (await getSetting<string>(LAST_SYNC_KEY)) ?? null;
}

export async function getLastSyncSummary(): Promise<SyncSummary | null> {
  const raw = await getSetting<SyncSummary>(SUMMARY_KEY);
  return raw ?? null;
}

/** Hours since last successful sync, or null if never synced. */
export async function hoursSinceLastSync(): Promise<number | null> {
  const last = await getLastTellerSync();
  if (!last) return null;
  return (Date.now() - new Date(last).getTime()) / 3_600_000;
}

// A connector error means a dead/expired token if it's an auth failure.
function isDeadToken(e: { status?: number | null; code?: string }): boolean {
  return e.status === 401 || e.status === 403 || (e.code ?? '').includes('disconnect');
}

export async function syncTellerTransactions(opts?: { force?: boolean }): Promise<TellerSyncOutcome> {
  const last = await getLastTellerSync();

  // Debounce: skip the network entirely if we synced moments ago.
  if (!opts?.force && last) {
    const ageMin = (Date.now() - new Date(last).getTime()) / 60_000;
    if (ageMin < DEBOUNCE_MIN) {
      const summary = (await getLastSyncSummary()) ?? undefined;
      return { ok: true, skipped: true, summary };
    }
  }

  const since = isoDaysAgo(DELTA_DAYS);
  const brokenBanks: string[] = [];

  // ── Transactions ──────────────────────────────────────────────
  const txRes = await fetch(`/api/teller/import?since=${since}`, { method: 'POST' });
  if (txRes.status === 429) return { ok: false, rateLimited: true, error: 'rate_limited' };
  const tx = await txRes.json().catch(() => null);
  if (!tx?.ok) return { ok: false, error: tx?.error || 'transaction_import_failed' };
  const txNew: number = tx.inserted ?? 0;
  const txUpdated: number = tx.updated ?? 0;
  let through: string = tx.through ?? '';
  for (const e of (tx.errors ?? [])) {
    if (isDeadToken(e) && !brokenBanks.includes(e.institution)) brokenBanks.push(e.institution);
  }

  // ── Income (best-effort — a failure here doesn't sink the whole sync) ──
  let incomeNew = 0;
  const incRes = await fetch(`/api/teller/import-income?since=${since}`, { method: 'POST' });
  if (incRes.status !== 429) {
    const inc = await incRes.json().catch(() => null);
    if (inc?.ok) {
      incomeNew = inc.inserted ?? 0;
      if (inc.through && inc.through > through) through = inc.through;
      for (const e of (inc.errors ?? [])) {
        if (isDeadToken(e) && !brokenBanks.includes(e.institution)) brokenBanks.push(e.institution);
      }
    }
  }

  const summary: SyncSummary = {
    syncedAt: new Date().toISOString(),
    txNew, txUpdated, incomeNew, through, brokenBanks,
  };
  await saveSetting(LAST_SYNC_KEY, summary.syncedAt);
  await saveSetting(SUMMARY_KEY, summary);
  return { ok: true, summary };
}

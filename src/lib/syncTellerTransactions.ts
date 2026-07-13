// On-demand delta sync for bank transactions + income.
//
// CUTOVER (2026-07-11): now targets PLAID (/api/plaid/import[-income]) — Teller
// shut down its API. The endpoints are drop-in compatible (same {inserted,
// updated,through,errors} shape), so the delta-window, debounce, partial-sync,
// and rate-limit handling below are unchanged. Export/state-key names keep the
// "teller" spelling only to avoid churn across importers; they mean "bank sync".
//
// Original design notes (still accurate):
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

const LAST_SYNC_KEY = 'last_teller_sync';            // last CLEAN sync — drives the staleness banner
const LAST_ATTEMPT_KEY = 'last_teller_sync_attempt'; // last attempt of any kind — drives the debounce
const SUMMARY_KEY = 'last_teller_sync_summary';
const DELTA_DAYS = 14;        // minimum trailing window to re-pull
const DEBOUNCE_MIN = 5;       // a click within this window won't re-hit Teller
export const STALE_HOURS = 48; // older than this → show the refresh prompt

// Provider cutover floor: Teller's imported history ends 2026-07-06 (teller_ ids);
// Plaid owns everything from here on (plaid_ ids). Clamp the sync window so Plaid
// NEVER re-pulls a date Teller already covered — otherwise the same real
// transaction lands twice (teller_<id> AND plaid_<id>) and double-counts. Once
// enough time passes that the trailing window starts after this date, the clamp
// is a no-op. Safe to remove after the old teller_ rows age out of relevance.
const PLAID_CUTOVER = '2026-07-07';

/** What a sync changed — persisted so the indicator survives a reload. */
export interface SyncSummary {
  syncedAt: string;            // ISO
  txNew: number;
  txUpdated: number;
  incomeNew: number;
  through: string;             // latest transaction date pulled ('YYYY-MM-DD'), '' if none
  brokenBanks: string[];       // institutions whose token is dead → user reconnects
  failedBanks: string[];       // institutions that errored this pull (429/5xx/network) — data may be incomplete
  partial: boolean;            // true when any account failed — staleness clock does NOT advance
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

  // Debounce on the last ATTEMPT (not the last clean sync) — a partial sync
  // shouldn't invite hammering Teller, but also must not advance the
  // staleness clock (handled below).
  const lastAttempt = (await getSetting<string>(LAST_ATTEMPT_KEY)) ?? last;
  if (!opts?.force && lastAttempt) {
    const ageMin = (Date.now() - new Date(lastAttempt).getTime()) / 60_000;
    if (ageMin < DEBOUNCE_MIN) {
      const summary = (await getLastSyncSummary()) ?? undefined;
      return { ok: true, skipped: true, summary };
    }
  }
  await saveSetting(LAST_ATTEMPT_KEY, new Date().toISOString());
  // A FAILED attempt must not arm the debounce — otherwise a transient error
  // (e.g. the dev server mid-reload) is followed by a lying "Already up to
  // date ✓" for five minutes. Only real syncs and genuine 429 back-offs keep
  // the attempt timestamp.
  const disarmDebounce = () => saveSetting(LAST_ATTEMPT_KEY, last ?? '1970-01-01T00:00:00.000Z');

  // Window: at least DELTA_DAYS, but ALWAYS reaching back past the last clean
  // sync (with 2 days of overlap). Anchoring to "now - 14d" alone meant any
  // sync gap over two weeks permanently dropped the transactions in between.
  let since = isoDaysAgo(DELTA_DAYS);
  if (last) {
    const lastAnchor = new Date(new Date(last).getTime() - 2 * 86400000).toISOString().slice(0, 10);
    if (lastAnchor < since) since = lastAnchor;
  }
  // Never reach back before the provider cutover — keeps Plaid off the dates the
  // old teller_ rows already own, so nothing double-counts during the overlap.
  if (since < PLAID_CUTOVER) since = PLAID_CUTOVER;

  const brokenBanks: string[] = [];
  const failedBanks: string[] = [];
  const recordErrors = (errs: Array<{ status?: number | null; code?: string; institution: string }>) => {
    for (const e of errs) {
      if (isDeadToken(e)) { if (!brokenBanks.includes(e.institution)) brokenBanks.push(e.institution); }
      else if (!failedBanks.includes(e.institution)) failedBanks.push(e.institution);
    }
  };

  // ── Transactions ──────────────────────────────────────────────
  let txRes: Response;
  try {
    txRes = await fetch(`/api/plaid/import?since=${since}`, { method: 'POST' });
  } catch (err) {
    await disarmDebounce();
    throw err;
  }
  if (txRes.status === 429) return { ok: false, rateLimited: true, error: 'rate_limited' };
  const tx = await txRes.json().catch(() => null);
  if (!tx?.ok) { await disarmDebounce(); return { ok: false, error: tx?.error || 'transaction_import_failed' }; }
  const txNew: number = tx.inserted ?? 0;
  const txUpdated: number = tx.updated ?? 0;
  let through: string = tx.through ?? '';
  const txErrors = (tx.errors ?? []) as Array<{ status?: number | null; code?: string; institution: string }>;
  recordErrors(txErrors);
  // The server wraps per-account Teller failures in a 200 — surface an all-429
  // pull as rate-limited so the UI's back-off message isn't dead code.
  if (txErrors.length > 0 && txErrors.every(e => e.status === 429) && txNew + txUpdated === 0) {
    return { ok: false, rateLimited: true, error: 'rate_limited' };
  }

  // ── Income (best-effort — a failure here doesn't sink the sync, but it
  //    DOES mark it partial so the user isn't told everything is fresh) ──
  let incomeNew = 0;
  let incomeFailed = false;
  // Best-effort, but the fetch itself can THROW (server mid-reload, network
  // drop). Unwrapped, that rejected the whole sync AFTER the debounce was armed
  // and BEFORE the summary was saved — so for 5 min every retry short-circuited
  // on the stale prior (clean) summary and the UI lied "Already up to date ✓".
  // Catch it, mark the sync partial (which does NOT advance the staleness clock),
  // and persist a partial summary so the state stays honest.
  let incRes: Response | null = null;
  try {
    incRes = await fetch(`/api/plaid/import-income?since=${since}`, { method: 'POST' });
  } catch {
    incRes = null;
  }
  const inc = !incRes || incRes.status === 429 ? null : await incRes.json().catch(() => null);
  if (inc?.ok) {
    incomeNew = inc.inserted ?? 0;
    if (inc.through && inc.through > through) through = inc.through;
    recordErrors((inc.errors ?? []) as Array<{ status?: number | null; code?: string; institution: string }>);
  } else {
    incomeFailed = true;
  }

  const partial = failedBanks.length > 0 || brokenBanks.length > 0 || incomeFailed;
  const summary: SyncSummary = {
    syncedAt: new Date().toISOString(),
    txNew, txUpdated, incomeNew, through, brokenBanks, failedBanks, partial,
  };
  // Only a CLEAN sync advances the staleness clock — a partial pull means some
  // bank's data is missing, and "Updated 2h ago" would be a lie that also
  // suppresses the refresh prompt for two more days.
  if (!partial) await saveSetting(LAST_SYNC_KEY, summary.syncedAt);
  await saveSetting(SUMMARY_KEY, summary);
  return { ok: true, summary };
}

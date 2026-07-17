// Server-side auto-sync — the always-on host pulls Plaid on a timer so data
// stays fresh even when nobody opens the app (fixes the "I was out of town for
// 3 days" gap). Complements the client's on-open refresh. Reuses the SAME
// import cores as the HTTP endpoints, so tombstones/merchant-mappings/posted-
// only all apply identically. Safe no-op when Plaid isn't configured or the
// interval is disabled (PLAID_AUTOSYNC_HOURS<=0).

import type { Pool } from 'pg'
import { getPool, getCurrentUserId } from './db-pool.ts'
import { plaidConfigStatus } from './plaid-client.ts'
import { runPlaidImport, runPlaidImportIncome } from './api-handlers/plaid.ts'

const AUTOSYNC_HOURS = Number(process.env.PLAID_AUTOSYNC_HOURS ?? 12)
// Match the client's dedup floor: Plaid owns >= this date; Teller owns before.
const PLAID_CUTOVER = '2026-07-07'
const DELTA_DAYS = 14

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
}

/** Write the "last synced" marker settings so the app's staleness UI reflects
 *  the timer's runs, not just manual/on-open syncs — same keys the client uses. */
async function writeLastSyncMarker(pool: Pool, userId: string, summary: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString()
  const upsert = (key: string, value: unknown) => pool.query(
    `INSERT INTO settings (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [userId, key, JSON.stringify(value)],
  )
  await upsert('last_teller_sync', now)
  await upsert('last_teller_sync_summary', { syncedAt: now, brokenBanks: [], failedBanks: [], partial: false, ...summary })
}

async function runOnce(): Promise<void> {
  const pool = getPool()
  const userId = getCurrentUserId()
  if (!pool || !userId) return
  if (!plaidConfigStatus().configured) return
  let since = isoDaysAgo(DELTA_DAYS)
  if (since < PLAID_CUTOVER) since = PLAID_CUTOVER
  const tx = await runPlaidImport(pool, userId, { since })
  const inc = await runPlaidImportIncome(pool, userId, { since })
  const through = [tx.through, inc.through].filter(Boolean).sort().pop() ?? ''
  await writeLastSyncMarker(pool, userId, { txNew: tx.inserted, txUpdated: tx.updated, incomeNew: inc.inserted, through })
  const failed = tx.errors.length + inc.errors.length
  console.log(`[iris] auto-sync: +${tx.inserted} new / ${tx.updated} updated txns, +${inc.inserted} income${through ? `, through ${through}` : ''}${failed ? `, ${failed} connector error(s)` : ''}`)
}

/** Start the host auto-sync loop: once ~1 min after boot, then every N hours. */
export function startPlaidAutoSync(): void {
  if (!(AUTOSYNC_HOURS > 0)) { console.log('[iris] auto-sync disabled (PLAID_AUTOSYNC_HOURS<=0)'); return }
  if (!plaidConfigStatus().configured) { console.log('[iris] auto-sync idle: Plaid not configured on this host'); return }
  const tick = () => { void runOnce().catch((e) => console.warn(`[iris] auto-sync failed: ${e instanceof Error ? e.message : String(e)}`)) }
  setTimeout(tick, 60_000)
  setInterval(tick, AUTOSYNC_HOURS * 3_600_000)
  console.log(`[iris] auto-sync ON — every ${AUTOSYNC_HOURS}h (first run in ~1 min)`)
}

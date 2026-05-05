// Build-D1 — one-shot migration from per-browser IndexedDB to user-owned
// Postgres via the Iris API. Read-only on the IndexedDB side; existing app
// surfaces keep reading from IndexedDB until Build-D2 swaps the store calls.
//
// Migrates the two high-volume stores in this pass:
//   - incomeSources -> /api/incomeSources/save (upsert)
//   - expenses      -> /api/expenses/save      (upsert)
//
// Budget-config stores (buckets, sinkingFunds, funMoney, paycheck,
// customCategories, recurringDecisions, inflowDecisions, earners) need a
// schema decision (own-tables vs settings-blobs) and ship in Build-D2.
//
// Idempotent: writes a `migration_v1_complete` settings flag on success and
// short-circuits future calls unless `{ force: true }` is passed. Per-row
// errors are collected, not fatal — the transcript reports both sides.
//
// Designed to be called from DevTools console:
//   await window.__irisMigrate()
//   await window.__irisMigrate({ force: true })   // re-run even if flagged

import { openDB } from 'idb'

const SOURCE_DB = 'iris-budget'
const SOURCE_VERSION = 4
const MIGRATION_FLAG_KEY = 'migration_v1_complete'

interface RowError { id: string; error: string }
interface StoreResult {
  read: number
  written: number
  errors: RowError[]
}

export interface MigrationTranscript {
  startTime: string
  endTime: string
  durationMs: number
  status: 'completed' | 'already_complete' | 'completed_with_errors' | 'aborted'
  incomeSources: StoreResult
  expenses: StoreResult
  notes: string[]
}

async function isAlreadyMigrated(): Promise<boolean> {
  try {
    const r = await fetch(`/api/settings/get/${encodeURIComponent(MIGRATION_FLAG_KEY)}`)
    if (r.status === 404) return false
    if (!r.ok) return false
    const body = (await r.json()) as { value?: unknown }
    return body.value === true
  } catch {
    return false
  }
}

async function markMigrationComplete(): Promise<void> {
  await fetch('/api/settings/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: MIGRATION_FLAG_KEY, value: true }),
  })
}

async function readSourceStores(): Promise<{
  incomeSources: Array<Record<string, unknown> & { id: string }>
  expenses: Array<Record<string, unknown> & { id: string }>
}> {
  const db = await openDB(SOURCE_DB, SOURCE_VERSION)
  const incomeSources = (await db.getAll('incomeSources')) as Array<Record<string, unknown> & { id: string }>
  const expenses = (await db.getAll('expenses')) as Array<Record<string, unknown> & { id: string }>
  db.close()
  return { incomeSources, expenses }
}

async function postUpsert(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) return { ok: true }
    const respBody = (await r.json().catch(() => ({}))) as { error?: string; message?: string }
    return { ok: false, error: respBody.error ?? respBody.message ?? `http_${r.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function migrateIndexedDbToPostgres(
  opts: { force?: boolean } = {},
): Promise<MigrationTranscript> {
  const startTime = new Date().toISOString()
  const start = Date.now()
  const notes: string[] = []

  if (!opts.force && (await isAlreadyMigrated())) {
    return {
      startTime,
      endTime: new Date().toISOString(),
      durationMs: Date.now() - start,
      status: 'already_complete',
      incomeSources: { read: 0, written: 0, errors: [] },
      expenses: { read: 0, written: 0, errors: [] },
      notes: ['Migration flag already set. Pass `{ force: true }` to re-run.'],
    }
  }

  // eslint-disable-next-line no-console
  console.info('[iris migrate] reading IndexedDB…')
  let incomeSources: Awaited<ReturnType<typeof readSourceStores>>['incomeSources']
  let expenses: Awaited<ReturnType<typeof readSourceStores>>['expenses']
  try {
    const src = await readSourceStores()
    incomeSources = src.incomeSources
    expenses = src.expenses
  } catch (err) {
    return {
      startTime,
      endTime: new Date().toISOString(),
      durationMs: Date.now() - start,
      status: 'aborted',
      incomeSources: { read: 0, written: 0, errors: [] },
      expenses: { read: 0, written: 0, errors: [] },
      notes: [`Failed to read IndexedDB: ${err instanceof Error ? err.message : String(err)}`],
    }
  }

  const incResults: StoreResult = { read: incomeSources.length, written: 0, errors: [] }
  const expResults: StoreResult = { read: expenses.length, written: 0, errors: [] }

  // eslint-disable-next-line no-console
  console.info(`[iris migrate] source totals — incomeSources: ${incomeSources.length}, expenses: ${expenses.length}`)

  for (const s of incomeSources) {
    const r = await postUpsert('/api/incomeSources/save', { source: s })
    if (r.ok) incResults.written++
    else incResults.errors.push({ id: String(s.id ?? '<no-id>'), error: r.error ?? 'unknown' })
  }
  // eslint-disable-next-line no-console
  console.info(`[iris migrate] incomeSources: ${incResults.written}/${incResults.read} written, ${incResults.errors.length} errors`)

  for (let i = 0; i < expenses.length; i++) {
    const e = expenses[i]
    const r = await postUpsert('/api/expenses/save', { expense: e })
    if (r.ok) expResults.written++
    else expResults.errors.push({ id: String(e.id ?? '<no-id>'), error: r.error ?? 'unknown' })
    if ((i + 1) % 100 === 0) {
      // eslint-disable-next-line no-console
      console.info(`[iris migrate] expenses progress: ${i + 1}/${expenses.length}`)
    }
  }
  // eslint-disable-next-line no-console
  console.info(`[iris migrate] expenses: ${expResults.written}/${expResults.read} written, ${expResults.errors.length} errors`)

  const totalErrors = incResults.errors.length + expResults.errors.length
  let status: MigrationTranscript['status']
  if (totalErrors === 0) {
    await markMigrationComplete()
    status = 'completed'
    notes.push('Migration flag set. IndexedDB left intact as fallback.')
  } else {
    status = 'completed_with_errors'
    notes.push(`Migration flag NOT set due to ${totalErrors} error(s). Review and re-run with { force: true } after fixes.`)
  }

  const transcript: MigrationTranscript = {
    startTime,
    endTime: new Date().toISOString(),
    durationMs: Date.now() - start,
    status,
    incomeSources: incResults,
    expenses: expResults,
    notes,
  }
  // eslint-disable-next-line no-console
  console.info('[iris migrate] done', transcript)
  return transcript
}

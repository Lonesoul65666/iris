// Build-D1 + D2a — one-shot migration from per-browser IndexedDB to user-owned
// Postgres via the Iris API. Read-only on the IndexedDB side; existing app
// surfaces keep reading from IndexedDB until Build-D2b swaps the store calls.
//
// Migrates two phases (each independently flagged + idempotent):
//
//   v1 — high-volume stores with their own tables:
//     - incomeSources -> /api/incomeSources/save (upsert)
//     - expenses      -> /api/expenses/save      (upsert)
//
//   v2 — budget-config stores into the generic `collections` table:
//     - buckets, sinkingFunds, funMoney, paycheck, customCategories,
//       recurringDecisions, inflowDecisions, earners
//     - All go to /api/collections/:name/save
//
//   v3 — non-budget stores that make auth + the app browser-independent
//     (Build-D2c): iris-portfolio.settings (incl auth_users/PINs) → /api/settings,
//     iris-portfolio.userProfile → settings 'user_profile',
//     iris-audit.log → /api/audit/append.
//
// `migration_v1_complete` and `migration_v2_complete` settings flags
// short-circuit future calls unless `{ force: true }` is passed. Per-row
// errors are collected, not fatal — the transcript reports per-store counts.
//
// Designed to be called from DevTools console:
//   await window.__irisMigrate()
//   await window.__irisMigrate({ force: true })   // re-run all phases
//   await window.__irisMigrate({ phases: ['v2'] }) // run only v2

import { openDB, type IDBPDatabase } from 'idb'

const SOURCE_DB = 'iris-budget'
const SOURCE_VERSION = 4
const PORTFOLIO_DB = 'iris-portfolio'   // settings + userProfile (Build-D2c)
const AUDIT_DB = 'iris-audit'           // audit log (Build-D2c)
const MIGRATION_V1_FLAG = 'migration_v1_complete'
const MIGRATION_V2_FLAG = 'migration_v2_complete'
const MIGRATION_V3_FLAG = 'migration_v3_complete'

// IndexedDB store names that go into the generic `collections` table.
const BUDGET_CONFIG_STORES = [
  'buckets',
  'sinkingFunds',
  'funMoney',
  'paycheck',
  'customCategories',
  'recurringDecisions',
  'inflowDecisions',
  'earners',
] as const

type BudgetConfigStoreName = typeof BUDGET_CONFIG_STORES[number]

// keyPath used by each store in IndexedDB (must match the create call in
// budgetStore.ts). For collection rows, we use the row's value of this field
// as the canonical `key` in Postgres.
const STORE_KEY_PATH: Record<BudgetConfigStoreName, string> = {
  buckets: 'category',
  sinkingFunds: 'id',
  funMoney: 'person',
  paycheck: 'id',
  customCategories: 'id',
  recurringDecisions: 'id',
  inflowDecisions: 'expenseId',
  earners: 'id',
}

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
  v1: {
    status: 'completed' | 'already_complete' | 'completed_with_errors' | 'aborted' | 'skipped'
    incomeSources: StoreResult
    expenses: StoreResult
  }
  v2: {
    status: 'completed' | 'already_complete' | 'completed_with_errors' | 'aborted' | 'skipped'
    collections: Record<BudgetConfigStoreName, StoreResult>
  }
  v3: {
    status: 'completed' | 'already_complete' | 'completed_with_errors' | 'aborted' | 'skipped'
    settings: StoreResult
    userProfile: StoreResult
    auditLog: StoreResult
  }
  notes: string[]
}

async function isFlagSet(key: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/settings/get/${encodeURIComponent(key)}`)
    if (r.status === 404) return false
    if (!r.ok) return false
    const body = (await r.json()) as { value?: unknown }
    return body.value === true
  } catch {
    return false
  }
}

async function setFlag(key: string): Promise<void> {
  await fetch('/api/settings/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value: true }),
  })
}

async function openSourceDb(): Promise<IDBPDatabase> {
  return openDB(SOURCE_DB, SOURCE_VERSION)
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

function emptyStoreResult(): StoreResult {
  return { read: 0, written: 0, errors: [] }
}

function emptyV1() {
  return {
    status: 'skipped' as const,
    incomeSources: emptyStoreResult(),
    expenses: emptyStoreResult(),
  }
}

function emptyV2() {
  const collections: Partial<Record<BudgetConfigStoreName, StoreResult>> = {}
  for (const name of BUDGET_CONFIG_STORES) collections[name] = emptyStoreResult()
  return {
    status: 'skipped' as const,
    collections: collections as Record<BudgetConfigStoreName, StoreResult>,
  }
}

function emptyV3() {
  return {
    status: 'skipped' as const,
    settings: emptyStoreResult(),
    userProfile: emptyStoreResult(),
    auditLog: emptyStoreResult(),
  }
}

// The OLD iris-portfolio.settings store JSON-encoded every value to a string.
// Decode it the same way the OLD portfolioStore.getSetting did (parse, fall
// back to raw) so the value lands in Postgres jsonb in its true type.
function decodeLegacySetting(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// v3 — non-budget stores that make auth + the app browser-independent:
//   iris-portfolio.settings  -> /api/settings/save   (incl auth_users / PINs)
//   iris-portfolio.userProfile -> settings 'user_profile'
//   iris-audit.log -> /api/audit/append
async function runV3(notes: string[]): Promise<MigrationTranscript['v3']> {
  const settingsResult = emptyStoreResult()
  const profileResult = emptyStoreResult()
  const auditResult = emptyStoreResult()

  // ── settings + userProfile (iris-portfolio) ──
  try {
    const pdb = await openDB(PORTFOLIO_DB)
    if (pdb.objectStoreNames.contains('settings')) {
      const rows = (await pdb.getAll('settings')) as Array<{ key: string; value: unknown }>
      settingsResult.read = rows.length
      for (const row of rows) {
        const value = decodeLegacySetting(row.value)
        const r = await postUpsert('/api/settings/save', { key: row.key, value })
        if (r.ok) settingsResult.written++
        else settingsResult.errors.push({ id: row.key, error: r.error ?? 'unknown' })
      }
      // eslint-disable-next-line no-console
      console.info(`[iris migrate v3] settings: ${settingsResult.written}/${settingsResult.read} written, ${settingsResult.errors.length} errors`)
    }
    if (pdb.objectStoreNames.contains('userProfile')) {
      const profiles = (await pdb.getAll('userProfile')) as Array<Record<string, unknown>>
      profileResult.read = profiles.length
      if (profiles.length > 0) {
        // Singleton store — take the first (most recent) profile.
        const r = await postUpsert('/api/settings/save', { key: 'user_profile', value: profiles[0] })
        if (r.ok) profileResult.written++
        else profileResult.errors.push({ id: 'user_profile', error: r.error ?? 'unknown' })
      }
      // eslint-disable-next-line no-console
      console.info(`[iris migrate v3] userProfile: ${profileResult.written}/${profileResult.read} written`)
    }
    pdb.close()
  } catch (err) {
    settingsResult.errors.push({ id: '<portfolio-db-open>', error: err instanceof Error ? err.message : String(err) })
    // eslint-disable-next-line no-console
    console.warn('[iris migrate v3] failed to open iris-portfolio:', err)
  }

  // ── audit log (iris-audit) ──
  try {
    const adb = await openDB(AUDIT_DB)
    if (adb.objectStoreNames.contains('log')) {
      const entries = (await adb.getAll('log')) as Array<Record<string, unknown> & { id?: string }>
      auditResult.read = entries.length
      for (const entry of entries) {
        const r = await postUpsert('/api/audit/append', { entry })
        if (r.ok) auditResult.written++
        else auditResult.errors.push({ id: String(entry.id ?? '<no-id>'), error: r.error ?? 'unknown' })
      }
      // eslint-disable-next-line no-console
      console.info(`[iris migrate v3] auditLog: ${auditResult.written}/${auditResult.read} written, ${auditResult.errors.length} errors`)
    }
    adb.close()
  } catch (err) {
    auditResult.errors.push({ id: '<audit-db-open>', error: err instanceof Error ? err.message : String(err) })
    // eslint-disable-next-line no-console
    console.warn('[iris migrate v3] failed to open iris-audit:', err)
  }

  const totalErrors = settingsResult.errors.length + profileResult.errors.length + auditResult.errors.length
  let status: MigrationTranscript['v3']['status']
  if (totalErrors === 0) {
    await setFlag(MIGRATION_V3_FLAG)
    status = 'completed'
    notes.push('v3 flag set. iris-portfolio.settings + userProfile + iris-audit left intact as fallback.')
  } else {
    status = 'completed_with_errors'
    notes.push(`v3 flag NOT set due to ${totalErrors} error(s).`)
  }

  return { status, settings: settingsResult, userProfile: profileResult, auditLog: auditResult }
}

async function runV1(
  db: IDBPDatabase,
  notes: string[],
): Promise<MigrationTranscript['v1']> {
  const incomeSources = (await db.getAll('incomeSources')) as Array<Record<string, unknown> & { id?: string }>
  const expenses = (await db.getAll('expenses')) as Array<Record<string, unknown> & { id?: string }>

  const incResults: StoreResult = { read: incomeSources.length, written: 0, errors: [] }
  const expResults: StoreResult = { read: expenses.length, written: 0, errors: [] }

  // eslint-disable-next-line no-console
  console.info(`[iris migrate v1] source totals — incomeSources: ${incomeSources.length}, expenses: ${expenses.length}`)

  for (const s of incomeSources) {
    const r = await postUpsert('/api/incomeSources/save', { source: s })
    if (r.ok) incResults.written++
    else incResults.errors.push({ id: String(s.id ?? '<no-id>'), error: r.error ?? 'unknown' })
  }
  // eslint-disable-next-line no-console
  console.info(`[iris migrate v1] incomeSources: ${incResults.written}/${incResults.read} written, ${incResults.errors.length} errors`)

  for (let i = 0; i < expenses.length; i++) {
    const e = expenses[i]
    const r = await postUpsert('/api/expenses/save', { expense: e })
    if (r.ok) expResults.written++
    else expResults.errors.push({ id: String(e.id ?? '<no-id>'), error: r.error ?? 'unknown' })
    if ((i + 1) % 100 === 0) {
      // eslint-disable-next-line no-console
      console.info(`[iris migrate v1] expenses progress: ${i + 1}/${expenses.length}`)
    }
  }
  // eslint-disable-next-line no-console
  console.info(`[iris migrate v1] expenses: ${expResults.written}/${expResults.read} written, ${expResults.errors.length} errors`)

  const totalErrors = incResults.errors.length + expResults.errors.length
  let status: MigrationTranscript['v1']['status']
  if (totalErrors === 0) {
    await setFlag(MIGRATION_V1_FLAG)
    status = 'completed'
    notes.push('v1 flag set. IndexedDB v1 stores (incomeSources, expenses) left intact as fallback.')
  } else {
    status = 'completed_with_errors'
    notes.push(`v1 flag NOT set due to ${totalErrors} error(s).`)
  }

  return { status, incomeSources: incResults, expenses: expResults }
}

async function runV2(
  db: IDBPDatabase,
  notes: string[],
): Promise<MigrationTranscript['v2']> {
  const collections: Partial<Record<BudgetConfigStoreName, StoreResult>> = {}
  let totalErrors = 0

  for (const name of BUDGET_CONFIG_STORES) {
    const result: StoreResult = { read: 0, written: 0, errors: [] }
    collections[name] = result

    let rows: Array<Record<string, unknown>>
    try {
      rows = (await db.getAll(name)) as Array<Record<string, unknown>>
    } catch (err) {
      result.errors.push({ id: '<store-read>', error: err instanceof Error ? err.message : String(err) })
      totalErrors++
      // eslint-disable-next-line no-console
      console.warn(`[iris migrate v2] failed to read store '${name}':`, err)
      continue
    }
    result.read = rows.length

    if (rows.length === 0) {
      // eslint-disable-next-line no-console
      console.info(`[iris migrate v2] ${name}: empty, skipping`)
      continue
    }

    const keyPath = STORE_KEY_PATH[name]
    const items = rows.map((row) => {
      const key = String(row[keyPath] ?? '<no-key>')
      return { key, data: row }
    })

    const r = await postUpsert(`/api/collections/${name}/save`, { items })
    if (r.ok) {
      result.written = items.length
      // eslint-disable-next-line no-console
      console.info(`[iris migrate v2] ${name}: ${result.written}/${result.read} written, 0 errors`)
    } else {
      // Batch failed — fall back to per-row writes so we get granular error info.
      // eslint-disable-next-line no-console
      console.warn(`[iris migrate v2] ${name}: batch failed (${r.error}); falling back to per-row writes`)
      for (const it of items) {
        const r2 = await postUpsert(`/api/collections/${name}/save`, { item: it })
        if (r2.ok) result.written++
        else result.errors.push({ id: it.key, error: r2.error ?? 'unknown' })
      }
      totalErrors += result.errors.length
      // eslint-disable-next-line no-console
      console.info(`[iris migrate v2] ${name}: ${result.written}/${result.read} written, ${result.errors.length} errors (per-row fallback)`)
    }
  }

  let status: MigrationTranscript['v2']['status']
  if (totalErrors === 0) {
    await setFlag(MIGRATION_V2_FLAG)
    status = 'completed'
    notes.push('v2 flag set. IndexedDB budget-config stores left intact as fallback.')
  } else {
    status = 'completed_with_errors'
    notes.push(`v2 flag NOT set due to ${totalErrors} error(s).`)
  }

  return { status, collections: collections as Record<BudgetConfigStoreName, StoreResult> }
}

export interface MigrateOptions {
  force?: boolean
  phases?: Array<'v1' | 'v2' | 'v3'>
}

export async function migrateIndexedDbToPostgres(
  opts: MigrateOptions = {},
): Promise<MigrationTranscript> {
  const startTime = new Date().toISOString()
  const start = Date.now()
  const notes: string[] = []
  const phases = opts.phases ?? ['v1', 'v2', 'v3']
  const transcript: MigrationTranscript = {
    startTime,
    endTime: startTime,
    durationMs: 0,
    v1: emptyV1(),
    v2: emptyV2(),
    v3: emptyV3(),
    notes,
  }

  // eslint-disable-next-line no-console
  console.info('[iris migrate] opening IndexedDB…')
  let db: IDBPDatabase
  try {
    db = await openSourceDb()
  } catch (err) {
    notes.push(`Failed to open IndexedDB: ${err instanceof Error ? err.message : String(err)}`)
    transcript.v1.status = 'aborted'
    transcript.v2.status = 'aborted'
    // v3 opens its own DBs (iris-portfolio / iris-audit), so run it even if
    // iris-budget fails to open.
    if (phases.includes('v3')) {
      if (!opts.force && (await isFlagSet(MIGRATION_V3_FLAG))) {
        transcript.v3 = { ...emptyV3(), status: 'already_complete' }
      } else {
        transcript.v3 = await runV3(notes)
      }
    } else {
      transcript.v3.status = 'aborted'
    }
    transcript.endTime = new Date().toISOString()
    transcript.durationMs = Date.now() - start
    return transcript
  }

  try {
    if (phases.includes('v1')) {
      if (!opts.force && (await isFlagSet(MIGRATION_V1_FLAG))) {
        transcript.v1 = { ...emptyV1(), status: 'already_complete' }
        notes.push('v1 already complete. Pass { force: true } to re-run.')
        // eslint-disable-next-line no-console
        console.info('[iris migrate v1] already complete, skipping')
      } else {
        transcript.v1 = await runV1(db, notes)
      }
    }

    if (phases.includes('v2')) {
      if (!opts.force && (await isFlagSet(MIGRATION_V2_FLAG))) {
        transcript.v2 = { ...emptyV2(), status: 'already_complete' }
        notes.push('v2 already complete. Pass { force: true } to re-run.')
        // eslint-disable-next-line no-console
        console.info('[iris migrate v2] already complete, skipping')
      } else {
        transcript.v2 = await runV2(db, notes)
      }
    }

    if (phases.includes('v3')) {
      if (!opts.force && (await isFlagSet(MIGRATION_V3_FLAG))) {
        transcript.v3 = { ...emptyV3(), status: 'already_complete' }
        notes.push('v3 already complete. Pass { force: true } to re-run.')
        // eslint-disable-next-line no-console
        console.info('[iris migrate v3] already complete, skipping')
      } else {
        transcript.v3 = await runV3(notes)
      }
    }
  } finally {
    db.close()
  }

  transcript.endTime = new Date().toISOString()
  transcript.durationMs = Date.now() - start
  // eslint-disable-next-line no-console
  console.info('[iris migrate] done', transcript)
  return transcript
}

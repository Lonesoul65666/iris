// Singleton connection-pool manager for the Iris dev-time API.
//
// Lifecycle: client POSTs connection string to /api/connect on app boot;
// we open a pg.Pool, run pending schema migrations, ensure a single user
// exists (Phase 1 single-user model), and cache everything in module state.
// Subsequent /api/* requests borrow from this pool and use the cached user_id.
//
// max: 5 keeps us inside Supabase free-tier connection limits.

import pg from 'pg'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runMigrations, type MigrationResult } from './schema/runner.ts'
const { Pool } = pg
type PgPool = InstanceType<typeof pg.Pool>

let pool: PgPool | null = null
let activeConnectionString: string | null = null
let currentUserId: string | null = null
let lastMigrationResult: MigrationResult | null = null

export function hasPool(): boolean {
  return pool !== null
}

export function getPool(): PgPool | null {
  return pool
}

export function getCurrentUserId(): string | null {
  return currentUserId
}

export function getLastMigrationResult(): MigrationResult | null {
  return lastMigrationResult
}

async function ensureSingleUser(p: PgPool): Promise<string> {
  const existing = await p.query<{ id: string }>('SELECT id FROM users ORDER BY created_at LIMIT 1')
  if (existing.rows.length > 0) return existing.rows[0].id

  const created = await p.query<{ id: string }>(
    `INSERT INTO users (id, display_name)
     VALUES (gen_random_uuid(), 'You')
     RETURNING id`,
  )
  return created.rows[0].id
}

export async function connect(connectionString: string): Promise<void> {
  if (pool && activeConnectionString === connectionString) return
  if (pool) await closePool()

  const next = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })

  // Smoke the pool before we hand it out — fail fast if the URI is wrong.
  await next.query('SELECT 1')

  // Run pending schema migrations inside the new pool.
  lastMigrationResult = await runMigrations(next)

  // Ensure exactly one user exists; cache its id for handlers.
  currentUserId = await ensureSingleUser(next)

  pool = next
  activeConnectionString = connectionString
}

/**
 * Auto-connect from a server-side env var instead of a browser localStorage
 * paste. Reads DATABASE_URL (fallback IRIS_DATABASE_URL). This is the de-browser
 * path: the standalone server and the Vite dev plugin both call this at startup
 * so config lives in `.env.local`, not the browser. No-op (returns false) when
 * the var is unset — callers then fall back to the client POST /api/connect flow.
 */
export async function autoConnectFromEnv(): Promise<boolean> {
  const cs = process.env.DATABASE_URL ?? process.env.IRIS_DATABASE_URL
  if (!cs) return false
  await connect(cs)
  return true
}

/**
 * Persist the currently-connected connection string to `.env.local` as
 * DATABASE_URL, so the standalone server (and the dev plugin) can auto-connect
 * without a browser localStorage paste. The secret moves from server memory to
 * a gitignored file — it never returns to the client. Idempotent: replaces an
 * existing DATABASE_URL line or appends one. Returns false if nothing connected.
 */
export function persistConnectionStringToEnvLocal(): { wrote: boolean; reason?: string } {
  if (!activeConnectionString) return { wrote: false, reason: 'no_active_connection' }
  const envPath = resolve(process.cwd(), '.env.local')
  let content = ''
  try { content = readFileSync(envPath, 'utf8') } catch { /* file may not exist yet */ }
  const line = `DATABASE_URL=${activeConnectionString}`
  if (/^DATABASE_URL=.*$/m.test(content)) {
    content = content.replace(/^DATABASE_URL=.*$/m, line)
  } else {
    content = (content.replace(/\s*$/, '') + `\n${line}\n`).replace(/^\n/, '')
  }
  writeFileSync(envPath, content, 'utf8')
  return { wrote: true }
}

export async function closePool(): Promise<void> {
  if (!pool) return
  const dying = pool
  pool = null
  activeConnectionString = null
  currentUserId = null
  lastMigrationResult = null
  await dying.end()
}

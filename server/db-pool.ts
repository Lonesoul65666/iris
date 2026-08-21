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
  if (existing.rows.length > 0) {
    // Single-user app by design. If somehow >1 user exists, we pin the oldest —
    // warn loudly so a stranded second user's data can't hide silently.
    const count = await p.query<{ n: string }>('SELECT count(*)::int AS n FROM users')
    if (Number(count.rows[0]?.n) > 1) {
      // eslint-disable-next-line no-console
      console.warn(`[iris] db-pool: ${count.rows[0].n} users found — pinning the oldest. Data under other user rows will not be served.`)
    }
    return existing.rows[0].id
  }

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

  // Encrypt the link unless it's a local Postgres (which typically has no TLS).
  // Remote (Supabase) carries the password + every financial row, so plaintext
  // is unacceptable. rejectUnauthorized:false = encrypted without CA pinning —
  // matches the maintenance scripts and won't break on Supabase's cert chain.
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(connectionString)
  const next = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
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
export function envConnectionString(): string | null {
  return process.env.DATABASE_URL ?? process.env.IRIS_DATABASE_URL ?? null
}

export async function autoConnectFromEnv(): Promise<boolean> {
  const cs = envConnectionString()
  if (!cs) return false
  try {
    await connect(cs)
    autoConnectError = null
    return true
  } catch (err) {
    autoConnectError = err instanceof Error ? err.message : String(err)
    throw err
  }
}

// ── Boot resilience ──────────────────────────────────────────────────────────
// A connect failure at startup used to be permanent: main() logged it and then
// served forever with no pool, so every /api/* call 503'd and the client showed
// "Point this machine at your database" — asking for a connection string that was
// already in .env.local. Recovering meant a human noticing and restarting.
//
// That is exactly what a sleeping Supabase project causes (2026-08-21): the first
// connection after idle can exceed the 10s timeout, and the host had just been
// restarted for a server-code update. The database was fine minutes later.
//
// So: keep trying, in the background, with backoff — and record the reason so the
// UI can say "can't reach your database, retrying" instead of asking for input.

let autoConnectError: string | null = null
let autoConnectAttempts = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

/** Escalating, then steady at a minute. Long enough to cover a cold start,
 *  patient enough to survive an outage without hammering. */
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000, 20_000, 45_000]
const RETRY_STEADY_MS = 60_000

export interface DbBootStatus {
  /** Is a connection string configured at all (env or a previous paste)? */
  hasEnvUrl: boolean
  connected: boolean
  attempts: number
  lastError: string | null
  retrying: boolean
}

export function dbBootStatus(): DbBootStatus {
  return {
    hasEnvUrl: envConnectionString() !== null,
    connected: pool !== null,
    attempts: autoConnectAttempts,
    lastError: autoConnectError,
    retrying: retryTimer !== null,
  }
}

/**
 * Connect from the environment, and if it fails KEEP TRYING until it works.
 * Resolves as soon as the first attempt settles (so the HTTP server can start
 * immediately either way); retries continue in the background.
 *
 * Stops the moment a pool exists — including one seeded by the client's
 * POST /api/connect, so a manual fix isn't fought by a pending retry.
 */
export async function autoConnectFromEnvWithRetry(
  log: (msg: string) => void = () => {},
): Promise<boolean> {
  if (envConnectionString() === null) return false

  const attempt = async (): Promise<boolean> => {
    if (pool) return true
    autoConnectAttempts++
    try {
      await autoConnectFromEnv()
      log(`[iris] connected to Postgres via DATABASE_URL${autoConnectAttempts > 1 ? ` (attempt ${autoConnectAttempts})` : ''}`)
      return true
    } catch (err) {
      log(`[iris] DATABASE_URL connect attempt ${autoConnectAttempts} failed: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }

  const schedule = () => {
    if (pool) { retryTimer = null; return }
    const delay = RETRY_DELAYS_MS[Math.min(autoConnectAttempts - 1, RETRY_DELAYS_MS.length - 1)] ?? RETRY_STEADY_MS
    const wait = autoConnectAttempts > RETRY_DELAYS_MS.length ? RETRY_STEADY_MS : delay
    log(`[iris] retrying the database in ${Math.round(wait / 1000)}s — the app will start serving as soon as it connects`)
    retryTimer = setTimeout(() => {
      void attempt().then((ok) => { if (!ok) schedule(); else retryTimer = null })
    }, wait)
    // Never hold the process open for a retry.
    if (typeof retryTimer.unref === 'function') retryTimer.unref()
  }

  const ok = await attempt()
  if (!ok) schedule()
  return ok
}

/** Test seam + clean shutdown: stop any pending retry. */
export function stopAutoConnectRetry(): void {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
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

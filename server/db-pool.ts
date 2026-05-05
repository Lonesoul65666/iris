// Singleton connection-pool manager for the Iris dev-time API.
//
// Lifecycle: client POSTs connection string to /api/connect on app boot;
// we open a pg.Pool, run pending schema migrations, ensure a single user
// exists (Phase 1 single-user model), and cache everything in module state.
// Subsequent /api/* requests borrow from this pool and use the cached user_id.
//
// max: 5 keeps us inside Supabase free-tier connection limits.

import pg from 'pg'
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

export async function closePool(): Promise<void> {
  if (!pool) return
  const dying = pool
  pool = null
  activeConnectionString = null
  currentUserId = null
  lastMigrationResult = null
  await dying.end()
}

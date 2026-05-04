// Singleton connection-pool manager for the Iris dev-time API.
//
// Lifecycle: client POSTs connection string to /api/connect on app boot;
// we open a pg.Pool and cache it in module state. Subsequent /api/* requests
// borrow from this pool. Reconnecting with a different string tears down the
// old pool first.
//
// max: 5 keeps us inside Supabase free-tier connection limits.

import pg from 'pg'
const { Pool } = pg
type PgPool = InstanceType<typeof pg.Pool>

let pool: PgPool | null = null
let activeConnectionString: string | null = null

export function hasPool(): boolean {
  return pool !== null
}

export function getPool(): PgPool | null {
  return pool
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

  pool = next
  activeConnectionString = connectionString
}

export async function closePool(): Promise<void> {
  if (!pool) return
  const dying = pool
  pool = null
  activeConnectionString = null
  await dying.end()
}

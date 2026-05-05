// Versioned migration runner for Iris.
//
// Migrations are plain `.sql` files in this directory, named `NNNN_<slug>.sql`
// (e.g. `0001_init.sql`). On `/api/connect`, we read pending versions and
// apply them inside a single transaction per file. Each applied version is
// recorded in `schema_migrations` with a SHA-256 of the file contents, so
// drift is detectable on a future startup.

import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Pool } from 'pg'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

interface MigrationFile {
  version: number
  name: string
  path: string
  sql: string
  checksum: string
}

function discoverMigrations(): MigrationFile[] {
  const entries = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  return entries.map((filename) => {
    const m = filename.match(/^(\d+)_(.+)\.sql$/)
    if (!m) throw new Error(`Migration filename malformed: ${filename}`)
    const path = join(MIGRATIONS_DIR, filename)
    const sql = readFileSync(path, 'utf8')
    return {
      version: Number(m[1]),
      name: m[2],
      path,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    }
  })
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    int          PRIMARY KEY,
      name       text         NOT NULL,
      checksum   text         NOT NULL,
      applied_at timestamptz  NOT NULL DEFAULT now()
    )
  `)
}

async function getAppliedVersions(pool: Pool): Promise<Map<number, string>> {
  const r = await pool.query<{ version: number; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations ORDER BY version',
  )
  return new Map(r.rows.map((row) => [row.version, row.checksum]))
}

export interface MigrationResult {
  applied: number[]
  skipped: number[]
  driftDetected: number[]
}

export async function runMigrations(pool: Pool): Promise<MigrationResult> {
  await ensureMigrationsTable(pool)
  const applied = await getAppliedVersions(pool)
  const files = discoverMigrations()

  const result: MigrationResult = { applied: [], skipped: [], driftDetected: [] }

  for (const file of files) {
    const recordedChecksum = applied.get(file.version)

    if (recordedChecksum) {
      if (recordedChecksum !== file.checksum) {
        result.driftDetected.push(file.version)
      } else {
        result.skipped.push(file.version)
      }
      continue
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(file.sql)
      await client.query(
        'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
        [file.version, file.name, file.checksum],
      )
      await client.query('COMMIT')
      result.applied.push(file.version)
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(
        `Migration ${file.version}_${file.name} failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      client.release()
    }
  }

  return result
}

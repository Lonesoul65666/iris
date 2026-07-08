// Host-side password reset — the lockout escape hatch.
//
// Run ON THE HOST (where .env.local + DATABASE_URL live), either:
//   npm run reset-password            (interactive: pick a name, type a new pw)
//   npm run reset-password <username> (skips the name prompt)
// or double-click reset-password.bat in the repo root.
//
// It talks to the SAME database the app uses, so a reset here immediately lets
// you log in on any device. No app, no login, no UI required — this is what
// gets you back in when you've forgotten a password or locked yourself out.

import pg from 'pg'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { hashPassword, normalizeUsername, validatePasswordStrength } from '../server/api-handlers/auth-core.ts'

function readDatabaseUrl(): string {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) {
    console.error('DATABASE_URL not found in .env.local — run this on the host, in the app folder.')
    process.exit(1)
  }
  return line.slice('DATABASE_URL='.length).trim()
}

const pool = new pg.Pool({ connectionString: readDatabaseUrl(), max: 2, ssl: { rejectUnauthorized: false } })
const rl = createInterface({ input, output })

async function done(code: number): Promise<never> {
  rl.close()
  await pool.end()
  process.exit(code)
}

const accounts = (await pool.query<{ username: string; display_name: string }>(
  'SELECT username, display_name FROM auth_accounts ORDER BY username',
)).rows

if (accounts.length === 0) {
  console.log('No accounts exist yet — nothing to reset. Create accounts via first-run setup.')
  await done(0)
}

console.log('\nAccounts on this database:')
for (const a of accounts) {
  const label = a.display_name && a.display_name !== a.username ? ` (${a.display_name})` : ''
  console.log(`  - ${a.username}${label}`)
}

let username = process.argv[2] ?? ''
if (!username) username = await rl.question('\nUsername to reset: ')
const uname = normalizeUsername(username)
const match = accounts.find((a) => a.username === uname)
if (!match) {
  console.error(`\nNo account named "${username}". Nothing changed.`)
  await done(1)
}

const p1 = await rl.question(`New password for ${match.username} (min ${10} chars): `)
const weak = validatePasswordStrength(p1)
if (weak) {
  console.error(`\n${weak} Nothing changed.`)
  await done(1)
}
const p2 = await rl.question('Confirm new password: ')
if (p1 !== p2) {
  console.error("\nPasswords don't match. Nothing changed.")
  await done(1)
}

await pool.query(
  `UPDATE auth_accounts
      SET password_hash = $1, password_changed_at = now(), failed_attempts = 0, locked_until = NULL
    WHERE username = $2`,
  [hashPassword(p1), uname],
)
console.log(`\n✅ Password reset for ${match.username}. Any lockout is cleared — log in with the new password.`)
await done(0)

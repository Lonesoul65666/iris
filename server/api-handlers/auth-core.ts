// Auth primitives — hashing, cookies, and the session store.
//
// Deliberately imports nothing from http-utils.ts so that http-utils'
// requireContext can import validateSession from here without a cycle
// (http-utils <-> auth handlers would otherwise be circular).

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Pool } from 'pg'

const COOKIE_NAME = 'iris_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const SCRYPT_KEYLEN = 64

// ─── password hashing ────────────────────────────────────────────────────────

/** Hash a password with scrypt. Format: `scrypt$<saltHex>$<hashHex>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** Constant-time verify a password against a stored `scrypt$salt$hash` string. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  if (expected.length !== SCRYPT_KEYLEN) return false
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN)
  return timingSafeEqual(actual, expected)
}

/** Login-match key: usernames compare case-insensitively, trimmed. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

// ─── tokens + cookies ─────────────────────────────────────────────────────────

/** SHA-256 of a session token — what we store, never the raw token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Parse a Cookie header into a name→value map. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const k = part.slice(0, eq).trim()
    const v = part.slice(eq + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

/** Behind Tailscale/HTTPS the proxy sets x-forwarded-proto; only then is the
 *  connection secure. On plain localhost dev it's http, so Secure would stop
 *  the cookie from ever being sent — gate it. */
function isSecureRequest(req: IncomingMessage): boolean {
  const xfp = req.headers['x-forwarded-proto']
  const proto = Array.isArray(xfp) ? xfp[0] : xfp
  return proto === 'https'
}

export function serializeSessionCookie(token: string, req: IncomingMessage): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000)
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ]
  if (isSecureRequest(req)) attrs.push('Secure')
  return attrs.join('; ')
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}

// ─── session store (DB-backed) ────────────────────────────────────────────────

export interface Account {
  id: string
  username: string
  displayName: string
}

/** Create a session, return the raw token to send as a cookie. */
export async function createSession(pool: Pool, accountId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await pool.query(
    'INSERT INTO auth_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), accountId, expiresAt],
  )
  return token
}

/** Validate the session cookie on a request. Returns the Account or null.
 *  Lazily deletes an expired session it happens to touch. */
export async function validateSession(req: IncomingMessage, pool: Pool): Promise<Account | null> {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!token) return null
  const r = await pool.query<{ account_id: string; username: string; display_name: string; expires_at: string }>(
    `SELECT s.account_id, s.expires_at, a.username, a.display_name
       FROM auth_sessions s JOIN auth_accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1`,
    [hashToken(token)],
  )
  const row = r.rows[0]
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(token)])
    return null
  }
  return { id: row.account_id, username: row.username, displayName: row.display_name }
}

export async function destroySession(req: IncomingMessage, pool: Pool): Promise<void> {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(token)])
}

export async function accountCount(pool: Pool): Promise<number> {
  const r = await pool.query<{ n: string }>('SELECT COUNT(*)::int AS n FROM auth_accounts')
  return Number(r.rows[0]?.n ?? 0)
}

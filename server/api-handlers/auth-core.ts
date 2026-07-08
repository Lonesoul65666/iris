// Auth primitives — hashing, cookies, and the session store.
//
// Deliberately imports nothing from http-utils.ts so that http-utils'
// requireContext can import validateSession from here without a cycle
// (http-utils <-> auth handlers would otherwise be circular).

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Pool } from 'pg'

const COOKIE_NAME = 'iris_session'
const SCRYPT_KEYLEN = 64

// ─── security policy knobs (all tweakable in one place) ────────────────────────
/** Absolute session lifetime — a session is dead this long after creation, no
 *  matter how active. */
const SESSION_MAX_MS = 14 * 24 * 60 * 60 * 1000 // 14 days
/** Idle timeout — a session with no activity for this long is logged out. This
 *  is what fixes "stays logged in forever": an unattended browser on a public
 *  URL falls out on its own. */
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000 // 24 hours
/** Don't rewrite last_used_at on every single request — only once it's this
 *  stale. Keeps idle detection accurate without a DB write per API call. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000 // 5 minutes
/** Minimum password length, enforced on setup / change / reset. */
export const MIN_PASSWORD_LEN = 10
/** Passwords older than this force a re-set (reuse is allowed — it just makes
 *  you walk through the change flow and restarts the clock). */
export const PASSWORD_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000 // 90 days
/** Failed logins before an account is temporarily locked. */
export const LOCKOUT_THRESHOLD = 5
/** How long an account stays locked after tripping the threshold. */
export const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes

// ─── pure policy helpers (no DB — unit-tested directly) ────────────────────────

/** Returns an error message if the password is too weak, else null. */
export function validatePasswordStrength(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LEN) {
    return `Password must be at least ${MIN_PASSWORD_LEN} characters.`
  }
  return null
}

/** True once a password is older than PASSWORD_MAX_AGE_MS. */
export function isPasswordExpired(changedAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!changedAt) return false
  const t = new Date(changedAt).getTime()
  if (!Number.isFinite(t)) return false
  return now - t > PASSWORD_MAX_AGE_MS
}

/** True once a session has been idle (no activity) longer than SESSION_IDLE_MS. */
export function isSessionIdleExpired(lastUsedAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!lastUsedAt) return false
  const t = new Date(lastUsedAt).getTime()
  if (!Number.isFinite(t)) return false
  return now - t > SESSION_IDLE_MS
}

/** Given the failed-attempt count BEFORE this failure, return the next state.
 *  On hitting the threshold we lock and reset the counter to zero, so after the
 *  lock expires the account gets a fresh allotment of attempts. */
export function computeLockout(attemptsBefore: number): { attempts: number; locked: boolean } {
  const next = (Number.isFinite(attemptsBefore) ? attemptsBefore : 0) + 1
  if (next >= LOCKOUT_THRESHOLD) return { attempts: 0, locked: true }
  return { attempts: next, locked: false }
}

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
  const maxAge = Math.floor(SESSION_MAX_MS / 1000)
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
  /** True when the account's password has aged past PASSWORD_MAX_AGE_MS — the
   *  client forces a re-set (reuse allowed) but access is otherwise unaffected. */
  passwordExpired: boolean
}

/** Create a session, return the raw token to send as a cookie. */
export async function createSession(pool: Pool, accountId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_MAX_MS).toISOString()
  await pool.query(
    'INSERT INTO auth_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), accountId, expiresAt],
  )
  return token
}

/** Validate the session cookie on a request. Returns the Account or null.
 *  Enforces BOTH the absolute expiry and the idle timeout, lazily deleting a
 *  session that has died by either rule, and slides the idle window (throttled)
 *  on a live session. */
export async function validateSession(req: IncomingMessage, pool: Pool): Promise<Account | null> {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!token) return null
  const th = hashToken(token)
  const r = await pool.query<{
    account_id: string; username: string; display_name: string
    expires_at: string; last_used_at: string; password_changed_at: string
  }>(
    `SELECT s.account_id, s.expires_at, s.last_used_at,
            a.username, a.display_name, a.password_changed_at
       FROM auth_sessions s JOIN auth_accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1`,
    [th],
  )
  const row = r.rows[0]
  if (!row) return null
  const now = Date.now()
  const absExpired = new Date(row.expires_at).getTime() < now
  if (absExpired || isSessionIdleExpired(row.last_used_at, now)) {
    await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [th])
    return null
  }
  // Slide the idle window, but only write when it's gone stale enough to matter.
  if (now - new Date(row.last_used_at).getTime() > LAST_USED_THROTTLE_MS) {
    await pool.query('UPDATE auth_sessions SET last_used_at = now() WHERE token_hash = $1', [th])
  }
  return {
    id: row.account_id,
    username: row.username,
    displayName: row.display_name,
    passwordExpired: isPasswordExpired(row.password_changed_at, now),
  }
}

// ─── login-throttle + password management (DB-backed) ──────────────────────────

export interface LoginAccount {
  id: string
  displayName: string
  passwordHash: string
  failedAttempts: number
  lockedUntil: string | null
  passwordChangedAt: string
}

/** Fetch the row needed to authenticate a login (includes throttle state). */
export async function getLoginAccount(pool: Pool, username: string): Promise<LoginAccount | null> {
  const r = await pool.query<{
    id: string; display_name: string; password_hash: string
    failed_attempts: number; locked_until: string | null; password_changed_at: string
  }>(
    `SELECT id, display_name, password_hash, failed_attempts, locked_until, password_changed_at
       FROM auth_accounts WHERE username = $1`,
    [normalizeUsername(username)],
  )
  const row = r.rows[0]
  if (!row) return null
  return {
    id: row.id,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    passwordChangedAt: row.password_changed_at,
  }
}

/** Same, by id — used when we already know who's logged in (change-password). */
export async function getLoginAccountById(pool: Pool, id: string): Promise<LoginAccount | null> {
  const r = await pool.query<{
    id: string; display_name: string; password_hash: string
    failed_attempts: number; locked_until: string | null; password_changed_at: string
  }>(
    `SELECT id, display_name, password_hash, failed_attempts, locked_until, password_changed_at
       FROM auth_accounts WHERE id = $1`,
    [id],
  )
  const row = r.rows[0]
  if (!row) return null
  return {
    id: row.id,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    passwordChangedAt: row.password_changed_at,
  }
}

/** True if the account is currently within a lockout window. */
export function isLocked(account: Pick<LoginAccount, 'lockedUntil'>, now = Date.now()): boolean {
  return !!account.lockedUntil && new Date(account.lockedUntil).getTime() > now
}

/** Record a failed login; locks the account if it trips the threshold.
 *  Returns whether this failure caused a lock (for the client message). */
export async function recordFailedLogin(pool: Pool, accountId: string, attemptsBefore: number): Promise<{ locked: boolean }> {
  const { attempts, locked } = computeLockout(attemptsBefore)
  if (locked) {
    const until = new Date(Date.now() + LOCKOUT_MS).toISOString()
    await pool.query('UPDATE auth_accounts SET failed_attempts = 0, locked_until = $2 WHERE id = $1', [accountId, until])
  } else {
    await pool.query('UPDATE auth_accounts SET failed_attempts = $2 WHERE id = $1', [accountId, attempts])
  }
  return { locked }
}

/** Clear throttle state after a successful login. */
export async function clearFailedLogin(pool: Pool, accountId: string): Promise<void> {
  await pool.query('UPDATE auth_accounts SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [accountId])
}

/** Set a new password, restart the age clock, and clear any throttle state.
 *  Reuse is deliberately allowed — no comparison against the old hash. */
export async function changeAccountPassword(pool: Pool, accountId: string, newPassword: string): Promise<void> {
  await pool.query(
    `UPDATE auth_accounts
        SET password_hash = $2, password_changed_at = now(), failed_attempts = 0, locked_until = NULL
      WHERE id = $1`,
    [accountId, hashPassword(newPassword)],
  )
}

export async function destroySession(req: IncomingMessage, pool: Pool): Promise<void> {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(token)])
}

export async function accountCount(pool: Pool): Promise<number> {
  const r = await pool.query<{ n: string }>('SELECT COUNT(*)::int AS n FROM auth_accounts')
  return Number(r.rows[0]?.n ?? 0)
}

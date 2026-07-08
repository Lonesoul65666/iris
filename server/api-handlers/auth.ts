// Authentication endpoints. Primitives (hashing, cookies, sessions) live in
// auth-core.ts; this file is just the HTTP handlers.
//
//   GET  /api/auth/status  -> { ok, configured, needsSetup, authenticated, user? }
//   POST /api/auth/setup   { accounts:[{username,password,displayName?}] } (first-run only)
//   POST /api/auth/login   { username, password } -> sets session cookie
//   POST /api/auth/logout  -> clears session
//   GET  /api/auth/me      -> { ok, user } | 401

import { getPool } from '../db-pool.ts'
import { sendJson, readJsonBody, errorMessage, methodNotAllowed, type Req, type Res } from './http-utils.ts'
import {
  hashPassword, verifyPassword, normalizeUsername,
  createSession, validateSession, destroySession, accountCount,
  serializeSessionCookie, clearSessionCookie,
  validatePasswordStrength, isPasswordExpired,
  getLoginAccount, getLoginAccountById, isLocked, recordFailedLogin, clearFailedLogin, changeAccountPassword,
} from './auth-core.ts'

/** Minutes remaining on a lockout, floored at 1 (for a friendly message). */
function lockMinutes(lockedUntil: string): number {
  return Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000))
}

/** Public: tells the client what state it's in — connect? set up accounts? log in? */
export async function handleAuthStatus(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const pool = getPool()
  if (!pool) { sendJson(res, 200, { ok: true, configured: false, needsSetup: false, authenticated: false }); return }
  try {
    const count = await accountCount(pool)
    const account = count === 0 ? null : await validateSession(req, pool)
    sendJson(res, 200, {
      ok: true,
      configured: true,
      needsSetup: count === 0,
      authenticated: !!account,
      user: account
        ? { username: account.username, displayName: account.displayName, mustChangePassword: account.passwordExpired }
        : undefined,
    })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'status_failed', message: errorMessage(err) })
  }
}

/** First-run only: create the login accounts. Refuses once any account exists. */
export async function handleAuthSetup(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const pool = getPool()
  if (!pool) { sendJson(res, 503, { ok: false, error: 'not_configured', message: 'Connect a database first.' }); return }
  try {
    if (await accountCount(pool) > 0) {
      sendJson(res, 409, { ok: false, error: 'already_setup', message: 'Accounts already exist. Log in instead.' })
      return
    }
    const body = (await readJsonBody(req)) as { accounts?: Array<{ username?: unknown; password?: unknown; displayName?: unknown }> }
    const accounts = Array.isArray(body.accounts) ? body.accounts : []
    const clean = accounts
      .map((a) => {
        const username = typeof a.username === 'string' ? a.username.trim() : ''
        const displayName = typeof a.displayName === 'string' && a.displayName.trim() ? a.displayName.trim() : username
        return { username, password: typeof a.password === 'string' ? a.password : '', displayName }
      })
      .filter((a) => a.username && a.password)
    if (clean.length === 0) { sendJson(res, 400, { ok: false, error: 'no_accounts', message: 'Provide at least one username + password.' }); return }
    const weak = clean.map((a) => validatePasswordStrength(a.password)).find(Boolean)
    if (weak) { sendJson(res, 400, { ok: false, error: 'weak_password', message: weak }); return }
    const seen = new Set<string>()
    for (const a of clean) {
      const key = normalizeUsername(a.username)
      if (seen.has(key)) { sendJson(res, 400, { ok: false, error: 'duplicate_username', message: `Duplicate username: ${a.username}` }); return }
      seen.add(key)
    }
    for (const a of clean) {
      await pool.query(
        'INSERT INTO auth_accounts (username, display_name, password_hash) VALUES ($1, $2, $3)',
        [normalizeUsername(a.username), a.displayName, hashPassword(a.password)],
      )
    }
    sendJson(res, 200, { ok: true, created: clean.length })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'setup_failed', message: errorMessage(err) })
  }
}

export async function handleAuthLogin(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const pool = getPool()
  if (!pool) { sendJson(res, 503, { ok: false, error: 'not_configured' }); return }
  try {
    const body = (await readJsonBody(req)) as { username?: unknown; password?: unknown }
    const username = typeof body.username === 'string' ? body.username : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!username || !password) { sendJson(res, 400, { ok: false, error: 'missing_credentials' }); return }
    const account = await getLoginAccount(pool, username)
    // Already locked out? Refuse before even checking the password.
    if (account && account.lockedUntil && isLocked(account)) {
      const mins = lockMinutes(account.lockedUntil)
      sendJson(res, 423, { ok: false, error: 'locked', message: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` })
      return
    }
    // Verify even when the user is missing (dummy hash) to keep timing uniform.
    const ok = account ? verifyPassword(password, account.passwordHash) : (verifyPassword(password, hashPassword('x')), false)
    if (!account || !ok) {
      if (account) {
        const { locked } = await recordFailedLogin(pool, account.id, account.failedAttempts)
        if (locked) {
          sendJson(res, 423, { ok: false, error: 'locked', message: 'Too many failed attempts. This account is locked for 15 minutes.' })
          return
        }
      }
      sendJson(res, 401, { ok: false, error: 'invalid_credentials', message: 'Wrong username or password.' })
      return
    }
    await clearFailedLogin(pool, account.id)
    const token = await createSession(pool, account.id)
    res.setHeader('Set-Cookie', serializeSessionCookie(token, req))
    sendJson(res, 200, {
      ok: true,
      user: { username: normalizeUsername(username), displayName: account.displayName, mustChangePassword: isPasswordExpired(account.passwordChangedAt) },
    })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'login_failed', message: errorMessage(err) })
  }
}

export async function handleAuthLogout(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const pool = getPool()
  try {
    if (pool) await destroySession(req, pool)
  } catch { /* clearing the cookie below is what matters */ }
  res.setHeader('Set-Cookie', clearSessionCookie())
  sendJson(res, 200, { ok: true })
}

export async function handleAuthMe(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const pool = getPool()
  if (!pool) { sendJson(res, 401, { ok: false, error: 'unauthenticated' }); return }
  try {
    const account = await validateSession(req, pool)
    if (!account) { sendJson(res, 401, { ok: false, error: 'unauthenticated' }); return }
    sendJson(res, 200, { ok: true, user: { username: account.username, displayName: account.displayName, mustChangePassword: account.passwordExpired } })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'me_failed', message: errorMessage(err) })
  }
}

/** Change the logged-in account's password. Verifies the current password,
 *  enforces the length policy, and restarts the age clock. Reuse is allowed. */
export async function handleAuthChangePassword(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const pool = getPool()
  if (!pool) { sendJson(res, 503, { ok: false, error: 'not_configured' }); return }
  try {
    const account = await validateSession(req, pool)
    if (!account) { sendJson(res, 401, { ok: false, error: 'unauthenticated', message: 'Log in first.' }); return }
    const body = (await readJsonBody(req)) as { currentPassword?: unknown; newPassword?: unknown }
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    const weak = validatePasswordStrength(newPassword)
    if (weak) { sendJson(res, 400, { ok: false, error: 'weak_password', message: weak }); return }
    const row = await getLoginAccountById(pool, account.id)
    if (!row || !verifyPassword(currentPassword, row.passwordHash)) {
      sendJson(res, 401, { ok: false, error: 'wrong_current', message: 'Your current password is incorrect.' })
      return
    }
    await changeAccountPassword(pool, account.id, newPassword)
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'change_failed', message: errorMessage(err) })
  }
}

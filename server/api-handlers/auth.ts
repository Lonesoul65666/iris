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
} from './auth-core.ts'

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
      user: account ? { username: account.username, displayName: account.displayName } : undefined,
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
    if (clean.some((a) => a.password.length < 6)) { sendJson(res, 400, { ok: false, error: 'weak_password', message: 'Passwords must be at least 6 characters.' }); return }
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
    const r = await pool.query<{ id: string; display_name: string; password_hash: string }>(
      'SELECT id, display_name, password_hash FROM auth_accounts WHERE username = $1',
      [normalizeUsername(username)],
    )
    const row = r.rows[0]
    // Verify even when the user is missing (dummy hash) to keep timing uniform.
    const ok = row ? verifyPassword(password, row.password_hash) : (verifyPassword(password, hashPassword('x')), false)
    if (!row || !ok) { sendJson(res, 401, { ok: false, error: 'invalid_credentials', message: 'Wrong username or password.' }); return }
    const token = await createSession(pool, row.id)
    res.setHeader('Set-Cookie', serializeSessionCookie(token, req))
    sendJson(res, 200, { ok: true, user: { username: normalizeUsername(username), displayName: row.display_name } })
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
    sendJson(res, 200, { ok: true, user: { username: account.username, displayName: account.displayName } })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'me_failed', message: errorMessage(err) })
  }
}

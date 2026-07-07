// Client for the auth endpoints. Same-origin fetches include the session
// cookie automatically, so nothing here manages tokens by hand.

export interface AuthUser {
  username: string
  displayName: string
}

export interface AuthStatus {
  configured: boolean   // DB connected?
  needsSetup: boolean   // no login accounts yet?
  authenticated: boolean
  user?: AuthUser
}

export async function getAuthStatus(): Promise<AuthStatus> {
  try {
    const res = await fetch('/api/auth/status')
    if (!res.ok) return { configured: false, needsSetup: false, authenticated: false }
    return (await res.json()) as AuthStatus
  } catch {
    return { configured: false, needsSetup: false, authenticated: false }
  }
}

export interface SetupAccountInput { username: string; password: string; displayName?: string }

export async function setupAccounts(accounts: SetupAccountInput[]): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accounts }),
  })
  const body = await res.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string }
  return { ok: !!body.ok, message: body.message ?? body.error }
}

export async function login(username: string, password: string): Promise<{ ok: boolean; user?: AuthUser; message?: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await res.json().catch(() => ({})) as { ok?: boolean; user?: AuthUser; message?: string; error?: string }
  return { ok: !!body.ok, user: body.user, message: body.message ?? body.error }
}

export async function logout(): Promise<void> {
  try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
}

/** Connect the backend to a Postgres URI and persist it to .env.local so it
 *  survives a restart. Used by the first-run setup screen on a fresh host. */
export async function connectDatabase(connectionString: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString }),
    })
    const body = await res.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string }
    if (!res.ok || !body.ok) return { ok: false, message: body.message ?? body.error ?? 'Could not connect.' }
    // Best-effort persist; connection still works this session even if it fails.
    await fetch('/api/connect/persist', { method: 'POST' }).catch(() => {})
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error.' }
  }
}

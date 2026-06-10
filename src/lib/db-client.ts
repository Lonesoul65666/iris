// Boot-time DB connection bootstrap.
//
// De-browser model: the backend can auto-connect from DATABASE_URL (.env.local),
// so a browser localStorage paste is now OPTIONAL. Resolution order:
//   1. If localStorage has a connection string, POST it to /api/connect (lets a
//      browser override the server's env config — backwards compatible).
//   2. Otherwise (or if that POST fails), check /api/health: if the server is
//      already connected from env, proceed with no paste required.
//   3. Only if neither path yields a connection do we report no_credential.

const STORAGE_KEY = 'iris_db_connection_string'

export type ConnectResult =
  | { status: 'connected' }
  | { status: 'no_credential' }
  | { status: 'error'; message: string }

async function serverIsConnected(): Promise<boolean> {
  try {
    const res = await fetch('/api/health')
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean; db?: string }
    return body.ok === true && body.db === 'connected'
  } catch {
    return false
  }
}

export async function bootstrapDbConnection(): Promise<ConnectResult> {
  const cs = localStorage.getItem(STORAGE_KEY)

  if (cs) {
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: cs }),
      })
      if (res.ok) return { status: 'connected' }
      // POST failed — the server may still be connected from env; fall through.
    } catch {
      // Network error — fall through to the health check.
    }
  }

  // No usable localStorage credential, or the POST failed: did the server
  // auto-connect from DATABASE_URL?
  if (await serverIsConnected()) return { status: 'connected' }

  if (!cs) return { status: 'no_credential' }
  return { status: 'error', message: 'Could not connect with the stored connection string, and the server is not configured.' }
}

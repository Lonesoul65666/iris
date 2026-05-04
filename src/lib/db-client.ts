// Boot-time helper: hand the user-owned connection string from localStorage
// to the dev-server middleware so /api/* can use the pg pool.
//
// Build-B scope: just the bootstrap. Real store calls swap to fetch() in
// Foundation Session 3, after schema + endpoints land in Session 2.

const STORAGE_KEY = 'iris_db_connection_string'

export type ConnectResult =
  | { status: 'connected' }
  | { status: 'no_credential' }
  | { status: 'error'; message: string }

export async function bootstrapDbConnection(): Promise<ConnectResult> {
  const cs = localStorage.getItem(STORAGE_KEY)
  if (!cs) return { status: 'no_credential' }

  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: cs }),
    })
    if (res.ok) return { status: 'connected' }
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
    return { status: 'error', message: body.message ?? body.error ?? `http_${res.status}` }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

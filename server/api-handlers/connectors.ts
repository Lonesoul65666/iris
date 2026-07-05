// Connector enrollment endpoints (Build-T2).
//
//   GET  /api/connectors/list             -> { ok, items: Connector[] }
//   POST /api/connectors/save             { connector } -> { ok, id }
//   POST /api/connectors/delete           { id } | { all: true } -> { ok, deleted }
//
// Stores access tokens captured by the in-app Teller Connect widget (and
// later Coinbase / OFX flows). Access tokens are secrets; they live only in
// the user's own Postgres and are never logged or returned to anyone but
// the same user.
//
// The client generates `id` (uuid) so save is idempotent on retry.

import { sendJson, readJsonBody, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'

interface ConnectorRow {
  id: string
  provider: string
  institution: string
  provider_enrollment_id: string | null
  access_token: string
  status: string
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface ConnectorInput {
  id: string
  provider: string
  institution: string
  provider_enrollment_id?: string | null
  access_token?: string // never returned by list — server-side only
  status?: string
  data?: Record<string, unknown>
}

function isValidProvider(p: unknown): p is string {
  return typeof p === 'string' && /^[a-z0-9_-]{1,32}$/.test(p)
}

export async function handleConnectorsList(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  try {
    // NEVER return access_token — it's a live bank bearer credential and stays
    // server-side. Teller sync reads it directly from the DB (teller-client.ts).
    const r = await ctx.pool.query<ConnectorRow>(
      `SELECT id, provider, institution, provider_enrollment_id, status,
              data, created_at::text, updated_at::text
         FROM connectors
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [ctx.userId],
    )
    sendJson(res, 200, { ok: true, items: r.rows })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleConnectorsSave(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { connector?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const c = body.connector as ConnectorInput | undefined
  if (!c || typeof c !== 'object') {
    sendJson(res, 400, { ok: false, error: 'missing_connector' })
    return
  }
  if (typeof c.id !== 'string' || c.id.length === 0) {
    sendJson(res, 400, { ok: false, error: 'invalid_id' })
    return
  }
  if (!isValidProvider(c.provider)) {
    sendJson(res, 400, { ok: false, error: 'invalid_provider' })
    return
  }
  if (typeof c.institution !== 'string' || c.institution.length === 0) {
    sendJson(res, 400, { ok: false, error: 'invalid_institution' })
    return
  }
  if (typeof c.access_token !== 'string' || c.access_token.length === 0) {
    sendJson(res, 400, { ok: false, error: 'invalid_access_token' })
    return
  }
  const status = typeof c.status === 'string' ? c.status : 'active'
  const data = c.data && typeof c.data === 'object' ? c.data : {}
  const enrollmentId = typeof c.provider_enrollment_id === 'string' ? c.provider_enrollment_id : null

  try {
    const client = await ctx.pool.connect()
    try {
      await client.query('BEGIN')
      // Re-enrollment retires the old connector for the same institution.
      // Without this, every reconnect left a zombie 'active' row whose dead
      // token 401'd on every sync — a permanent "needs reconnect" alarm and
      // a wasted Teller call per sync.
      if (status === 'active') {
        await client.query(
          `UPDATE connectors SET status = 'replaced', updated_at = now()
            WHERE user_id = $1 AND provider = $2 AND institution = $3 AND id <> $4 AND status = 'active'`,
          [ctx.userId, c.provider, c.institution, c.id],
        )
      }
      await client.query(
        `INSERT INTO connectors
           (id, user_id, provider, institution, provider_enrollment_id, access_token, status, data, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
         ON CONFLICT (user_id, id) DO UPDATE
           SET provider               = EXCLUDED.provider,
               institution            = EXCLUDED.institution,
               provider_enrollment_id = EXCLUDED.provider_enrollment_id,
               access_token           = EXCLUDED.access_token,
               status                 = EXCLUDED.status,
               data                   = EXCLUDED.data,
               updated_at             = now()`,
        [c.id, ctx.userId, c.provider, c.institution, enrollmentId, c.access_token, status, JSON.stringify(data)],
      )
      await client.query('COMMIT')
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* connection may be dead */ }
      throw err
    } finally {
      client.release()
    }
    sendJson(res, 200, { ok: true, id: c.id })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleConnectorsDelete(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { id?: unknown; all?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  try {
    let r: { rowCount: number | null }
    if (body.all === true) {
      r = await ctx.pool.query('DELETE FROM connectors WHERE user_id = $1', [ctx.userId])
    } else if (typeof body.id === 'string' && body.id.length > 0) {
      r = await ctx.pool.query('DELETE FROM connectors WHERE user_id = $1 AND id = $2', [ctx.userId, body.id])
    } else {
      sendJson(res, 400, { ok: false, error: 'missing_id_or_all' })
      return
    }
    sendJson(res, 200, { ok: true, deleted: r.rowCount ?? 0 })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

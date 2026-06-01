// Audit log endpoints (Build-D2c) — mirrors the IndexedDB `iris-audit` store.
//
//   GET  /api/audit/list?limit=200&entityId=...  -> { ok, items: AuditEntry[] }  (newest first)
//   POST /api/audit/append  { entry }            -> { ok }
//   POST /api/audit/delete  { all: true }        -> { ok, deleted: N }
//
// The client generates entry.id + entry.timestamp (preserving the existing
// auditLogStore contract); the server promotes id + ts to columns and stores
// the full entry in `data` jsonb.

import { sendJson, readJsonBody, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'

interface AuditEntryShape {
  id: string
  timestamp: string
  [k: string]: unknown
}

export async function handleAuditList(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  const url = new URL(req.url ?? '', 'http://localhost')
  const entityId = url.searchParams.get('entityId')
  const limitRaw = Number(url.searchParams.get('limit') ?? '200')
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 200

  const where: string[] = ['user_id = $1']
  const params: unknown[] = [ctx.userId]
  if (entityId) {
    params.push(entityId)
    where.push(`data->>'entityId' = $${params.length}`)
  }
  params.push(limit)
  const sql = `SELECT data FROM audit_log WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT $${params.length}`

  try {
    const r = await ctx.pool.query<{ data: Record<string, unknown> }>(sql, params)
    sendJson(res, 200, { ok: true, items: r.rows.map((row) => row.data) })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleAuditAppend(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { entry?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const e = body.entry as AuditEntryShape | undefined
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || typeof e.timestamp !== 'string') {
    sendJson(res, 400, { ok: false, error: 'invalid_entry_shape' })
    return
  }
  try {
    await ctx.pool.query(
      `INSERT INTO audit_log (user_id, id, ts, data)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (user_id, id) DO UPDATE
         SET ts = EXCLUDED.ts, data = EXCLUDED.data`,
      [ctx.userId, e.id, e.timestamp, JSON.stringify(e)],
    )
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleAuditDelete(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { all?: unknown; id?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  try {
    let r: { rowCount: number | null }
    if (body.all === true) {
      r = await ctx.pool.query('DELETE FROM audit_log WHERE user_id = $1', [ctx.userId])
    } else if (typeof body.id === 'string' && body.id.length > 0) {
      r = await ctx.pool.query('DELETE FROM audit_log WHERE user_id = $1 AND id = $2', [ctx.userId, body.id])
    } else {
      sendJson(res, 400, { ok: false, error: 'missing_all_or_id' })
      return
    }
    sendJson(res, 200, { ok: true, deleted: r.rowCount ?? 0 })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

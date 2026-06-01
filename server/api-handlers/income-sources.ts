// Income source endpoints — mirrors the IndexedDB `incomeSources` store.
//
//   GET  /api/incomeSources/list   -> { ok, items: IncomeSource[] }
//   POST /api/incomeSources/save   { source } -> { ok }
//   POST /api/incomeSources/save-batch { sources: [...] } -> { ok, written: N }
//   POST /api/incomeSources/delete { id } | { ids:[...] } -> { ok, deleted: N }
//
// Hybrid columns + jsonb: id, payer, subtype, status, includeInBudget are
// promoted to typed columns for indexing/queries; everything else lives in
// `data` jsonb so the row shape can evolve without schema churn.

import { sendJson, readJsonBody, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'

interface IncomeSourceShape {
  id: string
  payer: string
  subtype: string
  status: string
  includeInBudget?: boolean
  [k: string]: unknown
}

function rowToSource(row: { id: string; payer: string; subtype: string; status: string; include_in_budget: boolean; data: Record<string, unknown> }): IncomeSourceShape {
  return {
    ...row.data,
    id: row.id,
    payer: row.payer,
    subtype: row.subtype,
    status: row.status,
    includeInBudget: row.include_in_budget,
  }
}

export async function handleIncomeSourcesList(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  try {
    const r = await ctx.pool.query<{
      id: string; payer: string; subtype: string; status: string;
      include_in_budget: boolean; data: Record<string, unknown>;
    }>(
      `SELECT id, payer, subtype, status, include_in_budget, data
       FROM income_sources
       WHERE user_id = $1
       ORDER BY id`,
      [ctx.userId],
    )
    sendJson(res, 200, { ok: true, items: r.rows.map(rowToSource) })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

function validateSource(s: unknown): { ok: true; source: IncomeSourceShape } | { ok: false; error: string } {
  if (!s || typeof s !== 'object') return { ok: false, error: 'missing_source' }
  const src = s as IncomeSourceShape
  if (typeof src.id !== 'string' || typeof src.payer !== 'string'
      || typeof src.subtype !== 'string' || typeof src.status !== 'string') {
    return { ok: false, error: 'invalid_source_shape' }
  }
  return { ok: true, source: src }
}

const UPSERT_SOURCE_SQL = `
  INSERT INTO income_sources
    (id, user_id, payer, subtype, status, include_in_budget, data, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
   ON CONFLICT (user_id, id) DO UPDATE
     SET payer             = EXCLUDED.payer,
         subtype           = EXCLUDED.subtype,
         status            = EXCLUDED.status,
         include_in_budget = EXCLUDED.include_in_budget,
         data              = EXCLUDED.data,
         updated_at        = now()
`

function upsertSourceParams(userId: string, s: IncomeSourceShape): unknown[] {
  return [s.id, userId, s.payer, s.subtype, s.status, s.includeInBudget !== false, JSON.stringify({ ...s })]
}

export async function handleIncomeSourcesSave(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { source?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const v = validateSource(body.source)
  if (!v.ok) {
    sendJson(res, 400, { ok: false, error: v.error })
    return
  }
  try {
    await ctx.pool.query(UPSERT_SOURCE_SQL, upsertSourceParams(ctx.userId, v.source))
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleIncomeSourcesSaveBatch(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { sources?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  if (!Array.isArray(body.sources)) {
    sendJson(res, 400, { ok: false, error: 'missing_sources' })
    return
  }
  const validated: IncomeSourceShape[] = []
  for (let i = 0; i < body.sources.length; i++) {
    const v = validateSource(body.sources[i])
    if (!v.ok) {
      sendJson(res, 400, { ok: false, error: v.error, index: i })
      return
    }
    validated.push(v.source)
  }
  try {
    const client = await ctx.pool.connect()
    try {
      await client.query('BEGIN')
      for (const s of validated) {
        await client.query(UPSERT_SOURCE_SQL, upsertSourceParams(ctx.userId, s))
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    sendJson(res, 200, { ok: true, written: validated.length })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleIncomeSourcesDelete(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { id?: unknown; ids?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const ids: string[] = []
  if (typeof body.id === 'string' && body.id.length > 0) ids.push(body.id)
  if (Array.isArray(body.ids)) {
    for (const id of body.ids) if (typeof id === 'string' && id.length > 0) ids.push(id)
  }
  if (ids.length === 0) {
    sendJson(res, 400, { ok: false, error: 'missing_id_or_ids' })
    return
  }
  try {
    const r = await ctx.pool.query(
      'DELETE FROM income_sources WHERE user_id = $1 AND id = ANY($2::text[])',
      [ctx.userId, ids],
    )
    sendJson(res, 200, { ok: true, deleted: r.rowCount ?? 0 })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

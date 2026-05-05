// Income source endpoints — mirrors the IndexedDB `incomeSources` store.
//
//   GET  /api/incomeSources/list   -> { ok, items: IncomeSource[] }
//   POST /api/incomeSources/save   { source } -> { ok }
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

export async function handleIncomeSourcesSave(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { source?: IncomeSourceShape }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const s = body.source
  if (!s || typeof s !== 'object') {
    sendJson(res, 400, { ok: false, error: 'missing_source' })
    return
  }
  if (typeof s.id !== 'string' || typeof s.payer !== 'string'
      || typeof s.subtype !== 'string' || typeof s.status !== 'string') {
    sendJson(res, 400, { ok: false, error: 'invalid_source_shape' })
    return
  }
  // The full source object goes into `data`; typed columns are promoted views.
  const data = { ...s }
  try {
    await ctx.pool.query(
      `INSERT INTO income_sources
        (id, user_id, payer, subtype, status, include_in_budget, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
       ON CONFLICT (user_id, id) DO UPDATE
         SET payer             = EXCLUDED.payer,
             subtype           = EXCLUDED.subtype,
             status            = EXCLUDED.status,
             include_in_budget = EXCLUDED.include_in_budget,
             data              = EXCLUDED.data,
             updated_at        = now()`,
      [s.id, ctx.userId, s.payer, s.subtype, s.status, s.includeInBudget !== false, JSON.stringify(data)],
    )
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

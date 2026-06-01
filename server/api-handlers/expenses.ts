// Expense (transaction) endpoints — mirrors the IndexedDB `expenses` store.
//
//   GET  /api/expenses/list?from=YYYY-MM-DD&to=YYYY-MM-DD  -> { ok, items }
//   POST /api/expenses/save    { expense }                 -> { ok }
//   POST /api/expenses/delete  { id } | { ids:[...] }
//                            | { all: true }
//                            | { source: '...' }
//                            | { batchPrefix: '...' }      -> { ok, deleted: N }
//
// `date` and `amount` are typed columns (queryable / indexable). The full
// expense object lives in `data` jsonb so we can evolve the row shape without
// schema churn.
//
// Date / amount normalization (added 2026-05-05 during Build-D1 migration):
// real-world IndexedDB rows arrive in mixed shapes (ISO datetime strings,
// MM/DD/YYYY from CSVs, numeric strings). We coerce to canonical
// `YYYY-MM-DD` (date) and JS number (amount) here so the migration script
// doesn't have to scrub data row-by-row.

import { sendJson, readJsonBody, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'

interface ExpenseShape {
  id: string
  date: string  // canonical 'YYYY-MM-DD' on the wire after normalization
  amount: number
  [k: string]: unknown
}

function rowToExpense(row: { id: string; date: string; amount: string; data: Record<string, unknown> }): ExpenseShape {
  return {
    ...row.data,
    id: row.id,
    date: row.date,
    amount: Number(row.amount),
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function normalizeDate(input: unknown): string | null {
  if (typeof input !== 'string') return null
  // ISO date or ISO datetime — take the YYYY-MM-DD prefix if present.
  const isoMatch = input.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoMatch) return isoMatch[1]
  // MM/DD/YYYY or M/D/YYYY (CSV imports).
  const slashMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashMatch) {
    const mm = slashMatch[1].padStart(2, '0')
    const dd = slashMatch[2].padStart(2, '0')
    return `${slashMatch[3]}-${mm}-${dd}`
  }
  // Last resort: try Date.parse for things like "April 15, 2026".
  const t = Date.parse(input)
  if (!Number.isNaN(t)) {
    const d = new Date(t)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return null
}

function normalizeAmount(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input
  if (typeof input === 'string') {
    const cleaned = input.replace(/[$,\s]/g, '')
    const n = parseFloat(cleaned)
    if (Number.isFinite(n)) return n
  }
  return null
}

export async function handleExpensesList(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  const url = new URL(req.url ?? '', 'http://localhost')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (from && !ISO_DATE.test(from)) {
    sendJson(res, 400, { ok: false, error: 'invalid_from' })
    return
  }
  if (to && !ISO_DATE.test(to)) {
    sendJson(res, 400, { ok: false, error: 'invalid_to' })
    return
  }
  const where: string[] = ['user_id = $1']
  const params: unknown[] = [ctx.userId]
  if (from) { params.push(from); where.push(`date >= $${params.length}`) }
  if (to)   { params.push(to);   where.push(`date <= $${params.length}`) }
  const sql = `SELECT id, date, amount, data FROM expenses WHERE ${where.join(' AND ')} ORDER BY date DESC, id`
  try {
    const r = await ctx.pool.query<{ id: string; date: string; amount: string; data: Record<string, unknown> }>(sql, params)
    sendJson(res, 200, { ok: true, items: r.rows.map(rowToExpense) })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleExpensesDelete(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { id?: unknown; ids?: unknown; all?: unknown; source?: unknown; batchPrefix?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  try {
    let r: { rowCount: number | null }
    if (body.all === true) {
      r = await ctx.pool.query('DELETE FROM expenses WHERE user_id = $1', [ctx.userId])
    } else if (typeof body.source === 'string' && body.source.length > 0) {
      r = await ctx.pool.query(
        `DELETE FROM expenses WHERE user_id = $1 AND data->>'source' = $2`,
        [ctx.userId, body.source],
      )
    } else if (typeof body.batchPrefix === 'string' && body.batchPrefix.length > 0) {
      r = await ctx.pool.query(
        `DELETE FROM expenses WHERE user_id = $1 AND data->>'importBatch' LIKE $2`,
        [ctx.userId, `${body.batchPrefix}%`],
      )
    } else {
      const ids: string[] = []
      if (typeof body.id === 'string' && body.id.length > 0) ids.push(body.id)
      if (Array.isArray(body.ids)) {
        for (const id of body.ids) if (typeof id === 'string' && id.length > 0) ids.push(id)
      }
      if (ids.length === 0) {
        sendJson(res, 400, { ok: false, error: 'missing_id_or_filter' })
        return
      }
      r = await ctx.pool.query(
        'DELETE FROM expenses WHERE user_id = $1 AND id = ANY($2::text[])',
        [ctx.userId, ids],
      )
    }
    sendJson(res, 200, { ok: true, deleted: r.rowCount ?? 0 })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleExpensesSave(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { expense?: Record<string, unknown> }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const e = body.expense
  if (!e || typeof e !== 'object') {
    sendJson(res, 400, { ok: false, error: 'missing_expense' })
    return
  }

  const id = e.id
  const dateNorm = normalizeDate(e.date)
  const amountNorm = normalizeAmount(e.amount)

  const invalidFields: string[] = []
  if (typeof id !== 'string' || id.length === 0) invalidFields.push('id')
  if (dateNorm === null) invalidFields.push('date')
  if (amountNorm === null) invalidFields.push('amount')
  if (invalidFields.length > 0) {
    sendJson(res, 400, {
      ok: false,
      error: 'invalid_expense_shape',
      invalidFields,
      seenTypes: { id: typeof id, date: typeof e.date, amount: typeof e.amount },
    })
    return
  }

  // Persist canonical normalized values both in the typed columns AND in the
  // jsonb `data` blob so reads are consistent.
  const data = { ...e, date: dateNorm, amount: amountNorm }
  try {
    await ctx.pool.query(
      `INSERT INTO expenses (id, user_id, date, amount, data, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, now())
       ON CONFLICT (user_id, id) DO UPDATE
         SET date       = EXCLUDED.date,
             amount     = EXCLUDED.amount,
             data       = EXCLUDED.data,
             updated_at = now()`,
      [id, ctx.userId, dateNorm, amountNorm, JSON.stringify(data)],
    )
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

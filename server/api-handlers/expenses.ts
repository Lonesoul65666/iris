// Expense (transaction) endpoints — mirrors the IndexedDB `expenses` store.
//
//   GET  /api/expenses/list?from=YYYY-MM-DD&to=YYYY-MM-DD  -> { ok, items }
//   POST /api/expenses/save  { expense } -> { ok }
//
// `date` and `amount` are typed columns (queryable / indexable). The full
// expense object lives in `data` jsonb so we can evolve the row shape without
// schema churn.

import { sendJson, readJsonBody, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'

interface ExpenseShape {
  id: string
  date: string  // ISO 'YYYY-MM-DD'
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

export async function handleExpensesSave(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { expense?: ExpenseShape }
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
  if (typeof e.id !== 'string' || typeof e.date !== 'string' || !ISO_DATE.test(e.date)
      || typeof e.amount !== 'number' || !Number.isFinite(e.amount)) {
    sendJson(res, 400, { ok: false, error: 'invalid_expense_shape' })
    return
  }
  const data = { ...e }
  try {
    await ctx.pool.query(
      `INSERT INTO expenses (id, user_id, date, amount, data, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, now())
       ON CONFLICT (user_id, id) DO UPDATE
         SET date       = EXCLUDED.date,
             amount     = EXCLUDED.amount,
             data       = EXCLUDED.data,
             updated_at = now()`,
      [e.id, ctx.userId, e.date, e.amount, JSON.stringify(data)],
    )
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

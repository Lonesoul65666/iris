// Full-export endpoint — Layer 4 backup per ADR-0002.
//
//   GET /api/export/full -> JSON file download containing all user data
//                           across users, settings, income_sources, expenses,
//                           and collections. Stable schema:
//                           { meta, users, settings, income_sources, expenses, collections }
//
// Sets Content-Disposition so the browser downloads it as
// `iris-backup-YYYY-MM-DD.json`. No filtering — the user owns all their
// data and gets all of it.

import { sendJson, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'

interface ExportPayload {
  meta: {
    exportedAt: string
    schemaVersion: number
    userId: string
  }
  users: Array<{ id: string; display_name: string; created_at: string }>
  settings: Array<{ key: string; value: unknown; updatedAt: string }>
  income_sources: Array<Record<string, unknown>>
  expenses: Array<Record<string, unknown>>
  collections: Array<{ name: string; key: string; data: unknown; updatedAt: string }>
}

export async function handleExportFull(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = await requireContext(req, res)
  if (!ctx) return

  try {
    const [usersR, settingsR, incomeR, expensesR, collectionsR, schemaR] = await Promise.all([
      ctx.pool.query<{ id: string; display_name: string; created_at: string }>(
        'SELECT id, display_name, created_at FROM users WHERE id = $1',
        [ctx.userId],
      ),
      ctx.pool.query<{ key: string; value: unknown; updated_at: string }>(
        'SELECT key, value, updated_at FROM settings WHERE user_id = $1 ORDER BY key',
        [ctx.userId],
      ),
      ctx.pool.query<{ id: string; payer: string; subtype: string; status: string; include_in_budget: boolean; data: Record<string, unknown> }>(
        `SELECT id, payer, subtype, status, include_in_budget, data
         FROM income_sources WHERE user_id = $1 ORDER BY id`,
        [ctx.userId],
      ),
      ctx.pool.query<{ id: string; date: string; amount: string; data: Record<string, unknown> }>(
        `SELECT id, date, amount, data
         FROM expenses WHERE user_id = $1 ORDER BY date DESC, id`,
        [ctx.userId],
      ),
      ctx.pool.query<{ name: string; key: string; data: unknown; updated_at: string }>(
        `SELECT name, key, data, updated_at
         FROM collections WHERE user_id = $1 ORDER BY name, key`,
        [ctx.userId],
      ),
      ctx.pool.query<{ version: number }>(
        'SELECT MAX(version) AS version FROM schema_migrations',
      ),
    ])

    const payload: ExportPayload = {
      meta: {
        exportedAt: new Date().toISOString(),
        schemaVersion: schemaR.rows[0]?.version ?? 0,
        userId: ctx.userId,
      },
      users: usersR.rows,
      settings: settingsR.rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at })),
      income_sources: incomeR.rows.map((r) => ({
        ...r.data,
        id: r.id,
        payer: r.payer,
        subtype: r.subtype,
        status: r.status,
        includeInBudget: r.include_in_budget,
      })),
      expenses: expensesR.rows.map((r) => ({ ...r.data, id: r.id, date: r.date, amount: Number(r.amount) })),
      collections: collectionsR.rows.map((r) => ({ name: r.name, key: r.key, data: r.data, updatedAt: r.updated_at })),
    }

    const today = new Date().toISOString().slice(0, 10)
    const filename = `iris-backup-${today}.json`
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.end(JSON.stringify(payload, null, 2))
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'export_failed', message: errorMessage(err) })
  }
}

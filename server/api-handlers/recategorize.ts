// Re-categorization endpoint (Build-T3 follow-up).
//
//   POST /api/expenses/recategorize?dryRun=1   -> { ok, total, changed, before, after, samples }
//
// Applies the existing, merchant-tuned classifier (src/utils/transactionCategorize)
// to expenses already in Postgres. The Teller import used Teller's own (sparse)
// categories, which left ~736 Citi rows as 'other'. guessCategory/classifyBank-
// Transaction know Scott & Claire's actual merchants (H-E-B, Starbucks, hotels,
// Atmos, Fidelity→investing, WF mortgage→housing, card payments→transfer), so a
// re-pass collapses the 'other' pile. No Teller calls — pure DB rewrite.
//
// Imported rows store amount POSITIVE (already sign-flipped to spend magnitude).
// classifyBankTransaction treats positive as an inflow, so we pass a NEGATIVE
// amount to force the outflow path (where the merchant rules live).

import { sendJson, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'
import { classifyBankTransaction } from '../../src/utils/transactionCategorize.ts'

interface ExpenseRow {
  id: string
  date: string
  amount: string
  data: Record<string, unknown>
}

export async function handleExpensesRecategorize(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return

  const url = new URL(req.url ?? '', 'http://localhost')
  const dryRun = url.searchParams.get('dryRun') === '1'
  // By default only touch rows whose category is 'other' / missing; pass all=1
  // to re-classify everything (e.g. to also tidy the CapOne mappings).
  const all = url.searchParams.get('all') === '1'

  let rows: ExpenseRow[]
  try {
    const r = await ctx.pool.query<ExpenseRow>(
      'SELECT id, date, amount, data FROM expenses WHERE user_id = $1',
      [ctx.userId],
    )
    rows = r.rows
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
    return
  }

  const before: Record<string, number> = {}
  const after: Record<string, number> = {}
  const updates: Array<{ id: string; data: Record<string, unknown> }> = []
  const samples: Array<{ desc: string; from: string; to: string }> = []

  for (const row of rows) {
    const data = row.data || {}
    const oldCat = (data.category as string) || 'other'
    before[oldCat] = (before[oldCat] ?? 0) + 1

    const desc = String(data.description ?? '')
    const amt = Number(row.amount) || 0
    // negative => outflow path (merchant rules)
    const { flow, type, category } = classifyBankTransaction(desc, -Math.abs(amt))

    const shouldTouch = all || oldCat === 'other' || !data.category
    const newCat = shouldTouch ? category : oldCat

    after[newCat] = (after[newCat] ?? 0) + 1

    if (shouldTouch && newCat !== oldCat) {
      const newData = { ...data, category: newCat, flow, transactionType: type }
      updates.push({ id: row.id, data: newData })
      if (samples.length < 12) samples.push({ desc: desc.slice(0, 34), from: oldCat, to: newCat })
    }
  }

  let written = 0
  if (!dryRun && updates.length > 0) {
    const client = await ctx.pool.connect()
    try {
      await client.query('BEGIN')
      for (const u of updates) {
        await client.query(
          'UPDATE expenses SET data = $3::jsonb, updated_at = now() WHERE user_id = $1 AND id = $2',
          [ctx.userId, u.id, JSON.stringify(u.data)],
        )
      }
      await client.query('COMMIT')
      written = updates.length
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* connection may be dead; finally still releases */ }
      sendJson(res, 500, { ok: false, error: 'write_failed', message: errorMessage(err) })
      return
    } finally {
      client.release()
    }
  }

  const sortCounts = (o: Record<string, number>) =>
    Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]))

  sendJson(res, 200, {
    ok: true,
    dryRun,
    mode: all ? 'all' : 'other_only',
    total: rows.length,
    changed: updates.length,
    written,
    before: sortCounts(before),
    after: sortCounts(after),
    samples,
  })
}

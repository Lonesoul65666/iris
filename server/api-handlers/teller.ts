// Teller API endpoints (Build-T1).
//
//   GET /api/teller/status    -> { ok, status }  cert/key config diagnostics (no secrets)
//   GET /api/teller/accounts  -> { ok, accounts, errors }  live accounts per connector
//
// /accounts is the first real handshake with Teller's data: for each active
// teller connector in the user's Postgres, present the access_token over the
// mTLS channel and list the accounts it can see. Per-connector failures are
// collected (not fatal) so one revoked enrollment doesn't blank the whole list.

import { sendJson, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'
import { fetchAccounts, fetchAllTransactions, tellerConfigStatus, TellerApiError, type TellerAccount } from '../teller-client.ts'
import { tellerTxnToExpense, classifyTellerTxn, type MappedExpense, type SkipReason } from '../teller-map.ts'

export async function handleTellerStatus(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  // No DB context needed — pure config inspection. Never returns cert contents.
  sendJson(res, 200, { ok: true, status: tellerConfigStatus() })
}

interface ConnectorTokenRow {
  id: string
  institution: string
  access_token: string
  provider_enrollment_id: string | null
}

interface AccountWithConnector extends TellerAccount {
  _connectorId: string
  _connectorInstitution: string
}

interface ConnectorFetchError {
  connectorId: string
  institution: string
  status: number | null
  code: string
  message: string
}

export async function handleTellerAccounts(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return

  // Fail fast with a clear message if certs aren't configured.
  const cfg = tellerConfigStatus()
  if (!cfg.configured || !cfg.certReadable || !cfg.keyReadable) {
    sendJson(res, 503, { ok: false, error: 'teller_not_configured', status: cfg })
    return
  }

  let rows: ConnectorTokenRow[]
  try {
    const r = await ctx.pool.query<ConnectorTokenRow>(
      `SELECT id, institution, access_token, provider_enrollment_id
         FROM connectors
        WHERE user_id = $1 AND provider = 'teller' AND status = 'active'
        ORDER BY created_at DESC`,
      [ctx.userId],
    )
    rows = r.rows
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
    return
  }

  const accounts: AccountWithConnector[] = []
  const errors: ConnectorFetchError[] = []

  // Sequential keeps it simple and avoids hammering Teller; the connector count
  // is tiny (one per bank). Parallelize later only if it ever matters.
  for (const row of rows) {
    try {
      const accs = await fetchAccounts(row.access_token)
      for (const a of accs) {
        accounts.push({ ...a, _connectorId: row.id, _connectorInstitution: row.institution })
      }
    } catch (err) {
      if (err instanceof TellerApiError) {
        errors.push({ connectorId: row.id, institution: row.institution, status: err.status, code: err.code, message: err.message })
      } else {
        errors.push({ connectorId: row.id, institution: row.institution, status: null, code: 'request_failed', message: errorMessage(err) })
      }
    }
  }

  sendJson(res, 200, { ok: true, accounts, errors })
}

/**
 * READ-ONLY raw transactions (Build-T3 pre-work / payroll detection).
 *   GET /api/teller/transactions?accountId=...&creditsOnly=1
 * Returns Teller transactions (optionally one account, optionally credits/
 * deposits only) WITHOUT writing anything. Used here to find when the second
 * income's paychecks stopped, so we can set the clean-slate cutoff precisely.
 */
export async function handleTellerTransactions(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return

  const cfg = tellerConfigStatus()
  if (!cfg.configured || !cfg.certReadable || !cfg.keyReadable) {
    sendJson(res, 503, { ok: false, error: 'teller_not_configured', status: cfg })
    return
  }

  const url = new URL(req.url ?? '', 'http://localhost')
  const filterAccountId = url.searchParams.get('accountId')
  const creditsOnly = url.searchParams.get('creditsOnly') === '1'

  let rows: ConnectorTokenRow[]
  try {
    const r = await ctx.pool.query<ConnectorTokenRow>(
      `SELECT id, institution, access_token, provider_enrollment_id
         FROM connectors
        WHERE user_id = $1 AND provider = 'teller' AND status = 'active'`,
      [ctx.userId],
    )
    rows = r.rows
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
    return
  }

  const out: Array<{ institution: string; accountId: string; accountName: string; subtype: string; date: string; amount: string; description: string; counterparty: string | null; category: string | null; txnType: string | null }> = []
  const errors: ConnectorFetchError[] = []

  for (const row of rows) {
    let accs: TellerAccount[]
    try {
      accs = await fetchAccounts(row.access_token)
    } catch (err) {
      errors.push({ connectorId: row.id, institution: row.institution, status: err instanceof TellerApiError ? err.status : null, code: err instanceof TellerApiError ? err.code : 'request_failed', message: errorMessage(err) })
      continue
    }
    for (const a of accs) {
      if (filterAccountId && a.id !== filterAccountId) continue
      try {
        const { transactions } = await fetchAllTransactions(row.access_token, a.id)
        for (const t of transactions) {
          const amt = Number(t.amount)
          if (creditsOnly && !(amt > 0)) continue
          out.push({
            institution: row.institution,
            accountId: a.id,
            accountName: a.name,
            subtype: a.subtype,
            date: t.date,
            amount: t.amount,
            description: t.description,
            counterparty: t.details?.counterparty?.name ?? null,
            category: t.details?.category ?? null,
            txnType: t.type ?? null,
          })
        }
      } catch (err) {
        errors.push({ connectorId: row.id, institution: `${row.institution}/${a.name}`, status: err instanceof TellerApiError ? err.status : null, code: err instanceof TellerApiError ? err.code : 'request_failed', message: errorMessage(err) })
      }
    }
  }

  sendJson(res, 200, { ok: true, transactions: out, errors })
}

interface ProbeAccountResult {
  connectorId: string
  institution: string
  accountId: string
  accountName: string
  type: string
  subtype: string
  lastFour: string
  txnCount: number
  earliest: string | null
  latest: string | null
  pages: number
  truncated: boolean
}

/**
 * READ-ONLY probe (Build-T3 pre-work). For every active Teller account, page
 * through its full transaction history and report depth (count + date range)
 * WITHOUT writing anything to the expenses table. This answers the load-bearing
 * unknown — how far back each bank lets us pull — before we decide whether to
 * clean-replace or layer onto the existing CSV/SimpleFIN history.
 */
export async function handleTellerProbe(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return

  const cfg = tellerConfigStatus()
  if (!cfg.configured || !cfg.certReadable || !cfg.keyReadable) {
    sendJson(res, 503, { ok: false, error: 'teller_not_configured', status: cfg })
    return
  }

  let rows: ConnectorTokenRow[]
  try {
    const r = await ctx.pool.query<ConnectorTokenRow>(
      `SELECT id, institution, access_token, provider_enrollment_id
         FROM connectors
        WHERE user_id = $1 AND provider = 'teller' AND status = 'active'
        ORDER BY created_at DESC`,
      [ctx.userId],
    )
    rows = r.rows
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
    return
  }

  const results: ProbeAccountResult[] = []
  const errors: ConnectorFetchError[] = []

  for (const row of rows) {
    let accs: TellerAccount[]
    try {
      accs = await fetchAccounts(row.access_token)
    } catch (err) {
      if (err instanceof TellerApiError) {
        errors.push({ connectorId: row.id, institution: row.institution, status: err.status, code: err.code, message: err.message })
      } else {
        errors.push({ connectorId: row.id, institution: row.institution, status: null, code: 'request_failed', message: errorMessage(err) })
      }
      continue
    }
    for (const a of accs) {
      try {
        const { transactions, pages, truncated } = await fetchAllTransactions(row.access_token, a.id)
        const dates = transactions.map((t) => t.date).filter(Boolean).sort()
        results.push({
          connectorId: row.id,
          institution: row.institution,
          accountId: a.id,
          accountName: a.name,
          type: a.type,
          subtype: a.subtype,
          lastFour: a.last_four,
          txnCount: transactions.length,
          earliest: dates[0] ?? null,
          latest: dates[dates.length - 1] ?? null,
          pages,
          truncated,
        })
      } catch (err) {
        if (err instanceof TellerApiError) {
          errors.push({ connectorId: row.id, institution: `${row.institution}/${a.name}`, status: err.status, code: err.code, message: err.message })
        } else {
          errors.push({ connectorId: row.id, institution: `${row.institution}/${a.name}`, status: null, code: 'request_failed', message: errorMessage(err) })
        }
      }
    }
  }

  sendJson(res, 200, { ok: true, results, errors })
}

interface ImportAccountSummary {
  institution: string
  accountName: string
  subtype: string
  lastFour: string
  source: string
  fetched: number
  kept: number
  keptAmount: number
  skipped: Record<string, number>
  sampleKept: Array<{ date: string; amount: number; description: string; category: string }>
}

/**
 * Build-T3 import. Fetch Teller transactions since `?since=YYYY-MM-DD`
 * (default 2025-09-01), map to Iris expenses with double-count avoidance, and
 * UPSERT them tagged with an import batch. Old (sf-/CSV) rows are left intact —
 * the prune is a separate, deliberate step after verification.
 *
 *   ?since=YYYY-MM-DD   cutoff (default 2025-09-01)
 *   ?dryRun=1           map + summarize but DO NOT write
 *
 * Deterministic ids (`teller_<txnId>`) make re-runs idempotent; the batch tag
 * makes a bad import reversible via /api/expenses/delete { batchPrefix }.
 */
export async function handleTellerImport(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return

  const cfg = tellerConfigStatus()
  if (!cfg.configured || !cfg.certReadable || !cfg.keyReadable) {
    sendJson(res, 503, { ok: false, error: 'teller_not_configured', status: cfg })
    return
  }

  const url = new URL(req.url ?? '', 'http://localhost')
  const since = url.searchParams.get('since') ?? '2025-09-01'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    sendJson(res, 400, { ok: false, error: 'invalid_since', expected: 'YYYY-MM-DD' })
    return
  }
  const dryRun = url.searchParams.get('dryRun') === '1'
  const batch = `teller-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`

  let rows: ConnectorTokenRow[]
  try {
    const r = await ctx.pool.query<ConnectorTokenRow>(
      `SELECT id, institution, access_token, provider_enrollment_id
         FROM connectors
        WHERE user_id = $1 AND provider = 'teller' AND status = 'active'`,
      [ctx.userId],
    )
    rows = r.rows
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
    return
  }

  const perAccount: ImportAccountSummary[] = []
  const errors: ConnectorFetchError[] = []
  const toWrite: MappedExpense[] = []

  for (const row of rows) {
    let accs: TellerAccount[]
    try {
      accs = await fetchAccounts(row.access_token)
    } catch (err) {
      errors.push({ connectorId: row.id, institution: row.institution, status: err instanceof TellerApiError ? err.status : null, code: err instanceof TellerApiError ? err.code : 'request_failed', message: errorMessage(err) })
      continue
    }
    for (const a of accs) {
      try {
        const { transactions } = await fetchAllTransactions(row.access_token, a.id, { sinceDate: since })
        const summary: ImportAccountSummary = {
          institution: row.institution, accountName: a.name, subtype: a.subtype, lastFour: a.last_four,
          source: '', fetched: transactions.length, kept: 0, keptAmount: 0, skipped: {}, sampleKept: [],
        }
        for (const t of transactions) {
          const cls = classifyTellerTxn(t, a)
          if (!cls.keep) {
            const reason: SkipReason = cls.reason ?? 'non_spending_account'
            summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1
            continue
          }
          const exp = tellerTxnToExpense(t, a, batch)
          if (!exp) continue
          summary.source = exp.source
          summary.kept++
          summary.keptAmount = Math.round((summary.keptAmount + exp.amount) * 100) / 100
          if (summary.sampleKept.length < 5) {
            summary.sampleKept.push({ date: exp.date, amount: exp.amount, description: exp.description.slice(0, 32), category: exp.category })
          }
          toWrite.push(exp)
        }
        perAccount.push(summary)
      } catch (err) {
        errors.push({ connectorId: row.id, institution: `${row.institution}/${a.name}`, status: err instanceof TellerApiError ? err.status : null, code: err instanceof TellerApiError ? err.code : 'request_failed', message: errorMessage(err) })
      }
    }
  }

  let written = 0
  if (!dryRun && toWrite.length > 0) {
    const client = await ctx.pool.connect()
    try {
      await client.query('BEGIN')
      for (const e of toWrite) {
        await client.query(
          `INSERT INTO expenses (id, user_id, date, amount, data, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, now())
           ON CONFLICT (user_id, id) DO UPDATE
             SET date = EXCLUDED.date, amount = EXCLUDED.amount, data = EXCLUDED.data, updated_at = now()`,
          [e.id, ctx.userId, e.date, e.amount, JSON.stringify(e)],
        )
      }
      await client.query('COMMIT')
      written = toWrite.length
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* connection may be dead; finally still releases */ }
      sendJson(res, 500, { ok: false, error: 'write_failed', message: errorMessage(err), batch })
      return
    } finally {
      client.release()
    }
  }

  const totalKept = perAccount.reduce((s, a) => s + a.kept, 0)
  const totalAmount = Math.round(perAccount.reduce((s, a) => s + a.keptAmount, 0) * 100) / 100
  sendJson(res, 200, {
    ok: true,
    dryRun,
    batch,
    since,
    totalKept,
    totalAmount,
    written,
    perAccount,
    errors,
  })
}

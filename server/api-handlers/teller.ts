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
import { fetchAccounts, fetchAccountBalance, fetchAllTransactions, tellerConfigStatus, TellerApiError, type TellerAccount } from '../teller-client.ts'
import { tellerTxnToExpense, classifyTellerTxn, mapAccountSource, tellerTxnToIncome, type MappedExpense, type MappedIncome, type SkipReason } from '../teller-map.ts'

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

interface BalanceRow {
  accountId: string
  source: string
  name: string
  institution: string
  type: string
  subtype: string
  lastFour: string
  currency: string
  ledger: number | null
  available: number | null
  /** asset = depository (cash); liability = credit card (balance owed) */
  kind: 'asset' | 'liability'
}

/**
 * READ-ONLY account balances across all connected Teller accounts.
 *   GET /api/teller/balances
 * Returns one row per account with its ledger/available balance, mapped to the
 * Iris source taxonomy (credit_card_1, bofa_checking, …) so the client can build
 * cash accounts AND confirm every "pool" is reporting. Frugal: one /accounts
 * call per connector + one /balances call per account. No writes.
 */
export async function handleTellerBalances(req: Req, res: Res): Promise<void> {
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

  const balances: BalanceRow[] = []
  const errors: ConnectorFetchError[] = []

  for (const row of rows) {
    try {
      const accs = await fetchAccounts(row.access_token)
      for (const a of accs) {
        let ledger: number | null = null
        let available: number | null = null
        try {
          const bal = await fetchAccountBalance(row.access_token, a.id)
          ledger = bal.ledger !== null ? Number(bal.ledger) : null
          available = bal.available !== null ? Number(bal.available) : null
        } catch {
          /* leave nulls — account still listed so the pool is visible */
        }
        balances.push({
          accountId: a.id,
          source: mapAccountSource(a),
          name: a.name,
          institution: a.institution?.name ?? row.institution,
          type: a.type,
          subtype: a.subtype,
          lastFour: a.last_four,
          currency: a.currency,
          ledger,
          available,
          kind: a.subtype === 'credit_card' ? 'liability' : 'asset',
        })
      }
    } catch (err) {
      if (err instanceof TellerApiError) {
        errors.push({ connectorId: row.id, institution: row.institution, status: err.status, code: err.code, message: err.message })
      } else {
        errors.push({ connectorId: row.id, institution: row.institution, status: null, code: 'request_failed', message: errorMessage(err) })
      }
    }
  }

  sendJson(res, 200, { ok: true, balances, errors })
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
      // A dead token never comes back — mark the connector so the next sync
      // stops retrying it (and the permanent "needs reconnect" alarm clears
      // once the bank is re-enrolled). Best effort.
      if (err instanceof TellerApiError && (err.status === 401 || err.status === 403)) {
        try {
          await ctx.pool.query(
            `UPDATE connectors SET status = 'disconnected', updated_at = now() WHERE user_id = $1 AND id = $2`,
            [ctx.userId, row.id],
          )
        } catch { /* best effort */ }
      }
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

  // User merchant mappings are the user's explicit intent for a merchant —
  // apply them to NEW imports so corrections don't have to be redone after
  // every sync. (Existing rows keep their data via the edit-preserving upsert.)
  let skippedTombstoned = 0
  try {
    const mapRows = await ctx.pool.query<{ key: string; data: { category?: string; isWorkExpense?: boolean } }>(
      `SELECT key, data FROM collections WHERE user_id = $1 AND name = 'merchantMappings'`,
      [ctx.userId],
    )
    const mappings = new Map(mapRows.rows.map(r => [r.key.toLowerCase(), r.data]))
    for (const e of toWrite) {
      const m = mappings.get(e.description.toLowerCase())
      if (!m) continue
      if (m.category) e.category = m.category
      if (typeof m.isWorkExpense === 'boolean') e.isWorkExpense = m.isWorkExpense
    }

    // Tombstones: rows the user deleted in the UI must not resurrect when the
    // trailing sync window re-pulls them.
    const tombRows = await ctx.pool.query<{ key: string }>(
      `SELECT key FROM collections WHERE user_id = $1 AND name = 'deletedTellerIds'`,
      [ctx.userId],
    )
    if (tombRows.rows.length > 0) {
      const tombs = new Set(tombRows.rows.map(r => r.key))
      const before = toWrite.length
      for (let i = toWrite.length - 1; i >= 0; i--) {
        if (tombs.has(toWrite[i].id)) toWrite.splice(i, 1)
      }
      skippedTombstoned = before - toWrite.length
    }
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'mapping_lookup_failed', message: errorMessage(err) })
    return
  }

  let written = 0
  let inserted = 0
  let updated = 0
  if (!dryRun && toWrite.length > 0) {
    const client = await ctx.pool.connect()
    try {
      await client.query('BEGIN')
      for (const e of toWrite) {
        // (xmax = 0) is true for a fresh INSERT, false when ON CONFLICT did an UPDATE —
        // so we can report "new vs refreshed" without a separate existence check.
        const w = await client.query<{ inserted: boolean }>(
          `INSERT INTO expenses (id, user_id, date, amount, data, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, now())
           ON CONFLICT (user_id, id) DO UPDATE
             SET date = EXCLUDED.date,
                 amount = EXCLUDED.amount,
                 -- Refresh bank-sourced fields, but PRESERVE the user's manual edits
                 -- (category, work flag, reimbursement, notes, recurring, income subtype,
                 -- spender attribution) so re-syncing the trailing window never
                 -- clobbers a correction they made.
                 data = EXCLUDED.data || jsonb_strip_nulls(jsonb_build_object(
                   'category',            expenses.data->'category',
                   'isWorkExpense',       expenses.data->'isWorkExpense',
                   'reimbursementStatus', expenses.data->'reimbursementStatus',
                   'notes',               expenses.data->'notes',
                   'recurring',           expenses.data->'recurring',
                   'incomeSubtype',       expenses.data->'incomeSubtype',
                   'incomeSourceId',      expenses.data->'incomeSourceId',
                   'spender',             expenses.data->'spender'
                 )),
                 updated_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [e.id, ctx.userId, e.date, e.amount, JSON.stringify(e)],
        )
        if (w.rows[0]?.inserted) inserted++; else updated++
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
  const through = toWrite.reduce((m, e) => (e.date > m ? e.date : m), '')
  sendJson(res, 200, {
    ok: true,
    dryRun,
    batch,
    since,
    totalKept,
    totalAmount,
    written,
    inserted,
    updated,
    skippedTombstoned,
    through,
    perAccount,
    errors,
  })
}

interface IncomeImportSummary {
  institution: string
  accountName: string
  subtype: string
  lastFour: string
  source: string
  fetched: number
  income: number
  incomeAmount: number
  reimbursement: number
  reimbursementAmount: number
  sample: { date: string; amount: number; description: string; type: string }[]
}

/**
 * Import income INFLOWS from Teller (Phase-1 budget: real income).
 *   POST /api/teller/import-income?since=YYYY-MM-DD&dryRun=1
 * Depository accounts only (income lands in checking/savings, never cards).
 * Keeps employer (Abnormal) deposits as income, Coupa/AI-Inc as reimbursement;
 * skips transfers/interest/non-employer (see classifyTellerInflow). Idempotent
 * (teller_<txnId>), reversible via the batch tag. Dry-run first to inspect.
 */
export async function handleTellerImportIncome(req: Req, res: Res): Promise<void> {
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) { sendJson(res, 400, { ok: false, error: 'invalid_since', expected: 'YYYY-MM-DD' }); return }
  const dryRun = url.searchParams.get('dryRun') === '1'
  const batch = `teller-income-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`

  let rows: ConnectorTokenRow[]
  try {
    const r = await ctx.pool.query<ConnectorTokenRow>(
      `SELECT id, institution, access_token, provider_enrollment_id
         FROM connectors WHERE user_id = $1 AND provider = 'teller' AND status = 'active'`,
      [ctx.userId],
    )
    rows = r.rows
  } catch (err) { sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) }); return }

  const perAccount: IncomeImportSummary[] = []
  const errors: ConnectorFetchError[] = []
  const toWrite: MappedIncome[] = []

  for (const row of rows) {
    let accs: TellerAccount[]
    try { accs = await fetchAccounts(row.access_token) }
    catch (err) {
      errors.push({ connectorId: row.id, institution: row.institution, status: err instanceof TellerApiError ? err.status : null, code: err instanceof TellerApiError ? err.code : 'request_failed', message: errorMessage(err) })
      if (err instanceof TellerApiError && (err.status === 401 || err.status === 403)) {
        try {
          await ctx.pool.query(
            `UPDATE connectors SET status = 'disconnected', updated_at = now() WHERE user_id = $1 AND id = $2`,
            [ctx.userId, row.id],
          )
        } catch { /* best effort */ }
      }
      continue
    }
    for (const a of accs) {
      if (a.subtype === 'credit_card') continue   // income never lands on a card; stay frugal
      try {
        const { transactions } = await fetchAllTransactions(row.access_token, a.id, { sinceDate: since })
        const summary: IncomeImportSummary = { institution: row.institution, accountName: a.name, subtype: a.subtype, lastFour: a.last_four, source: mapAccountSource(a), fetched: transactions.length, income: 0, incomeAmount: 0, reimbursement: 0, reimbursementAmount: 0, sample: [] }
        for (const t of transactions) {
          const inc = tellerTxnToIncome(t, a, batch)
          if (!inc) continue
          if (inc.transactionType === 'reimbursement') { summary.reimbursement++; summary.reimbursementAmount = Math.round((summary.reimbursementAmount + inc.amount) * 100) / 100 }
          else { summary.income++; summary.incomeAmount = Math.round((summary.incomeAmount + inc.amount) * 100) / 100 }
          if (summary.sample.length < 8) summary.sample.push({ date: inc.date, amount: inc.amount, description: inc.description.slice(0, 40), type: inc.transactionType })
          toWrite.push(inc)
        }
        perAccount.push(summary)
      } catch (err) { errors.push({ connectorId: row.id, institution: `${row.institution}/${a.name}`, status: err instanceof TellerApiError ? err.status : null, code: err instanceof TellerApiError ? err.code : 'request_failed', message: errorMessage(err) }) }
    }
  }

  let written = 0
  let inserted = 0
  let updated = 0
  if (!dryRun && toWrite.length > 0) {
    const client = await ctx.pool.connect()
    try {
      await client.query('BEGIN')
      for (const e of toWrite) {
        const w = await client.query<{ inserted: boolean }>(
          `INSERT INTO expenses (id, user_id, date, amount, data, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, now())
           ON CONFLICT (user_id, id) DO UPDATE
             SET date = EXCLUDED.date,
                 amount = EXCLUDED.amount,
                 -- Refresh bank-sourced fields, but PRESERVE the user's manual edits
                 -- (category, work flag, reimbursement, notes, recurring, income subtype,
                 -- spender attribution) so re-syncing the trailing window never
                 -- clobbers a correction they made.
                 data = EXCLUDED.data || jsonb_strip_nulls(jsonb_build_object(
                   'category',            expenses.data->'category',
                   'isWorkExpense',       expenses.data->'isWorkExpense',
                   'reimbursementStatus', expenses.data->'reimbursementStatus',
                   'notes',               expenses.data->'notes',
                   'recurring',           expenses.data->'recurring',
                   'incomeSubtype',       expenses.data->'incomeSubtype',
                   'incomeSourceId',      expenses.data->'incomeSourceId',
                   'spender',             expenses.data->'spender'
                 )),
                 updated_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [e.id, ctx.userId, e.date, e.amount, JSON.stringify(e)],
        )
        if (w.rows[0]?.inserted) inserted++; else updated++
      }
      await client.query('COMMIT')
      written = toWrite.length
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* connection may be dead; finally still releases */ }
      sendJson(res, 500, { ok: false, error: 'write_failed', message: errorMessage(err), batch }); return
    } finally { client.release() }
  }

  const totalIncome = Math.round(perAccount.reduce((s, a) => s + a.incomeAmount, 0) * 100) / 100
  const totalReimbursement = Math.round(perAccount.reduce((s, a) => s + a.reimbursementAmount, 0) * 100) / 100
  const through = toWrite.reduce((m, e) => (e.date > m ? e.date : m), '')
  sendJson(res, 200, { ok: true, dryRun, batch, since, totalIncome, totalReimbursement, written, inserted, updated, through, perAccount, errors })
}

// Plaid API endpoints — the Teller replacement (Slice 1: connect + accounts).
//
//   GET  /api/plaid/status       -> { ok, status }  config diagnostics (no secrets)
//   POST /api/plaid/link-token   -> { ok, link_token }  for the frontend Plaid Link
//   POST /api/plaid/exchange     { public_token, institution?, accounts? }  -> stores access_token
//   GET  /api/plaid/accounts     -> { ok, accounts, errors }  live accounts per connector
//
// Access tokens are written to the SAME `connectors` table Teller used, tagged
// provider='plaid', so the rest of the intake plumbing can read them uniformly.

import type { Pool } from 'pg'
import { sendJson, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'
import { readJsonBody } from './http-utils.ts'
import {
  plaidConfigStatus, createLinkToken, exchangePublicToken, getAccounts, getTransactions,
  PlaidApiError, type PlaidAccount,
} from '../plaid-client.ts'
import { plaidTxnToExpense, plaidTxnToIncome, classifyPlaidTxn, plaidToTellerAccount } from '../plaid-map.ts'
import { mapAccountSource, type MappedExpense, type MappedIncome } from '../teller-map.ts'

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
}
function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function handlePlaidStatus(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  // Pure config inspection — no DB context, never returns the secret.
  sendJson(res, 200, { ok: true, status: plaidConfigStatus() })
}

/** Mint a Link token for the browser to open Plaid Link with. */
export async function handlePlaidLinkToken(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = await requireContext(req, res)
  if (!ctx) return
  const cfg = plaidConfigStatus()
  if (!cfg.configured) { sendJson(res, 503, { ok: false, error: 'plaid_not_configured', status: cfg }); return }
  try {
    const { link_token } = await createLinkToken(ctx.userId)
    sendJson(res, 200, { ok: true, link_token })
  } catch (err) {
    const status = err instanceof PlaidApiError ? err.status : 500
    sendJson(res, status, { ok: false, error: 'link_token_failed', message: errorMessage(err) })
  }
}

interface ExchangeBody {
  public_token?: unknown
  institution?: unknown
  institution_id?: unknown
}

/** Exchange the Link public_token for an access_token and persist it. */
export async function handlePlaidExchange(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = await requireContext(req, res)
  if (!ctx) return
  const cfg = plaidConfigStatus()
  if (!cfg.configured) { sendJson(res, 503, { ok: false, error: 'plaid_not_configured', status: cfg }); return }
  try {
    const body = (await readJsonBody(req)) as ExchangeBody
    const publicToken = typeof body.public_token === 'string' ? body.public_token : ''
    if (!publicToken) { sendJson(res, 400, { ok: false, error: 'missing_public_token' }); return }
    const institution = typeof body.institution === 'string' && body.institution.trim() ? body.institution.trim() : 'Unknown bank'
    const institutionId = typeof body.institution_id === 'string' ? body.institution_id : null

    const { access_token, item_id } = await exchangePublicToken(publicToken)

    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `conn_${item_id}`
    await ctx.pool.query(
      `INSERT INTO connectors (id, user_id, provider, institution, provider_enrollment_id, access_token, status, data, created_at, updated_at)
       VALUES ($1, $2, 'plaid', $3, $4, $5, 'active', $6::jsonb, now(), now())`,
      [id, ctx.userId, institution, item_id, access_token, JSON.stringify({ item_id, institution_id: institutionId })],
    )
    sendJson(res, 200, { ok: true, institution })
  } catch (err) {
    const status = err instanceof PlaidApiError ? err.status : 500
    sendJson(res, status, { ok: false, error: 'exchange_failed', message: errorMessage(err) })
  }
}

interface PlaidConnectorRow {
  id: string
  institution: string
  access_token: string
}

interface AccountWithConnector extends PlaidAccount {
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

/** List live accounts across all active Plaid connectors. */
export async function handlePlaidAccounts(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = await requireContext(req, res)
  if (!ctx) return
  const cfg = plaidConfigStatus()
  if (!cfg.configured) { sendJson(res, 503, { ok: false, error: 'plaid_not_configured', status: cfg }); return }

  let rows: PlaidConnectorRow[]
  try {
    const r = await ctx.pool.query<PlaidConnectorRow>(
      `SELECT id, institution, access_token
         FROM connectors
        WHERE user_id = $1 AND provider = 'plaid' AND status = 'active'
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
  for (const row of rows) {
    try {
      const { accounts: accs } = await getAccounts(row.access_token)
      for (const a of accs) accounts.push({ ...a, _connectorId: row.id, _connectorInstitution: row.institution })
    } catch (err) {
      errors.push({
        connectorId: row.id,
        institution: row.institution,
        status: err instanceof PlaidApiError ? err.status : null,
        code: err instanceof PlaidApiError ? err.code : 'request_failed',
        message: errorMessage(err),
      })
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
  kind: 'asset' | 'liability'
}

/**
 * READ-ONLY balances across active Plaid connectors — the Teller-balances
 * replacement that feeds cash accounts into the portfolio / net worth. Maps each
 * account to the Iris source taxonomy (via the shared adapter) so the same
 * `teller-<source>` portfolio rows update in place.
 */
export async function handlePlaidBalances(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = await requireContext(req, res)
  if (!ctx) return
  const cfg = plaidConfigStatus()
  if (!cfg.configured) { sendJson(res, 503, { ok: false, error: 'plaid_not_configured', status: cfg }); return }

  let rows: PlaidConnectorRow[]
  try {
    const r = await ctx.pool.query<PlaidConnectorRow>(
      `SELECT id, institution, access_token FROM connectors
        WHERE user_id = $1 AND provider = 'plaid' AND status = 'active' ORDER BY created_at DESC`,
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
      const { accounts: accs } = await getAccounts(row.access_token)
      for (const a of accs) {
        const tellerAcct = plaidToTellerAccount(a, row.institution)
        const isLiability = tellerAcct.subtype === 'credit_card'
        balances.push({
          accountId: a.account_id,
          source: mapAccountSource(tellerAcct),
          name: a.name,
          institution: row.institution,
          type: a.type,
          subtype: a.subtype ?? '',
          lastFour: a.mask ?? '',
          currency: a.balances?.iso_currency_code ?? 'USD',
          ledger: a.balances?.current ?? null,
          available: a.balances?.available ?? null,
          kind: isLiability ? 'liability' : 'asset',
        })
      }
    } catch (err) {
      errors.push({
        connectorId: row.id, institution: row.institution,
        status: err instanceof PlaidApiError ? err.status : null,
        code: err instanceof PlaidApiError ? err.code : 'request_failed',
        message: errorMessage(err),
      })
    }
  }
  sendJson(res, 200, { ok: true, balances, errors })
}

interface ImportAccountSummary {
  institution: string
  accountName: string
  subtype: string | null
  mask: string | null
  source: string
  fetched: number
  kept: number
  keptAmount: number
  skipped: Record<string, number>
  sampleKept: Array<{ date: string; amount: number; description: string; category: string }>
}

/**
 * Import Plaid transactions in the [since, today] window, mapped to Iris
 * expenses via the (reused) Teller mapper. Mirrors handleTellerImport:
 *   ?since=YYYY-MM-DD  (default 90 days ago)   ?dryRun=1  map+summarize, no write
 * Deterministic ids (plaid_<txnId>) make re-runs idempotent; the batch tag makes
 * a bad import reversible via /api/expenses/delete { batchPrefix }.
 */
export async function handlePlaidImport(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = await requireContext(req, res)
  if (!ctx) return
  const cfg = plaidConfigStatus()
  if (!cfg.configured) { sendJson(res, 503, { ok: false, error: 'plaid_not_configured', status: cfg }); return }
  const url = new URL(req.url ?? '', 'http://localhost')
  const sinceParam = url.searchParams.get('since')
  if (sinceParam && !/^\d{4}-\d{2}-\d{2}$/.test(sinceParam)) { sendJson(res, 400, { ok: false, error: 'invalid_since', expected: 'YYYY-MM-DD' }); return }
  const dryRun = url.searchParams.get('dryRun') === '1'
  try {
    sendJson(res, 200, await runPlaidImport(ctx.pool, ctx.userId, { since: sinceParam ?? undefined, dryRun }))
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'import_failed', message: errorMessage(err) })
  }
}

/** Active Plaid connector tokens for a user. */
async function fetchPlaidConnectors(pool: Pool, userId: string): Promise<PlaidConnectorRow[]> {
  const r = await pool.query<PlaidConnectorRow>(
    `SELECT id, institution, access_token FROM connectors
      WHERE user_id = $1 AND provider = 'plaid' AND status = 'active'`,
    [userId],
  )
  return r.rows
}

/** Edit-preserving upsert for mapped rows (bank-sourced fields refresh; user
 *  edits preserved). Returns counts; throws on failure. */
async function upsertMappedRows(pool: Pool, userId: string, rows: Array<MappedExpense | MappedIncome>): Promise<{ written: number; inserted: number; updated: number }> {
  if (rows.length === 0) return { written: 0, inserted: 0, updated: 0 }
  let inserted = 0, updated = 0
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const e of rows) {
      const w = await client.query<{ inserted: boolean }>(
        `INSERT INTO expenses (id, user_id, date, amount, data, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, now())
         ON CONFLICT (user_id, id) DO UPDATE
           SET date = EXCLUDED.date,
               amount = EXCLUDED.amount,
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
        [e.id, userId, e.date, e.amount, JSON.stringify(e)],
      )
      if (w.rows[0]?.inserted) inserted++; else updated++
    }
    await client.query('COMMIT')
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* connection may be dead */ }
    throw err
  } finally {
    client.release()
  }
  return { written: rows.length, inserted, updated }
}

export interface PlaidImportResult {
  ok: true; dryRun: boolean; batch: string; since: string
  totalKept: number; totalAmount: number
  written: number; inserted: number; updated: number; skippedTombstoned: number
  through: string; perAccount: ImportAccountSummary[]; errors: ConnectorFetchError[]
}

/** Core transaction import — shared by the HTTP handler AND the auto-sync timer,
 *  so both honor the same posted-only / merchant-mapping / tombstone logic.
 *  Throws on hard DB failure; per-connector fetch errors are collected. */
export async function runPlaidImport(pool: Pool, userId: string, opts: { since?: string; dryRun?: boolean } = {}): Promise<PlaidImportResult> {
  const since = opts.since ?? isoDaysAgo(90)
  const dryRun = !!opts.dryRun
  const batch = `plaid-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`
  const rows = await fetchPlaidConnectors(pool, userId)

  const perAccount: ImportAccountSummary[] = []
  const errors: ConnectorFetchError[] = []
  const toWrite: MappedExpense[] = []

  for (const row of rows) {
    let data: { accounts: PlaidAccount[]; transactions: Awaited<ReturnType<typeof getTransactions>>['transactions'] }
    try {
      data = await getTransactions(row.access_token, since, isoToday())
    } catch (err) {
      errors.push({ connectorId: row.id, institution: row.institution, status: err instanceof PlaidApiError ? err.status : null, code: err instanceof PlaidApiError ? err.code : 'request_failed', message: errorMessage(err) })
      continue
    }
    const acctById = new Map(data.accounts.map((a) => [a.account_id, a]))
    const summaryByAcct = new Map<string, ImportAccountSummary>()
    for (const t of data.transactions) {
      const a = acctById.get(t.account_id)
      if (!a) continue
      let summary = summaryByAcct.get(a.account_id)
      if (!summary) {
        summary = { institution: row.institution, accountName: a.name, subtype: a.subtype, mask: a.mask, source: '', fetched: 0, kept: 0, keptAmount: 0, skipped: {}, sampleKept: [] }
        summaryByAcct.set(a.account_id, summary)
      }
      summary.fetched++
      const cls = classifyPlaidTxn(t, a)
      if (!cls.keep) {
        const reason = cls.reason ?? 'non_spending_account'
        summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1
        continue
      }
      const exp = plaidTxnToExpense(t, a, row.institution, batch)
      if (!exp) continue
      summary.source = exp.source
      summary.kept++
      summary.keptAmount = Math.round((summary.keptAmount + exp.amount) * 100) / 100
      if (summary.sampleKept.length < 5) summary.sampleKept.push({ date: exp.date, amount: exp.amount, description: exp.description.slice(0, 32), category: exp.category })
      toWrite.push(exp)
    }
    for (const s of summaryByAcct.values()) perAccount.push(s)
  }

  // Merchant mappings + deletion tombstones — so corrections/deletes survive a re-pull.
  const mapRows = await pool.query<{ key: string; data: { category?: string; isWorkExpense?: boolean } }>(
    `SELECT key, data FROM collections WHERE user_id = $1 AND name = 'merchantMappings'`, [userId],
  )
  const mappings = new Map(mapRows.rows.map((r) => [r.key.toLowerCase(), r.data]))
  for (const e of toWrite) {
    const m = mappings.get(e.description.toLowerCase())
    if (!m) continue
    if (m.category) e.category = m.category
    if (typeof m.isWorkExpense === 'boolean') e.isWorkExpense = m.isWorkExpense
  }
  let skippedTombstoned = 0
  const tombRows = await pool.query<{ key: string }>(
    `SELECT key FROM collections WHERE user_id = $1 AND name = 'deletedTellerIds'`, [userId],
  )
  if (tombRows.rows.length > 0) {
    const tombs = new Set(tombRows.rows.map((r) => r.key))
    const before = toWrite.length
    for (let i = toWrite.length - 1; i >= 0; i--) if (tombs.has(toWrite[i].id)) toWrite.splice(i, 1)
    skippedTombstoned = before - toWrite.length
  }

  const { written, inserted, updated } = dryRun ? { written: 0, inserted: 0, updated: 0 } : await upsertMappedRows(pool, userId, toWrite)
  const totalKept = perAccount.reduce((s, a) => s + a.kept, 0)
  const totalAmount = Math.round(perAccount.reduce((s, a) => s + a.keptAmount, 0) * 100) / 100
  const through = toWrite.reduce((m, e) => (e.date > m ? e.date : m), '')
  return { ok: true, dryRun, batch, since, totalKept, totalAmount, written, inserted, updated, skippedTombstoned, through, perAccount, errors }
}

/**
 * Import income INFLOWS from Plaid (employer deposits / reimbursements).
 *   POST /api/plaid/import-income?since=YYYY-MM-DD&dryRun=1
 */
export async function handlePlaidImportIncome(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = await requireContext(req, res)
  if (!ctx) return
  const cfg = plaidConfigStatus()
  if (!cfg.configured) { sendJson(res, 503, { ok: false, error: 'plaid_not_configured', status: cfg }); return }
  const url = new URL(req.url ?? '', 'http://localhost')
  const sinceParam = url.searchParams.get('since')
  if (sinceParam && !/^\d{4}-\d{2}-\d{2}$/.test(sinceParam)) { sendJson(res, 400, { ok: false, error: 'invalid_since', expected: 'YYYY-MM-DD' }); return }
  const dryRun = url.searchParams.get('dryRun') === '1'
  try {
    sendJson(res, 200, await runPlaidImportIncome(ctx.pool, ctx.userId, { since: sinceParam ?? undefined, dryRun }))
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'income_import_failed', message: errorMessage(err) })
  }
}

export interface PlaidIncomeResult {
  ok: true; dryRun: boolean; batch: string; since: string
  income: number; reimbursement: number; incomeAmount: number; reimbursementAmount: number
  written: number; inserted: number; updated: number; through: string; errors: ConnectorFetchError[]
}

/** Core income import — shared by the HTTP handler AND the auto-sync timer. */
export async function runPlaidImportIncome(pool: Pool, userId: string, opts: { since?: string; dryRun?: boolean } = {}): Promise<PlaidIncomeResult> {
  const since = opts.since ?? isoDaysAgo(90)
  const dryRun = !!opts.dryRun
  const batch = `plaid-income-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`
  const rows = await fetchPlaidConnectors(pool, userId)

  const errors: ConnectorFetchError[] = []
  const toWrite: MappedIncome[] = []
  let income = 0, reimbursement = 0, incomeAmount = 0, reimbursementAmount = 0

  for (const row of rows) {
    let data: Awaited<ReturnType<typeof getTransactions>>
    try {
      data = await getTransactions(row.access_token, since, isoToday())
    } catch (err) {
      errors.push({ connectorId: row.id, institution: row.institution, status: err instanceof PlaidApiError ? err.status : null, code: err instanceof PlaidApiError ? err.code : 'request_failed', message: errorMessage(err) })
      continue
    }
    const acctById = new Map(data.accounts.map((a) => [a.account_id, a]))
    for (const t of data.transactions) {
      const a = acctById.get(t.account_id)
      if (!a) continue
      const inc = plaidTxnToIncome(t, a, row.institution, batch)
      if (!inc) continue
      if (inc.transactionType === 'reimbursement') { reimbursement++; reimbursementAmount = Math.round((reimbursementAmount + inc.amount) * 100) / 100 }
      else { income++; incomeAmount = Math.round((incomeAmount + inc.amount) * 100) / 100 }
      toWrite.push(inc)
    }
  }

  const { written, inserted, updated } = dryRun ? { written: 0, inserted: 0, updated: 0 } : await upsertMappedRows(pool, userId, toWrite)
  const through = toWrite.reduce((m, e) => (e.date > m ? e.date : m), '')
  return { ok: true, dryRun, batch, since, income, reimbursement, incomeAmount, reimbursementAmount, written, inserted, updated, through, errors }
}

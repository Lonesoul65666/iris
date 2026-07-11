// Plaid API endpoints — the Teller replacement (Slice 1: connect + accounts).
//
//   GET  /api/plaid/status       -> { ok, status }  config diagnostics (no secrets)
//   POST /api/plaid/link-token   -> { ok, link_token }  for the frontend Plaid Link
//   POST /api/plaid/exchange     { public_token, institution?, accounts? }  -> stores access_token
//   GET  /api/plaid/accounts     -> { ok, accounts, errors }  live accounts per connector
//
// Access tokens are written to the SAME `connectors` table Teller used, tagged
// provider='plaid', so the rest of the intake plumbing can read them uniformly.

import { sendJson, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'
import { readJsonBody } from './http-utils.ts'
import {
  plaidConfigStatus, createLinkToken, exchangePublicToken, getAccounts, getTransactions,
  PlaidApiError, type PlaidAccount,
} from '../plaid-client.ts'
import { plaidTxnToExpense, classifyPlaidTxn } from '../plaid-map.ts'
import type { MappedExpense } from '../teller-map.ts'

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
  const since = url.searchParams.get('since') ?? isoDaysAgo(90)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) { sendJson(res, 400, { ok: false, error: 'invalid_since', expected: 'YYYY-MM-DD' }); return }
  const dryRun = url.searchParams.get('dryRun') === '1'
  const batch = `plaid-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`

  let rows: PlaidConnectorRow[]
  try {
    const r = await ctx.pool.query<PlaidConnectorRow>(
      `SELECT id, institution, access_token FROM connectors
        WHERE user_id = $1 AND provider = 'plaid' AND status = 'active'`,
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
    let data: { accounts: PlaidAccount[]; transactions: Awaited<ReturnType<typeof getTransactions>>['transactions'] }
    try {
      data = await getTransactions(row.access_token, since, isoToday())
    } catch (err) {
      errors.push({
        connectorId: row.id, institution: row.institution,
        status: err instanceof PlaidApiError ? err.status : null,
        code: err instanceof PlaidApiError ? err.code : 'request_failed',
        message: errorMessage(err),
      })
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

  // Apply the user's merchant mappings + honor deletion tombstones — identical to
  // the Teller import so corrections/deletes survive a re-pull.
  let skippedTombstoned = 0
  try {
    const mapRows = await ctx.pool.query<{ key: string; data: { category?: string; isWorkExpense?: boolean } }>(
      `SELECT key, data FROM collections WHERE user_id = $1 AND name = 'merchantMappings'`,
      [ctx.userId],
    )
    const mappings = new Map(mapRows.rows.map((r) => [r.key.toLowerCase(), r.data]))
    for (const e of toWrite) {
      const m = mappings.get(e.description.toLowerCase())
      if (!m) continue
      if (m.category) e.category = m.category
      if (typeof m.isWorkExpense === 'boolean') e.isWorkExpense = m.isWorkExpense
    }
    const tombRows = await ctx.pool.query<{ key: string }>(
      `SELECT key FROM collections WHERE user_id = $1 AND name = 'deletedTellerIds'`,
      [ctx.userId],
    )
    if (tombRows.rows.length > 0) {
      const tombs = new Set(tombRows.rows.map((r) => r.key))
      const before = toWrite.length
      for (let i = toWrite.length - 1; i >= 0; i--) if (tombs.has(toWrite[i].id)) toWrite.splice(i, 1)
      skippedTombstoned = before - toWrite.length
    }
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'mapping_lookup_failed', message: errorMessage(err) })
    return
  }

  let written = 0, inserted = 0, updated = 0
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
      try { await client.query('ROLLBACK') } catch { /* connection may be dead */ }
      sendJson(res, 500, { ok: false, error: 'write_failed', message: errorMessage(err), batch })
      return
    } finally {
      client.release()
    }
  }

  const totalKept = perAccount.reduce((s, a) => s + a.kept, 0)
  const totalAmount = Math.round(perAccount.reduce((s, a) => s + a.keptAmount, 0) * 100) / 100
  const through = toWrite.reduce((m, e) => (e.date > m ? e.date : m), '')
  sendJson(res, 200, { ok: true, dryRun, batch, since, totalKept, totalAmount, written, inserted, updated, skippedTombstoned, through, perAccount, errors })
}

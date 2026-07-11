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
  plaidConfigStatus, createLinkToken, exchangePublicToken, getAccounts,
  PlaidApiError, type PlaidAccount,
} from '../plaid-client.ts'

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

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
import { fetchAccounts, tellerConfigStatus, TellerApiError, type TellerAccount } from '../teller-client.ts'

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

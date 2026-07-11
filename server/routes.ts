// Single source of truth for the Iris API route table.
//
// Both transports register the SAME routes through this function:
//   - the Vite dev plugin (server/api-plugin.ts) — adapts `use` onto
//     server.middlewares so dev behavior is byte-identical to before, and
//   - the standalone Node server (server/standalone.ts) — adapts `use` onto a
//     connect-compatible prefix router (server/router.ts).
//
// `use(prefix, handler)` mirrors connect/Vite semantics: the prefix is matched
// against the URL with a `/`/`?`/end boundary, and `req.url` is stripped of the
// prefix before the handler runs (the settings/get and collections handlers
// rely on that stripped suffix). Keep registration ORDER intact — first match
// wins, so longer composite prefixes that share a stem must precede shorter ones.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { connect, getPool, hasPool, getLastMigrationResult, persistConnectionStringToEnvLocal } from './db-pool.ts'
import { sendJson, readJsonBody } from './api-handlers/http-utils.ts'
import { handleSettingsList, handleSettingsGet, handleSettingsSave, handleSettingsDelete } from './api-handlers/settings.ts'
import { handleIncomeSourcesList, handleIncomeSourcesSave, handleIncomeSourcesSaveBatch, handleIncomeSourcesDelete } from './api-handlers/income-sources.ts'
import { handleExpensesList, handleExpensesSave, handleExpensesDelete } from './api-handlers/expenses.ts'
import { handleExpensesRecategorize } from './api-handlers/recategorize.ts'
import { handleCollectionsList, handleCollectionsSave, handleCollectionsReplace, handleCollectionsDelete } from './api-handlers/collections.ts'
import { handleExportFull } from './api-handlers/export.ts'
import { handleAuditList, handleAuditAppend, handleAuditDelete } from './api-handlers/audit.ts'
import { handleConnectorsList, handleConnectorsSave, handleConnectorsDelete } from './api-handlers/connectors.ts'
import { handleTellerStatus, handleTellerAccounts, handleTellerBalances, handleTellerProbe, handleTellerTransactions, handleTellerImport, handleTellerImportIncome } from './api-handlers/teller.ts'
import { handleAuthStatus, handleAuthSetup, handleAuthLogin, handleAuthLogout, handleAuthMe, handleAuthChangePassword } from './api-handlers/auth.ts'
import { handlePlaidStatus, handlePlaidLinkToken, handlePlaidExchange, handlePlaidAccounts, handlePlaidImport, handlePlaidImportIncome } from './api-handlers/plaid.ts'
import { handleUpdate } from './api-handlers/update.ts'

type Req = IncomingMessage
type Res = ServerResponse

/** Handler signature shared by all routes (req.url already prefix-stripped). */
export type Handler = (req: Req, res: Res) => Promise<void>

/** A `use`-style registrar: prefix + handler, in connect/Vite order. */
export type UseFn = (prefix: string, handler: Handler) => void

async function handleConnect(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
  let body: { connectionString?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const cs = body.connectionString
  if (typeof cs !== 'string' || cs.length === 0) {
    sendJson(res, 400, { ok: false, error: 'missing_connection_string' })
    return
  }
  try {
    await connect(cs)
    sendJson(res, 200, { ok: true, migrations: getLastMigrationResult() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendJson(res, 500, { ok: false, error: 'connect_failed', message })
  }
}

async function handleHealth(_req: Req, res: Res): Promise<void> {
  if (!hasPool()) { sendJson(res, 503, { ok: false, db: 'not_configured' }); return }
  try {
    const pool = getPool()!
    const r = await pool.query<{ one: number }>('SELECT 1 AS one')
    if (r.rows[0]?.one === 1) {
      sendJson(res, 200, { ok: true, db: 'connected', migrations: getLastMigrationResult() })
    } else {
      sendJson(res, 500, { ok: false, db: 'error', message: 'unexpected_select_1_result' })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendJson(res, 500, { ok: false, db: 'error', message })
  }
}

/**
 * Register every Iris API route against the given `use`. Order matters — see
 * the file header. The settings/get and collections entries parse the
 * prefix-stripped `req.url` suffix to sub-route by key / collection name.
 */
/**
 * Persist the in-memory connection string to .env.local (DATABASE_URL) so the
 * backend can auto-connect without a browser paste — the de-browser migration
 * step. POST-only, returns no secret.
 */
async function handleConnectPersist(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method_not_allowed' }); return }
  if (!hasPool()) { sendJson(res, 503, { ok: false, error: 'not_configured', message: 'Connect first.' }); return }
  try {
    const result = persistConnectionStringToEnvLocal()
    sendJson(res, result.wrote ? 200 : 409, { ok: result.wrote, ...result })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'persist_failed', message: err instanceof Error ? err.message : String(err) })
  }
}

export function registerIrisRoutes(use: UseFn): void {
  use('/api/connect/persist', handleConnectPersist)
  use('/api/connect', handleConnect)
  use('/api/health', handleHealth)

  // Auth routes bypass the requireContext session gate (they ARE the gate).
  // Order matters: longer prefixes before shorter shared stems.
  use('/api/auth/status', handleAuthStatus)
  use('/api/auth/setup', handleAuthSetup)
  use('/api/auth/login', handleAuthLogin)
  use('/api/auth/logout', handleAuthLogout)
  use('/api/auth/change-password', handleAuthChangePassword)
  use('/api/auth/me', handleAuthMe)

  use('/api/update', handleUpdate)

  use('/api/settings/list', handleSettingsList)
  use('/api/settings/save', handleSettingsSave)
  use('/api/settings/delete', handleSettingsDelete)
  // /api/settings/get/:key — the key is the prefix-stripped suffix of req.url.
  use('/api/settings/get', async (req, res) => {
    const key = decodeURIComponent((req.url ?? '').replace(/^\/+/, '').split('?')[0])
    if (!key) { sendJson(res, 400, { ok: false, error: 'missing_key' }); return }
    await handleSettingsGet(req, res, key)
  })

  use('/api/incomeSources/list', handleIncomeSourcesList)
  use('/api/incomeSources/save-batch', handleIncomeSourcesSaveBatch)
  use('/api/incomeSources/save', handleIncomeSourcesSave)
  use('/api/incomeSources/delete', handleIncomeSourcesDelete)

  use('/api/expenses/list', handleExpensesList)
  use('/api/expenses/save', handleExpensesSave)
  use('/api/expenses/delete', handleExpensesDelete)
  use('/api/expenses/recategorize', handleExpensesRecategorize)

  use('/api/export/full', handleExportFull)

  use('/api/audit/list', handleAuditList)
  use('/api/audit/append', handleAuditAppend)
  use('/api/audit/delete', handleAuditDelete)

  use('/api/connectors/list', handleConnectorsList)
  use('/api/connectors/save', handleConnectorsSave)
  use('/api/connectors/delete', handleConnectorsDelete)

  use('/api/teller/status', handleTellerStatus)
  use('/api/teller/accounts', handleTellerAccounts)
  use('/api/teller/balances', handleTellerBalances)
  use('/api/teller/probe', handleTellerProbe)
  use('/api/teller/transactions', handleTellerTransactions)
  use('/api/teller/import-income', handleTellerImportIncome)
  use('/api/teller/import', handleTellerImport)

  // Plaid — the Teller replacement (Teller shut down its API 2026).
  use('/api/plaid/status', handlePlaidStatus)
  use('/api/plaid/link-token', handlePlaidLinkToken)
  use('/api/plaid/exchange', handlePlaidExchange)
  use('/api/plaid/accounts', handlePlaidAccounts)
  use('/api/plaid/import-income', handlePlaidImportIncome)
  use('/api/plaid/import', handlePlaidImport)

  // /api/collections/:name/{list,save,delete} — req.url after the prefix is
  // e.g. '/buckets/list' or '/sinkingFunds/save?...'.
  use('/api/collections', async (req, res) => {
    const suffix = (req.url ?? '').replace(/^\/+/, '').split('?')[0]
    const segments = suffix.split('/').filter(Boolean)
    if (segments.length !== 2) {
      sendJson(res, 400, { ok: false, error: 'invalid_collections_path', expected: '/api/collections/:name/{list|save}' })
      return
    }
    const [name, action] = segments
    if (action === 'list') {
      await handleCollectionsList(req, res, name)
    } else if (action === 'save') {
      await handleCollectionsSave(req, res, name)
    } else if (action === 'replace') {
      await handleCollectionsReplace(req, res, name)
    } else if (action === 'delete') {
      await handleCollectionsDelete(req, res, name)
    } else {
      sendJson(res, 404, { ok: false, error: 'unknown_collections_action' })
    }
  })
}

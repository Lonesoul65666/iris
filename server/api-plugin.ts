// Vite middleware API plugin for Iris.
//
// Mounts the dev-time API on the same port as the frontend:
//   POST /api/connect                    { connectionString } -> { ok }
//   GET  /api/health                     -> { ok, db, migrations? }
//   GET  /api/settings/list              -> { ok, items }
//   GET  /api/settings/get/:key          -> { ok, value }
//   POST /api/settings/save              { key, value } -> { ok }
//   GET  /api/incomeSources/list         -> { ok, items }
//   POST /api/incomeSources/save         { source } -> { ok }
//   GET  /api/expenses/list?from=&to=    -> { ok, items }
//   POST /api/expenses/save              { expense } -> { ok }
//
// Connection string never touches source / commits — it's POSTed in from the
// client at boot from localStorage. Schema migrations + single-user-ensure
// run inside `connect()`; subsequent endpoints rely on the cached pool +
// user_id (Phase 1 single-user model — partner mode adds real auth later).

import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { connect, getPool, hasPool, getLastMigrationResult } from './db-pool.ts'
import { handleSettingsList, handleSettingsGet, handleSettingsSave, handleSettingsDelete } from './api-handlers/settings.ts'
import { handleIncomeSourcesList, handleIncomeSourcesSave, handleIncomeSourcesSaveBatch, handleIncomeSourcesDelete } from './api-handlers/income-sources.ts'
import { handleExpensesList, handleExpensesSave, handleExpensesDelete } from './api-handlers/expenses.ts'
import { handleExpensesRecategorize } from './api-handlers/recategorize.ts'
import { handleCollectionsList, handleCollectionsSave, handleCollectionsDelete } from './api-handlers/collections.ts'
import { handleExportFull } from './api-handlers/export.ts'
import { handleAuditList, handleAuditAppend, handleAuditDelete } from './api-handlers/audit.ts'
import { handleConnectorsList, handleConnectorsSave, handleConnectorsDelete } from './api-handlers/connectors.ts'
import { handleTellerStatus, handleTellerAccounts, handleTellerProbe, handleTellerTransactions, handleTellerImport } from './api-handlers/teller.ts'

type Req = IncomingMessage
type Res = ServerResponse

function sendJson(res: Res, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: Req): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw)
}

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

export function irisApi(): Plugin {
  const wrap = (h: (req: Req, res: Res) => Promise<void>) =>
    (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      void h(req, res).catch(next)
    }

  return {
    name: 'iris-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/connect', wrap(handleConnect))
      server.middlewares.use('/api/health', wrap(handleHealth))

      server.middlewares.use('/api/settings/list', wrap(handleSettingsList))
      server.middlewares.use('/api/settings/save', wrap(handleSettingsSave))
      server.middlewares.use('/api/settings/delete', wrap(handleSettingsDelete))
      // /api/settings/get/:key — extract the suffix from req.url
      server.middlewares.use('/api/settings/get', wrap(async (req, res) => {
        // req.url here is everything after the /api/settings/get prefix
        const key = decodeURIComponent((req.url ?? '').replace(/^\/+/, '').split('?')[0])
        if (!key) { sendJson(res, 400, { ok: false, error: 'missing_key' }); return }
        await handleSettingsGet(req, res, key)
      }))

      server.middlewares.use('/api/incomeSources/list', wrap(handleIncomeSourcesList))
      server.middlewares.use('/api/incomeSources/save-batch', wrap(handleIncomeSourcesSaveBatch))
      server.middlewares.use('/api/incomeSources/save', wrap(handleIncomeSourcesSave))
      server.middlewares.use('/api/incomeSources/delete', wrap(handleIncomeSourcesDelete))

      server.middlewares.use('/api/expenses/list', wrap(handleExpensesList))
      server.middlewares.use('/api/expenses/save', wrap(handleExpensesSave))
      server.middlewares.use('/api/expenses/delete', wrap(handleExpensesDelete))
      server.middlewares.use('/api/expenses/recategorize', wrap(handleExpensesRecategorize))

      server.middlewares.use('/api/export/full', wrap(handleExportFull))

      server.middlewares.use('/api/audit/list', wrap(handleAuditList))
      server.middlewares.use('/api/audit/append', wrap(handleAuditAppend))
      server.middlewares.use('/api/audit/delete', wrap(handleAuditDelete))

      server.middlewares.use('/api/connectors/list', wrap(handleConnectorsList))
      server.middlewares.use('/api/connectors/save', wrap(handleConnectorsSave))
      server.middlewares.use('/api/connectors/delete', wrap(handleConnectorsDelete))

      server.middlewares.use('/api/teller/status', wrap(handleTellerStatus))
      server.middlewares.use('/api/teller/accounts', wrap(handleTellerAccounts))
      server.middlewares.use('/api/teller/probe', wrap(handleTellerProbe))
      server.middlewares.use('/api/teller/transactions', wrap(handleTellerTransactions))
      server.middlewares.use('/api/teller/import', wrap(handleTellerImport))

      // /api/collections/:name/{list,save} — single-name routing.
      // req.url after the '/api/collections' prefix looks like '/buckets/list'
      // or '/sinkingFunds/save?...'.
      server.middlewares.use('/api/collections', wrap(async (req, res) => {
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
        } else if (action === 'delete') {
          await handleCollectionsDelete(req, res, name)
        } else {
          sendJson(res, 404, { ok: false, error: 'unknown_collections_action' })
        }
      }))
    },
  }
}

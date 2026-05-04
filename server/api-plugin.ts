// Vite middleware API plugin for Iris (Phase 1 Foundation, Build-B).
//
// Mounts a tiny set of endpoints on the same dev port as the frontend:
//   POST /api/connect  { connectionString } -> { ok }
//   GET  /api/health                        -> { ok, db: 'connected' | 'not_configured' | 'error', ... }
//
// Build-B is scaffold-only. Schema + real endpoints land in Foundation Session 2.
// Connection string never touches source / commits — it's POSTed in from the
// client at boot from localStorage.

import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { connect, getPool, hasPool } from './db-pool.ts'

type Req = IncomingMessage
type Res = ServerResponse

function sendJson(res: Res, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: Req): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw)
}

async function handleConnect(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
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
    sendJson(res, 200, { ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Don't echo the connection string back; only the error message.
    sendJson(res, 500, { ok: false, error: 'connect_failed', message })
  }
}

async function handleHealth(_req: Req, res: Res): Promise<void> {
  if (!hasPool()) {
    sendJson(res, 503, { ok: false, db: 'not_configured' })
    return
  }
  try {
    const pool = getPool()!
    const r = await pool.query<{ one: number }>('SELECT 1 AS one')
    if (r.rows[0]?.one === 1) {
      sendJson(res, 200, { ok: true, db: 'connected' })
    } else {
      sendJson(res, 500, { ok: false, db: 'error', message: 'unexpected_select_1_result' })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendJson(res, 500, { ok: false, db: 'error', message })
  }
}

export function irisApi(): Plugin {
  return {
    name: 'iris-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/connect', (req, res, next) => {
        void handleConnect(req, res).catch(next)
      })
      server.middlewares.use('/api/health', (req, res, next) => {
        void handleHealth(req, res).catch(next)
      })
    },
  }
}

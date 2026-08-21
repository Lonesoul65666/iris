// Coinbase API endpoints — the one exchange Plaid can't reach (see
// server/coinbase-client.ts for why).
//
//   GET    /api/coinbase/status    -> { ok, connected, institution?, lastError? }
//   POST   /api/coinbase/connect   { keyName, privateKey }  -> validates, then stores
//   DELETE /api/coinbase/connect   -> forgets the key
//   GET    /api/coinbase/balances  -> { ok, balances, total, unpriced }
//
// The key lives in the SAME `connectors` table every other token uses, tagged
// provider='coinbase'. It is validated before being written — a key that can't
// read an account is a typo, and storing it would just fail silently later.

import { sendJson, requireContext, methodNotAllowed, errorMessage, readJsonBody, type Req, type Res } from './http-utils.ts'
import { fetchCoinbasePortfolio, listCoinbaseBalances, CoinbaseApiError, type CoinbaseKey } from '../coinbase-client.ts'

interface ConnectorRow {
  id: string
  access_token: string
}

const CONNECTOR_ID = 'coinbase-api'

async function loadKey(pool: import('pg').Pool, userId: string): Promise<CoinbaseKey | null> {
  const r = await pool.query<ConnectorRow>(
    `SELECT id, access_token FROM connectors
      WHERE user_id = $1 AND provider = 'coinbase' AND status = 'active'
      ORDER BY created_at DESC LIMIT 1`,
    [userId],
  )
  if (r.rows.length === 0) return null
  try {
    const parsed = JSON.parse(r.rows[0].access_token) as CoinbaseKey
    if (!parsed.keyName || !parsed.privateKey) return null
    return parsed
  } catch {
    return null
  }
}

export async function handleCoinbaseStatus(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = await requireContext(req, res)
  if (!ctx) return
  try {
    const key = await loadKey(ctx.pool, ctx.userId)
    sendJson(res, 200, { ok: true, connected: key !== null, keyName: key ? redact(key.keyName) : null })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

/** Show enough of the key name to recognise it, never enough to use it. */
function redact(keyName: string): string {
  const tail = keyName.slice(-6)
  return `…${tail}`
}

interface ConnectBody { keyName?: unknown; privateKey?: unknown }

export async function handleCoinbaseConnect(req: Req, res: Res): Promise<void> {
  const ctx = await requireContext(req, res)
  if (!ctx) return

  if (req.method === 'DELETE') {
    try {
      await ctx.pool.query(
        `UPDATE connectors SET status = 'disconnected', updated_at = now()
          WHERE user_id = $1 AND provider = 'coinbase'`,
        [ctx.userId],
      )
      sendJson(res, 200, { ok: true, connected: false })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: 'delete_failed', message: errorMessage(err) })
    }
    return
  }
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const body = (await readJsonBody(req)) as ConnectBody
    const keyName = typeof body.keyName === 'string' ? body.keyName.trim() : ''
    const privateKey = typeof body.privateKey === 'string' ? body.privateKey.trim() : ''
    if (!keyName || !privateKey) { sendJson(res, 400, { ok: false, error: 'missing_key' }); return }
    if (!privateKey.includes('PRIVATE KEY')) {
      // The CDP portal hands over a PEM block. Anything else is a paste mishap,
      // and saying so now beats an opaque signature failure later.
      sendJson(res, 400, { ok: false, error: 'not_a_pem', message: 'Expected an EC PRIVATE KEY PEM block, including the BEGIN/END lines.' })
      return
    }

    // Prove the key works BEFORE storing it — one live read-only call.
    const balances = await listCoinbaseBalances({ keyName, privateKey })

    await ctx.pool.query(
      `INSERT INTO connectors (id, user_id, provider, institution, provider_enrollment_id, access_token, status, data, created_at, updated_at)
       VALUES ($1, $2, 'coinbase', 'Coinbase', NULL, $3, 'active', $4::jsonb, now(), now())
       ON CONFLICT (user_id, id) DO UPDATE
         SET access_token = EXCLUDED.access_token, status = 'active', data = EXCLUDED.data, updated_at = now()`,
      [CONNECTOR_ID, ctx.userId, JSON.stringify({ keyName, privateKey }), JSON.stringify({ products: 'balances' })],
    )
    sendJson(res, 200, { ok: true, connected: true, wallets: balances.length })
  } catch (err) {
    if (err instanceof CoinbaseApiError) {
      // 401 here is nearly always "wrong algorithm" (Ed25519 keys are rejected)
      // or a key without View permission — worth naming, since the raw message
      // is unhelpful.
      sendJson(res, err.status === 401 ? 401 : 502, {
        ok: false, error: 'coinbase_rejected', code: err.code, message: err.message,
        hint: err.status === 401
          ? 'Coinbase rejected the key. It must be an ECDSA key (Ed25519 is not supported) with View permission.'
          : undefined,
      })
      return
    }
    sendJson(res, 500, { ok: false, error: 'connect_failed', message: errorMessage(err) })
  }
}

export async function handleCoinbaseBalances(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = await requireContext(req, res)
  if (!ctx) return
  try {
    const key = await loadKey(ctx.pool, ctx.userId)
    if (!key) { sendJson(res, 503, { ok: false, error: 'coinbase_not_connected' }); return }
    const { priced, total, unpriced } = await fetchCoinbasePortfolio(key)
    sendJson(res, 200, { ok: true, balances: priced, total, unpriced })
  } catch (err) {
    if (err instanceof CoinbaseApiError) {
      sendJson(res, 502, { ok: false, error: 'coinbase_rejected', code: err.code, message: err.message })
      return
    }
    sendJson(res, 500, { ok: false, error: 'balances_failed', message: errorMessage(err) })
  }
}

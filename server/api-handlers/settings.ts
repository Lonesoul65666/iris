// Settings endpoints — key/value/jsonb store scoped to the current user.
//
//   GET  /api/settings/list       -> { ok, items: [{key, value, updatedAt}] }
//   GET  /api/settings/get/:key   -> { ok, value } | { ok:false, error:'not_found' }
//   POST /api/settings/save       { key, value } -> { ok }
//   POST /api/settings/delete     { key } | { keys: [...] } -> { ok, deleted: N }

import { sendJson, readJsonBody, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'

export async function handleSettingsList(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  try {
    const r = await ctx.pool.query<{ key: string; value: unknown; updated_at: string }>(
      'SELECT key, value, updated_at FROM settings WHERE user_id = $1 ORDER BY key',
      [ctx.userId],
    )
    sendJson(res, 200, {
      ok: true,
      items: r.rows.map((row) => ({ key: row.key, value: row.value, updatedAt: row.updated_at })),
    })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleSettingsGet(req: Req, res: Res, key: string): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  try {
    const r = await ctx.pool.query<{ value: unknown }>(
      'SELECT value FROM settings WHERE user_id = $1 AND key = $2',
      [ctx.userId, key],
    )
    if (r.rows.length === 0) {
      sendJson(res, 404, { ok: false, error: 'not_found' })
      return
    }
    sendJson(res, 200, { ok: true, value: r.rows[0].value })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleSettingsDelete(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { key?: unknown; keys?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const keys: string[] = []
  if (typeof body.key === 'string' && body.key.length > 0) keys.push(body.key)
  if (Array.isArray(body.keys)) {
    for (const k of body.keys) {
      if (typeof k === 'string' && k.length > 0) keys.push(k)
    }
  }
  if (keys.length === 0) {
    sendJson(res, 400, { ok: false, error: 'missing_key_or_keys' })
    return
  }
  try {
    const r = await ctx.pool.query(
      'DELETE FROM settings WHERE user_id = $1 AND key = ANY($2::text[])',
      [ctx.userId, keys],
    )
    sendJson(res, 200, { ok: true, deleted: r.rowCount ?? 0 })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleSettingsSave(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { key?: unknown; value?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  if (typeof body.key !== 'string' || body.key.length === 0) {
    sendJson(res, 400, { ok: false, error: 'missing_key' })
    return
  }
  if (typeof body.value === 'undefined') {
    sendJson(res, 400, { ok: false, error: 'missing_value' })
    return
  }
  try {
    await ctx.pool.query(
      `INSERT INTO settings (user_id, key, value, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (user_id, key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = now()`,
      [ctx.userId, body.key, JSON.stringify(body.value)],
    )
    sendJson(res, 200, { ok: true })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

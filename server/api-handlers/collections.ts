// Generic collections endpoints — one table holds all budget-config stores
// (buckets, sinkingFunds, funMoney, paycheck, customCategories,
// recurringDecisions, inflowDecisions, earners). Each row is identified by
// (user_id, name, key) where `name` is the collection name and `key` is the
// IndexedDB keyPath value. Full row payload lives in `data` jsonb.
//
//   GET  /api/collections/:name/list    -> { ok, items: [{key, data, updatedAt}] }
//   POST /api/collections/:name/save    { items: [{key, data}] | item: {key, data} }
//                                       -> { ok, written }
//   POST /api/collections/:name/delete  { key } | { keys: [...] } | { all: true }
//                                       -> { ok, deleted: N }
//
// Single-name routing: the `:name` segment is parsed from the URL by the
// dispatcher in api-plugin.ts.

import { sendJson, readJsonBody, requireContext, methodNotAllowed, errorMessage, type Req, type Res } from './http-utils.ts'

const COLLECTION_NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/

function validName(name: unknown): name is string {
  return typeof name === 'string' && COLLECTION_NAME.test(name)
}

export async function handleCollectionsList(req: Req, res: Res, name: string): Promise<void> {
  if (req.method !== 'GET') return methodNotAllowed(res)
  if (!validName(name)) {
    sendJson(res, 400, { ok: false, error: 'invalid_collection_name' })
    return
  }
  const ctx = requireContext(res)
  if (!ctx) return
  try {
    const r = await ctx.pool.query<{ key: string; data: Record<string, unknown>; updated_at: string }>(
      `SELECT key, data, updated_at
       FROM collections
       WHERE user_id = $1 AND name = $2
       ORDER BY key`,
      [ctx.userId, name],
    )
    sendJson(res, 200, {
      ok: true,
      items: r.rows.map((row) => ({ key: row.key, data: row.data, updatedAt: row.updated_at })),
    })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleCollectionsDelete(req: Req, res: Res, name: string): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  if (!validName(name)) {
    sendJson(res, 400, { ok: false, error: 'invalid_collection_name' })
    return
  }
  const ctx = requireContext(res)
  if (!ctx) return
  let body: { key?: unknown; keys?: unknown; all?: unknown }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  try {
    let r: { rowCount: number | null }
    if (body.all === true) {
      r = await ctx.pool.query(
        'DELETE FROM collections WHERE user_id = $1 AND name = $2',
        [ctx.userId, name],
      )
    } else {
      const keys: string[] = []
      if (typeof body.key === 'string' && body.key.length > 0) keys.push(body.key)
      if (Array.isArray(body.keys)) {
        for (const k of body.keys) if (typeof k === 'string' && k.length > 0) keys.push(k)
      }
      if (keys.length === 0) {
        sendJson(res, 400, { ok: false, error: 'missing_key_or_keys_or_all' })
        return
      }
      r = await ctx.pool.query(
        'DELETE FROM collections WHERE user_id = $1 AND name = $2 AND key = ANY($3::text[])',
        [ctx.userId, name, keys],
      )
    }
    sendJson(res, 200, { ok: true, deleted: r.rowCount ?? 0 })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

// Atomic REPLACE: in ONE transaction, delete every row whose key is not in the
// incoming set, then upsert the incoming rows. Replaces the client's old
// list→save→N-deletes round-trips, which were un-transactioned — a mid-sequence
// drop resurrected deleted rows and two concurrent tabs lost-update-clobbered
// (2026-07-04 swarm audit, Medium). An empty `items` clears the collection.
export async function handleCollectionsReplace(req: Req, res: Res, name: string): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  if (!validName(name)) {
    sendJson(res, 400, { ok: false, error: 'invalid_collection_name' })
    return
  }
  const ctx = requireContext(res)
  if (!ctx) return

  let body: { items?: Array<{ key?: unknown; data?: unknown }> }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  if (!Array.isArray(body.items)) {
    sendJson(res, 400, { ok: false, error: 'missing_items' })
    return
  }
  const items: Array<{ key: string; data: unknown }> = []
  for (const it of body.items) {
    if (!it || typeof it !== 'object' || typeof it.key !== 'string' || it.key.length === 0) {
      sendJson(res, 400, { ok: false, error: 'invalid_item_in_array' })
      return
    }
    items.push({ key: it.key, data: it.data ?? {} })
  }

  try {
    const client = await ctx.pool.connect()
    try {
      await client.query('BEGIN')
      const keys = items.map((it) => it.key)
      // Delete the rows that are gone. With no incoming keys this clears all
      // rows (NOT (key = ANY('{}')) is true for every row) — the last-row case.
      const del = await client.query(
        'DELETE FROM collections WHERE user_id = $1 AND name = $2 AND NOT (key = ANY($3::text[]))',
        [ctx.userId, name, keys],
      )
      for (const it of items) {
        await client.query(
          `INSERT INTO collections (user_id, name, key, data, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, now())
           ON CONFLICT (user_id, name, key) DO UPDATE
             SET data = EXCLUDED.data, updated_at = now()`,
          [ctx.userId, name, it.key, JSON.stringify(it.data)],
        )
      }
      await client.query('COMMIT')
      sendJson(res, 200, { ok: true, written: items.length, deleted: del.rowCount ?? 0 })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

export async function handleCollectionsSave(req: Req, res: Res, name: string): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res)
  if (!validName(name)) {
    sendJson(res, 400, { ok: false, error: 'invalid_collection_name' })
    return
  }
  const ctx = requireContext(res)
  if (!ctx) return

  let body: { item?: { key?: unknown; data?: unknown }; items?: Array<{ key?: unknown; data?: unknown }> }
  try {
    body = (await readJsonBody(req)) as typeof body
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }

  const items: Array<{ key: string; data: unknown }> = []
  const single = body.item
  if (single && typeof single === 'object') {
    if (typeof single.key !== 'string' || single.key.length === 0) {
      sendJson(res, 400, { ok: false, error: 'invalid_item_key' })
      return
    }
    items.push({ key: single.key, data: single.data ?? {} })
  } else if (Array.isArray(body.items)) {
    for (const it of body.items) {
      if (!it || typeof it !== 'object' || typeof it.key !== 'string' || it.key.length === 0) {
        sendJson(res, 400, { ok: false, error: 'invalid_item_in_array' })
        return
      }
      items.push({ key: it.key, data: it.data ?? {} })
    }
  } else {
    sendJson(res, 400, { ok: false, error: 'missing_item_or_items' })
    return
  }

  try {
    const client = await ctx.pool.connect()
    try {
      await client.query('BEGIN')
      for (const it of items) {
        await client.query(
          `INSERT INTO collections (user_id, name, key, data, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, now())
           ON CONFLICT (user_id, name, key) DO UPDATE
             SET data = EXCLUDED.data, updated_at = now()`,
          [ctx.userId, name, it.key, JSON.stringify(it.data)],
        )
      }
      await client.query('COMMIT')
      sendJson(res, 200, { ok: true, written: items.length })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'query_failed', message: errorMessage(err) })
  }
}

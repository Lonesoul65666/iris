// Generic client for the Postgres-backed `collections` table (migration 0002):
// rows are (user_id, name, key, value jsonb). This is the device-agnostic
// substitute for per-browser IndexedDB object stores — any browser hitting the
// same server reads the same data.
//
// Mirrors the helper shape budgetStore.ts has used since Build-D2b. Extracted
// here so portfolioStore + actionStore can share it (2026-06-10 de-browser
// migration). budgetStore keeps its own private copy for now to avoid churning
// the load-bearing budget path; collapse the two when convenient.

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(`[iris api] ${path} → ${res.status} ${body.error ?? body.message ?? 'unknown'}`)
  }
  return (await res.json()) as T
}

interface ListItemEnvelope<T> { ok: true; items: T[] }
interface OkEnvelope { ok: true }
interface DeleteEnvelope { ok: true; deleted: number }

// A collections row: the real object lives in `data`; `key` (the old IDB
// keyPath value) is duplicated for routing only. items.map(i => i.data) rebuilds
// the original shape.
interface CollectionItem<T = unknown> { key: string; data: T; updatedAt: string }

/** Read a full collection back as the original row objects. */
export async function listCollection<T>(name: string): Promise<T[]> {
  const r = await api<ListItemEnvelope<CollectionItem<T>>>(`/api/collections/${encodeURIComponent(name)}/list`)
  return r.items.map((i) => i.data)
}

/** Bulk upsert rows into a collection (no-op for an empty array). */
export async function saveCollection<T>(
  name: string,
  rows: T[],
  keyOf: (row: T) => string,
): Promise<void> {
  if (rows.length === 0) return
  const items = rows.map((row) => ({ key: keyOf(row), data: row }))
  await api<OkEnvelope>(`/api/collections/${encodeURIComponent(name)}/save`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

/** Upsert a single row into a collection. */
export async function saveCollectionItem<T>(
  name: string,
  row: T,
  keyOf: (row: T) => string,
): Promise<void> {
  await api<OkEnvelope>(`/api/collections/${encodeURIComponent(name)}/save`, {
    method: 'POST',
    body: JSON.stringify({ item: { key: keyOf(row), data: row } }),
  })
}

/** REPLACE a collection: upsert the given rows AND delete rows whose keys are
 *  gone. saveCollection alone is upsert-only — a row the user deleted in the
 *  UI would survive in Postgres and resurrect on the next load (found by the
 *  2026-06-11 pre-paint audit: deleted stashes came back). Also handles
 *  deleting the LAST row, which saveCollection's empty-early-return never
 *  reached the API for. */
export async function replaceCollection<T>(
  name: string,
  rows: T[],
  keyOf: (row: T) => string,
): Promise<void> {
  const existing = await api<ListItemEnvelope<CollectionItem<unknown>>>(`/api/collections/${encodeURIComponent(name)}/list`)
  const keep = new Set(rows.map(keyOf))
  const stale = existing.items.map((i) => i.key).filter((k) => !keep.has(k))
  if (rows.length > 0) await saveCollection(name, rows, keyOf)
  for (const k of stale) await deleteCollectionKey(name, k)
}

/** Delete one row by key. */
export async function deleteCollectionKey(name: string, key: string): Promise<void> {
  await api<DeleteEnvelope>(`/api/collections/${encodeURIComponent(name)}/delete`, {
    method: 'POST',
    body: JSON.stringify({ key }),
  })
}

/** Delete every row in a collection. */
export async function clearCollection(name: string): Promise<void> {
  await api<DeleteEnvelope>(`/api/collections/${encodeURIComponent(name)}/delete`, {
    method: 'POST',
    body: JSON.stringify({ all: true }),
  })
}

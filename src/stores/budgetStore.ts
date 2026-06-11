// Budget store — Phase 1 single source of truth for budget data.
//
// As of 2026-05-07 (Build-D2b): all reads/writes route through the Iris API
// (`/api/*`) which talks to the user-owned Postgres per ADR-0002. Function
// signatures kept identical to the previous IndexedDB implementation so that
// the ~100 call sites across the app didn't need touching.
//
// Data shape:
//   - incomeSources / expenses: own typed tables (filtering, date queries)
//   - the eight budget-config stores live in the generic `collections` table
//     keyed by (user_id, name, key)
//
// IndexedDB is no longer the source of truth. Build-D1/D2a's migration script
// already copied existing data into Postgres. The old IndexedDB store
// continues to exist at iris-budget@v4 as a one-session fallback per ADR-0002.

import type { BudgetBucket, SinkingFund, FunMoney, PaycheckBreakdown, CustomCategory, IncomeSource, InflowDecision, Earner, Expense } from '../types/budget'

// ─── HTTP helpers ─────────────────────────────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
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

// `collections` rows come back with key + data + updatedAt. The actual row
// shape lives entirely in `data` — the keyPath value is duplicated as `key`
// for routing only. So `items.map(i => i.data)` rebuilds the original shape.
interface CollectionItem<T = unknown> { key: string; data: T; updatedAt: string }

async function listCollection<T>(name: string): Promise<T[]> {
  const r = await api<ListItemEnvelope<CollectionItem<T>>>(`/api/collections/${encodeURIComponent(name)}/list`)
  return r.items.map((i) => i.data)
}

async function saveCollection<T extends Record<string, unknown>>(
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

async function saveCollectionItem<T extends Record<string, unknown>>(
  name: string,
  row: T,
  keyOf: (row: T) => string,
): Promise<void> {
  await api<OkEnvelope>(`/api/collections/${encodeURIComponent(name)}/save`, {
    method: 'POST',
    body: JSON.stringify({ item: { key: keyOf(row), data: row } }),
  })
}

async function deleteCollectionKey(name: string, key: string): Promise<void> {
  await api<DeleteEnvelope>(`/api/collections/${encodeURIComponent(name)}/delete`, {
    method: 'POST',
    body: JSON.stringify({ key }),
  })
}

// REPLACE semantics: upsert rows AND delete rows whose keys are gone.
// saveCollection alone is upsert-only — a row deleted in the UI survived in
// Postgres and resurrected on the next load (2026-06-11 pre-paint audit).
// Also covers deleting the LAST row, which the empty-early-return never sent.
async function replaceCollection<T extends Record<string, unknown>>(
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

async function clearCollection(name: string): Promise<void> {
  await api<DeleteEnvelope>(`/api/collections/${encodeURIComponent(name)}/delete`, {
    method: 'POST',
    body: JSON.stringify({ all: true }),
  })
}

// ─── Buckets / SinkingFunds / FunMoney / Paycheck / CustomCategories ─────

// Buckets and stashes use REPLACE semantics — both have delete-in-UI flows
// (Edit Budget bucket removal, StashesCard delete), and upsert-only saves let
// deleted rows resurrect from Postgres on the next load.
export async function saveBudgetBuckets(buckets: BudgetBucket[]): Promise<void> {
  await replaceCollection('buckets', buckets as unknown as Array<Record<string, unknown>>, (b) => String((b as unknown as BudgetBucket).category))
}

export async function getBudgetBuckets(): Promise<BudgetBucket[]> {
  return listCollection<BudgetBucket>('buckets')
}

export async function saveSinkingFunds(funds: SinkingFund[]): Promise<void> {
  await replaceCollection('sinkingFunds', funds as unknown as Array<Record<string, unknown>>, (f) => String((f as unknown as SinkingFund).id))
}

export async function getSinkingFunds(): Promise<SinkingFund[]> {
  return listCollection<SinkingFund>('sinkingFunds')
}

export async function saveFunMoney(fm: FunMoney[]): Promise<void> {
  await saveCollection('funMoney', fm as unknown as Array<Record<string, unknown>>, (f) => String((f as unknown as FunMoney).person))
}

export async function getFunMoney(): Promise<FunMoney[]> {
  return listCollection<FunMoney>('funMoney')
}

export async function savePaycheck(p: PaycheckBreakdown): Promise<void> {
  const row = { ...p, id: 'current' as const }
  await saveCollectionItem('paycheck', row as unknown as Record<string, unknown>, () => 'current')
}

export async function getPaycheck(): Promise<PaycheckBreakdown | undefined> {
  const rows = await listCollection<PaycheckBreakdown & { id?: string }>('paycheck')
  return rows[0]
}

export async function getCustomCategories(): Promise<CustomCategory[]> {
  return listCollection<CustomCategory>('customCategories')
}

export async function saveCustomCategory(cat: CustomCategory): Promise<void> {
  await saveCollectionItem('customCategories', cat as unknown as Record<string, unknown>, (c) => String((c as unknown as CustomCategory).id))
}

export async function deleteCustomCategory(id: string): Promise<void> {
  await deleteCollectionKey('customCategories', id)
}

// ─── Recurring decisions ─────────────────────────────────────────────────

export interface RecurringDecision {
  id: string
  status: 'confirmed' | 'dismissed'
  updatedAt: string
}

export async function getRecurringDecisions(): Promise<RecurringDecision[]> {
  return listCollection<RecurringDecision>('recurringDecisions')
}

export async function saveRecurringDecision(d: RecurringDecision): Promise<void> {
  await saveCollectionItem('recurringDecisions', d as unknown as Record<string, unknown>, (r) => String((r as unknown as RecurringDecision).id))
}

export async function clearRecurringDecision(id: string): Promise<void> {
  await deleteCollectionKey('recurringDecisions', id)
}

// ─── Income sources ──────────────────────────────────────────────────────

export async function getIncomeSources(): Promise<IncomeSource[]> {
  const r = await api<ListItemEnvelope<IncomeSource>>('/api/incomeSources/list')
  return r.items
}

export async function saveIncomeSource(s: IncomeSource): Promise<void> {
  const stamped = { ...s, updatedAt: new Date().toISOString() }
  await api<OkEnvelope>('/api/incomeSources/save', {
    method: 'POST',
    body: JSON.stringify({ source: stamped }),
  })
}

export async function saveIncomeSources(sources: IncomeSource[]): Promise<void> {
  if (sources.length === 0) return
  const ts = new Date().toISOString()
  const stamped = sources.map((s) => ({ ...s, updatedAt: ts }))
  await api<{ ok: true; written: number }>('/api/incomeSources/save-batch', {
    method: 'POST',
    body: JSON.stringify({ sources: stamped }),
  })
}

export async function deleteIncomeSource(id: string): Promise<void> {
  await api<DeleteEnvelope>('/api/incomeSources/delete', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
}

// ─── Inflow decisions ────────────────────────────────────────────────────

export async function getInflowDecisions(): Promise<InflowDecision[]> {
  return listCollection<InflowDecision>('inflowDecisions')
}

export async function saveInflowDecision(d: InflowDecision): Promise<void> {
  await saveCollectionItem('inflowDecisions', d as unknown as Record<string, unknown>, (r) => String((r as unknown as InflowDecision).expenseId))
}

export async function clearInflowDecision(expenseId: string): Promise<void> {
  await deleteCollectionKey('inflowDecisions', expenseId)
}

// ─── Earners ─────────────────────────────────────────────────────────────

export async function getEarners(): Promise<Earner[]> {
  return listCollection<Earner>('earners')
}

export async function saveEarner(e: Earner): Promise<void> {
  await saveCollectionItem('earners', e as unknown as Record<string, unknown>, (r) => String((r as unknown as Earner).id))
}

export async function deleteEarner(id: string): Promise<void> {
  await deleteCollectionKey('earners', id)
}

// ─── Expenses ────────────────────────────────────────────────────────────

export async function saveExpense(e: Expense): Promise<void> {
  await api<OkEnvelope>('/api/expenses/save', {
    method: 'POST',
    body: JSON.stringify({ expense: e }),
  })
}

export async function getExpenses(): Promise<Expense[]> {
  const r = await api<ListItemEnvelope<Expense>>('/api/expenses/list')
  return r.items
}

export async function deleteExpense(id: string): Promise<void> {
  await api<DeleteEnvelope>('/api/expenses/delete', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
}

export async function clearAllExpenses(): Promise<number> {
  const r = await api<DeleteEnvelope>('/api/expenses/delete', {
    method: 'POST',
    body: JSON.stringify({ all: true }),
  })
  return r.deleted
}

export async function clearExpensesBySource(source: string): Promise<number> {
  const r = await api<DeleteEnvelope>('/api/expenses/delete', {
    method: 'POST',
    body: JSON.stringify({ source }),
  })
  return r.deleted
}

export async function clearExpensesByBatch(batchPrefix: string): Promise<number> {
  const r = await api<DeleteEnvelope>('/api/expenses/delete', {
    method: 'POST',
    body: JSON.stringify({ batchPrefix }),
  })
  return r.deleted
}

// Get summary of what's in the expense store (for the management UI).
// Aggregation stays client-side — same logic as the previous implementation,
// just sourced from the Postgres list endpoint.
export async function getExpenseSummary(): Promise<{
  total: number
  bySource: Record<string, number>
  byBatch: Record<string, { count: number; firstDate: string; lastDate: string }>
  dateRange: { earliest: string; latest: string } | null
}> {
  const all = await getExpenses()
  const bySource: Record<string, number> = {}
  const byBatch: Record<string, { count: number; firstDate: string; lastDate: string }> = {}
  let earliest = ''
  let latest = ''

  for (const e of all) {
    const src = (e.source as string | undefined) ?? 'unknown'
    bySource[src] = (bySource[src] || 0) + 1

    const batch = (e.importBatch as string | undefined) ?? 'manual'
    if (!byBatch[batch]) byBatch[batch] = { count: 0, firstDate: e.date, lastDate: e.date }
    byBatch[batch].count++
    if (e.date < byBatch[batch].firstDate) byBatch[batch].firstDate = e.date
    if (e.date > byBatch[batch].lastDate) byBatch[batch].lastDate = e.date

    if (!earliest || e.date < earliest) earliest = e.date
    if (!latest || e.date > latest) latest = e.date
  }

  return {
    total: all.length,
    bySource,
    byBatch,
    dateRange: all.length > 0 ? { earliest, latest } : null,
  }
}

// ─── Bulk clears ─────────────────────────────────────────────────────────

export async function clearBudgetBuckets(): Promise<void> {
  await clearCollection('buckets')
}

export async function clearSinkingFunds(): Promise<void> {
  await clearCollection('sinkingFunds')
}

export async function clearFunMoney(): Promise<void> {
  await clearCollection('funMoney')
}

// Nuclear option: clear everything in the budget DB. Iterates each collection
// + the typed tables. Useful for full-reset flows.
export async function clearAllBudgetData(): Promise<void> {
  const collectionNames = [
    'buckets', 'sinkingFunds', 'funMoney', 'paycheck',
    'customCategories', 'recurringDecisions', 'inflowDecisions', 'earners',
  ] as const
  await Promise.all(collectionNames.map((n) => clearCollection(n)))
  await clearAllExpenses()
  // incomeSources doesn't have a clear-all today — bulk-list and bulk-delete.
  const sources = await getIncomeSources()
  if (sources.length > 0) {
    await api<DeleteEnvelope>('/api/incomeSources/delete', {
      method: 'POST',
      body: JSON.stringify({ ids: sources.map((s) => s.id) }),
    })
  }
}

// Legacy lifecycle — preserved as a no-op for call-site compatibility.
// IndexedDB lifecycle no longer applies; nothing to close.
export function closeBudgetDB(): void {
  // intentional no-op
}

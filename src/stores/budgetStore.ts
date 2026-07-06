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

import type { BudgetBucket, SinkingFund, FunMoney, PaycheckBreakdown, CustomCategory, IncomeSource, InflowDecision, Earner, Expense, SourceOwner } from '../types/budget'
import { targetsOf, sameTargets, type BudgetTargetSnapshot } from '../utils/budgetHistory'

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
// Also covers deleting the LAST row (empty `rows` clears the collection).
//
// One atomic server call (/replace) — the old list→save→N-deletes sequence was
// un-transactioned: a mid-sequence drop resurrected deleted rows and two
// concurrent tabs lost-update-clobbered (2026-07-04 swarm audit).
async function replaceCollection<T extends Record<string, unknown>>(
  name: string,
  rows: T[],
  keyOf: (row: T) => string,
): Promise<void> {
  const items = rows.map((row) => ({ key: keyOf(row), data: row }))
  await api<OkEnvelope>(`/api/collections/${encodeURIComponent(name)}/replace`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

async function clearCollection(name: string): Promise<void> {
  await api<DeleteEnvelope>(`/api/collections/${encodeURIComponent(name)}/delete`, {
    method: 'POST',
    body: JSON.stringify({ all: true }),
  })
}

// ─── Buckets / SinkingFunds / FunMoney / Paycheck / CustomCategories ─────

// ─── Budget-target history (append-only; see src/utils/budgetHistory.ts) ──
// Every bucket save passes through here, so a target change can never slip by
// unrecorded. Snapshots are deduped (identical targets append nothing) and a
// history failure must never break the save itself.

let lastSnapshotTargets: Record<string, number> | null | undefined; // undefined = not loaded yet

export async function getBudgetTargetHistory(): Promise<BudgetTargetSnapshot[]> {
  const rows = await listCollection<BudgetTargetSnapshot>('budgetTargets')
  return rows.sort((a, b) => a.takenAt.localeCompare(b.takenAt))
}

/** Record a snapshot if the targets differ from the last one (or none exist). */
export async function snapshotBudgetTargets(buckets: BudgetBucket[]): Promise<void> {
  try {
    const targets = targetsOf(buckets)
    if (lastSnapshotTargets === undefined) {
      const hist = await getBudgetTargetHistory()
      lastSnapshotTargets = hist.length > 0 ? hist[hist.length - 1].targets : null
    }
    if (lastSnapshotTargets !== null && sameTargets(lastSnapshotTargets, targets)) return
    const snap: BudgetTargetSnapshot = { takenAt: new Date().toISOString(), targets }
    await saveCollectionItem('budgetTargets', snap as unknown as Record<string, unknown>, (s) => String((s as unknown as BudgetTargetSnapshot).takenAt))
    lastSnapshotTargets = targets
  } catch { /* target history is best-effort — never block the save */ }
}

// Buckets and stashes use REPLACE semantics — both have delete-in-UI flows
// (Edit Budget bucket removal, StashesCard delete), and upsert-only saves let
// deleted rows resurrect from Postgres on the next load.
export async function saveBudgetBuckets(buckets: BudgetBucket[]): Promise<void> {
  await replaceCollection('buckets', buckets as unknown as Array<Record<string, unknown>>, (b) => String((b as unknown as BudgetBucket).category))
  await snapshotBudgetTargets(buckets)
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
  // REPLACE semantics: callers always pass the FULL pot set, so a row that
  // disappears from the array must disappear from Postgres too. Upsert-only
  // let orphans survive — that's how a legacy action's "Person A"/"Person B"
  // defaults lingered alongside the real earner pots (2026-06-13). Key by
  // earner id when linked (stable across renames); person for legacy rows.
  await replaceCollection('funMoney', fm as unknown as Array<Record<string, unknown>>, (f) => {
    const row = f as unknown as FunMoney
    // Normalize the dedup key: trim + lowercase so a linked pot and a legacy
    // twin can't survive side-by-side on a casing/whitespace mismatch.
    return String(row.earnerId ?? row.person ?? '').trim().toLowerCase()
  })
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

// ─── Deploy confirmations (planned → confirmed) ──────────────────────────
// The honesty layer for the Money Map: a lane amount (investing $1,000/mo,
// later reserves) is a PLAN until the money actually moves. Scott confirms it
// manually — Fidelity alerts him the transfer landed, he taps ✓ — so the lane
// reads as REAL for that month instead of an inferred Settings guess. Keyed by
// `${month}:${lane}` so each month is confirmed independently. Feed-detect or a
// live ticker may validate this automatically later (parked, undecided).

export interface DeployConfirmation {
  month: string // 'YYYY-MM'
  lane: string  // 'investing' (extensible: 'reserves', a stash id, …)
  amount: number
  confirmedAt: string
}

const deployKey = (c: DeployConfirmation) => `${c.month}:${c.lane}`

export async function getDeployConfirmations(): Promise<DeployConfirmation[]> {
  return listCollection<DeployConfirmation>('deployConfirmations')
}

export async function saveDeployConfirmation(c: DeployConfirmation): Promise<void> {
  await saveCollectionItem('deployConfirmations', c as unknown as Record<string, unknown>, (r) => deployKey(r as unknown as DeployConfirmation))
}

export async function clearDeployConfirmation(month: string, lane: string): Promise<void> {
  await deleteCollectionKey('deployConfirmations', `${month}:${lane}`)
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

// ─── Source owners (attribution — couples model) ─────────────────────────

export async function getSourceOwners(): Promise<SourceOwner[]> {
  return listCollection<SourceOwner>('sourceOwners')
}

export async function saveSourceOwner(row: SourceOwner): Promise<void> {
  await saveCollectionItem('sourceOwners', row as unknown as Record<string, unknown>, (r) => String((r as unknown as SourceOwner).source))
}

export async function deleteSourceOwner(source: string): Promise<void> {
  await deleteCollectionKey('sourceOwners', source)
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

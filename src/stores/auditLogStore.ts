// Audit log — Postgres-backed via /api/audit (Build-D2c, 2026-05-10).
// Was IndexedDB (`iris-audit`); moved so audit history travels with the
// user-owned database. Convenience helpers below flow through logAuditEvent.

// ─── Types ───

export type AuditAction =
  | 'account_added'
  | 'account_closed'
  | 'account_edited'
  | 'holding_added'
  | 'holding_edited'
  | 'holding_removed'
  | 'csv_import'
  | 'budget_edit';

export interface AuditEntry {
  id: string;           // `${timestamp}-${randomHex}`
  timestamp: string;    // ISO 8601
  action: AuditAction;
  entityType: 'account' | 'holding' | 'budget';
  entityId: string;     // account.id, holding.id, or 'global' for budget
  entityName: string;   // human-readable label
  details: string;      // plain-English description
  meta?: Record<string, unknown>; // optional extra context (before/after values, import stats, etc.)
}

export interface BudgetDiff {
  scope: 'bucket' | 'stash' | 'funmoney';
  /** Stable identifier for the entity being changed (category id, fund id, etc.). */
  entityId: string;
  /** Display label, e.g. "Groceries". */
  entityName: string;
  /** Field name within the entity, e.g. "monthlyBudget". */
  field: string;
  oldVal: unknown;
  newVal: unknown;
  /** 'added' / 'removed' / 'edited' — field-level mutation type. */
  kind: 'added' | 'removed' | 'edited';
}

// ─── API helper ───

async function auditApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(`[iris api] ${path} → ${res.status} ${body.error ?? body.message ?? 'unknown'}`);
  }
  return (await res.json()) as T;
}

// ─── Write ───

export async function logAuditEvent(entry: Omit<AuditEntry, 'id'>): Promise<AuditEntry> {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const full: AuditEntry = { ...entry, id };
  await auditApi('/api/audit/append', { method: 'POST', body: JSON.stringify({ entry: full }) });
  return full;
}

// Convenience helpers
export async function auditAccountAdded(accountId: string, accountName: string, institution: string, type: string) {
  return logAuditEvent({
    timestamp: new Date().toISOString(),
    action: 'account_added',
    entityType: 'account',
    entityId: accountId,
    entityName: accountName,
    details: `Added ${type} account "${accountName}" at ${institution}`,
    meta: { institution, type },
  });
}

export async function auditAccountClosed(accountId: string, accountName: string, finalValue: number) {
  return logAuditEvent({
    timestamp: new Date().toISOString(),
    action: 'account_closed',
    entityType: 'account',
    entityId: accountId,
    entityName: accountName,
    details: `Closed account "${accountName}" — final balance $${finalValue.toLocaleString()}`,
    meta: { finalValue },
  });
}

export async function auditHoldingAdded(accountId: string, accountName: string, ticker: string, shares: number, avgCost: number) {
  return logAuditEvent({
    timestamp: new Date().toISOString(),
    action: 'holding_added',
    entityType: 'holding',
    entityId: `${accountId}-${ticker}`,
    entityName: `${ticker} in ${accountName}`,
    details: `Manually added ${shares} shares of ${ticker} @ $${avgCost} avg cost`,
    meta: { accountId, accountName, ticker, shares, avgCost },
  });
}

export async function auditHoldingEdited(accountId: string, accountName: string, ticker: string, field: string, oldVal: number, newVal: number) {
  return logAuditEvent({
    timestamp: new Date().toISOString(),
    action: 'holding_edited',
    entityType: 'holding',
    entityId: `${accountId}-${ticker}`,
    entityName: `${ticker} in ${accountName}`,
    details: `Updated ${field} for ${ticker}: ${oldVal} → ${newVal}`,
    meta: { accountId, ticker, field, oldVal, newVal },
  });
}

export async function auditBudgetEdit(diffs: BudgetDiff[]) {
  if (diffs.length === 0) return null;
  const summary = (() => {
    const counts: Record<string, number> = { added: 0, removed: 0, edited: 0 };
    for (const d of diffs) counts[d.kind]++;
    const parts = [];
    if (counts.added) parts.push(`${counts.added} added`);
    if (counts.edited) parts.push(`${counts.edited} edited`);
    if (counts.removed) parts.push(`${counts.removed} removed`);
    return parts.join(', ');
  })();
  return logAuditEvent({
    timestamp: new Date().toISOString(),
    action: 'budget_edit',
    entityType: 'budget',
    entityId: 'global',
    entityName: 'Budget',
    details: `Budget edited — ${summary}`,
    meta: { diffs },
  });
}

export async function auditCsvImport(accountId: string, accountName: string, institution: string, stats: { updated: number; added: number; removed: number; total: number }) {
  return logAuditEvent({
    timestamp: new Date().toISOString(),
    action: 'csv_import',
    entityType: 'account',
    entityId: accountId,
    entityName: accountName,
    details: `CSV import for ${accountName} (${institution}): ${stats.updated} updated, ${stats.added} added, ${stats.removed} removed — ${stats.total} rows`,
    meta: { ...stats, institution },
  });
}

// ─── Read ───

export async function getAuditLog(limit = 200): Promise<AuditEntry[]> {
  const body = await auditApi<{ ok: boolean; items: AuditEntry[] }>(`/api/audit/list?limit=${limit}`);
  return body.items; // server returns newest-first
}

export async function getAuditLogForEntity(entityId: string): Promise<AuditEntry[]> {
  const body = await auditApi<{ ok: boolean; items: AuditEntry[] }>(
    `/api/audit/list?entityId=${encodeURIComponent(entityId)}`,
  );
  return body.items;
}

export async function clearAuditLog(): Promise<void> {
  await auditApi('/api/audit/delete', { method: 'POST', body: JSON.stringify({ all: true }) });
}

// Legacy lifecycle no-op — IndexedDB audit DB no longer used (Build-D2c).
export function closeAuditDB(): void {
  // intentional no-op
}

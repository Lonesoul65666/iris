import { openDB, type IDBPDatabase } from 'idb';

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

// ─── DB ───

let dbInstance: IDBPDatabase<any> | null = null;

async function getAuditDB() {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB('iris-audit', 1, {
    upgrade(db) {
      const store = db.createObjectStore('log', { keyPath: 'id' });
      store.createIndex('by-timestamp', 'timestamp');
      store.createIndex('by-action', 'action');
      store.createIndex('by-entity', 'entityId');
    },
  });
  return dbInstance;
}

// ─── Write ───

export async function logAuditEvent(entry: Omit<AuditEntry, 'id'>): Promise<AuditEntry> {
  const db = await getAuditDB();
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const full: AuditEntry = { ...entry, id };
  await db.put('log', full);
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
  const db = await getAuditDB();
  const all = await db.getAllFromIndex('log', 'by-timestamp');
  return all.reverse().slice(0, limit); // newest first
}

export async function getAuditLogForEntity(entityId: string): Promise<AuditEntry[]> {
  const db = await getAuditDB();
  const all = await db.getAllFromIndex('log', 'by-entity', entityId);
  return all.reverse();
}

export async function clearAuditLog(): Promise<void> {
  const db = await getAuditDB();
  await db.clear('log');
}

export function closeAuditDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

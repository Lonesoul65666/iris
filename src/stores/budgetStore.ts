import { openDB, type IDBPDatabase } from 'idb';
import type { BudgetBucket, SinkingFund, FunMoney, PaycheckBreakdown, CustomCategory, IncomeSource, InflowDecision, Earner } from '../types/budget';

let dbInstance: IDBPDatabase<any> | null = null;

async function getBudgetDB() {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB('iris-budget', 4, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('buckets', { keyPath: 'category' });
        db.createObjectStore('sinkingFunds', { keyPath: 'id' });
        db.createObjectStore('funMoney', { keyPath: 'person' });
        db.createObjectStore('paycheck', { keyPath: 'id' });
        db.createObjectStore('expenses', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('customCategories', { keyPath: 'id' });
      }
      if (oldVersion < 3) {
        db.createObjectStore('recurringDecisions', { keyPath: 'id' });
      }
      if (oldVersion < 4) {
        // Income engine v2 — see project_iris_budget_architecture.md
        db.createObjectStore('incomeSources', { keyPath: 'id' });
        db.createObjectStore('inflowDecisions', { keyPath: 'expenseId' });
        db.createObjectStore('earners', { keyPath: 'id' });
      }
    },
  });
  return dbInstance;
}

export async function saveBudgetBuckets(buckets: BudgetBucket[]): Promise<void> {
  const db = await getBudgetDB();
  const tx = db.transaction('buckets', 'readwrite');
  for (const b of buckets) await tx.store.put(b);
  await tx.done;
}

export async function getBudgetBuckets(): Promise<BudgetBucket[]> {
  const db = await getBudgetDB();
  return db.getAll('buckets');
}

export async function saveSinkingFunds(funds: SinkingFund[]): Promise<void> {
  const db = await getBudgetDB();
  const tx = db.transaction('sinkingFunds', 'readwrite');
  for (const f of funds) await tx.store.put(f);
  await tx.done;
}

export async function getSinkingFunds(): Promise<SinkingFund[]> {
  const db = await getBudgetDB();
  return db.getAll('sinkingFunds');
}

export async function saveFunMoney(fm: FunMoney[]): Promise<void> {
  const db = await getBudgetDB();
  const tx = db.transaction('funMoney', 'readwrite');
  for (const f of fm) await tx.store.put(f);
  await tx.done;
}

export async function getFunMoney(): Promise<FunMoney[]> {
  const db = await getBudgetDB();
  return db.getAll('funMoney');
}

export async function savePaycheck(p: PaycheckBreakdown): Promise<void> {
  const db = await getBudgetDB();
  await db.put('paycheck', { ...p, id: 'current' });
}

export async function getPaycheck(): Promise<PaycheckBreakdown | undefined> {
  const db = await getBudgetDB();
  return db.get('paycheck', 'current');
}

export async function saveExpense(e: any): Promise<void> {
  const db = await getBudgetDB();
  await db.put('expenses', e);
}

export async function getExpenses(): Promise<any[]> {
  const db = await getBudgetDB();
  return db.getAll('expenses');
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getBudgetDB();
  await db.delete('expenses', id);
}

// ─── Data Management: Granular clearing ───

// Delete all expenses (transactions)
export async function clearAllExpenses(): Promise<number> {
  const db = await getBudgetDB();
  const all = await db.getAll('expenses');
  const count = all.length;
  const tx = db.transaction('expenses', 'readwrite');
  await tx.store.clear();
  await tx.done;
  return count;
}

// Delete expenses by source account (e.g., 'bofa_checking', 'credit_card_1')
export async function clearExpensesBySource(source: string): Promise<number> {
  const db = await getBudgetDB();
  const all = await db.getAll('expenses');
  const toDelete = all.filter((e: any) => e.source === source);
  const tx = db.transaction('expenses', 'readwrite');
  for (const e of toDelete) await tx.store.delete(e.id);
  await tx.done;
  return toDelete.length;
}

// Delete expenses by import batch (one CSV upload)
export async function clearExpensesByBatch(batchPrefix: string): Promise<number> {
  const db = await getBudgetDB();
  const all = await db.getAll('expenses');
  const toDelete = all.filter((e: any) => e.importBatch && e.importBatch.startsWith(batchPrefix));
  const tx = db.transaction('expenses', 'readwrite');
  for (const e of toDelete) await tx.store.delete(e.id);
  await tx.done;
  return toDelete.length;
}

// Get summary of what's in the expense store (for the management UI)
export async function getExpenseSummary(): Promise<{
  total: number;
  bySource: Record<string, number>;
  byBatch: Record<string, { count: number; firstDate: string; lastDate: string }>;
  dateRange: { earliest: string; latest: string } | null;
}> {
  const db = await getBudgetDB();
  const all = await db.getAll('expenses');
  const bySource: Record<string, number> = {};
  const byBatch: Record<string, { count: number; firstDate: string; lastDate: string }> = {};
  let earliest = '', latest = '';

  for (const e of all) {
    const src = (e as any).source || 'unknown';
    bySource[src] = (bySource[src] || 0) + 1;

    const batch = (e as any).importBatch || 'manual';
    if (!byBatch[batch]) byBatch[batch] = { count: 0, firstDate: e.date, lastDate: e.date };
    byBatch[batch].count++;
    if (e.date < byBatch[batch].firstDate) byBatch[batch].firstDate = e.date;
    if (e.date > byBatch[batch].lastDate) byBatch[batch].lastDate = e.date;

    if (!earliest || e.date < earliest) earliest = e.date;
    if (!latest || e.date > latest) latest = e.date;
  }

  return {
    total: all.length,
    bySource,
    byBatch,
    dateRange: all.length > 0 ? { earliest, latest } : null,
  };
}

// Reset budget buckets to defaults
export async function clearBudgetBuckets(): Promise<void> {
  const db = await getBudgetDB();
  const tx = db.transaction('buckets', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

// Reset sinking funds to defaults
export async function clearSinkingFunds(): Promise<void> {
  const db = await getBudgetDB();
  const tx = db.transaction('sinkingFunds', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

// Reset fun money to defaults
export async function clearFunMoney(): Promise<void> {
  const db = await getBudgetDB();
  const tx = db.transaction('funMoney', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

// ─── Custom Categories ───

export async function getCustomCategories(): Promise<CustomCategory[]> {
  const db = await getBudgetDB();
  return db.getAll('customCategories');
}

export interface RecurringDecision {
  id: string;                                 // matches RecurringCandidate.id
  status: 'confirmed' | 'dismissed';
  updatedAt: string;                          // ISO date
}

export async function getRecurringDecisions(): Promise<RecurringDecision[]> {
  const db = await getBudgetDB();
  return db.getAll('recurringDecisions');
}

export async function saveRecurringDecision(d: RecurringDecision): Promise<void> {
  const db = await getBudgetDB();
  await db.put('recurringDecisions', d);
}

export async function clearRecurringDecision(id: string): Promise<void> {
  const db = await getBudgetDB();
  await db.delete('recurringDecisions', id);
}

export async function saveCustomCategory(cat: CustomCategory): Promise<void> {
  const db = await getBudgetDB();
  await db.put('customCategories', cat);
}

export async function deleteCustomCategory(id: string): Promise<void> {
  const db = await getBudgetDB();
  await db.delete('customCategories', id);
}

// ─── Income sources (v2 budget engine) ──────────────────────────────────────

export async function getIncomeSources(): Promise<IncomeSource[]> {
  const db = await getBudgetDB();
  return db.getAll('incomeSources');
}

export async function saveIncomeSource(s: IncomeSource): Promise<void> {
  const db = await getBudgetDB();
  await db.put('incomeSources', { ...s, updatedAt: new Date().toISOString() });
}

export async function saveIncomeSources(sources: IncomeSource[]): Promise<void> {
  const db = await getBudgetDB();
  const tx = db.transaction('incomeSources', 'readwrite');
  const ts = new Date().toISOString();
  for (const s of sources) await tx.store.put({ ...s, updatedAt: ts });
  await tx.done;
}

export async function deleteIncomeSource(id: string): Promise<void> {
  const db = await getBudgetDB();
  await db.delete('incomeSources', id);
}

// ─── Inflow disambiguation decisions ───────────────────────────────────────

export async function getInflowDecisions(): Promise<InflowDecision[]> {
  const db = await getBudgetDB();
  return db.getAll('inflowDecisions');
}

export async function saveInflowDecision(d: InflowDecision): Promise<void> {
  const db = await getBudgetDB();
  await db.put('inflowDecisions', d);
}

export async function clearInflowDecision(expenseId: string): Promise<void> {
  const db = await getBudgetDB();
  await db.delete('inflowDecisions', expenseId);
}

// ─── Earners (lightweight profile per household member) ────────────────────

export async function getEarners(): Promise<Earner[]> {
  const db = await getBudgetDB();
  return db.getAll('earners');
}

export async function saveEarner(e: Earner): Promise<void> {
  const db = await getBudgetDB();
  await db.put('earners', e);
}

export async function deleteEarner(id: string): Promise<void> {
  const db = await getBudgetDB();
  await db.delete('earners', id);
}

// Nuclear option: clear everything in the budget DB
export async function clearAllBudgetData(): Promise<void> {
  const db = await getBudgetDB();
  const stores = [
    'buckets', 'sinkingFunds', 'funMoney', 'paycheck', 'expenses',
    'customCategories', 'recurringDecisions',
    'incomeSources', 'inflowDecisions', 'earners',
  ];
  for (const store of stores) {
    const tx = db.transaction(store, 'readwrite');
    await tx.store.clear();
    await tx.done;
  }
}

export function closeBudgetDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

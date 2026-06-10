// One-time migration: copy the two remaining per-browser IndexedDB databases
// (iris-actions, iris-portfolio) into the user-owned Postgres `collections`
// table, so the data stops being trapped in whichever browser profile first
// wrote it. Run ONCE from the browser that holds the real data:
//
//     await window.__irisMigrateStores()
//
// Reads IndexedDB DIRECTLY (not through the stores, which now point at
// Postgres) and writes verbatim via saveCollection — no recompute, no overwrite
// of fields. Idempotent: re-running just re-upserts the same keys. Does NOT
// delete the IndexedDB source (kept as a fallback; sampleData.clearAllUserData
// scrubs it later). Returns per-collection row counts.

import { openDB } from 'idb';
import { saveCollection } from './collectionsClient';

interface MigrateReport {
  actionItems: number;
  merchantMappings: number;
  accounts: number;
  equity: number;
  monthlyInvestments: number;
  snapshots: number;
  chatHistory: number;
  errors: string[];
}

/** Read all rows from one object store, or [] if the store/DB is absent. */
async function readStore(dbName: string, storeName: string): Promise<unknown[]> {
  // Open without a version so we never trigger an upgrade on the user's DB.
  const db = await openDB(dbName);
  try {
    if (!db.objectStoreNames.contains(storeName)) return [];
    return await db.getAll(storeName);
  } finally {
    db.close();
  }
}

async function migrateStore(
  report: MigrateReport,
  field: keyof Omit<MigrateReport, 'errors'>,
  dbName: string,
  storeName: string,
  collection: string,
  keyOf: (row: any) => string,
): Promise<void> {
  try {
    const rows = await readStore(dbName, storeName);
    await saveCollection(collection, rows as Record<string, unknown>[], keyOf);
    report[field] = rows.length;
  } catch (e) {
    report.errors.push(`${dbName}/${storeName} → ${collection}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function migrateBrowserStoresToPostgres(): Promise<MigrateReport> {
  const report: MigrateReport = {
    actionItems: 0, merchantMappings: 0, accounts: 0, equity: 0,
    monthlyInvestments: 0, snapshots: 0, chatHistory: 0, errors: [],
  };

  // iris-actions
  await migrateStore(report, 'actionItems', 'iris-actions', 'items', 'actionItems', (r) => String(r.id));
  await migrateStore(report, 'merchantMappings', 'iris-actions', 'merchantMappings', 'merchantMappings', (r) => String(r.original));

  // iris-portfolio
  await migrateStore(report, 'accounts', 'iris-portfolio', 'accounts', 'accounts', (r) => String(r.id));
  await migrateStore(report, 'equity', 'iris-portfolio', 'equity', 'equity', (r) => String(r.company || 'default'));
  await migrateStore(report, 'monthlyInvestments', 'iris-portfolio', 'monthlyInvestments', 'monthlyInvestments', (r) => String(r.id));
  await migrateStore(report, 'snapshots', 'iris-portfolio', 'snapshots', 'snapshots', (r) => String(r.date));
  await migrateStore(report, 'chatHistory', 'iris-portfolio', 'chatHistory', 'chatHistory', (r) => String(r.id));

  // eslint-disable-next-line no-console
  console.info('[iris] browser-store migration complete:', report);
  return report;
}

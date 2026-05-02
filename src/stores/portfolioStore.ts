import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Account, EquityProfile, UserProfile, MonthlyInvestment, PortfolioSnapshot, ChatMessage } from '../types/portfolio';

interface SignalDB extends DBSchema {
  accounts: { key: string; value: Account };
  equity: { key: string; value: EquityProfile };
  userProfile: { key: string; value: UserProfile };
  monthlyInvestments: { key: string; value: MonthlyInvestment };
  snapshots: { key: string; value: PortfolioSnapshot; indexes: { 'by-date': string } };
  chatHistory: { key: string; value: ChatMessage; indexes: { 'by-timestamp': string } };
  settings: { key: string; value: { key: string; value: string } };
}

let dbInstance: IDBPDatabase<SignalDB> | null = null;

async function getDB(): Promise<IDBPDatabase<SignalDB>> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<SignalDB>('iris-portfolio', 1, {
    upgrade(db) {
      db.createObjectStore('accounts', { keyPath: 'id' });
      db.createObjectStore('equity', { keyPath: 'company' });
      db.createObjectStore('userProfile', { keyPath: 'name' });
      db.createObjectStore('monthlyInvestments', { keyPath: 'id' });
      const snapshotStore = db.createObjectStore('snapshots', { keyPath: 'date' });
      snapshotStore.createIndex('by-date', 'date');
      const chatStore = db.createObjectStore('chatHistory', { keyPath: 'id' });
      chatStore.createIndex('by-timestamp', 'timestamp');
      db.createObjectStore('settings', { keyPath: 'key' });
    },
  });
  return dbInstance;
}

// Accounts
export async function getAllAccounts(): Promise<Account[]> {
  const db = await getDB();
  return db.getAll('accounts');
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const db = await getDB();
  return db.get('accounts', id);
}

export async function saveAccount(account: Account): Promise<void> {
  const db = await getDB();
  account.totalValue = account.holdings.reduce((sum, h) => sum + h.currentValue, 0);
  account.lastUpdated = new Date().toISOString();
  await db.put('accounts', account);
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('accounts', id);
}

// Equity
export async function getEquityProfile(): Promise<EquityProfile | undefined> {
  const db = await getDB();
  const all = await db.getAll('equity');
  return all[0];
}

export async function saveEquityProfile(profile: EquityProfile): Promise<void> {
  const db = await getDB();
  await db.put('equity', profile);
}

// User Profile
export async function getUserProfile(): Promise<UserProfile | undefined> {
  const db = await getDB();
  const all = await db.getAll('userProfile');
  return all[0];
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const db = await getDB();
  // Store uses keyPath:'name'. If the user changes their name (or upgrades
  // from the empty-name default to a real name), naive `put` leaves the old
  // record behind and `getUserProfile` returns the wrong (older) one.
  // Clear-and-write keeps the store as a singleton.
  await db.clear('userProfile');
  await db.put('userProfile', profile);
}

// Monthly Investments
export async function getMonthlyInvestments(): Promise<MonthlyInvestment[]> {
  const db = await getDB();
  return db.getAll('monthlyInvestments');
}

export async function saveMonthlyInvestment(inv: MonthlyInvestment): Promise<void> {
  const db = await getDB();
  await db.put('monthlyInvestments', inv);
}

// Chat History
export async function getChatHistory(): Promise<ChatMessage[]> {
  const db = await getDB();
  const messages = await db.getAll('chatHistory');
  return messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function saveChatMessage(msg: ChatMessage): Promise<void> {
  const db = await getDB();
  await db.put('chatHistory', msg);
}

export async function clearChatHistory(): Promise<void> {
  const db = await getDB();
  await db.clear('chatHistory');
}

// Settings
//
// Storage shape: every setting value is JSON-encoded on write. Reads attempt
// JSON.parse first; if the stored value isn't valid JSON (legacy raw-string
// data from before this change), fall back to returning the raw string.
//
// Generic signatures let callers state their expected type:
//   getSetting<NotificationPreferences>(key)
//   saveSetting('enabled_modules', ['investments', 'equity'])
// Default T is string for backward source compatibility.
export async function getSetting<T = string>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const result = await db.get('settings', key);
  if (result?.value === undefined) return undefined;
  const raw = result.value;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

export async function saveSetting<T = unknown>(key: string, value: T): Promise<void> {
  const db = await getDB();
  // Always JSON-encode so reads can round-trip arbitrary types. Strings get
  // wrapped in quotes; objects/arrays/numbers get standard JSON encoding.
  await db.put('settings', { key, value: JSON.stringify(value) });
}

// Snapshots
export async function saveSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
  const db = await getDB();
  await db.put('snapshots', snapshot);
}

export async function getSnapshots(): Promise<PortfolioSnapshot[]> {
  const db = await getDB();
  return db.getAllFromIndex('snapshots', 'by-date');
}

/** Clear all snapshots (used after migrations change portfolio values to prevent phantom chart swings) */
export async function clearSnapshots(): Promise<void> {
  const db = await getDB();
  await db.clear('snapshots');
}

// ─── Market Intelligence Persistence ───

export async function saveMarketReport(report: unknown): Promise<void> {
  await saveSetting('market_intelligence_report', JSON.stringify(report));
}

export async function loadMarketReport(): Promise<unknown | null> {
  const raw = await getSetting('market_intelligence_report');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveMarketAnnotations(annotations: { checkedIds: string[]; pinnedItems: unknown[] }): Promise<void> {
  await saveSetting('market_intelligence_annotations', JSON.stringify(annotations));
}

export async function loadMarketAnnotations(): Promise<{ checkedIds: string[]; pinnedItems: unknown[] } | null> {
  const raw = await getSetting('market_intelligence_annotations');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ─── Nudge Management ───

/** List all dismiss records (keys prefixed with "nudge_dismiss::"). Returns raw JSON-parsed values. */
export async function listNudgeDismisses(): Promise<unknown[]> {
  const db = await getDB();
  const all = await db.getAll('settings');
  const out: unknown[] = [];
  for (const row of all) {
    if (!row.key.startsWith('nudge_dismiss::')) continue;
    try { out.push(JSON.parse(row.value)); } catch { /* ignore malformed */ }
  }
  return out;
}

export async function deleteNudgeDismiss(nudgeId: string): Promise<void> {
  const db = await getDB();
  await db.delete('settings', 'nudge_dismiss::' + nudgeId);
}

export async function clearAllNudgeDismisses(): Promise<void> {
  const db = await getDB();
  const all = await db.getAll('settings');
  const tx = db.transaction('settings', 'readwrite');
  for (const row of all) {
    if (row.key.startsWith('nudge_dismiss::')) await tx.store.delete(row.key);
  }
  await tx.done;
}

// ─── Data Management ───

// Reset portfolio accounts to defaults (will re-populate on next load)
export async function clearAllAccounts(): Promise<void> {
  const db = await getDB();
  await db.clear('accounts');
}

// Reset equity data
export async function clearEquity(): Promise<void> {
  const db = await getDB();
  await db.clear('equity');
}

// Reset user profile
export async function clearUserProfile(): Promise<void> {
  const db = await getDB();
  await db.clear('userProfile');
}

// Nuclear: clear everything in portfolio DB (accounts, equity, profile, investments, chat, settings)
export async function clearAllPortfolioData(): Promise<void> {
  const db = await getDB();
  await db.clear('accounts');
  await db.clear('equity');
  await db.clear('userProfile');
  await db.clear('monthlyInvestments');
  await db.clear('snapshots');
  await db.clear('chatHistory');
  await db.clear('settings');
}

// Close + drop cached connection so the next call reopens fresh.
// Used by full-wipe flows (clearAllUserData) before deleteDatabase().
export function closePortfolioDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

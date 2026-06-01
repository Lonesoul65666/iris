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

// User Profile — Postgres-backed via the settings layer (Build-D2c, 2026-05-10).
// Stored as a single JSON blob under settings key 'user_profile'. The Postgres
// `users` table (identity / user_id) stays separate from this app-profile object.
export async function getUserProfile(): Promise<UserProfile | undefined> {
  return getSetting<UserProfile>('user_profile');
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await saveSetting('user_profile', profile);
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

// Settings — Postgres-backed via /api/settings (Build-D2c, 2026-05-10).
//
// Reimplemented to call the user-owned Postgres `settings` table instead of the
// per-browser IndexedDB store. This is the keystone that makes auth (auth_users
// / PINs), enabled_modules, onboarding state, and nudge dismisses
// browser-independent. Values round-trip as native JSON (jsonb) — NO manual
// stringify/parse (the server stores `value::jsonb` and returns it parsed).
//
// Requires the pool to be connected; main.tsx awaits bootstrapDbConnection()
// before mounting <App/>, so all component-level calls are safe.
async function settingsApi<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function getSetting<T = string>(key: string): Promise<T | undefined> {
  const res = await fetch(`/api/settings/get/${encodeURIComponent(key)}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`[iris api] settings/get ${key} → ${res.status}`);
  const body = (await res.json()) as { ok: boolean; value?: T };
  return body.value;
}

export async function saveSetting<T = unknown>(key: string, value: T): Promise<void> {
  await settingsApi('/api/settings/save', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  });
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

// Values round-trip as native JSON now (Build-D2c) — no manual stringify/parse.
export async function saveMarketReport(report: unknown): Promise<void> {
  await saveSetting('market_intelligence_report', report);
}

export async function loadMarketReport(): Promise<unknown | null> {
  return (await getSetting<unknown>('market_intelligence_report')) ?? null;
}

export async function saveMarketAnnotations(annotations: { checkedIds: string[]; pinnedItems: unknown[] }): Promise<void> {
  await saveSetting('market_intelligence_annotations', annotations);
}

export async function loadMarketAnnotations(): Promise<{ checkedIds: string[]; pinnedItems: unknown[] } | null> {
  return (await getSetting<{ checkedIds: string[]; pinnedItems: unknown[] }>('market_intelligence_annotations')) ?? null;
}

// ─── Nudge Management (Postgres-backed via /api/settings, Build-D2c) ───

interface SettingsListItem { key: string; value: unknown; updatedAt: string }

/** List all dismiss records (keys prefixed with "nudge_dismiss::"). */
export async function listNudgeDismisses(): Promise<unknown[]> {
  const body = await settingsApi<{ ok: boolean; items: SettingsListItem[] }>('/api/settings/list');
  return body.items.filter((i) => i.key.startsWith('nudge_dismiss::')).map((i) => i.value);
}

export async function deleteNudgeDismiss(nudgeId: string): Promise<void> {
  await settingsApi('/api/settings/delete', {
    method: 'POST',
    body: JSON.stringify({ key: 'nudge_dismiss::' + nudgeId }),
  });
}

export async function clearAllNudgeDismisses(): Promise<void> {
  const body = await settingsApi<{ ok: boolean; items: SettingsListItem[] }>('/api/settings/list');
  const keys = body.items.map((i) => i.key).filter((k) => k.startsWith('nudge_dismiss::'));
  if (keys.length > 0) {
    await settingsApi('/api/settings/delete', { method: 'POST', body: JSON.stringify({ keys }) });
  }
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

// Reset user profile (Postgres-backed via settings, Build-D2c).
export async function clearUserProfile(): Promise<void> {
  await settingsApi('/api/settings/delete', {
    method: 'POST',
    body: JSON.stringify({ key: 'user_profile' }),
  });
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

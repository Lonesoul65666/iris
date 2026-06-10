// Portfolio store — Postgres-backed.
//
// As of 2026-06-10 (de-browser store migration), accounts / equity / monthly
// investments / snapshots / chat history moved off per-browser IndexedDB into
// the user-owned Postgres `collections` table (via collectionsClient). Combined
// with settings/userProfile (already Postgres since Build-D2c), the whole
// portfolio store is now device-agnostic — Edge, Chrome, Firefox, any profile
// read the same data. Function signatures are unchanged so the ~consumers
// (PortfolioView, AppDataContext, DataBackup, actionStore exec engine) are
// untouched.
//
// IndexedDB is no longer read or written here. closePortfolioDB() is retained
// as a no-op for sampleData.clearAllUserData(), which still scrubs any residual
// iris-* IndexedDB databases as defense-in-depth.

import type { Account, EquityProfile, UserProfile, MonthlyInvestment, PortfolioSnapshot, ChatMessage } from '../types/portfolio';
import { listCollection, saveCollectionItem, deleteCollectionKey, clearCollection } from '../lib/collectionsClient';

// Accounts
export async function getAllAccounts(): Promise<Account[]> {
  return listCollection<Account>('accounts');
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const all = await getAllAccounts();
  return all.find((a) => a.id === id);
}

export async function saveAccount(account: Account): Promise<void> {
  account.totalValue = account.holdings.reduce((sum, h) => sum + h.currentValue, 0);
  account.lastUpdated = new Date().toISOString();
  await saveCollectionItem('accounts', account, (a) => a.id);
}

export async function deleteAccount(id: string): Promise<void> {
  await deleteCollectionKey('accounts', id);
}

// Equity — a single profile in practice; keyed by company so multiple is possible.
export async function getEquityProfile(): Promise<EquityProfile | undefined> {
  const all = await listCollection<EquityProfile>('equity');
  return all[0];
}

export async function saveEquityProfile(profile: EquityProfile): Promise<void> {
  await saveCollectionItem('equity', profile, (p) => p.company || 'default');
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
  return listCollection<MonthlyInvestment>('monthlyInvestments');
}

export async function saveMonthlyInvestment(inv: MonthlyInvestment): Promise<void> {
  await saveCollectionItem('monthlyInvestments', inv, (i) => i.id);
}

// Chat History
export async function getChatHistory(): Promise<ChatMessage[]> {
  const messages = await listCollection<ChatMessage>('chatHistory');
  return messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function saveChatMessage(msg: ChatMessage): Promise<void> {
  await saveCollectionItem('chatHistory', msg, (m) => m.id);
}

export async function clearChatHistory(): Promise<void> {
  await clearCollection('chatHistory');
}

// Settings — Postgres-backed via /api/settings (Build-D2c, 2026-05-10).
//
// Values round-trip as native JSON (jsonb) — NO manual stringify/parse (the
// server stores `value::jsonb` and returns it parsed). Requires the pool to be
// connected; main.tsx awaits bootstrapDbConnection() before mounting <App/>,
// so all component-level calls are safe.
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
  await saveCollectionItem('snapshots', snapshot, (s) => s.date);
}

export async function getSnapshots(): Promise<PortfolioSnapshot[]> {
  const all = await listCollection<PortfolioSnapshot>('snapshots');
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

/** Clear all snapshots (used after migrations change portfolio values to prevent phantom chart swings) */
export async function clearSnapshots(): Promise<void> {
  await clearCollection('snapshots');
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

// Reset portfolio accounts (will re-populate from sample/real data on next load)
export async function clearAllAccounts(): Promise<void> {
  await clearCollection('accounts');
}

// Reset equity data
export async function clearEquity(): Promise<void> {
  await clearCollection('equity');
}

// Reset user profile (Postgres-backed via settings, Build-D2c).
export async function clearUserProfile(): Promise<void> {
  await settingsApi('/api/settings/delete', {
    method: 'POST',
    body: JSON.stringify({ key: 'user_profile' }),
  });
}

// Nuclear: clear every portfolio collection (accounts, equity, investments,
// snapshots, chat) + the user-profile setting.
export async function clearAllPortfolioData(): Promise<void> {
  await clearCollection('accounts');
  await clearCollection('equity');
  await clearCollection('monthlyInvestments');
  await clearCollection('snapshots');
  await clearCollection('chatHistory');
  await clearUserProfile();
}

// Retained as a no-op: the store no longer caches an IndexedDB handle. Kept so
// sampleData.clearAllUserData() (which still wipes residual iris-* IDB) compiles.
export function closePortfolioDB(): void {
  /* no-op — Postgres-backed, nothing to close */
}

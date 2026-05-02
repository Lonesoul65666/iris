/**
 * LLM daily cap / rate limiter.
 *
 * Philosophy: cloud calls cost real money. Scott is building Iris as a
 * downloadable local-first app (see project_iris_target) — we cannot let a
 * runaway loop burn through someone's Gemini/Claude/OpenAI budget in a day.
 * Local providers (Ollama) are uncapped since they're free.
 *
 * Storage: per-day counter in the `settings` keyspace. No schema bump.
 *   key: `llm_usage_YYYY-MM-DD`
 *   val: `{ cloud, local, providers: {gemini: n, claude: n, ...}, lastCall }`
 *
 * Policy:
 *   - Only CLOUD calls count against the cap.
 *   - Only SUCCESSFUL calls are recorded (auth/unavailable failures don't burn
 *     the budget — otherwise a misconfigured key could lock the user out).
 *   - When cap is hit, the router skips cloud providers and tries local;
 *     if none are available, throws a rate-limit error so the UI can show
 *     "cap hit — here's what's queued" state.
 *
 * Default cap: 50 cloud calls/day. Tuneable in Settings.
 */

import { getSetting, saveSetting } from '../../stores/portfolioStore';

const DEFAULT_DAILY_CAP = 50;
const CAP_SETTING_KEY = 'llm_daily_cap';

export interface UsageRecord {
  date: string;             // YYYY-MM-DD
  cloud: number;            // successful cloud calls today
  local: number;            // successful local calls today (not capped, here for UI)
  providers: Record<string, number>;
  lastCallAt: string | null;
}

export type ProviderKind = 'cloud' | 'local';

function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function usageSettingKey(dateStr: string): string {
  return `llm_usage_${dateStr}`;
}

function emptyRecord(dateStr: string): UsageRecord {
  return { date: dateStr, cloud: 0, local: 0, providers: {}, lastCallAt: null };
}

// ─── Listener plumbing — lets UI components reactively display remaining budget.

type Listener = (r: UsageRecord) => void;
const listeners = new Set<Listener>();

export function subscribeUsage(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(r: UsageRecord): void {
  for (const fn of listeners) {
    try { fn(r); } catch { /* swallow */ }
  }
}

// ─── Cap getter / setter.

export async function getDailyCap(): Promise<number> {
  const raw = await getSetting(CAP_SETTING_KEY);
  if (!raw) return DEFAULT_DAILY_CAP;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAILY_CAP;
  return n;
}

export async function setDailyCap(n: number): Promise<void> {
  if (!Number.isFinite(n) || n <= 0) throw new Error('Daily cap must be a positive number');
  await saveSetting(CAP_SETTING_KEY, String(Math.floor(n)));
}

// ─── Usage getters.

export async function getUsageToday(now = new Date()): Promise<UsageRecord> {
  const dateStr = todayKey(now);
  const raw = await getSetting(usageSettingKey(dateStr));
  if (!raw) return emptyRecord(dateStr);
  try {
    const parsed = JSON.parse(raw) as UsageRecord;
    if (parsed.date !== dateStr) return emptyRecord(dateStr);
    // Defensive: ensure all fields exist (migrations from older shape).
    return {
      date: parsed.date,
      cloud: parsed.cloud ?? 0,
      local: parsed.local ?? 0,
      providers: parsed.providers ?? {},
      lastCallAt: parsed.lastCallAt ?? null,
    };
  } catch {
    return emptyRecord(dateStr);
  }
}

export async function remainingCloudToday(now = new Date()): Promise<number> {
  const [cap, usage] = await Promise.all([getDailyCap(), getUsageToday(now)]);
  return Math.max(0, cap - usage.cloud);
}

export async function canMakeCloudCall(now = new Date()): Promise<boolean> {
  const remaining = await remainingCloudToday(now);
  return remaining > 0;
}

// ─── Recording calls (only on success).

export async function recordCall(
  providerId: string,
  kind: ProviderKind,
  now = new Date(),
): Promise<UsageRecord> {
  const record = await getUsageToday(now);
  if (kind === 'cloud') record.cloud += 1;
  else record.local += 1;
  record.providers[providerId] = (record.providers[providerId] ?? 0) + 1;
  record.lastCallAt = now.toISOString();
  await saveSetting(usageSettingKey(record.date), JSON.stringify(record));
  notify(record);
  return record;
}

// ─── Reset (mostly for testing / "reset today" button in Settings).

export async function resetUsageToday(now = new Date()): Promise<UsageRecord> {
  const dateStr = todayKey(now);
  const record = emptyRecord(dateStr);
  await saveSetting(usageSettingKey(dateStr), JSON.stringify(record));
  notify(record);
  return record;
}

// ─── Human-readable helpers for UI copy.

export async function usageSummary(now = new Date()): Promise<{
  cap: number;
  used: number;
  remaining: number;
  local: number;
  percent: number;
  dangerZone: boolean;
}> {
  const [cap, usage] = await Promise.all([getDailyCap(), getUsageToday(now)]);
  const used = usage.cloud;
  const remaining = Math.max(0, cap - used);
  const percent = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return {
    cap,
    used,
    remaining,
    local: usage.local,
    percent,
    dangerZone: remaining <= Math.max(3, Math.ceil(cap * 0.1)),
  };
}

export { DEFAULT_DAILY_CAP };

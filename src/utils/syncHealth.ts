// Sync-health → Proactive Iris nudges. Turns the last Teller sync outcome +
// freshness into clear "here's what needs attention and when" cards so data
// never silently goes stale behind a rate limit or a dead connection.
// (Scott, 2026-07-06: "don't miss stuff due to constant rate limits.")
//
// Rate limits surface indirectly-but-reliably: a 429'd bank lands in failedBanks
// AND a partial sync does NOT advance the freshness clock, so the staleness
// nudge keeps firing until a clean pull lands. Pure + testable.

import type { Nudge } from './nudgeEngine';
import type { SyncSummary } from '../lib/syncTellerTransactions';
import { STALE_HOURS } from '../lib/syncTellerTransactions';

const list = (banks: string[]): string => {
  if (banks.length <= 1) return banks[0] ?? '';
  if (banks.length === 2) return `${banks[0]} and ${banks[1]}`;
  return `${banks.slice(0, -1).join(', ')}, and ${banks[banks.length - 1]}`;
};

const days = (hours: number): string => {
  const d = Math.round(hours / 24);
  return d <= 1 ? 'a day' : `${d} days`;
};

/** Warning/critical nudges for anything wrong with data freshness. Empty when
 *  everything's current. Order = most urgent first (reconnect > incomplete >
 *  stale). Caller renders via NudgeCard. */
export function syncHealthNudges(
  summary: SyncSummary | null,
  hoursSinceLastSync: number | null,
  _now: Date = new Date(),
): Nudge[] {
  const out: Nudge[] = [];

  // 1. Dead connections — nothing will sync until reconnected. Most urgent.
  if (summary && summary.brokenBanks.length > 0) {
    const banks = list(summary.brokenBanks);
    out.push({
      id: `sync_broken:${summary.brokenBanks.slice().sort().join(',')}`,
      severity: 'critical',
      category: 'cadence',
      icon: '🔌',
      title: `${banks} ${summary.brokenBanks.length === 1 ? 'needs' : 'need'} reconnecting`,
      body: `${banks} lost ${summary.brokenBanks.length === 1 ? 'its' : 'their'} connection — no new data will come in until you reconnect in Settings. Everything already imported is safe.`,
      primary: { label: 'Reconnect in Settings', view: 'settings' },
      snoozeDays: 1,
    });
  }

  // 2. Incomplete last pull (a bank errored / was rate-limited) — data may be
  //    missing. The staleness clock didn't advance, so a re-sync is worth it.
  if (summary && summary.failedBanks.length > 0) {
    const banks = list(summary.failedBanks);
    out.push({
      id: `sync_incomplete:${summary.failedBanks.slice().sort().join(',')}`,
      severity: 'warning',
      category: 'cadence',
      icon: '⚠️',
      title: `Last refresh was incomplete`,
      body: `${banks} didn't fully respond last time (busy or rate-limited), so some recent transactions may be missing. Hit ↻ Refresh again in a few minutes to fill the gap — Iris won't count the clock as current until a clean pull lands.`,
      snoozeDays: 1,
    });
  }

  // 3. Just plain stale — hasn't refreshed in a while (only if not already
  //    covered by a broken/failed warning above).
  if (out.length === 0 && hoursSinceLastSync !== null && hoursSinceLastSync > STALE_HOURS) {
    out.push({
      id: 'sync_stale',
      severity: 'warning',
      category: 'cadence',
      icon: '🕒',
      title: `Accounts are ${days(hoursSinceLastSync)} stale`,
      body: `Your accounts haven't refreshed in ${days(hoursSinceLastSync)}. Hit ↻ Refresh so you're not budgeting on old numbers — better to pull often than let a rate limit pile up a backlog.`,
      snoozeDays: 1,
    });
  }

  // 4. Never synced at all.
  if (out.length === 0 && hoursSinceLastSync === null && !summary) {
    out.push({
      id: 'sync_never',
      severity: 'info',
      category: 'cadence',
      icon: '🔄',
      title: `Pull your latest transactions`,
      body: `No sync yet this session. Hit ↻ Refresh to pull the newest activity from your banks.`,
      snoozeDays: 1,
    });
  }

  return out;
}

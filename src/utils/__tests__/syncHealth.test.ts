import { describe, it, expect } from 'vitest';
import type { SyncSummary } from '../../lib/syncTellerTransactions';
import { syncHealthNudges } from '../syncHealth';

function summary(over: Partial<SyncSummary> = {}): SyncSummary {
  return {
    syncedAt: '2026-07-06T00:00:00Z', txNew: 0, txUpdated: 0, incomeNew: 0,
    through: '2026-07-05', brokenBanks: [], failedBanks: [], partial: false, ...over,
  };
}

describe('syncHealthNudges', () => {
  it('is silent when everything is fresh', () => {
    expect(syncHealthNudges(summary(), 2)).toEqual([]);
  });

  it('flags broken banks as critical with a reconnect action', () => {
    const [n] = syncHealthNudges(summary({ brokenBanks: ['Citi'] }), 2);
    expect(n.severity).toBe('critical');
    expect(n.title).toMatch(/Citi needs reconnecting/);
    expect(n.primary?.view).toBe('settings');
  });

  it('flags an incomplete/rate-limited pull as a warning', () => {
    const [n] = syncHealthNudges(summary({ failedBanks: ['CapOne'], partial: true }), 2);
    expect(n.severity).toBe('warning');
    expect(n.title).toMatch(/incomplete/i);
    expect(n.body).toMatch(/rate-limited/i);
  });

  it('flags staleness only when nothing more urgent applies', () => {
    // stale but also broken → only the broken (critical) one, no stale dup
    const broken = syncHealthNudges(summary({ brokenBanks: ['Citi'] }), 200);
    expect(broken).toHaveLength(1);
    expect(broken[0].severity).toBe('critical');
    // stale alone → the stale warning
    const [stale] = syncHealthNudges(summary(), 200);
    expect(stale.id).toBe('sync_stale');
    expect(stale.title).toMatch(/stale/);
  });

  it('surfaces a never-synced prompt', () => {
    const [n] = syncHealthNudges(null, null);
    expect(n.id).toBe('sync_never');
  });
});

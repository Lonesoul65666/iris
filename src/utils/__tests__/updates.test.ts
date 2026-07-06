import { describe, it, expect } from 'vitest';
import { whatsNewNudge, LATEST_UPDATE, type UpdateEntry } from '../../updates';

const entry: UpdateEntry = {
  version: '2026.07.06',
  date: '2026-07-06',
  title: 'Test update',
  notes: ['first thing', 'second thing'],
};

describe('whatsNewNudge', () => {
  it('shows a one-shot celebration nudge when the version is unseen', () => {
    const n = whatsNewNudge(null, entry);
    expect(n).not.toBeNull();
    expect(n!.id).toBe('whatsnew:2026.07.06');
    expect(n!.oneShot).toBe(true);
    expect(n!.severity).toBe('celebration');
    expect(n!.body).toContain('first thing');
    expect(n!.body).toContain('second thing');
  });

  it('returns null once the current version has been seen', () => {
    expect(whatsNewNudge('2026.07.06', entry)).toBeNull();
  });

  it('re-appears when a newer version ships', () => {
    // User last saw an older version → the newer entry still surfaces.
    expect(whatsNewNudge('2026.06.01', entry)).not.toBeNull();
  });

  it('defaults to the real LATEST_UPDATE and is self-consistent', () => {
    expect(whatsNewNudge(LATEST_UPDATE.version)).toBeNull();
    expect(whatsNewNudge(null)?.id).toBe(`whatsnew:${LATEST_UPDATE.version}`);
  });
});

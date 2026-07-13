import { describe, it, expect } from 'vitest';
import { buildSubscriptionNudges } from '../subscriptionNudges';
import type { RadarItem, SubscriptionRadar } from '../subscriptionRadar';

function item(over: Partial<RadarItem> & Pick<RadarItem, 'merchant'>): RadarItem {
  return {
    monthlyCost: 10,
    chargeAmount: 10,
    cadence: 'monthly',
    category: 'subscriptions',
    confidence: 0.9,
    lastDate: '2026-07-10',
    status: 'active',
    resurrected: false,
    ...over,
  };
}

function radar(over: Partial<SubscriptionRadar> = {}): SubscriptionRadar {
  return { items: [], canceled: [], ignored: [], totalMonthly: 0, totalAnnual: 0, count: 0, ...over };
}

describe('buildSubscriptionNudges', () => {
  it('emits a resurrection nudge for a canceled charge that billed again', () => {
    const r = radar({ canceled: [item({ merchant: 'SUNO', status: 'canceled', resurrected: true })] });
    const { nudges } = buildSubscriptionNudges(r, ['netflix']);
    expect(nudges).toHaveLength(1);
    expect(nudges[0].id).toBe('sub-resurrected:suno');
    expect(nudges[0].severity).toBe('warning');
  });

  it('does not emit resurrection for a canceled charge that has not billed again', () => {
    const r = radar({ canceled: [item({ merchant: 'SUNO', status: 'canceled', resurrected: false })] });
    expect(buildSubscriptionNudges(r, ['netflix']).nudges).toHaveLength(0);
  });

  it('emits a new-charge nudge for an active merchant not in the baseline', () => {
    const r = radar({ items: [item({ merchant: 'NewThing' })], count: 1 });
    const { nudges, newMerchants } = buildSubscriptionNudges(r, ['netflix']);
    expect(newMerchants).toEqual(['NewThing']);
    expect(nudges).toHaveLength(1);
    expect(nudges[0].id).toBe('sub-new:newthing');
  });

  it('stays SILENT on first run (null baseline) even though it reports the new merchants', () => {
    const r = radar({ items: [item({ merchant: 'NewThing' })], count: 1 });
    const { nudges, newMerchants } = buildSubscriptionNudges(r, null);
    expect(newMerchants).toEqual(['NewThing']); // reported so the caller can seed
    expect(nudges).toHaveLength(0);             // but no alert fired
  });

  it('does not re-alert a merchant already in the baseline', () => {
    const r = radar({ items: [item({ merchant: 'Netflix' })], count: 1 });
    expect(buildSubscriptionNudges(r, ['netflix']).nudges).toHaveLength(0);
  });
});

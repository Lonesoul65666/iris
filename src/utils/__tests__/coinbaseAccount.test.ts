import { describe, it, expect } from 'vitest';
import { buildCoinbaseAccount } from '../../lib/syncCoinbaseBalances';

const priced = [
  { currency: 'BTC', amount: 0.25, name: 'BTC Wallet', priceUsd: 60_000, valueUsd: 15_000 },
  { currency: 'USD', amount: 140.5, name: 'Cash (USD)', priceUsd: 1, valueUsd: 140.5 },
  { currency: 'ETH', amount: 2, name: 'ETH Wallet', priceUsd: 3_000, valueUsd: 6_000 },
  { currency: 'WEIRD', amount: 10, name: 'Weird', priceUsd: null, valueUsd: null },
];

describe('buildCoinbaseAccount', () => {
  const acct = buildCoinbaseAccount(priced, '2026-08-20');

  it('is one crypto account whose value is the sum of its priced holdings', () => {
    expect(acct.type).toBe('crypto');
    expect(acct.id).toBe('coinbase');          // fixed id → re-sync updates in place
    expect(acct.totalValue).toBe(21_140.5);
  });

  it('writes REAL per-coin positions, biggest first', () => {
    // Unlike the Plaid investment accounts (one synthetic "HOLDINGS" lump),
    // Coinbase's own API gives the actual wallets.
    expect(acct.holdings.map(h => h.ticker)).toEqual(['BTC', 'ETH', 'USD']);
    expect(acct.holdings[0]).toMatchObject({ shares: 0.25, currentPrice: 60_000, currentValue: 15_000 });
  });

  it('calls USD sitting in Coinbase cash, not crypto', () => {
    // Otherwise every "how much crypto do we hold" chart is wrong.
    expect(acct.holdings.find(h => h.ticker === 'USD')!.assetClass).toBe('cash');
    expect(acct.holdings.find(h => h.ticker === 'BTC')!.assetClass).toBe('crypto');
  });

  it('drops an unpriced asset rather than valuing it at zero', () => {
    expect(acct.holdings.some(h => h.ticker === 'WEIRD')).toBe(false);
  });

  it('reports no gain/loss rather than inventing a cost basis', () => {
    // The endpoint carries no basis; a made-up one would manufacture a fake gain.
    expect(acct.holdings.every(h => h.totalGainLoss === 0 && h.avgCostBasis === h.currentPrice)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { investmentAccountType } from '../../lib/syncTellerBalances';

// Plaid reports every non-cash account as type `investment` and leans on the
// SUBTYPE to say what it really is. Getting this wrong doesn't lose money, it
// just files it under the wrong heading — a Coinbase wallet shown as a brokerage.
describe('investmentAccountType', () => {
  it('recognises a crypto exchange', () => {
    for (const s of ['crypto', 'crypto exchange', 'Crypto Exchange']) {
      expect(investmentAccountType(s)).toBe('crypto');
    }
  });

  it('keeps the retirement subtypes apart', () => {
    expect(investmentAccountType('401k')).toBe('401k');
    expect(investmentAccountType('roth')).toBe('roth_ira');
    // A Roth 401(k) is a 401(k) with Roth tax treatment, not a Roth IRA — and
    // '401k' is checked first, so it lands in the right bucket.
    expect(investmentAccountType('roth 401k')).toBe('401k');
    expect(investmentAccountType('ira')).toBe('ira');
    expect(investmentAccountType('hsa')).toBe('hsa');
  });

  it('falls back to brokerage — which is what Robinhood arrives as', () => {
    expect(investmentAccountType('brokerage')).toBe('brokerage');
    expect(investmentAccountType('')).toBe('brokerage');
  });
});

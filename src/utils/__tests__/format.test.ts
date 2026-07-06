import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../format';

describe('formatCurrency', () => {
  it('puts the sign BEFORE the $ for negative millions', () => {
    expect(formatCurrency(-2_500_000)).toBe('-$2.5M');
  });
  it('formats positive millions', () => {
    expect(formatCurrency(2_500_000)).toBe('$2.5M');
  });
  it('formats sub-million with no cents', () => {
    expect(formatCurrency(546_645)).toBe('$546,645');
    expect(formatCurrency(-1200)).toBe('-$1,200');
  });
});

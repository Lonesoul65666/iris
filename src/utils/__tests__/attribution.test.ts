import { describe, it, expect } from 'vitest';
import type { Expense, Earner, SourceOwner } from '../../types/budget';
import { JOINT, buildOwnerMap, effectiveSpender, spenderName, nextSpender } from '../attribution';

const earners: Earner[] = [
  { id: 'earner-scott', name: 'Scott', isWorking: true },
  { id: 'earner-claire', name: 'Claire', isWorking: false },
];

const owners: SourceOwner[] = [
  { source: 'credit_card_1', owner: 'earner-scott' },
  { source: 'bofa_joint', owner: JOINT },
];

function exp(over: Partial<Expense>): Expense {
  return {
    id: 'x', date: '2026-06-01', description: 'test', amount: 10,
    category: 'amazon', reimbursementStatus: 'not_reimbursable',
    isWorkExpense: false, recurring: false,
    ...over,
  };
}

describe('effectiveSpender', () => {
  const map = buildOwnerMap(owners);

  it('per-transaction override beats the account owner', () => {
    const e = exp({ source: 'credit_card_1', spender: 'earner-claire' });
    expect(effectiveSpender(e, map)).toBe('earner-claire');
  });

  it('falls back to the account owner', () => {
    expect(effectiveSpender(exp({ source: 'credit_card_1' }), map)).toBe('earner-scott');
  });

  it('unmapped account = joint — never guesses', () => {
    expect(effectiveSpender(exp({ source: 'credit_card_2' }), map)).toBe(JOINT);
    expect(effectiveSpender(exp({}), map)).toBe(JOINT);
  });
});

describe('spenderName', () => {
  it('resolves earner ids and the joint id', () => {
    expect(spenderName('earner-scott', earners)).toBe('Scott');
    expect(spenderName(JOINT, earners)).toBe('Ours');
  });

  it('shows the raw id for a deleted earner rather than lying', () => {
    expect(spenderName('earner-gone', earners)).toBe('earner-gone');
  });
});

describe('nextSpender cycle', () => {
  it('walks inherit → each earner → ours → inherit', () => {
    expect(nextSpender(undefined, earners)).toBe('earner-scott');
    expect(nextSpender('earner-scott', earners)).toBe('earner-claire');
    expect(nextSpender('earner-claire', earners)).toBe(JOINT);
    expect(nextSpender(JOINT, earners)).toBeUndefined();
  });

  it('resets unknown values to inherit', () => {
    expect(nextSpender('earner-deleted', earners)).toBeUndefined();
  });

  it('still works with zero earners configured', () => {
    expect(nextSpender(undefined, [])).toBe(JOINT);
    expect(nextSpender(JOINT, [])).toBeUndefined();
  });
});

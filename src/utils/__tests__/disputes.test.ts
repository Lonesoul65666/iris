import { describe, it, expect } from 'vitest';
import {
  findCandidateCredit, listOpenDisputes, listCashOutNeedingCall,
  markDisputed, resolveDisputeWon, resolveDisputeLost, clearDispute,
  STALE_DISPUTE_DAYS, MATCH_WINDOW_DAYS, CASH_OUT_LOOKBACK_DAYS, isBankFee,
} from '../disputes';
import { computeMonthlySpending, isRealExpense } from '../transactionAnalysis';
import type { Expense } from '../../types/budget';

const NOW = new Date(2026, 7, 20); // Aug 20, 2026

function ex(p: Partial<Expense>): Expense {
  return {
    id: p.id ?? 'e1', date: p.date ?? '2026-08-08', description: p.description ?? 'LINKS CAR WASH',
    amount: p.amount ?? 34.99, category: p.category ?? 'fun_wife',
    reimbursementStatus: 'not_reimbursable', isWorkExpense: false, recurring: false,
    flow: 'outflow', transactionType: 'expense', ...p,
  } as Expense;
}
const credit = (p: Partial<Expense>) => ex({ flow: 'inflow', transactionType: 'refund', category: 'other', ...p });

const CHARGE = ex({ id: 'chg', date: '2026-08-08', amount: 34.99, category: 'fun_wife' });
const CREDIT = credit({ id: 'crd', date: '2026-08-11', amount: 34.99, description: 'CITIBANK CONDITIONAL CREDIT FOR DISPUTE' });

describe('findCandidateCredit — Iris offers, Scott confirms', () => {
  it('matches an unclaimed same-amount refund on/after the charge', () => {
    expect(findCandidateCredit(CHARGE, [CHARGE, CREDIT])?.id).toBe('crd');
  });

  it('matches a SAME-DAY credit (how every one of Scott\'s Citi credits actually posts)', () => {
    const sameDay = credit({ id: 'sd', date: '2026-08-08', amount: 34.99 });
    expect(findCandidateCredit(CHARGE, [CHARGE, sameDay])?.id).toBe('sd');
  });

  it('returns null while the credit has not arrived — the normal open state', () => {
    expect(findCandidateCredit(CHARGE, [CHARGE])).toBeNull();
  });

  it('ignores a credit for a different amount', () => {
    expect(findCandidateCredit(CHARGE, [CHARGE, credit({ id: 'x', amount: 17.5 })])).toBeNull();
  });

  it('ignores a credit BEFORE the charge', () => {
    expect(findCandidateCredit(CHARGE, [CHARGE, credit({ id: 'x', date: '2026-08-01', amount: 34.99 })])).toBeNull();
  });

  it('ignores a coincidence outside the match window', () => {
    const late = credit({ id: 'late', date: '2027-01-01', amount: 34.99 });
    expect(findCandidateCredit(CHARGE, [CHARGE, late])).toBeNull();
    expect(MATCH_WINDOW_DAYS).toBe(120);
  });

  it('never offers a credit already claimed by another dispute', () => {
    const other = ex({ id: 'other', date: '2026-08-05', amount: 34.99, disputeStatus: 'won', disputeCreditId: 'crd' });
    expect(findCandidateCredit(CHARGE, [CHARGE, other, CREDIT])).toBeNull();
  });

  it('picks the NEAREST credit when several qualify', () => {
    const far = credit({ id: 'far', date: '2026-09-01', amount: 34.99 });
    const near = credit({ id: 'near', date: '2026-08-09', amount: 34.99 });
    expect(findCandidateCredit(CHARGE, [CHARGE, far, near])?.id).toBe('near');
  });
});

describe('spend math — the double-count guard', () => {
  const month = (list: Expense[]) => computeMonthlySpending(list).find(m => m.month === '2026-08')!;

  it('an ordinary charge counts', () => {
    const m = month([CHARGE]);
    expect(m.totalExpenses).toBeCloseTo(34.99);
    expect(m.byCategory.fun_wife).toBeCloseTo(34.99);
    expect(m.totalDisputed).toBe(0);
  });

  it('OPEN dispute leaves spend but is still visible as disputed', () => {
    const m = month([{ ...CHARGE, ...markDisputed(NOW) }]);
    expect(m.totalExpenses).toBe(0);
    expect(m.byCategory.fun_wife).toBeUndefined(); // stops eating Claire's fun money
    expect(m.totalDisputed).toBeCloseTo(34.99);    // not hidden
    expect(isRealExpense({ ...CHARGE, ...markDisputed(NOW) })).toBe(false);
  });

  it('⭐ WON nets to ZERO — charge excluded AND credit suppressed, not both counted', () => {
    const r = resolveDisputeWon(CHARGE, CREDIT, NOW);
    const m = month([{ ...CHARGE, ...r.charge }, { ...CREDIT, ...r.credit! }]);
    expect(m.totalExpenses).toBe(0);
    expect(m.totalOperating).toBe(0);
    expect(m.byCategory.other).toBeUndefined(); // the credit does NOT net anywhere
    expect(m.totalDisputed).toBe(0);            // charge in, credit out — square
  });

  it('⭐ the trap: excluding the charge WITHOUT suppressing the credit invents money', () => {
    // Same win, but only the charge patch applied — what a half-done link does.
    const m = month([{ ...CHARGE, disputeStatus: 'won' }, CREDIT]);
    expect(m.totalExpenses).toBeCloseTo(-34.99); // phantom savings
    // ...which the real (both-patch) path does not do:
    const r = resolveDisputeWon(CHARGE, CREDIT, NOW);
    expect(month([{ ...CHARGE, ...r.charge }, { ...CREDIT, ...r.credit! }]).totalExpenses).toBe(0);
  });

  it('LOST puts the charge back as normal spend', () => {
    const { charge } = resolveDisputeLost({ ...CHARGE, disputeStatus: 'open' }, NOW);
    const m = month([{ ...CHARGE, ...charge }]);
    expect(m.totalExpenses).toBeCloseTo(34.99);
    expect(m.byCategory.fun_wife).toBeCloseTo(34.99);
    expect(m.totalDisputed).toBe(0);
  });

  it('winning with no credit posted yet still holds the charge out', () => {
    const r = resolveDisputeWon(CHARGE, null, NOW);
    expect(r.credit).toBeNull();
    expect(month([{ ...CHARGE, ...r.charge }]).totalExpenses).toBe(0);
  });
});

describe('listOpenDisputes — the recall (no digging through transactions)', () => {
  it('lists what is open, oldest first, and flags the stale ones', () => {
    const fresh = { ...ex({ id: 'fresh' }), ...markDisputed(new Date(2026, 7, 18)) };
    const old = { ...ex({ id: 'old', date: '2026-07-01' }), ...markDisputed(new Date(2026, 6, 2)) };
    const list = listOpenDisputes([fresh, old], NOW);
    expect(list.map(d => d.charge.id)).toEqual(['old', 'fresh']);
    expect(list[0].daysOpen).toBeGreaterThanOrEqual(STALE_DISPUTE_DAYS);
    expect(list[0].stale).toBe(true);
    expect(list[1].stale).toBe(false);
  });

  it('surfaces the candidate credit so a resolved dispute can be closed in one click', () => {
    const open = { ...CHARGE, ...markDisputed(new Date(2026, 7, 8)) };
    expect(listOpenDisputes([open, CREDIT], NOW)[0].candidateCredit?.id).toBe('crd');
  });

  it('drops out once resolved — nothing open is ever silently forgotten', () => {
    const won = { ...CHARGE, ...resolveDisputeWon(CHARGE, CREDIT, NOW).charge };
    expect(listOpenDisputes([won, CREDIT], NOW)).toHaveLength(0);
    expect(listOpenDisputes([{ ...CHARGE, disputeStatus: 'lost' }], NOW)).toHaveLength(0);
  });
});

describe('listCashOutNeedingCall — ~10 a year, each wants a human', () => {
  const atm = ex({ id: 'atm', date: '2026-08-06', amount: 204, category: 'atm_cash', description: 'PAI ATM WITHDRWL' });
  const cashapp = ex({ id: 'ca', date: '2026-07-24', amount: 160, category: 'atm_cash', description: 'CASH APP*DALLAS' });

  it('queues unattributed cash-out, newest first', () => {
    expect(listCashOutNeedingCall([cashapp, atm], NOW).map(e => e.id)).toEqual(['atm', 'ca']);
  });

  it('leaves the queue once categorized to where the cash actually went', () => {
    expect(listCashOutNeedingCall([{ ...atm, category: 'entertainment' }], NOW)).toHaveLength(0);
  });

  it('"keep it as ATM/Cash" also clears it', () => {
    expect(listCashOutNeedingCall([{ ...atm, cashOutReviewed: true }], NOW)).toHaveLength(0);
  });

  it('does NOT ask about bank FEES — nothing to attribute', () => {
    // Found in visual review: the queue was asking what a $5 Dubai ATM fee
    // "was for". Fees are real spend but there's no answer to give.
    const fees = [
      ex({ id: 'f1', date: '2026-08-05', amount: 5, category: 'atm_cash', description: '10014413 WITHDRWL Dubai AE FEE' }),
      ex({ id: 'f2', date: '2026-08-05', amount: 8, category: 'atm_cash', description: 'MashreqBank WITHDRWL DUBAI INTERNATIONAL TRANSACTION FEE' }),
    ];
    expect(listCashOutNeedingCall([...fees, atm], NOW).map(e => e.id)).toEqual(['atm']);
  });

  it('only asks about cash recent enough to remember', () => {
    // 11 months of history is a wall of guilt, not a queue.
    const ancient = ex({ id: 'old', date: '2025-09-08', amount: 204, category: 'atm_cash', description: '7ELEVEN-FCTI WITHDRWL' });
    expect(listCashOutNeedingCall([ancient, atm], NOW).map(e => e.id)).toEqual(['atm']);
    expect(CASH_OUT_LOOKBACK_DAYS).toBe(90);
  });

  it('ignores refunds and disputed rows', () => {
    expect(listCashOutNeedingCall([credit({ id: 'r', category: 'atm_cash' })], NOW)).toHaveLength(0);
    expect(listCashOutNeedingCall([{ ...atm, disputeStatus: 'open' }], NOW)).toHaveLength(0);
  });
});

describe('isBankFee', () => {
  it('spots the fee riders, not the withdrawal itself', () => {
    expect(isBankFee('10014413 02/07 WITHDRWL Dubai AE FEE')).toBe(true);
    expect(isBankFee('MashreqBank WITHDRWL DUBAI INTERNATIONAL TRANSACTION FEE')).toBe(true);
    expect(isBankFee('BofA Rewards-ATM Wthdrwl Fee Waiver of $2.50')).toBe(true);
    expect(isBankFee('PAI ATM 08/06 #XXXXX9679 WITHDRWL PAI ATM')).toBe(false);
    expect(isBankFee('CASH APP*DALLAS PMNT SENT')).toBe(false);
  });
});

describe('clearDispute / release', () => {
  it('undo restores an ordinary charge and releases the credit', () => {
    const won = { ...CHARGE, ...resolveDisputeWon(CHARGE, CREDIT, NOW).charge };
    const { charge, releaseCreditId } = clearDispute(won);
    expect(releaseCreditId).toBe('crd');
    expect(charge.disputeStatus).toBeUndefined();
    expect(computeMonthlySpending([{ ...won, ...charge }]).find(m => m.month === '2026-08')!.totalExpenses).toBeCloseTo(34.99);
  });

  it('losing releases the linked credit so it nets normally again', () => {
    const won = { ...CHARGE, ...resolveDisputeWon(CHARGE, CREDIT, NOW).charge };
    expect(resolveDisputeLost(won, NOW).releaseCreditId).toBe('crd');
  });
});

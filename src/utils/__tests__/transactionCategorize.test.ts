import { describe, it, expect } from 'vitest';
import { classifyBankTransaction, guessCategory } from '../transactionCategorize';

// Sign convention: classifyBankTransaction reads the RAW bank amount —
// positive = inflow, negative = outflow.

describe('classifyBankTransaction — outflow merchant rules', () => {
  it('EXXON-style fuel → transportation expense', () => {
    expect(classifyBankTransaction('EXXONMOBIL 47592 FORT WORTH TX', -52.3)).toEqual({
      flow: 'outflow',
      type: 'expense',
      category: 'transportation',
    });
  });

  it('H-E-B → food_groceries', () => {
    expect(classifyBankTransaction('H-E-B #618 FORT WORTH TX', -150).category).toBe('food_groceries');
  });

  it('WF HOME MTG → housing', () => {
    expect(classifyBankTransaction('WF HOME MTG AUTO PAY', -3200)).toEqual({
      flow: 'outflow',
      type: 'expense',
      category: 'housing',
    });
  });

  it('credit-card payment outflows → transfer (not spend)', () => {
    expect(classifyBankTransaction('CITI AUTOPAY PYMT', -2100).type).toBe('transfer');
    expect(classifyBankTransaction('CAPITAL ONE CRCARDPMT', -800).type).toBe('transfer');
  });

  it('Coinbase → investment / investing', () => {
    expect(classifyBankTransaction('COINBASE.COM 8889087930', -500)).toEqual({
      flow: 'outflow',
      type: 'investment',
      category: 'investing',
    });
  });

  it('hotels route work vs personal by location (Dubai → travel_personal)', () => {
    expect(classifyBankTransaction('MARRIOTT DALLAS', -400).category).toBe('travel_work');
    expect(classifyBankTransaction('MARRIOTT DUBAI', -400).category).toBe('travel_personal');
  });

  it('unknown outflow merchant → expense / other', () => {
    expect(classifyBankTransaction('XYZZY STORE 42', -10)).toEqual({
      flow: 'outflow',
      type: 'expense',
      category: 'other',
    });
  });
});

describe('classifyBankTransaction — inflows', () => {
  it('Abnormal payroll → income', () => {
    expect(classifyBankTransaction('ABNORMAL SEC-OSV DES:PAYROLL', 7917)).toEqual({
      flow: 'inflow',
      type: 'income',
      category: 'other',
    });
  });

  it('Coupa (Abnormal AI) → reimbursement, not income', () => {
    expect(classifyBankTransaction('ABNORMAL AI COUPA PAYMENT', 432.18).type).toBe('reimbursement');
  });

  it("card 'PAYMENT THANK YOU' → transfer", () => {
    expect(classifyBankTransaction('PAYMENT THANK YOU - WEB', 2500).type).toBe('transfer');
  });

  it('generic / Zelle inflows default to income', () => {
    expect(classifyBankTransaction('ZELLE PAYMENT FROM JOHN DOE', 100).type).toBe('income');
    expect(classifyBankTransaction('MYSTERY DEPOSIT', 10).type).toBe('income');
  });

  it("'REFUND' inflow → type refund AND the merchant's category (Amazon, not 'other')", () => {
    expect(classifyBankTransaction('AMAZON.COM REFUND', 43.5)).toEqual({
      flow: 'inflow',
      type: 'refund',
      category: 'amazon',
    });
  });

  it("'RETURN' inflow categorizes against the merchant rules too", () => {
    const r = classifyBankTransaction('TARGET RETURN', 20);
    expect(r.type).toBe('refund');
    expect(r.category).toBe('food_groceries'); // Target's outflow rule
  });
});

describe('guessCategory', () => {
  it('applies a few load-bearing merchant rules', () => {
    expect(guessCategory('AMZN Mktp US*123')).toBe('amazon');
    expect(guessCategory('UBER EATS HELP.UBER.COM')).toBe('food_dining');
    expect(guessCategory('UBER *TRIP')).toBe('transportation');
    expect(guessCategory('NETFLIX.COM')).toBe('subscriptions');
    expect(guessCategory('PRIMROSE SCHOOL OF KELLER')).toBe('childcare');
    expect(guessCategory('IRS USATAXPYMT')).toBe('taxes');
    expect(guessCategory('SOME RANDO VENDOR')).toBe('other');
  });
});

import { describe, it, expect } from 'vitest';
import { classifyBankTransaction, guessCategory, isCashOut, isDefiniteSpend, resolveTypeEdit } from '../transactionCategorize';

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

describe('cash out — one concept (2026-08-13)', () => {
  it('ATM withdrawals and Cash App sends all land in atm_cash', () => {
    // The SAME PAI ATM withdrawal used to be atm_cash in March, travel_personal
    // in June, and an uncounted transfer in August. One rule now.
    for (const d of [
      'PAI ATM 08/06 #XXXXX9679 WITHDRWL PAI ATM',
      'PAI ATM 06/14 #XXXXX8567 WITHDRWL PAI ATM NY',
      'BKOFAMERICA ATM 03/22 WITHDRAWAL',
      'PMNT SENT 0724 CASH APP*DALLAS XXXXX91940 CA',
      'CASH APP*DALLAS 06/23 PMNT SENT XXXXX91940 C',
    ]) {
      const r = classifyBankTransaction(d, -160);
      expect(r.category, d).toBe('atm_cash');
      expect(r.type, d).toBe('expense');
    }
  });

  it('isCashOut / isDefiniteSpend flag the right rows', () => {
    expect(isCashOut('pai atm withdrwl')).toBe(true);
    expect(isCashOut('cash app*dallas pmnt sent')).toBe(true);
    expect(isCashOut('amazon.com')).toBe(false);
    // A withdrawal that names one of YOUR OWN accounts is a transfer, not cash
    // out the door — counting it would double the card bill (2026-08-19 audit).
    expect(isCashOut('electronic withdrawal 08/12 crcardpmt')).toBe(false);
    expect(isCashOut('electronic withdrawal card payment chase')).toBe(false);
    expect(isCashOut('withdrawal online banking transfer to sav 1234')).toBe(false);
    expect(isCashOut('withdrawal fid bkg svc llc moneyline')).toBe(false);
    // …but a bare ATM withdrawal still is, and so is a loan/mortgage payment
    // (mis-categorised beats uncounted — see the vanishing mortgage).
    expect(isCashOut('electronic withdrawal 08/12 atm 7eleven')).toBe(true);
    expect(isCashOut('electronic withdrawal mortgage pmt')).toBe(true);
    expect(isDefiniteSpend('wf home mtg des:auto pay')).toBe(true);
    expect(isDefiniteSpend('pai atm withdrwl')).toBe(true);
    // The same guard has to hold through isDefiniteSpend, which is what FORCED
    // these rows to spend regardless of what the feed said.
    expect(isDefiniteSpend('electronic withdrawal crcardpmt')).toBe(false);
    // must stay false or the double-count guard breaks
    expect(isDefiniteSpend('citi card online des:payment')).toBe(false);
    expect(isDefiniteSpend('online banking transfer to sav')).toBe(false);
  });

  it('ATM inflows (rebates, deposits) are NOT cash-out — they never reach the rule', () => {
    expect(classifyBankTransaction('BofA Rewards-ATM Oper Rebate Refund of $4', 4).flow).toBe('inflow');
    expect(classifyBankTransaction('BKOFAMERICA ATM 05/01 DEPOSIT', 1538).flow).toBe('inflow');
  });
});

describe('resolveTypeEdit — typeOverride is a latch, not a trapdoor', () => {
  it('an edit that disagrees with the feed sets the override and records the feed type', () => {
    // The feed called this ATM row a transfer; the user says it is spend.
    expect(resolveTypeEdit({ transactionType: 'transfer' }, 'expense'))
      .toEqual({ transactionType: 'expense', typeOverride: true, feedType: 'transfer' });
  });

  it('setting a row BACK to what the bank said clears the override', () => {
    // Nothing ever wrote false, so this row used to stay frozen forever — and a
    // frozen row also stops getting classifier fixes, which is the reason
    // untouched rows are left mapper-owned in the first place.
    expect(resolveTypeEdit({ transactionType: 'expense', typeOverride: true, feedType: 'transfer' }, 'transfer'))
      .toEqual({ transactionType: 'transfer', typeOverride: false, feedType: 'transfer' });
  });

  it('a second disagreeing edit keeps the override and the same feed type', () => {
    expect(resolveTypeEdit({ transactionType: 'expense', typeOverride: true, feedType: 'transfer' }, 'investment'))
      .toEqual({ transactionType: 'investment', typeOverride: true, feedType: 'transfer' });
  });

  it('a legacy overridden row with no remembered feed type stays overridden', () => {
    // We cannot know what the bank said, and guessing would silently undo a
    // deliberate correction.
    expect(resolveTypeEdit({ transactionType: 'expense', typeOverride: true }, 'transfer'))
      .toEqual({ transactionType: 'transfer', typeOverride: true });
  });
});

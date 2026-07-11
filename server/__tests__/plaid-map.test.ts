import { describe, it, expect } from 'vitest'
import { plaidTxnToExpense, classifyPlaidTxn } from '../plaid-map.ts'
import type { PlaidAccount, PlaidTransaction } from '../plaid-client.ts'

function acct(over: Partial<PlaidAccount>): PlaidAccount {
  return {
    account_id: 'acc1', name: 'Account', official_name: null, mask: '0000',
    type: 'depository', subtype: 'checking',
    balances: { available: null, current: null, iso_currency_code: 'USD' },
    ...over,
  }
}
function txn(over: Partial<PlaidTransaction>): PlaidTransaction {
  return {
    transaction_id: 't1', account_id: 'acc1', date: '2026-07-10', name: 'THING',
    merchant_name: null, amount: 10, iso_currency_code: 'USD', pending: false,
    payment_channel: 'in store', personal_finance_category: null,
    ...over,
  }
}

const citiCard = acct({ type: 'credit', subtype: 'credit card', mask: '3306', name: 'Citi Card' })
const bofaChecking = acct({ type: 'depository', subtype: 'checking', mask: '8256', name: 'BofA Checking' })

describe('plaid → expense mapping (via the reused Teller mapper)', () => {
  it('credit-card purchase (positive amount) is spend, id re-prefixed plaid_', () => {
    const e = plaidTxnToExpense(txn({ amount: 25, name: 'STARBUCKS' }), citiCard, 'Citibank', 'batch1')
    expect(e).not.toBeNull()
    expect(e!.transactionType).toBe('expense')
    expect(e!.flow).toBe('outflow')
    expect(e!.amount).toBe(25)
    expect(e!.id).toBe('plaid_t1')
    expect(e!.source).toBe('credit_card_1') // Citi
  })

  it('credit-card payment (negative + payment descriptor) is a transfer, not spend', () => {
    const e = plaidTxnToExpense(txn({ amount: -100, name: 'ONLINE PAYMENT THANK YOU' }), citiCard, 'Citibank', 'b')
    expect(e!.transactionType).toBe('transfer')
    expect(e!.flow).toBe('inflow') // paying the card down
  })

  it('checking spend: Plaid positive is flipped to a Teller outflow and kept as spend', () => {
    const e = plaidTxnToExpense(txn({ amount: 50, name: 'H-E-B GROCERY' }), bofaChecking, 'Bank of America', 'b')
    expect(e!.transactionType).toBe('expense')
    expect(e!.flow).toBe('outflow')
    expect(e!.amount).toBe(50)
    expect(e!.source).toBe('bofa_checking')
  })

  it('checking inflow: Plaid negative is flipped to a positive and kept as a transfer', () => {
    const e = plaidTxnToExpense(txn({ amount: -200, name: 'ONLINE BANKING TRANSFER FROM SAV' }), bofaChecking, 'Bank of America', 'b')
    expect(e!.transactionType).toBe('transfer')
    expect(e!.flow).toBe('inflow')
    expect(e!.amount).toBe(200)
  })

  it('pending transactions are skipped entirely', () => {
    expect(classifyPlaidTxn(txn({ pending: true }), bofaChecking).keep).toBe(false)
    expect(plaidTxnToExpense(txn({ pending: true }), bofaChecking, 'Bank of America', 'b')).toBeNull()
  })

  it('normalizes a credit-type account to the credit_card subtype path', () => {
    // If the subtype weren't normalized, the mapper would treat this as a
    // non-spending account and drop the purchase.
    const e = plaidTxnToExpense(txn({ amount: 12, name: 'SHOP' }), acct({ type: 'credit', subtype: 'credit card', mask: '0114', name: 'CapOne' }), 'Capital One', 'b')
    expect(e).not.toBeNull()
    expect(e!.transactionType).toBe('expense')
    expect(e!.source).toBe('credit_card_2') // Capital One
  })
})

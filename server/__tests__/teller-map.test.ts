import { describe, it, expect } from 'vitest'
import { classifyTellerTxn, tellerTxnToExpense } from '../teller-map.ts'
import type { TellerTransaction, TellerAccount } from '../teller-client.ts'

const acct = (over: Partial<TellerAccount>): TellerAccount => ({
  id: 'acc_1', name: 'Test', type: 'depository', subtype: 'checking', status: 'open',
  last_four: '0000', currency: 'USD', institution: { id: 'i', name: 'Bank of America' },
  ...over,
} as TellerAccount)

const txn = (over: Partial<TellerTransaction>): TellerTransaction => ({
  id: 't_1', account_id: 'acc_1', date: '2026-06-15', description: 'X', amount: '-10.00',
  status: 'posted', type: 'ach', ...over,
} as TellerTransaction)

const CHECKING = acct({ subtype: 'checking', last_four: '8256' })
const CARD = acct({ subtype: 'credit_card', last_four: '3306', institution: { id: 'c', name: 'Citi' } })

describe('classifyTellerTxn — spend vs. visible-but-not-spend (double-count guard)', () => {
  it('card purchase (positive) is spend', () => {
    const r = classifyTellerTxn(txn({ amount: '25.00', description: 'AMAZON' }), CARD)
    expect(r.keep).toBe(true)
    expect(r.transfer).toBeFalsy()
    expect(r.refund).toBeFalsy()
  })

  it('card payment is KEPT as a transfer (visible), not spend, shown as inflow', () => {
    const r = classifyTellerTxn(txn({ amount: '-500.00', description: 'ONLINE PAYMENT, THANK YOU' }), CARD)
    expect(r.keep).toBe(true)
    expect(r.transfer).toBe(true)
    expect(r.flowOverride).toBe('inflow')
    const mapped = tellerTxnToExpense(txn({ amount: '-500.00', description: 'ONLINE PAYMENT, THANK YOU' }), CARD, 'b')
    expect(mapped?.transactionType).toBe('transfer')
    expect(mapped?.flow).toBe('inflow') // pays the card down
  })

  it('card merchant credit is still a refund (nets its category)', () => {
    const r = classifyTellerTxn(txn({ amount: '-30.00', description: 'AMAZON RETURN' }), CARD)
    expect(r.refund).toBe(true)
    expect(r.transfer).toBeFalsy()
  })

  it('checking bill (normal payee) is spend', () => {
    const r = classifyTellerTxn(txn({ amount: '-120.00', description: 'VERIZON WIRELESS' }), CHECKING)
    expect(r.keep).toBe(true)
    expect(r.transfer).toBeFalsy()
    expect(r.investment).toBeFalsy()
  })

  it('checking account-to-account transfer out is KEPT as a transfer, not spend', () => {
    const r = classifyTellerTxn(txn({ amount: '-2000.00', description: 'ONLINE BANKING TRANSFER TO SAV' }), CHECKING)
    expect(r.keep).toBe(true)
    expect(r.transfer).toBe(true)
  })

  it('checking non-employer inflow (transfer/deposit in) is KEPT as a transfer', () => {
    const r = classifyTellerTxn(txn({ amount: '750.00', description: 'ONLINE BANKING TRANSFER FROM SAVINGS', type: 'transfer' }), CHECKING)
    expect(r.keep).toBe(true)
    expect(r.transfer).toBe(true)
  })

  it('checking employer payroll inflow is LEFT to the income importer (not kept here)', () => {
    const r = classifyTellerTxn(txn({ amount: '7918.00', description: 'ABNORMAL SEC-OSV DES:PAYROLL' }), CHECKING)
    expect(r.keep).toBe(false)
    expect(r.reason).toBe('inflow')
  })

  it('checking Fidelity move is tagged investment, not spend or transfer', () => {
    const r = classifyTellerTxn(txn({ amount: '-1000.00', description: 'FID BKG SVC LLC DES:MONEYLINE' }), CHECKING)
    expect(r.keep).toBe(true)
    expect(r.investment).toBe(true)
    expect(r.transfer).toBeFalsy()
  })

  it('pending transactions are never imported', () => {
    const r = classifyTellerTxn(txn({ status: 'pending', amount: '-10.00' }), CHECKING)
    expect(r.keep).toBe(false)
  })
})

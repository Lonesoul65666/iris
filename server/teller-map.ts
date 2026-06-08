// Teller → Iris expense mapping (Build-T3).
//
// Turns a raw Teller transaction into an Iris Expense, or decides to skip it.
// The load-bearing rule is double-count avoidance, learned from the real data:
//
//   • Credit cards: PURCHASES are positive amounts. Import them. Negative
//     amounts are payments/refunds — skip (the payment is just moving money
//     from checking to the card; the underlying spend is already each charge).
//   • Checking: dominated by transfers, paychecks, investment moves, and card
//     payments — NOT spending. Import only genuine outflow bills: negative
//     amount, and NOT a transfer/payment/deposit/interest/investment.
//   • Savings / secondary "transfer-only" accounts: skip entirely.
//
// Categories are a best-effort first pass (Teller's category → Iris category);
// the user re-categorizes in the UI and the classifier refines. Not precious.

import type { TellerTransaction, TellerAccount } from './teller-client.ts'

// Teller category slug -> Iris ExpenseCategory. Unknowns fall through to 'other'.
const CATEGORY_MAP: Record<string, string> = {
  dining: 'food_dining',
  groceries: 'food_groceries',
  fuel: 'transportation',
  transport: 'transportation',
  transportation: 'transportation',
  utilities: 'utilities',
  phone: 'utilities',
  bills: 'utilities',
  entertainment: 'entertainment',
  charity: 'charity',
  health: 'healthcare',
  healthcare: 'healthcare',
  medical: 'healthcare',
  education: 'education',
  home: 'home_maintenance',
  shopping: 'personal',
  clothing: 'clothing',
  electronics: 'electronics',
  software: 'subscriptions',
  subscriptions: 'subscriptions',
  insurance: 'insurance',
  tax: 'taxes',
  taxes: 'taxes',
  sport: 'entertainment',
  fitness: 'personal',
  service: 'other',
  advertising: 'other',
  general: 'other',
}

export function mapTellerCategory(tellerCat: string | null | undefined, description: string): string {
  const d = (description || '').toUpperCase()
  if (d.includes('AMAZON') || d.includes('AMZN')) return 'amazon'
  if (tellerCat && CATEGORY_MAP[tellerCat]) return CATEGORY_MAP[tellerCat]
  return 'other'
}

// Map a Teller account to Iris's existing TransactionSource taxonomy so the
// Settings "Clear X" buttons and any source-based logic keep working. We're
// doing a clean-slate replace, so collision-tagging isn't needed anymore.
export function mapAccountSource(account: TellerAccount): string {
  const inst = (account.institution?.name || '').toLowerCase()
  const sub = account.subtype
  if (inst.includes('citi')) return 'credit_card_1'
  if (inst.includes('capital')) return 'credit_card_2'
  if (inst.includes('america') || inst.includes('bofa') || inst.includes('bank of america')) {
    if (sub === 'savings') return 'bofa_savings'
    // distinguish the two BoA checkings by last four; the joint/secondary one
    // is transfer-only and gets skipped at the txn level anyway.
    if (account.last_four === '1006') return 'bofa_joint'
    return 'bofa_checking'
  }
  return 'other'
}

export type SkipReason =
  | 'card_payment_or_refund'   // negative on a card
  | 'inflow'                   // positive on a depository acct (deposit/transfer-in)
  | 'transfer_or_payment'      // checking transfer / card payment / deposit / interest / adjustment
  | 'investment'               // money moved to investments
  | 'non_spending_account'     // savings / secondary transfer-only account

export interface MapResult {
  keep: boolean
  amount?: number              // positive spend magnitude
  category?: string
  reason?: SkipReason
}

const CHECKING_SKIP_TYPES = new Set(['transfer', 'card_payment', 'deposit', 'interest', 'adjustment', 'payment'])

// Checking outflows that look like spending but are actually card payments,
// brokerage/investment transfers, or account-to-account moves. Teller often
// types these as plain `ach`, so type alone misses them — match the payee.
// The mortgage servicer ("WF HOME MTG") deliberately matches NOTHING here so a
// real bill survives. Applied only to the primary checking account.
const NON_SPEND_PAYEE = new RegExp(
  [
    // credit-card issuers (an ACH to these from checking = paying off a card)
    'CAPITAL ONE', 'CITI ?CARD', 'CITICARD', 'COMENITY', 'AMERICAN EXPRESS', 'AMEX',
    'DISCOVER', 'CHASE CARD', 'CARDMEMBER', 'SYNCHRONY', 'BARCLAY', 'BANKCARD',
    'CRCARDPMT', 'CC ?PYMT', 'CREDIT ?CRD', 'CREDIT CARD',
    // brokerage / investment moves
    'FIDELITY', 'FID BKG', 'BKG SVC', 'MONEYLINE', 'SCHWAB', 'VANGUARD',
    'E\\*?TRADE', 'ETRADE', 'BETTERMENT', 'WEALTHFRONT', 'ROBINHOOD', 'MERRILL', 'COINBASE',
    // explicit transfers
    'ONLINE BANKING TRANSFER', 'WIRE TRANSFER', 'TRANSFER TO', 'TRANSFER FROM', 'ZELLE',
  ].join('|'),
  'i',
)

function isCheckingNonSpend(description: string): boolean {
  return NON_SPEND_PAYEE.test(description || '')
}

export function classifyTellerTxn(t: TellerTransaction, account: TellerAccount): MapResult {
  const amt = Number(t.amount)
  const sub = account.subtype

  if (sub === 'credit_card') {
    // Purchases are positive on cards; negatives are payments/refunds.
    if (amt > 0) return { keep: true, amount: amt, category: mapTellerCategory(t.details?.category, t.description) }
    return { keep: false, reason: 'card_payment_or_refund' }
  }

  if (sub === 'checking') {
    // The "Our stuffs" (1006) secondary checking is transfer-only.
    if (account.last_four === '1006') return { keep: false, reason: 'non_spending_account' }
    if (amt >= 0) return { keep: false, reason: 'inflow' }
    if (CHECKING_SKIP_TYPES.has(t.type)) return { keep: false, reason: 'transfer_or_payment' }
    if (t.details?.category === 'investment') return { keep: false, reason: 'investment' }
    // Card payments / brokerage transfers that Teller typed as plain `ach`.
    if (isCheckingNonSpend(t.description)) return { keep: false, reason: 'transfer_or_payment' }
    return { keep: true, amount: Math.abs(amt), category: mapTellerCategory(t.details?.category, t.description) }
  }

  // savings + anything else: not a spending account
  return { keep: false, reason: 'non_spending_account' }
}

export interface MappedExpense {
  id: string
  date: string
  amount: number
  description: string
  category: string
  reimbursementStatus: 'not_reimbursable'
  isWorkExpense: false
  recurring: false
  flow: 'outflow'
  transactionType: 'expense'
  source: string
  importBatch: string
  tellerTxnId: string
  tellerAccountId: string
  tellerCategory: string | null
  tellerInstitution: string
}

export function tellerTxnToExpense(
  t: TellerTransaction,
  account: TellerAccount,
  batch: string,
): MappedExpense | null {
  const r = classifyTellerTxn(t, account)
  if (!r.keep || r.amount === undefined) return null
  return {
    id: `teller_${t.id}`,
    date: t.date,
    amount: r.amount,
    description: t.description || account.name,
    category: r.category ?? 'other',
    reimbursementStatus: 'not_reimbursable',
    isWorkExpense: false,
    recurring: false,
    flow: 'outflow',
    transactionType: 'expense',
    source: mapAccountSource(account),
    importBatch: batch,
    tellerTxnId: t.id,
    tellerAccountId: account.id,
    tellerCategory: t.details?.category ?? null,
    tellerInstitution: account.institution?.name ?? '',
  }
}

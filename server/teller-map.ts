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
import { classifyBankTransaction } from '../src/utils/transactionCategorize.ts'

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

// Best-effort category for an imported transaction. Runs the merchant-tuned
// classifier FIRST (it knows the real merchants — EXXON→transportation,
// H-E-B→groceries, hotels→travel — and is the same logic /api/expenses/
// recategorize uses), then falls back to Teller's own category slug, then 'other'.
// classifyBankTransaction treats a positive amount as an inflow, so we pass a
// negative to force the outflow merchant-rule path. This is why a fresh sync now
// lands correct instead of trusting Teller's frequently-wrong category.
function bestCategory(description: string, amount: number, tellerCat: string | null | undefined): string {
  const { category } = classifyBankTransaction(description || '', -Math.abs(amount))
  if (category && category !== 'other') return category
  return mapTellerCategory(tellerCat, description)
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
  | 'card_payment'             // negative on a card that's a PAYMENT (moving money, not a refund)
  | 'inflow'                   // positive on a depository acct (deposit/transfer-in)
  | 'transfer_or_payment'      // checking transfer / card payment / deposit / interest / adjustment
  | 'investment'               // money moved to investments
  | 'non_spending_account'     // savings / secondary transfer-only account
  | 'pending'                  // not posted yet — imported only once it settles

export interface MapResult {
  keep: boolean
  amount?: number              // positive spend magnitude
  category?: string
  refund?: boolean             // card merchant credit — import as a refund that nets against its category
  reason?: SkipReason
}

// Negative card amounts are EITHER payments (skip — just moving money from
// checking, the spend is already each charge) or merchant credits (KEEP as
// refunds — an Amazon return must net against the Amazon bucket; dropping
// every credit overstated spend forever).
//
// DESCRIPTION is the only reliable signal: verified against the real Teller
// data 2026-06-11, Teller types EVERY card credit as `payment` — Target
// returns, Avis credits, dispute credits, the lot — so t.type must not be
// consulted. The issuers' actual payment descriptors are unmistakable:
// Citi "ONLINE PAYMENT, THANK YOU", CapOne "CAPITAL ONE MOBILE PYMT".
const CARD_PAYMENT_DESC = /PAYMENT,?\s*THANK\s*YOU|ONLINE PAYMENT|AUTOPAY|ACH PAYMENT|ELECTRONIC PAYMENT|MOBILE PAYMENT|\bPYMT\b|CARDMEMBER/i

function isCardPayment(t: TellerTransaction): boolean {
  return CARD_PAYMENT_DESC.test(t.description || '')
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
  // Skip pendings entirely: a voided hold (hotel/gas pre-auth) would otherwise
  // live in the budget forever as phantom spend, and Teller may re-id a pending
  // when it posts (duplicate risk). The txn imports on the next sync once it
  // settles — the trailing window guarantees we don't miss it.
  if (t.status === 'pending') return { keep: false, reason: 'pending' }
  const amt = Number(t.amount)
  const sub = account.subtype

  if (sub === 'credit_card') {
    // Purchases are positive on cards.
    if (amt > 0) return { keep: true, amount: amt, category: bestCategory(t.description, amt, t.details?.category) }
    // Negatives: payments skip; merchant credits import as refunds, categorized
    // against the merchant they refund so the netting lands in the right bucket.
    if (isCardPayment(t)) return { keep: false, reason: 'card_payment' }
    return { keep: true, refund: true, amount: Math.abs(amt), category: bestCategory(t.description, amt, t.details?.category) }
  }

  if (sub === 'checking') {
    // The "Our stuffs" (1006) secondary checking is transfer-only.
    if (account.last_four === '1006') return { keep: false, reason: 'non_spending_account' }
    if (amt >= 0) return { keep: false, reason: 'inflow' }
    if (CHECKING_SKIP_TYPES.has(t.type)) return { keep: false, reason: 'transfer_or_payment' }
    if (t.details?.category === 'investment') return { keep: false, reason: 'investment' }
    // Card payments / brokerage transfers that Teller typed as plain `ach`.
    if (isCheckingNonSpend(t.description)) return { keep: false, reason: 'transfer_or_payment' }
    return { keep: true, amount: Math.abs(amt), category: bestCategory(t.description, amt, t.details?.category) }
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
  isWorkExpense: boolean   // false from the classifier; user merchant mappings can override at import
  recurring: false
  flow: 'outflow' | 'inflow'          // refunds are inflows
  transactionType: 'expense' | 'refund'
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
    flow: r.refund ? 'inflow' : 'outflow',
    transactionType: r.refund ? 'refund' : 'expense',
    source: mapAccountSource(account),
    importBatch: batch,
    tellerTxnId: t.id,
    tellerAccountId: account.id,
    tellerCategory: t.details?.category ?? null,
    tellerInstitution: account.institution?.name ?? '',
  }
}

// ─── Income-inflow mapping (Phase-1 budget: real income) ────────────────────
//
// Single-income household — the employer is Abnormal. On a DEPOSITORY account,
// a positive (inflow) deposit from the employer is income; the Coupa / "Abnormal
// AI Inc" deposits are work-expense REIMBURSEMENTS, not salary. Everything else
// (transfers, Zelle, internal moves, interest, non-employer deposits) is skipped
// so we don't pollute income with transfers. The income detector then splits the
// Abnormal stream into base vs variable downstream.

const INCOME_EMPLOYER = /ABNORMAL/i
// Employer-agnostic ACH payroll markers, so the NEXT employer's paychecks keep
// importing without a code change. (/ABNORMAL/-only meant a job change would
// silently stop income imports — found by the 2026-06-11 audit, and timely.)
const PAYROLL_MARKER = /PAYROLL|DIR(?:ECT)?\s+DEP|DES:\s*PAYROLL|\bSALARY\b|-OSV\b/i
const REIMBURSEMENT_HINT = /COUPA|ABNORMAL\s*AI/i

export type IncomeSkipReason =
  | 'not_inflow'
  | 'credit_card_account'
  | 'transfer_or_internal'
  | 'interest'
  | 'not_employer'
  | 'pending'

export interface IncomeMapResult {
  keep: boolean
  amount?: number
  transactionType?: 'income' | 'reimbursement'
  reason?: IncomeSkipReason
}

export function classifyTellerInflow(t: TellerTransaction, account: TellerAccount): IncomeMapResult {
  if (t.status === 'pending') return { keep: false, reason: 'pending' }
  const amt = Number(t.amount)
  if (account.subtype === 'credit_card') return { keep: false, reason: 'credit_card_account' }
  if (amt <= 0) return { keep: false, reason: 'not_inflow' }
  const desc = t.description || ''
  // Transfers / Zelle / card-payment reversals / brokerage moves → not income.
  if (isCheckingNonSpend(desc)) return { keep: false, reason: 'transfer_or_internal' }
  if (t.type === 'interest') return { keep: false, reason: 'interest' }
  if (!INCOME_EMPLOYER.test(desc) && !PAYROLL_MARKER.test(desc)) return { keep: false, reason: 'not_employer' }
  const transactionType: 'income' | 'reimbursement' = REIMBURSEMENT_HINT.test(desc) ? 'reimbursement' : 'income'
  return { keep: true, amount: amt, transactionType }
}

export interface MappedIncome {
  id: string
  date: string
  amount: number
  description: string
  category: string
  reimbursementStatus: 'not_reimbursable'
  isWorkExpense: false
  recurring: false
  flow: 'inflow'
  transactionType: 'income' | 'reimbursement'
  source: string
  importBatch: string
  tellerTxnId: string
  tellerAccountId: string
  tellerCategory: string | null
  tellerInstitution: string
}

export function tellerTxnToIncome(
  t: TellerTransaction,
  account: TellerAccount,
  batch: string,
): MappedIncome | null {
  const r = classifyTellerInflow(t, account)
  if (!r.keep || r.amount === undefined || !r.transactionType) return null
  return {
    id: `teller_${t.id}`,
    date: t.date,
    amount: r.amount,
    description: t.description || account.name,
    category: r.transactionType === 'reimbursement' ? 'reimbursement' : 'income',
    reimbursementStatus: 'not_reimbursable',
    isWorkExpense: false,
    recurring: false,
    flow: 'inflow',
    transactionType: r.transactionType,
    source: mapAccountSource(account),
    importBatch: batch,
    tellerTxnId: t.id,
    tellerAccountId: account.id,
    tellerCategory: t.details?.category ?? null,
    tellerInstitution: account.institution?.name ?? '',
  }
}

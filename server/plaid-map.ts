// Plaid → Iris mapping. Rather than re-implement the (dense, well-tested) Teller
// classification rules, we ADAPT a Plaid transaction/account into the shapes the
// Teller mapper already understands, then reuse teller-map wholesale. This keeps
// classification behavior identical across the provider swap.
//
// The load-bearing difference is the SIGN CONVENTION:
//   • Plaid: a POSITIVE amount = money leaving the account (a debit) for EVERY
//     account type; negative = money in.
//   • Teller (what the mapper expects): on CREDIT CARDS a purchase is positive
//     (same as Plaid), but on DEPOSITORY accounts an inflow is positive and an
//     outflow is negative (opposite of Plaid).
// So: credit cards pass through unchanged; depository amounts get NEGATED.
//
// Ids are re-prefixed teller_ → plaid_ so the two providers never collide and a
// Plaid row is recognizable. The teller* metadata fields carry Plaid values
// (harmless — they're just provenance columns).

import type { PlaidAccount, PlaidTransaction } from './plaid-client.ts'
import type { TellerTransaction, TellerAccount } from './teller-client.ts'
import {
  tellerTxnToExpense, tellerTxnToIncome, classifyTellerTxn, classifyTellerInflow,
  type MappedExpense, type MappedIncome, type MapResult, type IncomeMapResult,
} from './teller-map.ts'

/** Normalize a Plaid account subtype to the Teller taxonomy the mapper branches on. */
function normalizeSubtype(a: PlaidAccount): string {
  if (a.type === 'credit' || (a.subtype ?? '').includes('credit')) return 'credit_card'
  if (a.subtype === 'checking' || a.subtype === 'savings') return a.subtype
  if (a.type === 'depository') return a.subtype === 'savings' ? 'savings' : 'checking'
  return a.subtype ?? a.type
}

/** True for cash accounts (where Plaid's sign is opposite Teller's). */
function isDepository(a: PlaidAccount): boolean {
  const sub = normalizeSubtype(a)
  return sub === 'checking' || sub === 'savings'
}

/** Map Plaid's personal_finance_category to the loose `type` the Teller mapper's
 *  CHECKING_SKIP_TYPES set consults. Description regexes do most of the work;
 *  this just adds signal for transfers/payments/deposits/interest. */
function pfcToType(pfc: PlaidTransaction['personal_finance_category']): string {
  const primary = pfc?.primary ?? ''
  const detailed = pfc?.detailed ?? ''
  if (detailed.includes('INTEREST')) return 'interest'
  if (primary === 'TRANSFER_IN' || primary === 'TRANSFER_OUT') return 'transfer'
  if (primary === 'LOAN_PAYMENTS') return 'payment'
  if (primary === 'INCOME') return 'deposit'
  if (primary === 'BANK_FEES') return 'adjustment'
  return ''
}

/** The details.category slug the Teller mapper reads (mainly to spot investment
 *  transfers). Everything else falls through to the description classifier. */
function pfcToCategorySlug(pfc: PlaidTransaction['personal_finance_category']): string | null {
  const detailed = pfc?.detailed ?? ''
  if (detailed.includes('INVESTMENT') || detailed.includes('RETIREMENT')) return 'investment'
  return pfc?.primary ? pfc.primary.toLowerCase() : null
}

export function plaidToTellerAccount(a: PlaidAccount, institution: string): TellerAccount {
  return {
    id: a.account_id,
    name: a.name,
    type: a.type,
    subtype: normalizeSubtype(a),
    status: 'open',
    last_four: a.mask ?? '',
    currency: a.balances?.iso_currency_code ?? 'USD',
    institution: { id: '', name: institution },
  }
}

export function plaidToTellerTxn(p: PlaidTransaction, account: PlaidAccount): TellerTransaction {
  // Depository: flip sign so Plaid's "positive = outflow" becomes Teller's
  // "negative = outflow". Credit cards already match, so pass through.
  const amount = isDepository(account) ? -p.amount : p.amount
  return {
    id: p.transaction_id,
    account_id: p.account_id,
    date: p.date,
    description: p.name || p.merchant_name || '',
    amount: String(amount),
    status: p.pending ? 'pending' : 'posted',
    type: pfcToType(p.personal_finance_category),
    details: {
      category: pfcToCategorySlug(p.personal_finance_category) ?? undefined,
      counterparty: p.merchant_name ? { name: p.merchant_name } : undefined,
    },
  }
}

/** Swap the teller_ id prefix for plaid_ on a mapped row (expense or income). */
function replaidId<T extends { id: string }>(row: T): T {
  return { ...row, id: row.id.replace(/^teller_/, 'plaid_') }
}

export function plaidTxnToExpense(p: PlaidTransaction, a: PlaidAccount, institution: string, batch: string): MappedExpense | null {
  const row = tellerTxnToExpense(plaidToTellerTxn(p, a), plaidToTellerAccount(a, institution), batch)
  return row ? replaidId(row) : null
}

export function plaidTxnToIncome(p: PlaidTransaction, a: PlaidAccount, institution: string, batch: string): MappedIncome | null {
  const row = tellerTxnToIncome(plaidToTellerTxn(p, a), plaidToTellerAccount(a, institution), batch)
  return row ? replaidId(row) : null
}

// Re-exported so the import handler can classify (for skip counts) without
// re-adapting shapes itself.
export function classifyPlaidTxn(p: PlaidTransaction, a: PlaidAccount): MapResult {
  return classifyTellerTxn(plaidToTellerTxn(p, a), plaidToTellerAccount(a, ''))
}
export function classifyPlaidInflow(p: PlaidTransaction, a: PlaidAccount): IncomeMapResult {
  return classifyTellerInflow(plaidToTellerTxn(p, a), plaidToTellerAccount(a, ''))
}

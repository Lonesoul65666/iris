// Plaid API client — the replacement for Teller (which shut down its API 2026).
//
// Unlike Teller, Plaid needs NO mutual TLS. Auth is just client_id + secret sent
// in the JSON body of every request. So this is a thin fetch wrapper (undici's
// global fetch is fine — no client cert to present) that injects credentials and
// selects the environment base URL.
//
// Config comes from .env.local:
//   PLAID_CLIENT_ID   your client id (identifier, not a secret on its own)
//   PLAID_SECRET      the secret for the ACTIVE environment
//   PLAID_ENV         'sandbox' | 'production'   (Plaid retired 'development')
//
// Secrets are read from env and never logged.

const PLAID_HOSTS: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
}

export interface PlaidConfigStatus {
  configured: boolean
  environment: string
  hasClientId: boolean
  hasSecret: boolean
  message?: string
}

/** Inspect Plaid configuration WITHOUT throwing — for a health endpoint. Never
 *  returns the secret itself, only whether it's present. */
export function plaidConfigStatus(): PlaidConfigStatus {
  const clientId = process.env.PLAID_CLIENT_ID ?? ''
  const secret = process.env.PLAID_SECRET ?? ''
  const environment = (process.env.PLAID_ENV ?? 'sandbox').toLowerCase()
  const status: PlaidConfigStatus = {
    configured: Boolean(clientId && secret && PLAID_HOSTS[environment]),
    environment,
    hasClientId: Boolean(clientId),
    hasSecret: Boolean(secret),
  }
  if (!PLAID_HOSTS[environment]) status.message = `PLAID_ENV must be 'sandbox' or 'production' (got '${environment}')`
  else if (!clientId || !secret) status.message = 'Set PLAID_CLIENT_ID and PLAID_SECRET in .env.local'
  return status
}

function plaidBaseUrl(): string {
  const env = (process.env.PLAID_ENV ?? 'sandbox').toLowerCase()
  const host = PLAID_HOSTS[env]
  if (!host) throw new Error(`plaid_bad_env: PLAID_ENV must be 'sandbox' or 'production' (got '${env}')`)
  return host
}

export class PlaidApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'PlaidApiError'
    this.status = status
    this.code = code
  }
}

/**
 * POST to a Plaid endpoint with client_id + secret injected. Plaid always uses
 * POST with a JSON body and returns JSON; non-2xx bodies carry an `error_code`.
 */
export async function plaidRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!clientId || !secret) {
    throw new Error('plaid_not_configured: set PLAID_CLIENT_ID and PLAID_SECRET in .env.local')
  }
  let res: Response
  try {
    res = await fetch(`${plaidBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, ...body }),
    })
  } catch (err) {
    throw new Error(`plaid_request_failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  const text = await res.text()
  if (!res.ok) {
    let code = 'plaid_error'
    let message = text
    try {
      const parsed = JSON.parse(text) as { error_code?: string; error_message?: string }
      if (parsed.error_code) code = parsed.error_code
      if (parsed.error_message) message = parsed.error_message
    } catch { /* non-JSON body; keep raw text */ }
    throw new PlaidApiError(res.status, code, message)
  }
  try {
    return JSON.parse(text) as T
  } catch (e) {
    throw new PlaidApiError(res.status, 'parse_error', e instanceof Error ? e.message : String(e))
  }
}

// ─── typed endpoint wrappers ───────────────────────────────────────────────────

/** Create a short-lived link_token for the frontend Plaid Link flow. */
export async function createLinkToken(clientUserId: string): Promise<{ link_token: string; expiration: string }> {
  return plaidRequest('/link/token/create', {
    client_name: 'Iris',
    user: { client_user_id: clientUserId },
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  })
}

/** Exchange the public_token (from Link onSuccess) for a durable access_token. */
export async function exchangePublicToken(publicToken: string): Promise<{ access_token: string; item_id: string }> {
  return plaidRequest('/item/public_token/exchange', { public_token: publicToken })
}

export interface PlaidAccount {
  account_id: string
  name: string
  official_name: string | null
  mask: string | null
  type: string
  subtype: string | null
  balances: { available: number | null; current: number | null; iso_currency_code: string | null }
}

/** List the accounts an access_token can see, plus the item's institution id. */
export async function getAccounts(accessToken: string): Promise<{ accounts: PlaidAccount[]; item: { institution_id: string | null } }> {
  return plaidRequest('/accounts/get', { access_token: accessToken })
}

export interface PlaidTransaction {
  transaction_id: string
  account_id: string
  date: string                 // 'YYYY-MM-DD'
  name: string
  merchant_name: string | null
  amount: number               // POSITIVE = money OUT of the account (opposite of Teller)
  iso_currency_code: string | null
  pending: boolean
  payment_channel: string
  personal_finance_category: { primary: string; detailed: string } | null
}

export interface TransactionsSyncPage {
  added: PlaidTransaction[]
  modified: PlaidTransaction[]
  removed: Array<{ transaction_id: string }>
  next_cursor: string
  has_more: boolean
}

/** One page of the incremental transactions feed. Pass the prior cursor (or
 *  omit for a first full sync); loop while `has_more`. Kept for future
 *  cursor-based syncing; the current import uses the bounded getTransactions. */
export async function transactionsSync(accessToken: string, cursor?: string): Promise<TransactionsSyncPage> {
  const body: Record<string, unknown> = { access_token: accessToken }
  if (cursor) body.cursor = cursor
  return plaidRequest('/transactions/sync', body)
}

interface TransactionsGetPage {
  accounts: PlaidAccount[]
  transactions: PlaidTransaction[]
  total_transactions: number
}

/**
 * Fetch all transactions in [startDate, endDate] (YYYY-MM-DD), paging through
 * Plaid's offset pagination. Mirrors Teller's bounded "since" window so the
 * import logic stays uniform. Right after linking, Plaid may still be preparing
 * data and return PRODUCT_NOT_READY — the caller surfaces that as a retry.
 */
export async function getTransactions(accessToken: string, startDate: string, endDate: string): Promise<{ accounts: PlaidAccount[]; transactions: PlaidTransaction[] }> {
  const pageSize = 500
  const all: PlaidTransaction[] = []
  let accounts: PlaidAccount[] = []
  let offset = 0
  let total = Infinity
  let guard = 0
  while (offset < total && guard < 100) {
    guard++
    const page = await plaidRequest<TransactionsGetPage>('/transactions/get', {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: pageSize, offset },
    })
    if (offset === 0) accounts = page.accounts
    total = page.total_transactions
    all.push(...page.transactions)
    if (page.transactions.length === 0) break
    offset += page.transactions.length
  }
  return { accounts, transactions: all }
}

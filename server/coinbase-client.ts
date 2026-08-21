// Coinbase connector — READ-ONLY balances for the crypto held in Scott's Coinbase
// account, so it lands in net worth like everything else.
//
// WHY THIS EXISTS AT ALL, given Plaid is already wired (checked 2026-08-20, after
// Scott said "I don't think Plaid supports Robinhood or Coinbase do they?"):
// Robinhood IS on Plaid (Investments). **Coinbase is not.** The Plaid↔Coinbase
// relationship runs the other way — Coinbase uses Plaid to verify YOUR BANK for
// funding. Plaid's crypto-exchange coverage is Binance.US, Kraken and Gemini;
// Coinbase bought its own aggregator (Zabo) rather than joining. So Coinbase needs
// its own door, which was the plan of record back in the 2026-05-01 scope reset
// ("Teller dev + Fidelity OFX + Coinbase API").
//
// AUTH: a CDP "Secret API Key" scoped to view-only, signature algorithm **ECDSA**
// (Ed25519 is explicitly not supported for the Coinbase App API). Every request
// carries its own JWT, ES256-signed, valid 2 minutes, with the request's method +
// host + path bound into the `uri` claim — so a stolen token can't be replayed
// against a different endpoint.
//
// The key never leaves the user's own machine + Postgres, same as every other
// connector token: this is a self-hosted app talking to the user's own account.

import crypto from 'node:crypto'

const HOST = 'api.coinbase.com'
const ACCOUNTS_PATH = '/api/v3/brokerage/accounts'
/** Public spot-price endpoint — no auth, so pricing costs no JWTs. */
const SPOT_PATH = (pair: string) => `/v2/prices/${pair}/spot`

export interface CoinbaseKey {
  /** CDP key name, e.g. `organizations/<org>/apiKeys/<id>`. Goes in `kid` + `sub`. */
  keyName: string
  /** EC PRIVATE KEY PEM, as downloaded. */
  privateKey: string
}

export class CoinbaseApiError extends Error {
  // Plain fields, not parameter properties: the build runs with
  // `erasableSyntaxOnly`, which forbids the shorthand.
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'CoinbaseApiError'
    this.status = status
    this.code = code
  }
}

const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * Mint a request-scoped ES256 JWT.
 *
 * Exported for tests: this is the piece that can't be verified against the live
 * API without Scott's key, so its shape is pinned by unit test instead. `nowSec`
 * and `nonce` are injectable for the same reason.
 */
export function buildCoinbaseJwt(
  key: CoinbaseKey,
  method: string,
  path: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  nonce: string = crypto.randomBytes(16).toString('hex'),
): string {
  const header = { alg: 'ES256', typ: 'JWT', kid: key.keyName, nonce }
  const payload = {
    sub: key.keyName,
    iss: 'cdp',
    nbf: nowSec,
    exp: nowSec + 120,
    // Binds the token to ONE endpoint. Note: no scheme, and no leading space.
    uri: `${method.toUpperCase()} ${HOST}${path}`,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  // `ieee-p1363` is the raw r||s encoding JWS requires; Node's default (DER) is
  // silently rejected by every JWT verifier, including Coinbase's.
  const sig = crypto.sign('sha256', Buffer.from(signingInput), {
    key: crypto.createPrivateKey(key.privateKey),
    dsaEncoding: 'ieee-p1363',
  })
  return `${signingInput}.${b64url(sig)}`
}

async function coinbaseGet<T>(key: CoinbaseKey, path: string): Promise<T> {
  const jwt = buildCoinbaseJwt(key, 'GET', path)
  const res = await fetch(`https://${HOST}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  })
  const text = await res.text()
  if (!res.ok) {
    let code = `http_${res.status}`
    let message = text.slice(0, 500)
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string; error_details?: string }
      if (parsed.error) code = parsed.error
      if (parsed.message || parsed.error_details) message = parsed.message ?? parsed.error_details ?? message
    } catch { /* non-JSON body — keep the raw text */ }
    throw new CoinbaseApiError(res.status, code, message)
  }
  try {
    return JSON.parse(text) as T
  } catch (e) {
    throw new CoinbaseApiError(res.status, 'parse_error', e instanceof Error ? e.message : String(e))
  }
}

interface RawAccount {
  uuid: string
  name: string
  currency: string
  available_balance?: { value?: string; currency?: string }
  hold?: { value?: string; currency?: string }
  type?: string
}

interface AccountsPage {
  accounts: RawAccount[]
  has_next?: boolean
  cursor?: string
}

/** One wallet's holding, in its own units — pricing happens separately. */
export interface CoinbaseBalance {
  currency: string
  /** available + hold: money on hold is still yours. */
  amount: number
  name: string
}

/** Every wallet with a non-zero balance. Pages until Coinbase says stop (a
 *  Coinbase account has a wallet per supported asset — hundreds of them, almost
 *  all empty, so the zero filter is what makes this usable). */
export async function listCoinbaseBalances(key: CoinbaseKey): Promise<CoinbaseBalance[]> {
  const out: CoinbaseBalance[] = []
  let cursor: string | undefined
  // Hard page cap: a runaway cursor must not loop forever on someone's laptop.
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ limit: '250' })
    if (cursor) qs.set('cursor', cursor)
    const data = await coinbaseGet<AccountsPage>(key, `${ACCOUNTS_PATH}?${qs.toString()}`)
    for (const a of data.accounts ?? []) {
      const avail = Number(a.available_balance?.value ?? 0)
      const hold = Number(a.hold?.value ?? 0)
      const amount = (Number.isFinite(avail) ? avail : 0) + (Number.isFinite(hold) ? hold : 0)
      if (amount <= 0) continue
      out.push({ currency: (a.available_balance?.currency ?? a.currency ?? '').toUpperCase(), amount, name: a.name })
    }
    if (!data.has_next || !data.cursor) break
    cursor = data.cursor
  }
  return out
}

/** USD spot price for one asset. Public endpoint — no key, no JWT. */
export async function spotPriceUsd(currency: string): Promise<number | null> {
  // Fiat and 1:1 stablecoins need no lookup (and USD has no USD-USD pair).
  if (currency === 'USD') return 1
  const res = await fetch(`https://${HOST}${SPOT_PATH(`${currency}-USD`)}`)
  if (!res.ok) return null
  try {
    const body = (await res.json()) as { data?: { amount?: string } }
    const px = Number(body.data?.amount)
    return Number.isFinite(px) ? px : null
  } catch {
    return null
  }
}

export interface PricedBalance extends CoinbaseBalance {
  /** USD per unit, or null when Coinbase has no USD pair for it. */
  priceUsd: number | null
  /** amount × priceUsd, or null when unpriced — NEVER silently 0. */
  valueUsd: number | null
}

/** Pure: attach prices to balances. Split out from the fetching so the money math
 *  is testable, and so an unpriced asset stays visibly unpriced instead of
 *  quietly contributing $0 to net worth. */
export function priceBalances(balances: CoinbaseBalance[], prices: Record<string, number | null>): PricedBalance[] {
  return balances.map((b) => {
    const priceUsd = b.currency === 'USD' ? 1 : (prices[b.currency] ?? null)
    return { ...b, priceUsd, valueUsd: priceUsd === null ? null : Math.round(b.amount * priceUsd * 100) / 100 }
  })
}

/** Σ of what could be priced, plus what couldn't — so the caller can say so. */
export function totalUsd(priced: PricedBalance[]): { total: number; unpriced: string[] } {
  let total = 0
  const unpriced: string[] = []
  for (const p of priced) {
    if (p.valueUsd === null) unpriced.push(p.currency)
    else total += p.valueUsd
  }
  return { total: Math.round(total * 100) / 100, unpriced }
}

/** Balances + USD pricing in one call. */
export async function fetchCoinbasePortfolio(key: CoinbaseKey): Promise<{ priced: PricedBalance[]; total: number; unpriced: string[] }> {
  const balances = await listCoinbaseBalances(key)
  const currencies = [...new Set(balances.map((b) => b.currency))]
  const prices: Record<string, number | null> = {}
  for (const c of currencies) prices[c] = await spotPriceUsd(c)
  const priced = priceBalances(balances, prices)
  return { priced, ...totalUsd(priced) }
}

import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { buildCoinbaseJwt, priceBalances, totalUsd, type CoinbaseBalance } from '../coinbase-client.ts'

// The live API can't be exercised without Scott's key, so the two things that
// would fail silently against it — the token shape and the money math — are
// pinned here instead.

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const KEY = { keyName: 'organizations/abc/apiKeys/def', privateKey: privateKey as unknown as string }

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

describe('buildCoinbaseJwt', () => {
  const jwt = buildCoinbaseJwt(KEY, 'get', '/api/v3/brokerage/accounts', 1_800_000_000, 'deadbeef')
  const [h, p, sig] = jwt.split('.')

  it('is an ES256 token carrying the key name in kid and sub', () => {
    expect(decode(h)).toEqual({ alg: 'ES256', typ: 'JWT', kid: KEY.keyName, nonce: 'deadbeef' })
    expect(decode(p).sub).toBe(KEY.keyName)
    expect(decode(p).iss).toBe('cdp')
  })

  it('lives for two minutes', () => {
    expect(decode(p).nbf).toBe(1_800_000_000)
    expect(decode(p).exp).toBe(1_800_000_120)
  })

  it('binds the token to ONE method + host + path, uppercased method, no scheme', () => {
    // A token that isn't bound can be replayed against another endpoint.
    expect(decode(p).uri).toBe('GET api.coinbase.com/api/v3/brokerage/accounts')
  });

  it('signs with the raw r||s encoding JWS requires, not DER', () => {
    const ok = crypto.verify(
      'sha256', Buffer.from(`${h}.${p}`),
      { key: publicKey as unknown as string, dsaEncoding: 'ieee-p1363' },
      Buffer.from(sig, 'base64url'),
    )
    expect(ok).toBe(true)
    // 64 bytes = P-256 r||s. A DER signature would be ~70 and variable-length,
    // which Coinbase rejects with an unhelpful 401.
    expect(Buffer.from(sig, 'base64url')).toHaveLength(64)
  })

  it('mints a different token per request', () => {
    const other = buildCoinbaseJwt(KEY, 'GET', '/api/v3/brokerage/accounts', 1_800_000_000, 'cafebabe')
    expect(other).not.toBe(jwt)
    expect(decode(other.split('.')[0]).nonce).toBe('cafebabe')
  })
})

describe('pricing balances', () => {
  const balances: CoinbaseBalance[] = [
    { currency: 'BTC', amount: 0.25, name: 'BTC Wallet' },
    { currency: 'ETH', amount: 2, name: 'ETH Wallet' },
    { currency: 'USD', amount: 140.5, name: 'Cash (USD)' },
  ]

  it('values each holding at its spot price, USD at par', () => {
    const priced = priceBalances(balances, { BTC: 60_000, ETH: 3_000 })
    expect(priced.map((p) => p.valueUsd)).toEqual([15_000, 6_000, 140.5])
    expect(totalUsd(priced)).toEqual({ total: 21_140.5, unpriced: [] })
  })

  it('leaves an unpriceable asset NULL instead of counting it as zero', () => {
    // A coin with no USD pair must not quietly shrink net worth by pretending
    // it's worth nothing.
    const priced = priceBalances([...balances, { currency: 'WEIRDCOIN', amount: 1000, name: 'Weird' }], { BTC: 60_000, ETH: 3_000 })
    const weird = priced.find((p) => p.currency === 'WEIRDCOIN')!
    expect(weird.priceUsd).toBeNull()
    expect(weird.valueUsd).toBeNull()
    const { total, unpriced } = totalUsd(priced)
    expect(total).toBe(21_140.5)      // unchanged by the unpriced holding…
    expect(unpriced).toEqual(['WEIRDCOIN'])  // …but it is named, not hidden
  })

  it('rounds to cents', () => {
    const priced = priceBalances([{ currency: 'BTC', amount: 0.123456789, name: 'BTC' }], { BTC: 61_234.567 })
    expect(priced[0].valueUsd).toBe(7559.82)  // 0.123456789 x 61,234.567
  })
})

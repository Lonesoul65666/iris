import { describe, it, expect, afterEach } from 'vitest'
import { plaidConfigStatus } from '../plaid-client.ts'

const saved = { ...process.env }
afterEach(() => {
  process.env.PLAID_CLIENT_ID = saved.PLAID_CLIENT_ID
  process.env.PLAID_SECRET = saved.PLAID_SECRET
  process.env.PLAID_ENV = saved.PLAID_ENV
})

describe('plaidConfigStatus', () => {
  it('is configured with client id, secret, and a valid env', () => {
    process.env.PLAID_CLIENT_ID = 'abc123'
    process.env.PLAID_SECRET = 'shh'
    process.env.PLAID_ENV = 'sandbox'
    const s = plaidConfigStatus()
    expect(s.configured).toBe(true)
    expect(s.hasClientId).toBe(true)
    expect(s.hasSecret).toBe(true)
    expect(s.environment).toBe('sandbox')
  })

  it('is not configured when the secret is missing (and never leaks it)', () => {
    process.env.PLAID_CLIENT_ID = 'abc123'
    process.env.PLAID_SECRET = ''
    process.env.PLAID_ENV = 'sandbox'
    const s = plaidConfigStatus()
    expect(s.configured).toBe(false)
    expect(s.hasSecret).toBe(false)
    expect(JSON.stringify(s)).not.toContain('abc123-secret')
  })

  it('rejects an invalid PLAID_ENV with a helpful message', () => {
    process.env.PLAID_CLIENT_ID = 'abc123'
    process.env.PLAID_SECRET = 'shh'
    process.env.PLAID_ENV = 'development' // Plaid retired this env
    const s = plaidConfigStatus()
    expect(s.configured).toBe(false)
    expect(s.message).toMatch(/sandbox.*production/)
  })

  it('defaults env to sandbox when unset', () => {
    process.env.PLAID_CLIENT_ID = 'abc123'
    process.env.PLAID_SECRET = 'shh'
    delete process.env.PLAID_ENV
    expect(plaidConfigStatus().environment).toBe('sandbox')
  })
})

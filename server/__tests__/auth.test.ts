import { describe, it, expect } from 'vitest'
import type { IncomingMessage } from 'node:http'
import {
  hashPassword, verifyPassword, normalizeUsername,
  hashToken, parseCookies, serializeSessionCookie, clearSessionCookie,
} from '../api-handlers/auth-core.ts'

const reqWith = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', () => {
    const stored = hashPassword('correct horse battery staple')
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true)
    expect(verifyPassword('wrong password', stored)).toBe(false)
  })

  it('produces a salted scrypt$ format, unique per call', () => {
    const a = hashPassword('samePassword')
    const b = hashPassword('samePassword')
    expect(a.startsWith('scrypt$')).toBe(true)
    expect(a).not.toBe(b) // random salt → different hashes
    expect(verifyPassword('samePassword', a)).toBe(true)
    expect(verifyPassword('samePassword', b)).toBe(true)
  })

  it('rejects malformed stored hashes without throwing', () => {
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', 'notscrypt$aa$bb')).toBe(false)
    expect(verifyPassword('x', 'scrypt$deadbeef')).toBe(false)
  })
})

describe('normalizeUsername', () => {
  it('lowercases and trims for case-insensitive matching', () => {
    expect(normalizeUsername('  Scott ')).toBe('scott')
    expect(normalizeUsername('CLAIRE')).toBe('claire')
  })
})

describe('token hashing', () => {
  it('is deterministic sha256 hex (64 chars)', () => {
    const h = hashToken('abc')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken('abc')).toBe(h)
    expect(hashToken('abd')).not.toBe(h)
  })
})

describe('parseCookies', () => {
  it('parses a Cookie header into a map', () => {
    expect(parseCookies('iris_session=abc123; other=v')).toEqual({ iris_session: 'abc123', other: 'v' })
  })
  it('handles missing/empty headers and url-decodes', () => {
    expect(parseCookies(undefined)).toEqual({})
    expect(parseCookies('')).toEqual({})
    expect(parseCookies('k=a%20b')).toEqual({ k: 'a b' })
  })
})

describe('session cookie serialization', () => {
  it('is httpOnly + SameSite=Lax + Path, and NOT Secure over plain http', () => {
    const c = serializeSessionCookie('tok', reqWith({}))
    expect(c).toContain('iris_session=tok')
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Path=/')
    expect(c).not.toContain('Secure')
  })
  it('adds Secure when the proxy reports https', () => {
    const c = serializeSessionCookie('tok', reqWith({ 'x-forwarded-proto': 'https' }))
    expect(c).toContain('Secure')
  })
  it('clear cookie expires immediately', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0')
  })
})

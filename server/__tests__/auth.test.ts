import { describe, it, expect } from 'vitest'
import type { IncomingMessage } from 'node:http'
import {
  hashPassword, verifyPassword, normalizeUsername,
  hashToken, parseCookies, serializeSessionCookie, clearSessionCookie,
  validatePasswordStrength, isPasswordExpired, isSessionIdleExpired,
  computeLockout, isLocked,
  MIN_PASSWORD_LEN, PASSWORD_MAX_AGE_MS, LOCKOUT_THRESHOLD,
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

describe('validatePasswordStrength', () => {
  it('rejects passwords shorter than the minimum', () => {
    expect(validatePasswordStrength('short')).toMatch(/at least/)
    expect(validatePasswordStrength('x'.repeat(MIN_PASSWORD_LEN - 1))).toMatch(/at least/)
  })
  it('accepts passwords at or above the minimum', () => {
    expect(validatePasswordStrength('x'.repeat(MIN_PASSWORD_LEN))).toBeNull()
    expect(validatePasswordStrength('correct horse battery staple')).toBeNull()
  })
  it('rejects non-strings without throwing', () => {
    expect(validatePasswordStrength(undefined as unknown as string)).toMatch(/at least/)
    expect(validatePasswordStrength(12345678901 as unknown as string)).toMatch(/at least/)
  })
})

describe('isPasswordExpired', () => {
  const now = Date.UTC(2026, 6, 7)
  it('is false for a freshly-changed password', () => {
    expect(isPasswordExpired(new Date(now).toISOString(), now)).toBe(false)
  })
  it('is true once older than the max age', () => {
    const old = new Date(now - PASSWORD_MAX_AGE_MS - 1000).toISOString()
    expect(isPasswordExpired(old, now)).toBe(true)
  })
  it('is false right at the boundary and for missing/garbage input', () => {
    expect(isPasswordExpired(new Date(now - PASSWORD_MAX_AGE_MS + 1000).toISOString(), now)).toBe(false)
    expect(isPasswordExpired(null, now)).toBe(false)
    expect(isPasswordExpired('not a date', now)).toBe(false)
  })
})

describe('isSessionIdleExpired', () => {
  const now = Date.UTC(2026, 6, 7)
  it('is false when recently used', () => {
    expect(isSessionIdleExpired(new Date(now - 60_000).toISOString(), now)).toBe(false)
  })
  it('is true after a long idle gap', () => {
    expect(isSessionIdleExpired(new Date(now - 25 * 60 * 60 * 1000).toISOString(), now)).toBe(true)
  })
  it('is false for missing/garbage input (fail-open — absolute expiry still guards)', () => {
    expect(isSessionIdleExpired(null, now)).toBe(false)
    expect(isSessionIdleExpired('nope', now)).toBe(false)
  })
})

describe('computeLockout', () => {
  it('increments below the threshold without locking', () => {
    expect(computeLockout(0)).toEqual({ attempts: 1, locked: false })
    expect(computeLockout(LOCKOUT_THRESHOLD - 2)).toEqual({ attempts: LOCKOUT_THRESHOLD - 1, locked: false })
  })
  it('locks and resets the counter on hitting the threshold', () => {
    expect(computeLockout(LOCKOUT_THRESHOLD - 1)).toEqual({ attempts: 0, locked: true })
  })
  it('treats a non-finite prior count as zero', () => {
    expect(computeLockout(NaN as unknown as number)).toEqual({ attempts: 1, locked: false })
  })
})

describe('isLocked', () => {
  const now = Date.UTC(2026, 6, 7)
  it('is true while lockedUntil is in the future', () => {
    expect(isLocked({ lockedUntil: new Date(now + 60_000).toISOString() }, now)).toBe(true)
  })
  it('is false when lockedUntil has passed or is absent', () => {
    expect(isLocked({ lockedUntil: new Date(now - 1000).toISOString() }, now)).toBe(false)
    expect(isLocked({ lockedUntil: null }, now)).toBe(false)
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

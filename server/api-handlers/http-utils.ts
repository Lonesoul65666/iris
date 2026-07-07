// Shared HTTP utilities for Iris API handlers.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { getPool, getCurrentUserId } from '../db-pool.ts'
import { validateSession, accountCount, type Account } from './auth-core.ts'
import type { Pool } from 'pg'

export type Req = IncomingMessage
export type Res = ServerResponse

export function sendJson(res: Res, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export async function readJsonBody(req: Req): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw)
}

export interface RequestContext {
  pool: Pool
  /** Household data scope — the single shared user_id all data hangs off. */
  userId: string
  /** The logged-in account (who's using it — Scott vs Claire). Null only during
   *  first-run, before any accounts exist (transitional open access). */
  account: Account | null
}

/**
 * Gate + context for every data route. Checks the DB is connected AND (once
 * login accounts exist) that the request carries a valid session cookie — so
 * this one function protects every handler that calls it. Auth/connect/health
 * routes deliberately do NOT call this, so they stay reachable pre-login.
 *
 * FIRST-RUN RULE: if no accounts exist yet, access is allowed (the app behaves
 * exactly as it did before auth — open on loopback). The moment accounts are
 * created, the session gate engages. This keeps existing installs working and
 * makes auth opt-in via setup — with no locked-out intermediate state. The
 * standalone server refuses a non-loopback bind until accounts exist, so this
 * transitional openness is never network-exposed.
 *
 * Async now (session lookup hits the DB): callers must `await` it.
 */
export async function requireContext(req: Req, res: Res): Promise<RequestContext | null> {
  const pool = getPool()
  const userId = getCurrentUserId()
  if (!pool || !userId) {
    sendJson(res, 503, { ok: false, error: 'not_configured', message: 'Call /api/connect first.' })
    return null
  }
  const account = await validateSession(req, pool)
  if (account) return { pool, userId, account }
  // No valid session — allowed ONLY during first-run (no accounts yet).
  if ((await accountCount(pool)) === 0) return { pool, userId, account: null }
  sendJson(res, 401, { ok: false, error: 'unauthenticated', message: 'Log in first.' })
  return null
}

export function methodNotAllowed(res: Res): void {
  sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

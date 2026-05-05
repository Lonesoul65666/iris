// Shared HTTP utilities for Iris API handlers.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { getPool, getCurrentUserId } from '../db-pool.ts'
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
  userId: string
}

export function requireContext(res: Res): RequestContext | null {
  const pool = getPool()
  const userId = getCurrentUserId()
  if (!pool || !userId) {
    sendJson(res, 503, { ok: false, error: 'not_configured', message: 'Call /api/connect first.' })
    return null
  }
  return { pool, userId }
}

export function methodNotAllowed(res: Res): void {
  sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

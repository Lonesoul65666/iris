// Teller API client (Build-T1) — server-side mTLS.
//
// Teller authenticates API calls with BOTH:
//   1. mutual TLS: a client certificate + private key issued to the dev app
//      (paths in TELLER_CERT_PATH / TELLER_KEY_PATH — files live outside the
//      repo, never in source or chat), AND
//   2. HTTP Basic auth where the username is the per-enrollment access_token
//      (captured by in-app Teller Connect in Build-T2) and the password is
//      empty.
//
// This module loads the cert+key once, caches an https.Agent, and exposes a
// typed `tellerRequest` for the API handlers. Secrets never get logged.

import { readFileSync } from 'node:fs'
import https from 'node:https'

const TELLER_API_BASE = 'https://api.teller.io'

interface AgentState {
  agent: https.Agent
  certPath: string
  keyPath: string
}

let cached: AgentState | null = null

export interface TellerConfigStatus {
  configured: boolean
  certPath: string | null
  keyPath: string | null
  certReadable: boolean
  keyReadable: boolean
  environment: string
  message?: string
}

/** Inspect cert/key configuration WITHOUT throwing — for a health endpoint. */
export function tellerConfigStatus(): TellerConfigStatus {
  const certPath = process.env.TELLER_CERT_PATH ?? null
  const keyPath = process.env.TELLER_KEY_PATH ?? null
  const environment = process.env.TELLER_ENV ?? 'development'
  const status: TellerConfigStatus = {
    configured: Boolean(certPath && keyPath),
    certPath,
    keyPath,
    certReadable: false,
    keyReadable: false,
    environment,
  }
  if (!certPath || !keyPath) {
    status.message = 'TELLER_CERT_PATH and/or TELLER_KEY_PATH not set in .env.local'
    return status
  }
  try {
    const cert = readFileSync(certPath, 'utf8')
    status.certReadable = cert.includes('BEGIN CERTIFICATE')
  } catch (e) {
    status.message = `cert unreadable: ${e instanceof Error ? e.message : String(e)}`
  }
  try {
    const key = readFileSync(keyPath, 'utf8')
    status.keyReadable = key.includes('BEGIN') && key.includes('PRIVATE KEY')
  } catch (e) {
    status.message = `key unreadable: ${e instanceof Error ? e.message : String(e)}`
  }
  return status
}

/** Build (or reuse) the mTLS agent. Throws a clear error if certs missing. */
function getAgent(): https.Agent {
  const certPath = process.env.TELLER_CERT_PATH
  const keyPath = process.env.TELLER_KEY_PATH
  if (!certPath || !keyPath) {
    throw new Error('teller_certs_not_configured: set TELLER_CERT_PATH and TELLER_KEY_PATH in .env.local')
  }
  if (cached && cached.certPath === certPath && cached.keyPath === keyPath) {
    return cached.agent
  }
  let cert: Buffer
  let key: Buffer
  try {
    cert = readFileSync(certPath)
    key = readFileSync(keyPath)
  } catch (e) {
    throw new Error(`teller_cert_read_failed: ${e instanceof Error ? e.message : String(e)}`)
  }
  const agent = new https.Agent({ cert, key, keepAlive: true })
  cached = { agent, certPath, keyPath }
  return agent
}

export interface TellerError {
  status: number
  code: string
  message: string
}

export class TellerApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'TellerApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Make an authenticated Teller API request.
 *
 * Uses node:https.request (NOT global fetch): Node's undici-based fetch ignores
 * the `agent` option, so the mTLS client cert would silently never be presented
 * and the TLS handshake would fail. https.request honors the Agent's cert+key.
 *
 * @param accessToken the per-enrollment access_token (Basic-auth username)
 * @param path        e.g. '/accounts' or `/accounts/${id}/transactions`
 */
export function tellerRequest<T>(accessToken: string, path: string): Promise<T> {
  const agent = getAgent()
  // Basic auth: username = access_token, password = empty.
  const auth = Buffer.from(`${accessToken}:`).toString('base64')

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      `${TELLER_API_BASE}${path}`,
      {
        method: 'GET',
        agent,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            let code = 'teller_error'
            let message = text
            try {
              const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } }
              if (parsed.error?.code) code = parsed.error.code
              if (parsed.error?.message) message = parsed.error.message
            } catch {
              /* non-JSON body; keep raw text */
            }
            reject(new TellerApiError(status, code, message))
            return
          }
          try {
            resolve(JSON.parse(text) as T)
          } catch (e) {
            reject(new TellerApiError(status, 'parse_error', e instanceof Error ? e.message : String(e)))
          }
        })
      },
    )
    req.on('error', (e) => reject(new Error(`teller_request_failed: ${e.message}`)))
    req.end()
  })
}

export interface TellerAccount {
  id: string
  name: string
  type: string
  subtype: string
  status: string
  last_four: string
  currency: string
  institution: { id: string; name: string }
  links?: Record<string, string>
}

export async function fetchAccounts(accessToken: string): Promise<TellerAccount[]> {
  return tellerRequest<TellerAccount[]>(accessToken, '/accounts')
}

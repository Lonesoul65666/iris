// Minimal connect-compatible prefix router for the standalone Node server.
//
// Vite mounts each API handler with `server.middlewares.use(prefix, handler)`,
// which (via connect) matches the prefix on a `/`/`?`/end boundary and STRIPS
// the prefix from `req.url` before the handler runs. Outside Vite there is no
// connect, so this router replicates those exact semantics — the handlers see
// an identical `req.url`, so nothing downstream has to change.
//
// Matching: registration order, first match wins (handlers respond rather than
// calling next()). Errors are caught and returned as a 500 JSON body.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendJson } from './api-handlers/http-utils.ts'
import type { Handler, UseFn } from './routes.ts'

interface Route {
  prefix: string
  handler: Handler
}

export interface Router {
  use: UseFn
  /** Dispatch a request. Returns true if a route matched (and responded). */
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>
}

/** connect's prefix rule: startsWith(prefix) AND next char is '/', '?', or end. */
function matches(url: string, prefix: string): boolean {
  if (url.length < prefix.length) return false
  if (url.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return false
  const c = url.charCodeAt(prefix.length)
  // 0x2f === '/', 0x3f === '?'
  return Number.isNaN(c) || c === 0x2f || c === 0x3f
}

export function createRouter(): Router {
  const routes: Route[] = []

  const use: UseFn = (prefix, handler) => {
    routes.push({ prefix, handler })
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = req.url ?? '/'
    for (const route of routes) {
      if (!matches(url, route.prefix)) continue
      // Strip the prefix exactly like connect, preserving any query string and
      // re-leading with '/' so handlers that read req.url see what Vite gave them.
      let stripped = url.slice(route.prefix.length)
      if (stripped[0] !== '/') stripped = '/' + stripped
      req.url = stripped
      try {
        await route.handler(req, res)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'handler_error', message })
        else res.end()
      }
      return true
    }
    return false
  }

  return { use, handle }
}

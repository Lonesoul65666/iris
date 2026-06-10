// Standalone Node HTTP server for Iris — runs the entire backend WITHOUT Vite.
//
// This is the de-browser keystone: today the API only exists inside Vite dev
// middleware, so a packaged build has no backend. This server mounts the SAME
// shared route table (server/routes.ts) via a connect-compatible router,
// replicates Vite's /api/yf Yahoo proxy, auto-connects to Postgres from
// DATABASE_URL (.env.local), and serves the built client from dist/ with SPA
// fallback. No browser localStorage paste required.
//
// Run:  node --env-file=.env.local server/standalone.ts
//       (Node 24 runs .ts directly. PORT overrides the default 5173.)

import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, join, extname, normalize, sep } from 'node:path'
import { createRouter } from './router.ts'
import { registerIrisRoutes } from './routes.ts'
import { autoConnectFromEnv } from './db-pool.ts'
import { isYahooProxy, proxyYahoo } from './yf-proxy.ts'

const PORT = Number(process.env.PORT ?? process.env.IRIS_PORT ?? 5173)
const DIST = resolve(process.cwd(), 'dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

const router = createRouter()
registerIrisRoutes((prefix, handler) => router.use(prefix, handler))

/** Serve a static asset from dist/, falling back to index.html for SPA routes. */
async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  let filePath = normalize(join(DIST, urlPath))
  // Path-traversal guard: the resolved path must stay inside DIST.
  if (filePath !== DIST && !filePath.startsWith(DIST + sep)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }
  try {
    const s = await stat(filePath)
    if (s.isDirectory()) filePath = join(filePath, 'index.html')
  } catch {
    // Unknown path → SPA fallback to index.html (client-side routing).
    filePath = join(DIST, 'index.html')
  }
  try {
    const data = await readFile(filePath)
    res.statusCode = 200
    res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream')
    res.end(data)
  } catch {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not found. Did you run `npm run build`? (dist/ is missing)')
  }
}

const server = http.createServer((req, res) => {
  void (async () => {
    const url = req.url ?? '/'
    if (isYahooProxy(url)) { proxyYahoo(req, res); return }
    if (await router.handle(req, res)) return
    // Unmatched /api/* is a real 404, not an SPA route.
    if (url.startsWith('/api/')) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: 'unknown_route', url }))
      return
    }
    await serveStatic(req, res)
  })().catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
    }
    res.end(JSON.stringify({ ok: false, error: 'server_error', message }))
  })
})

async function main(): Promise<void> {
  try {
    const connected = await autoConnectFromEnv()
    if (connected) {
      console.log('[iris] connected to Postgres via DATABASE_URL')
    } else {
      console.warn('[iris] WARNING: DATABASE_URL not set — /api/* will 503 until configured (add it to .env.local)')
    }
  } catch (err) {
    console.error(`[iris] DATABASE_URL connect failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  server.listen(PORT, () => {
    console.log(`[iris] standalone server listening on http://localhost:${PORT}`)
    console.log(`[iris] serving client from ${DIST}`)
  })
}

void main()

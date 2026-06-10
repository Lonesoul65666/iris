// Yahoo Finance reverse proxy for the standalone server.
//
// In dev, Vite's `server.proxy` forwards /api/yf/* -> query1.finance.yahoo.com
// (stripping the /api/yf prefix) so the client dodges CORS for market data and
// news (see src/services/marketDataApi.ts + newsApi.ts). Outside Vite we
// replicate that here with a streaming https pipe. GET-only — that's all the
// client uses.

import type { IncomingMessage, ServerResponse } from 'node:http'
import https from 'node:https'

const YF_PREFIX = '/api/yf'
const YF_HOST = 'query1.finance.yahoo.com'

/** True when this request is a Yahoo proxy call. */
export function isYahooProxy(url: string): boolean {
  return url === YF_PREFIX || url.startsWith(YF_PREFIX + '/') || url.startsWith(YF_PREFIX + '?')
}

/** Pipe a /api/yf/* request to Yahoo Finance and stream the response back. */
export function proxyYahoo(req: IncomingMessage, res: ServerResponse): void {
  const upstreamPath = (req.url ?? '').slice(YF_PREFIX.length) || '/'
  const upstream = https.request(
    {
      host: YF_HOST,
      path: upstreamPath,
      method: 'GET',
      headers: {
        // Yahoo rejects requests without a browser-ish UA; mirror what the
        // browser would send. Force Host to the upstream (changeOrigin).
        Host: YF_HOST,
        'User-Agent': 'Mozilla/5.0 (Iris)',
        Accept: 'application/json',
      },
    },
    (upstreamRes) => {
      res.statusCode = upstreamRes.statusCode ?? 502
      const ct = upstreamRes.headers['content-type']
      if (ct) res.setHeader('Content-Type', ct)
      upstreamRes.pipe(res)
    },
  )
  upstream.on('error', (e) => {
    if (!res.headersSent) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
    }
    res.end(JSON.stringify({ ok: false, error: 'yf_proxy_failed', message: e.message }))
  })
  upstream.end()
}

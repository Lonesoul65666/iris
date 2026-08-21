// Vite dev plugin for the Iris API.
//
// Mounts the API on the dev server's port by adapting the SHARED route table
// (server/routes.ts) onto Vite's connect middleware stack — so dev routing is
// byte-identical to before, and the standalone Node server (server/standalone.ts)
// serves the exact same routes through the same registration function.
//
// On boot it also auto-connects from DATABASE_URL (.env.local) so the pool is
// ready without a browser localStorage paste. If that env var is unset, the
// client's POST /api/connect bootstrap still seeds the pool (backwards compatible).

import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { autoConnectFromEnvWithRetry, envConnectionString } from './db-pool.ts'
import { registerIrisRoutes, type Handler } from './routes.ts'

export function irisApi(): Plugin {
  const wrap = (h: Handler) =>
    (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      void h(req, res).catch(next)
    }

  return {
    name: 'iris-api',
    async configureServer(server: ViteDevServer) {
      // Seed the pool from env before the first request, if configured — and keep
      // retrying in the background rather than serving a pool-less dev server.
      if (envConnectionString() !== null) {
        await autoConnectFromEnvWithRetry((msg) => server.config.logger.info(msg))
      }
      // Each route remains its own connect middleware (native prefix-stripping).
      registerIrisRoutes((prefix, handler) => {
        server.middlewares.use(prefix, wrap(handler))
      })
    },
  }
}

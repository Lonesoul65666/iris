import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { irisApi } from './server/api-plugin.ts'

export default defineConfig(({ mode }) => {
  // Server-side secrets (Teller mTLS cert paths) live in .env.local without a
  // VITE_ prefix, so Vite won't expose them to the client. loadEnv with ''
  // reads ALL keys; we copy only the TELLER_* ones onto process.env so the
  // API middleware (Node side) can read them. They never reach the browser.
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['TELLER_CERT_PATH', 'TELLER_KEY_PATH', 'TELLER_ENV']) {
    if (env[key]) process.env[key] = env[key]
  }

  return {
  plugins: [irisApi(), react(), tailwindcss()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api/yf': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yf/, ''),
      },
      // SimpleFIN Bridge proxy removed 2026-05-10 — service deprecated (ADR-0001).
    },
  },
  }
})

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { irisApi } from './server/api-plugin.ts'

export default defineConfig(({ mode }) => {
  // Server-side config in .env.local has no VITE_ prefix, so Vite won't expose
  // it to the client bundle. loadEnv with '' reads ALL keys; we copy the Node-
  // side ones onto process.env so the API middleware can read them. DATABASE_URL
  // lets the plugin auto-connect at boot (de-browser path — no localStorage
  // paste needed); TELLER_* are the mTLS cert paths + environment.
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['DATABASE_URL', 'IRIS_DATABASE_URL', 'TELLER_CERT_PATH', 'TELLER_KEY_PATH', 'TELLER_ENV']) {
    if (env[key]) process.env[key] = env[key]
  }

  return {
  plugins: [irisApi(), react(), tailwindcss()],
  server: {
    port: 5173,
    open: false,
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

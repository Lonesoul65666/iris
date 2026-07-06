import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { bootstrapDbConnection } from './lib/db-client.ts'
import { syncTellerBalances } from './lib/syncTellerBalances.ts'

// (The one-shot IndexedDB->Postgres migrations — Build-D1 2026-05-05 and the
// store de-browsering 2026-06-10 — completed long ago and were deleted
// 2026-06-11. They live in git history if ever needed.)
;(window as unknown as { __irisSyncBalances?: typeof syncTellerBalances }).__irisSyncBalances =
  syncTellerBalances

const rootEl = document.getElementById('root')!

// Build-D2b: app reads/writes route through /api/* now (Postgres canonical).
// We MUST seed the server-side pg pool before <App /> renders, otherwise the
// first batch of fetch('/api/...') calls in AppDataContext race ahead of the
// POST /api/connect and get 503'd, leaving the app stuck on "Loading Iris…".
async function boot(): Promise<void> {
  let r: Awaited<ReturnType<typeof bootstrapDbConnection>>
  try {
    r = await bootstrapDbConnection()
  } catch (err) {
    // A thrown bootstrap (network down, server unreachable) must not leave a
    // blank white screen — render a real, reloadable error instead.
    const msg = err instanceof Error ? err.message : String(err)
    rootEl.innerHTML = `
      <div style="padding:48px;font-family:system-ui,sans-serif;color:#aaa;max-width:640px;">
        <h1 style="color:#ff5c5c;">Iris couldn't start</h1>
        <p style="color:#ff8888;">${msg}</p>
        <p>The database connection failed to initialize. Check that the server is running, then <a style="color:#7c5cff;" href="javascript:location.reload()">reload</a>.</p>
      </div>
    `
    // eslint-disable-next-line no-console
    console.error('[iris] db bootstrap threw:', err)
    return
  }
  // eslint-disable-next-line no-console
  console.info('[iris] db bootstrap:', r)

  if (r.status === 'no_credential') {
    rootEl.innerHTML = `
      <div style="padding:48px;font-family:system-ui,sans-serif;color:#aaa;max-width:680px;">
        <h1 style="color:#7c5cff;">Iris needs a database connection</h1>
        <p>The server has no <code>DATABASE_URL</code> configured, and there's no connection string in this browser's <code>localStorage</code>.</p>
        <p><strong>Recommended (server-side, no browser needed):</strong> add your Supabase Session Pooler URI to <code>.env.local</code>:</p>
        <pre style="background:#1a1a1a;padding:12px;border-radius:6px;color:#ddd;">DATABASE_URL=&lt;your Supabase Session Pooler URI&gt;</pre>
        <p>then restart the server.</p>
        <p style="color:#777;">Or, for a one-off in this browser, run in DevTools and reload:</p>
        <pre style="background:#1a1a1a;padding:12px;border-radius:6px;color:#999;">localStorage.setItem('iris_db_connection_string', '&lt;your URI&gt;')</pre>
      </div>
    `
    return
  }

  if (r.status === 'error') {
    rootEl.innerHTML = `
      <div style="padding:48px;font-family:system-ui,sans-serif;color:#aaa;max-width:640px;">
        <h1 style="color:#ff5c5c;">Iris couldn't connect to the database</h1>
        <p style="color:#ff8888;">${r.message}</p>
        <p>Check your connection string in <code>localStorage.iris_db_connection_string</code>, or visit <a style="color:#7c5cff;" href="/api/health">/api/health</a> for diagnostics.</p>
      </div>
    `
    return
  }

  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

void boot()

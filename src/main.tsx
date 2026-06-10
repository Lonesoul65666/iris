import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { bootstrapDbConnection } from './lib/db-client.ts'
import { migrateIndexedDbToPostgres } from './lib/migrate-indexeddb-to-postgres.ts'
import { migrateBrowserStoresToPostgres } from './lib/migrate-browser-stores.ts'

// Expose the IndexedDB->Postgres migrations on window so they can be triggered
// manually from DevTools console. Not auto-invoked — running them is a
// deliberate user action.
//   __irisMigrate       — Build-D1: budget/income/expenses (one-shot, done)
//   __irisMigrateStores — 2026-06-10: portfolio + action stores (de-browser)
;(window as unknown as { __irisMigrate?: typeof migrateIndexedDbToPostgres }).__irisMigrate =
  migrateIndexedDbToPostgres
;(window as unknown as { __irisMigrateStores?: typeof migrateBrowserStoresToPostgres }).__irisMigrateStores =
  migrateBrowserStoresToPostgres

const rootEl = document.getElementById('root')!

// Build-D2b: app reads/writes route through /api/* now (Postgres canonical).
// We MUST seed the server-side pg pool before <App /> renders, otherwise the
// first batch of fetch('/api/...') calls in AppDataContext race ahead of the
// POST /api/connect and get 503'd, leaving the app stuck on "Loading Iris…".
async function boot(): Promise<void> {
  const r = await bootstrapDbConnection()
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

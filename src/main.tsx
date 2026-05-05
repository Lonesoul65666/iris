import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { bootstrapDbConnection } from './lib/db-client.ts'
import { migrateIndexedDbToPostgres } from './lib/migrate-indexeddb-to-postgres.ts'

void bootstrapDbConnection().then((r) => {
  // eslint-disable-next-line no-console
  console.info('[iris] db bootstrap:', r)
})

// Build-D1: expose the IndexedDB->Postgres migration on window so it can be
// triggered manually from DevTools console. Not auto-invoked — running it is
// a deliberate user action.
;(window as unknown as { __irisMigrate?: typeof migrateIndexedDbToPostgres }).__irisMigrate =
  migrateIndexedDbToPostgres

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

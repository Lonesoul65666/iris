import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { bootstrapDbConnection } from './lib/db-client.ts'

void bootstrapDbConnection().then((r) => {
  // eslint-disable-next-line no-console
  console.info('[iris] db bootstrap:', r)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

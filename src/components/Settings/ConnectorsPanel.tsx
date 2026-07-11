// Connectors panel (Build-T2): in-app bank/card enrollment via Teller Connect.
//
// Replaces the throwaway scratch launcher (`public/teller-connect.html`,
// gitignored, never persisted access tokens) with an in-app flow that writes
// the captured access token directly to the user's own Postgres through
// `/api/connectors/save`. Teller shows access tokens once — persisting them
// in the user's DB is the whole point of moving enrollment in-app.
//
// T1 (server-side mTLS + transaction fetch) will read from these rows next.

import { useEffect, useState, useCallback } from 'react'
import { syncTellerBalances } from '../../lib/syncTellerBalances'
import { formatCurrency } from '../../utils/format'

// Public Teller Application ID — fine to live in source per Teller docs.
const TELLER_APPLICATION_ID = 'app_prt5j01vo1ij37cq5i000'
const TELLER_ENVIRONMENT = 'development'
const TELLER_SCRIPT_SRC = 'https://cdn.teller.io/connect/connect.js'

interface TellerEnrollmentPayload {
  accessToken?: string
  access_token?: string
  user?: { id?: string }
  enrollment?: {
    id?: string
    institution?: { name?: string; id?: string }
  }
  signatures?: string[]
}

interface TellerConnectInstance {
  open: () => void
  destroy?: () => void
}

interface TellerConnectGlobal {
  setup: (opts: {
    applicationId: string
    environment: string
    selectAccount?: 'disabled' | 'single' | 'multiple'
    onInit?: () => void
    onSuccess: (e: TellerEnrollmentPayload) => void
    onExit?: () => void
    onFailure?: (f: unknown) => void
  }) => TellerConnectInstance
}

declare global {
  interface Window {
    TellerConnect?: TellerConnectGlobal
  }
}

// ── Plaid Link (Teller's replacement) ────────────────────────────────────────
const PLAID_SCRIPT_SRC = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'

interface PlaidLinkMetadata {
  institution?: { name?: string; institution_id?: string }
}
interface PlaidLinkHandler { open: () => void; destroy?: () => void }
interface PlaidLinkGlobal {
  create: (opts: {
    token: string
    onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void
    onExit?: (err: unknown, metadata: unknown) => void
    onEvent?: (eventName: string, metadata: unknown) => void
  }) => PlaidLinkHandler
}
declare global {
  interface Window {
    Plaid?: PlaidLinkGlobal
  }
}

function loadPlaidScript(): Promise<PlaidLinkGlobal> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no_window'))
  if (window.Plaid) return Promise.resolve(window.Plaid)
  return new Promise<PlaidLinkGlobal>((resolve, reject) => {
    const done = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error('plaid_script_loaded_but_global_missing')))
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PLAID_SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', done, { once: true })
      existing.addEventListener('error', () => reject(new Error('plaid_script_load_error')), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = PLAID_SCRIPT_SRC
    s.async = true
    s.addEventListener('load', done, { once: true })
    s.addEventListener('error', () => reject(new Error('plaid_script_load_error')), { once: true })
    document.head.appendChild(s)
  })
}

interface ConnectorRow {
  id: string
  provider: string
  institution: string
  provider_enrollment_id: string | null
  access_token: string
  status: string
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(`[iris api] ${path} → ${res.status} ${body.error ?? body.message ?? 'unknown'}`)
  }
  return (await res.json()) as T
}

function loadTellerScript(): Promise<TellerConnectGlobal> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no_window'))
  if (window.TellerConnect) return Promise.resolve(window.TellerConnect)

  return new Promise<TellerConnectGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TELLER_SCRIPT_SRC}"]`)
    const onLoad = () => {
      if (window.TellerConnect) resolve(window.TellerConnect)
      else reject(new Error('teller_script_loaded_but_global_missing'))
    }
    if (existing) {
      existing.addEventListener('load', onLoad, { once: true })
      existing.addEventListener('error', () => reject(new Error('teller_script_load_error')), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = TELLER_SCRIPT_SRC
    s.async = true
    s.addEventListener('load', onLoad, { once: true })
    s.addEventListener('error', () => reject(new Error('teller_script_load_error')), { once: true })
    document.head.appendChild(s)
  })
}

// Tolerate Teller's two access-token field-name shapes seen across SDK versions.
function extractAccessToken(p: TellerEnrollmentPayload): string | null {
  return p.accessToken ?? p.access_token ?? null
}

export default function ConnectorsPanel() {
  const [items, setItems] = useState<ConnectorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api<{ ok: true; items: ConnectorRow[] }>('/api/connectors/list')
      setItems(r.items)
    } catch (e) {
      setStatus(`Load failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const openConnect = useCallback(async () => {
    setStatus(null)
    setBusy(true)
    try {
      const Teller = await loadTellerScript()
      const instance = Teller.setup({
        applicationId: TELLER_APPLICATION_ID,
        environment: TELLER_ENVIRONMENT,
        selectAccount: 'multiple',
        onSuccess: (payload) => {
          void (async () => {
            const accessToken = extractAccessToken(payload)
            const institution = payload.enrollment?.institution?.name ?? 'Unknown bank'
            const enrollmentId = payload.enrollment?.id ?? null
            if (!accessToken) {
              setStatus('Enrollment succeeded but no access_token in payload. Check Teller SDK version.')
              setBusy(false)
              return
            }
            const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
              ? crypto.randomUUID()
              : `conn_${Date.now()}_${Math.random().toString(36).slice(2)}`
            try {
              await api<{ ok: true }>('/api/connectors/save', {
                method: 'POST',
                body: JSON.stringify({
                  connector: {
                    id,
                    provider: 'teller',
                    institution,
                    provider_enrollment_id: enrollmentId,
                    access_token: accessToken,
                    status: 'active',
                    data: {
                      user_id: payload.user?.id ?? null,
                      institution_id: payload.enrollment?.institution?.id ?? null,
                      signatures: payload.signatures ?? null,
                    },
                  },
                }),
              })
              setStatus(`Connected: ${institution}`)
              await refresh()
            } catch (e) {
              setStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
            } finally {
              setBusy(false)
            }
          })()
        },
        onExit: () => { setBusy(false) },
        onFailure: (f) => {
          setStatus(`Enrollment failed: ${JSON.stringify(f)}`)
          setBusy(false)
        },
      })
      instance.open()
    } catch (e) {
      setStatus(`Teller Connect failed to load: ${e instanceof Error ? e.message : String(e)}`)
      setBusy(false)
    }
  }, [refresh])

  const openPlaidConnect = useCallback(async () => {
    setStatus(null)
    setBusy(true)
    try {
      // 1) mint a link_token from our backend, 2) open Plaid Link, 3) exchange
      //    the returned public_token for a durable access_token (server-side).
      const { link_token } = await api<{ ok: true; link_token: string }>('/api/plaid/link-token', { method: 'POST' })
      const Plaid = await loadPlaidScript()
      const handler = Plaid.create({
        token: link_token,
        onSuccess: (publicToken, metadata) => {
          void (async () => {
            try {
              await api<{ ok: true }>('/api/plaid/exchange', {
                method: 'POST',
                body: JSON.stringify({
                  public_token: publicToken,
                  institution: metadata.institution?.name ?? 'Unknown bank',
                  institution_id: metadata.institution?.institution_id ?? null,
                }),
              })
              setStatus(`Connected: ${metadata.institution?.name ?? 'bank'}`)
              await refresh()
            } catch (e) {
              setStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
            } finally {
              setBusy(false)
            }
          })()
        },
        onExit: () => { setBusy(false) },
      })
      handler.open()
    } catch (e) {
      setStatus(`Plaid Link failed to load: ${e instanceof Error ? e.message : String(e)}`)
      setBusy(false)
    }
  }, [refresh])

  const syncBalances = useCallback(async () => {
    setStatus(null)
    setBusy(true)
    try {
      const r = await syncTellerBalances()
      const cash = r.assetsSynced.reduce((s, a) => s + a.balance, 0)
      const fmt = formatCurrency
      const liab = r.liabilities.length
        ? ' · cards owed: ' + r.liabilities.map((l) => `${l.source} ${fmt(l.balanceOwed)}`).join(', ')
        : ''
      setStatus(`Synced ${r.assetsSynced.length} cash account(s) — ${fmt(cash)}${liab}. Reload to update net worth.`)
    } catch (e) {
      setStatus(`Balance sync failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [])

  const disconnect = useCallback(async (id: string, institution: string) => {
    if (!confirm(`Disconnect ${institution}? The access token will be deleted. You'll need to re-enroll to sync transactions again.`)) return
    try {
      await api<{ ok: true; deleted: number }>('/api/connectors/delete', {
        method: 'POST',
        body: JSON.stringify({ id }),
      })
      await refresh()
    } catch (e) {
      setStatus(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [refresh])

  return (
    <div className="glass-card p-6">
      <h3 className="font-semibold text-text-primary mb-2">Connectors</h3>
      <p className="text-xs text-text-muted mb-4">
        Connect a bank, card, or brokerage to auto-sync transactions into Iris.
        Access tokens are stored only in your own Postgres — never in Iris source or logs.
        <br />
        Environment: <span className="font-mono">{TELLER_ENVIRONMENT}</span> · App ID: <span className="font-mono">{TELLER_APPLICATION_ID}</span>
      </p>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={() => void openPlaidConnect()}
          disabled={busy}
          className="px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          {busy ? 'Opening Plaid…' : 'Connect a bank (Plaid)'}
        </button>
        <button
          onClick={openConnect}
          disabled={busy}
          title="Teller shut down its API in 2026 — kept only for reference; use Plaid."
          className="px-3 py-2 bg-surface-3 hover:bg-surface-4 rounded-lg text-xs text-text-muted transition-colors disabled:opacity-50"
        >
          {busy ? '…' : 'Teller (retired)'}
        </button>
        <button
          onClick={() => void syncBalances()}
          disabled={busy || items.length === 0}
          className="px-4 py-2 bg-surface-3 hover:bg-surface-4 rounded-lg text-sm font-medium text-text-secondary transition-colors disabled:opacity-50"
          title="Pull current cash balances from connected banks into your portfolio"
        >
          {busy ? 'Syncing…' : 'Sync bank balances'}
        </button>
        <button
          onClick={() => void refresh()}
          className="px-3 py-2 bg-surface-3 hover:bg-surface-4 rounded-lg text-xs text-text-secondary transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-text-muted">Loading connectors…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-text-muted">No connectors yet. Click "Connect a bank" to enroll your first institution.</p>
      ) : (
        <ul className="divide-y divide-surface-3 border border-surface-3 rounded-lg overflow-hidden">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3 bg-surface-2/40">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{c.institution}</div>
                <div className="text-xs text-text-muted">
                  {c.provider} · enrolled {new Date(c.created_at).toLocaleDateString()} ·{' '}
                  <span className={c.status === 'active' ? 'text-positive' : 'text-negative'}>{c.status}</span>
                </div>
              </div>
              <button
                onClick={() => void disconnect(c.id, c.institution)}
                className="px-3 py-1.5 bg-surface-3 hover:bg-negative/20 hover:text-negative rounded-lg text-xs text-text-secondary transition-colors"
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      {status && (
        <p className={`text-xs mt-3 ${/fail|error/i.test(status) ? 'text-negative' : 'text-positive'}`}>{status}</p>
      )}
    </div>
  )
}

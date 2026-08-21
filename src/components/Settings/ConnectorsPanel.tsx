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
import { syncCoinbaseBalances } from '../../lib/syncCoinbaseBalances'
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

  /** `products` picks WHICH Link flow this is. Plaid filters the institution list
   *  to institutions supporting every product asked for, so a `transactions`
   *  token can't reach Coinbase or Robinhood (they expose `investments`) and an
   *  `investments` token won't show a normal chequing account. Two buttons, one
   *  function; the choice is recorded on the connector so the transaction
   *  importer knows to skip an investments-only item. */
  // ── Coinbase: its own key-based connector, because Plaid does not cover
  //    Coinbase at all (checked 2026-08-20). Read-only ECDSA key from the CDP
  //    portal; the key is validated by a live call before it is stored.
  const [cbConnected, setCbConnected] = useState<boolean | null>(null)
  const [cbKeyName, setCbKeyName] = useState('')
  const [cbPrivateKey, setCbPrivateKey] = useState('')
  const [cbOpen, setCbOpen] = useState(false)

  const refreshCoinbase = useCallback(async () => {
    try {
      const r = await api<{ ok: true; connected: boolean }>('/api/coinbase/status')
      setCbConnected(r.connected)
    } catch { setCbConnected(false) }
  }, [])

  useEffect(() => { void refreshCoinbase() }, [refreshCoinbase])

  const saveCoinbaseKey = useCallback(async () => {
    setStatus(null)
    setBusy(true)
    try {
      const r = await api<{ ok: true; wallets: number }>('/api/coinbase/connect', {
        method: 'POST',
        body: JSON.stringify({ keyName: cbKeyName.trim(), privateKey: cbPrivateKey }),
      })
      // Never keep the secret in component state after it's stored.
      setCbPrivateKey('')
      setCbOpen(false)
      setStatus(`Coinbase connected — ${r.wallets} wallet(s) with a balance. Hit "Sync Coinbase" to pull them in.`)
      await refreshCoinbase()
    } catch (e) {
      setStatus(`Coinbase rejected that key: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [cbKeyName, cbPrivateKey, refreshCoinbase])

  const syncCoinbase = useCallback(async () => {
    setStatus(null)
    setBusy(true)
    try {
      const r = await syncCoinbaseBalances()
      if (!r.connected) { setStatus('No Coinbase key stored yet.'); return }
      const top = r.holdings.slice(0, 4).map(h => `${h.ticker} ${formatCurrency(h.valueUsd)}`).join(' · ')
      setStatus(`Coinbase: ${formatCurrency(r.total)} across ${r.holdings.length} holding(s). ${top}`
        + (r.unpriced.length > 0 ? ` — no USD price for ${r.unpriced.join(', ')}, left out of the total.` : ''))
    } catch (e) {
      setStatus(`Coinbase sync failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [])

  const forgetCoinbaseKey = useCallback(async () => {
    setBusy(true)
    try {
      await api<{ ok: true }>('/api/coinbase/connect', { method: 'DELETE' })
      setStatus('Coinbase key forgotten.')
      await refreshCoinbase()
    } catch (e) {
      setStatus(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [refreshCoinbase])

  const openPlaidConnect = useCallback(async (products: 'transactions' | 'investments' = 'transactions') => {
    setStatus(null)
    setBusy(true)
    try {
      // 1) mint a link_token from our backend, 2) open Plaid Link, 3) exchange
      //    the returned public_token for a durable access_token (server-side).
      const { link_token } = await api<{ ok: true; link_token: string }>(
        `/api/plaid/link-token?products=${products}`, { method: 'POST' })
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
                  products,
                }),
              })
              const name = metadata.institution?.name ?? (products === 'investments' ? 'brokerage' : 'bank')
              if (products === 'investments') {
                // Pull it in NOW rather than telling the user to go find another
                // button. A brokerage is linked for exactly one reason — its
                // balance — so leaving net worth unchanged after a successful
                // connect just reads as "nothing happened". (Found the hard way:
                // Robinhood linked cleanly on 2026-08-20 and then sat invisible
                // until the next balance sync.)
                setStatus(`Connected: ${name}. Pulling the balance in…`)
                try {
                  const r = await syncTellerBalances()
                  const landed = r.assetsSynced.map(a => `${a.name} ${formatCurrency(a.balance)}`).join(' · ')
                  setStatus(`Connected: ${name}. ${landed || 'No balances came back yet — try Sync bank balances in a minute.'}`)
                } catch (e) {
                  setStatus(`Connected: ${name}, but the balance pull failed: ${e instanceof Error ? e.message : String(e)}. Try "Sync bank balances".`)
                }
              } else {
                setStatus(`Connected: ${name}`)
              }

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

  const runPlaidDryRun = useCallback(async () => {
    setStatus(null)
    setBusy(true)
    try {
      const r = await api<{ ok: true; totalKept: number; through: string; written: number; perAccount: Array<{ institution: string; accountName: string; kept: number }> }>(
        '/api/plaid/import?dryRun=1',
        { method: 'POST' },
      )
      const byAcct = r.perAccount.map((a) => `${a.accountName}: ${a.kept}`).join(' · ')
      setStatus(`Dry run — would import ${r.totalKept} transaction(s)${r.through ? ` through ${r.through}` : ''}. Nothing written. ${byAcct}`)
    } catch (e) {
      setStatus(`Dry run failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [])

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
        Connect a bank or card to auto-sync transactions. Connect a brokerage
        (Fidelity, Robinhood, and the exchanges Plaid covers — Kraken, Gemini,
        Binance.US) to feed its balance into net worth; those have no transactions
        to import, so Iris won't ask them for any. Coinbase is NOT on Plaid — it
        has its own key-based connector below.
        Access tokens are stored only in your own Postgres — never in Iris source or logs.
        <br />
        Environment: <span className="font-mono">{TELLER_ENVIRONMENT}</span> · App ID: <span className="font-mono">{TELLER_APPLICATION_ID}</span>
      </p>

      {/* Coinbase — separate on purpose. Plaid's Coinbase integration is the
          OTHER direction (Coinbase verifying your bank), so the only read path
          for the crypto itself is Coinbase's own API. */}
      <div className="mb-4 rounded-xl border border-glass-border bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary">
              Coinbase {cbConnected === true && <span className="text-positive text-xs font-normal">· connected</span>}
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Not available through Plaid — that connection only lets Coinbase check your bank.
              This uses a <strong>read-only</strong> key from Coinbase instead: portal.cdp.coinbase.com → API keys →
              Create (permission <span className="font-mono">View</span>, signature algorithm <span className="font-mono">ECDSA</span> — Ed25519 will not work).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setCbOpen(v => !v)} disabled={busy}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-surface-3 hover:bg-surface-4 text-text-secondary transition-colors disabled:opacity-50">
              {cbConnected ? 'Replace key' : 'Add key'}
            </button>
            <button onClick={() => void syncCoinbase()} disabled={busy || !cbConnected}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-accent/20 border border-accent/50 text-accent-light hover:bg-accent/30 transition-colors disabled:opacity-40"
              title="Read balances and write them into net worth">
              {busy ? '…' : 'Sync Coinbase'}
            </button>
            {cbConnected && (
              <button onClick={() => void forgetCoinbaseKey()} disabled={busy}
                className="px-2 py-2 rounded-lg text-xs text-text-muted hover:text-negative transition-colors disabled:opacity-50">
                Forget
              </button>
            )}
          </div>
        </div>
        {cbOpen && (
          <div className="mt-3 space-y-2">
            <input value={cbKeyName} onChange={e => setCbKeyName(e.target.value)}
              placeholder="Key name — organizations/…/apiKeys/…"
              className="w-full bg-surface-2 border border-glass-border focus:border-accent/50 rounded-lg px-2 py-1.5 text-xs font-mono text-text-secondary outline-none" />
            <textarea value={cbPrivateKey} onChange={e => setCbPrivateKey(e.target.value)}
              placeholder={'-----BEGIN EC PRIVATE KEY-----\n…\n-----END EC PRIVATE KEY-----'}
              rows={4}
              className="w-full bg-surface-2 border border-glass-border focus:border-accent/50 rounded-lg px-2 py-1.5 text-xs font-mono text-text-secondary outline-none" />
            <div className="flex items-center gap-2">
              <button onClick={() => void saveCoinbaseKey()} disabled={busy || !cbKeyName.trim() || !cbPrivateKey.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent hover:bg-accent-dim text-white transition-colors disabled:opacity-40">
                {busy ? 'Checking…' : 'Save + verify'}
              </button>
              <span className="text-[10px] text-text-muted">
                Verified against Coinbase before it's stored, and it lands in your own Postgres — same as every other token here.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={() => void openPlaidConnect('transactions')}
          disabled={busy}
          className="px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          {busy ? 'Opening Plaid…' : 'Connect a bank (Plaid)'}
        </button>
        <button
          onClick={() => void openPlaidConnect('investments')}
          disabled={busy}
          title="Fidelity, Robinhood, Kraken, Gemini — balances feed net worth. These have no transactions to import, so Iris won't try. (Coinbase is not on Plaid — see its own connector.)"
          className="px-4 py-2 bg-accent/20 border border-accent/50 hover:bg-accent/30 rounded-lg text-sm font-medium text-accent-light transition-colors disabled:opacity-50"
        >
          {busy ? 'Opening Plaid…' : 'Connect a brokerage (Plaid)'}
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
          onClick={() => void runPlaidDryRun()}
          disabled={busy || items.length === 0}
          className="px-3 py-2 bg-surface-3 hover:bg-surface-4 rounded-lg text-xs text-text-secondary transition-colors disabled:opacity-50"
          title="Preview what a Plaid import would pull — writes NOTHING"
        >
          {busy ? '…' : 'Test Plaid import (dry-run)'}
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

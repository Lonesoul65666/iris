---
name: project-iris-handoff-2026-07-18
description: "Iris handoff 2026-07-18 — READ FIRST (with [[project-iris-backlog]]). Plaid fully live: bank/card transactions + balances + all 3 Fidelity investment accounts now feed net worth. Scott crossed $1M net worth (~$1,001,842). Fixed an account-id collision that hid 2 Fidelity accounts; flat-backfilled the trend line to Apr 29 (no cliff). Auto-refresh: 12h host timer (transactions) + on-open (transactions+balances). Subscription watchdog + auto-refresh shipped earlier this arc. 316 tests. When Scott says 'continue Iris', surface the backlog."
metadata: 
  node_type: memory
  type: project
  originSessionId: b5b6daf6-8dcb-4cc3-8b06-70219bf8d84b
---

# Iris handoff — 2026-07-18 · READ FIRST (+ [[project-iris-backlog]])

Supersedes [[project-iris-handoff-2026-07-13]] as read-first (its content — Plaid migration, Tailscale Funnel, auth hardening, always-on host — all still valid). Repo `C:\Claude\projects\signal\signal-app` on **master**, pushed (latest `abc692b`). **316 tests**, tsc clean, prod build OK.

**On any new Iris session: read this + [[project-iris-backlog]] and show Scott the prioritized 3-bucket list.**

## 💰 Net worth is now REAL and complete — Scott crossed $1M
Plaid returns all 3 Fidelity accounts; they now feed net worth correctly:
- ABNORMAL AI 401(k) (1720) — **$71,865** · Individual-TOD brokerage (3549) — **$311,977** · MIMECAST 401(k) (9348) — **$57,592**
- + BofA checking/savings/joint (~$175k) + home equity (~$185k) + car ($200k) = **~$1,001,842** ("$1.0M" on the headline — display rounds to millions; not literally a round million).
- **⚠️ $1M crossing fired NO celebration** — no net-worth-milestone achievement exists. Bucket-1 backlog item (Scott wants big splashy milestone celebrations).

## 🐛 The bug we fixed (account-id collision)
mapAccountSource only knows Citi/CapOne/BofA → **all 3 Fidelity accounts mapped to source `other` → same id `teller-other` → they overwrote each other**, so only Mimecast survived (and it was mis-typed as `bank` cash, inflating "safe to spend" risk). Fix (`abc692b`):
- Balance sync now INCLUDES investment accounts (`handlePlaidBalances`: depository=asset, credit=liability, **investment=investment**, loan/other skipped).
- Each account gets a **unique id** — investments use `plaid-inv-<plaidAccountId>`; depository stays `teller-<source>`. Typed by subtype (401k/ira/roth_ira/hsa/brokerage).
- `totalLiquid = sum(all accounts' totalValue)` so investments count in net worth; "Safe to Spend" is budget-based (separate) so a 401k does NOT leak into spendable. Verified.

## 🧹 One-time data fix (scripts/fix-networth-backfill.ts, backed up)
Ran against the shared DB (backup at `scripts/backups/networth-backfill-backup.json`):
- **Deleted the duplicate** old mis-mapped Mimecast row (`accounts` key `teller-other`).
- **Corrected today's snapshot** (removed the dup → $1,001,842).
- **Flat-backfilled** the Fidelity total (**+$441,434**) across all 39 historical snapshots (back to 2026-04-29) so the trend line rises smoothly instead of cliff-jumping on Jul 18. Scott's explicit call: flat is fine, don't reconstruct market history; real deviations accrue forward. Line now $829,968 (Apr 29) → $1,001,842 (today). The small ~$14k step near today is REAL bank-cash catch-up (balances were frozen while Teller was dead).

## 🔁 Auto-refresh model (shipped this arc — the "one change, live there")
- **Transactions:** host **12h server timer** (`server/plaid-sync.ts`, `PLAID_AUTOSYNC_HOURS` default 12) + **on-open** (debounced 5 min). Import cores extracted (`runPlaidImport`/`runPlaidImportIncome`) so timer + endpoints share logic. Writes `last_teller_sync` marker so staleness UI reflects timer runs.
- **Balances/net worth:** **on-open** only (`syncTellerBalances` in DashboardView mount effect, if >4h stale). DECIDED not to add balances to the server timer — you only see net worth when the app's open, and doing it right would need server-side snapshot generation; marginal. The manual "Sync bank balances" (Settings→Connectors) is now just a "do it now" override.
- **PLAID_ENV=production** on the host AND now on the dev machine's `.env.local` (Scott added Plaid client_id + prod secret to `C:\Claude\...\.env.local` so probes can run from dev).

## ✅ Also shipped earlier this arc (see [[project-iris-handoff-2026-07-13]])
Teller→Plaid full migration, Tailscale Funnel (public URL, no client install), auth hardening, subscription watchdog (cancel/ignore/resurrection/new-charge), dashboard de-emoji + capitalization, balance-sync-to-Plaid fix.

## Probe/utility scripts written this arc (untracked, one-offs — do NOT commit)
`scripts/probe-cc-freshness.ts`, `probe-investments.ts`, `probe-networth.ts`, `probe-snapshots.ts`, `fix-networth-backfill.ts`. Handy templates for reading Plaid/DB state from dev.

## Gotchas (still current)
- Two syncs, different buttons: dashboard **"↻ Update"** = TRANSACTIONS; Settings→Connectors **"Sync bank balances"** = BALANCES/net-worth accounts. On-open does both.
- Frontend changes need host rebuild + **hard-refresh** (Ctrl+Shift+R); server changes need **restart**.
- Push to `master` needs explicit in-session user OK (classifier); the Update button pulls `--ff-only` from master.
- `npx tsc` outside the app dir hits a squatter ("not the tsc you are looking for") — `cd /c/Claude/projects/signal/signal-app` first; check real result via `${PIPESTATUS[0]}`.
- Dedup floor `PLAID_CUTOVER=2026-07-07` in syncTellerTransactions.ts (Teller owns ≤07-06, Plaid ≥07-07).

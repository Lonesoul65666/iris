---
name: project-iris-handoff-2026-07-13
description: "Iris handoff 2026-07-13 — READ FIRST. Teller SHUT DOWN its API (2026); bank/card sync fully migrated to PLAID (all slices shipped: connect, import, income, balances, dashboard cutover, dedup floor). Tailscale Funnel live (public URL, no client install). Subscription watchdog shipped (cancel/ignore + resurrection & new-charge alerts). Dashboard de-emoji + capitalization. Fidelity/Coinbase never used Teller (unaffected); Plaid Investments→Portfolio is a PARKED future project. 316 tests, all on master."
metadata: 
  node_type: memory
  type: project
  originSessionId: b5b6daf6-8dcb-4cc3-8b06-70219bf8d84b
---

# Iris handoff — 2026-07-13 · READ FIRST

Supersedes [[project-iris-handoff-2026-07-08]] as read-first (its content — always-on host, auth hardening, start-iris.bat, boot auto-start — all still valid). Repo `C:\Claude\projects\signal\signal-app` on **master**, pushed to github.com/Lonesoul65666/iris (latest `df4af37`). **316 tests**, tsc clean.

## 🌐 Tailscale Funnel is LIVE (remote access solved)
Public URL **`https://iris.tailb5491b.ts.net`** — reachable from ANY browser, **nothing installed on the client** (Scott's hard requirement: he switches devices constantly, wants to show buddies, can't install VPN clients on his work machine). Chose **Funnel** (public) over `tailscale serve` (tailnet-only, needs client). The login is the only gate — which is why the auth hardening ([[project-iris-handoff-2026-07-08]]) had to land first.
- **Gotcha that cost time:** funnel reported "Available on the internet" but was unreachable externally until **HTTPS certs** were enabled (admin console → DNS → "allow HTTPS certs") + `tailscale cert iris.tailb5491b.ts.net` + funnel restarted. CLI lies about readiness before the cert issues.
- Run: `tailscale funnel --bg 5173` on the host. Full-path form on Windows: `& "C:\Program Files\Tailscale\tailscale.exe" funnel --bg 5173`.
- Tailscale "device sharing" invite screen ≠ Funnel — that one DOES need the client; ignore it.

## 💥 TELLER SHUT DOWN — migrated everything to PLAID
Mid-session, **Teller.io announced it's shutting down its entire API** (HN: news.ycombinator.com/item?id=48841633). That's why bank reconnects started failing. Evaluated replacements: **Plaid** wins for US-personal (free Trial plan = real data, 10 lifetime connections, $0). Akoya = enterprise-gated; GoCardless = EU-only + winding down. **Full Plaid migration SHIPPED and live on Scott's real banks.**

**Plaid account/config:** free **Trial plan** (created 2026-07; 10-connection lifetime cap, no time limit). Compliance Center → **App profile completed** (required for OAuth banks — website URL = the ts.net funnel URL, reason-for-access text). Host `.env.local` now has `PLAID_CLIENT_ID` + `PLAID_SECRET` (**production** secret) + `PLAID_ENV=production`. (Built/tested in `sandbox` first with `user_good`/`pass_good`.)

**Architecture (mirrors the old Teller stack, reuses its logic):**
- `server/plaid-client.ts` — fetch-based (NO mTLS, unlike Teller; client_id+secret in body). Env base URLs sandbox/production. Fns: config status, link-token, public-token exchange, getAccounts (with balances), getTransactions (bounded /transactions/get, paginated), transactionsSync (unused, kept).
- `server/plaid-map.ts` — **ADAPTS** Plaid txn/account into Teller shapes and **reuses `teller-map.ts` wholesale** (identical classification). KEY: Plaid sign convention (positive = money OUT for all accounts) is **flipped for depository** to match Teller (positive = inflow on cash); credit cards already agree. Subtype normalized (credit → credit_card). Ids re-prefixed `teller_`→`plaid_`.
- `server/api-handlers/plaid.ts` — `/api/plaid/{status,link-token,exchange,accounts,balances,import,import-income}`. Import mirrors Teller's (posted-only, merchant-mapping + tombstone-aware, edit-preserving upsert, reversible `plaid-<ts>` batch, `?since=&dryRun=1`).
- Connectors panel: **"Connect a bank (Plaid)"** (Plaid Link popup) + **"Test Plaid import (dry-run)"** button (safe preview, writes nothing). Teller connect button demoted to "Teller (retired)".
- Access tokens stored in the SAME `connectors` table, `provider='plaid'`.

**Dashboard cutover:** `src/lib/syncTellerTransactions.ts` now calls `/api/plaid/import[-income]` (export/state-key names kept as "teller" to avoid churn — they mean "bank sync"). `syncTellerBalances.ts` now calls `/api/plaid/balances` (was silently hitting dead Teller → Scott caught cash balances not updating).

**⚠️ Dedup floor `PLAID_CUTOVER='2026-07-07'`** in syncTellerTransactions.ts: Teller's imported rows (`teller_` ids) end 2026-07-06; Plaid owns ≥07-07 (`plaid_` ids). The floor stops the trailing sync window from re-pulling pre-cutover dates and creating duplicate rows for the same real transaction. No data loss — full history intact, one provider per date. No-op after the window naturally passes the cutover (~late July).

**Live state:** real banks connected via Plaid (BofA checking/savings/joint + Citi confirmed in the dry-run; **Cap One was NOT in the dry-run — may still need connecting**). Real import ran, transactions current through today. Teller connectors are inert (nothing reads `provider='teller'`) and safe to delete (deleting a connector row does NOT touch imported `teller_` transaction history).

## 🔭 Fidelity / Coinbase — NOT on Teller, and a PARKED future project
Neither ever went through Teller (probe confirmed only 3 bank Teller connectors). **Fidelity = manual CSV uploads today; Coinbase = its own API.** So Teller's death didn't touch them.
- **PARKED (Scott's explicit "for later"):** wire **Plaid Investments** product → the **Investments/Portfolio area** (NOT budget). The `Account`/`Holding` model in `src/types/portfolio.ts` maps ~1:1 to Plaid `/investments/holdings` (ticker/name/assetClass/shares/costBasis/price/value). Would replace CSV. **Separate ~3-slice build** (investments link-token product + holdings endpoint + Portfolio sync). **CAVEAT:** Fidelity is gated on Plaid (Akoya lockdown since 2023; paid-plan/approval, not the free Trial) — may not connect on the trial even built; other brokerages fine. Don't promise Fidelity-on-trial.

## ✅ Subscription watchdog SHIPPED (`df4af37`)
Scott's idea, built this session. **Subscriptions & Recurring is now interactive:**
- Hover a charge → **Canceled** or **"Not a sub" (ignored)**; **Restore** undoes. Canceled + ignored drop out of the active monthly total AND the Coming Up forecast.
- **Resurrection alert:** a canceled charge that bills again AFTER its cancel date → red inline flag + top-of-dashboard nudge ("cancellation didn't take"). Exactly the SUNO/OpenAI case Scott described.
- **New-charge alert:** a recurring charge not in the "known" baseline → top nudge. **First run seeds the baseline SILENTLY** (no flood for existing subs); only genuinely-new arrivals alert after.
- Files: `src/utils/subscriptionRadar.ts` (status-aware, partitions active/canceled/ignored + resurrection), `src/utils/subscriptionNudges.ts` (pure nudge builder), `SubscriptionRadar.tsx` (row actions), `DashboardView.tsx` (state + reconcile effect mirroring the syncNudges pattern + handlers). Settings: `subscription_status` (map) + `subscription_baseline` (known keys). +8 tests.

## ✅ Auto-refresh SHIPPED (`35deb95`) — retired the manual-refresh chore
Researched Plaid limits (Scott asked): **Trial plan = UNLIMITED API calls** (only the 10-Item cap), rate limits huge (50/min per Item), Plaid refreshes banks 1–4×/day and is built for regular syncing. So Teller's "never poll" constraint is GONE. Weighed webhooks vs timer and **recommended AGAINST webhooks** for a personal app (more surface area, negligible freshness gain, won't outgrow the timer since scale/cost/real-time never apply) — Scott agreed, chose timer + on-open.
- **Extracted import cores** `runPlaidImport` / `runPlaidImportIncome` (pool, userId, opts) in plaid.ts; HTTP handlers are now thin wrappers. Shared `upsertMappedRows` + `fetchPlaidConnectors`. So timer + endpoints run identical logic (tombstones/mappings honored — no deleted-row resurrection on auto-sync).
- **`server/plaid-sync.ts`** — `startPlaidAutoSync()`: once ~1 min after boot, then every `PLAID_AUTOSYNC_HOURS` (default 12, 0=disable). Clamps `since` to the 2026-07-07 cutover floor. Writes `last_teller_sync`(+summary) settings so the staleness UI reflects timer runs. No-op if Plaid unconfigured. Wired into standalone.ts after listen (host-only).
- **On-open refresh** in DashboardView: `syncTellerTransactions()` (5-min debounced) on mount + `syncTellerBalances()` if >4h stale. Fire-and-forget (no auto-reload; new rows show on next natural load).
- Manual "↻ Update" button stays as a "do it now" override. The "haven't refreshed in N days" nudge should now rarely fire. What's New retitled "Auto-refresh + subscription watchdog".
- **Webhooks explicitly DECIDED-AGAINST** (not a TODO). If ever revisited: SYNC_UPDATES_AVAILABLE for transactions, HOLDINGS/INVESTMENTS_TRANSACTIONS DEFAULT_UPDATE for investments; needs public endpoint (funnel exists) + JWT signature verification + per-Item webhook registration + /transactions/sync+cursor migration. Not worth it for a 2-person app.

## 🎨 Dashboard de-emoji + capitalization (Scott dislikes icons)
"Coming Up · Next 30 Days" + "Subscriptions & Recurring" capitalized; the 📅/🔁 section icons + the per-row category emoji removed; `DashSection.icon` made optional. **Scott said "get rid of all the stupid icons" — a broader app-wide emoji purge was NOT done** (only these sections); he may want that swept later.

## ⏭️ PENDING / NEXT
- **"VA" capitalization in "Spend by account"** — Scott reported a label showing lowercase; couldn't identify which from code. Ask him for the exact label; one-line fix.
- **Connect Cap One via Plaid** if he wants it (wasn't in the dry-run).
- **Plaid Investments → Portfolio** (the parked project above) when he's ready.
- Optional: broader emoji removal across the app; delete the inert Teller connectors for tidiness.

## Token-efficiency note (Scott asked)
Reading code directly (targeted files + grep) is the CHEAP path for building. The browser/Iris live view is for VERIFYING and is token-EXPENSIVE (screenshots are images) — use sparingly. Do NOT run the dev server against the shared prod DB to "verify" features with load-time write side-effects (e.g. the watchdog baseline seed) — let the host be first to write. Rely on unit tests + host verification.

## Gotchas (still current)
- Fresh clone MUST `npm run build` once (dist/ not in repo). Dashboard/frontend changes need a host rebuild + browser hard-refresh (Ctrl+Shift+R) — cached JS hides new UI.
- `git pull` on the host fails if a committed file collides with a hand-created local one (`Remove-Item` the local copy, re-pull). Bit us with start-iris.bat.
- Push to `master` needs explicit in-session user authorization (classifier blocks otherwise); the Update button's `git pull --ff-only` requires the fix ON master.
- Bash cwd usually persists but can reset to `C:\Claude` — `cd /c/Claude/projects/signal/signal-app` before npm/tsc; `npx tsc` outside the app dir hits a squatter package ("not the tsc you are looking for"). Check real result via `${PIPESTATUS[0]}`.
- APP_VERSION (src/updates.ts) is a MANUAL release-notes version, not git — bump it + add a UPDATES entry only for real user-facing releases (drives the What's New card). Now `2026.07.13`.

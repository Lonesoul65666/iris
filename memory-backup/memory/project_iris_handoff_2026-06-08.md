---
name: Iris session handoff (2026-06-08 — Teller connector SHIPPED end-to-end + clean-slate real-data import + categorization)
description: Built the entire Teller connector this session (T1 mTLS client, T2 in-app enrollment, T3 transaction import) and did a clean-slate rebuild of the budget on real bank data. 1,688 real transactions (Sept 2025→today, $211k) now drive the budget, replacing the stale 638 CSV/SimpleFIN rows. Found the single-income transition date empirically (Claire's last paycheck Aug 1, 2025). Re-categorized via the existing merchant-tuned classifier ('other' 736→200). Commits 4bcc42a, 1e269fc, e652352, 974c0a6.
type: project
originSessionId: 2026-06-08-teller-connector-clean-slate
---

## ⭐ LATEST STATE (read first): Teller connector LIVE, budget runs on real data

**📍 REPO: `C:\Claude\projects\signal\signal-app`** (Iris = product; repo = `signal`. No folder named "iris".) Latest commit **`974c0a6`**, tree clean, type-check green. Dev server port 5173.

This session shipped the connector the 2026-05-10 handoff said was NEXT, then went further and rebuilt the budget on real data AND categorized it. Six commits on top of `3aa7759` (latest **`6733b65`**):
```
6733b65 feat(categorize): expand merchant classifier — 'other' 200 → 14 (0.8%)
974c0a6 feat(expenses): re-categorize via existing merchant-tuned classifier
e652352 feat(teller): Build-T3 — import transactions to expenses (clean-slate on single income)
1e269fc feat(teller): Build-T1 — server-side mTLS client + /api/teller/accounts
4bcc42a feat(connectors): Build-T2 — in-app Teller enrollment lands tokens in user Postgres
```

### What's now true
- **All 3 institutions connected & syncing** via Teller: Citibank (1 card), Capital One (1 card), Bank of America (3 accounts). Tokens live in Scott's Postgres `connectors` table. Re-enrollment is DONE — one-time, in-app, never again.
- **Budget runs on 1,688 real transactions**, Sept 1 2025 → today, ~$211k. Old 638 CSV/SimpleFIN rows pruned. Real monthly spend curve (~$22k/mo full months, spiking Jan–Apr from Dubai/Hawaii travel).
- **Categorized**: 'other' went 736 → **14 (0.8%)** across an auto-pass + 3 rule-expansion passes of `src/utils/transactionCategorize.ts` (commits 974c0a6 + 6733b65). Dashboard spending-by-category is real (Housing $3,200 = WF mortgage). Remaining 14 are legit-uncategorizable (card/bank/gov fees) or true one-off unknowns for the merchant-learning review flow. New `debt` line catches CC interest; ATM withdrawals → personal; Kona/Hawaii fixed to travel_personal.

### Teller specifics (LOCKED facts)
- **App ID `app_prt5j01vo1ij37cq5i000`** (public, in code). Dev app "Iris Finance" CONFIRMED still active after the gap.
- **Certs at `C:\Claude\projects\Teller\` (certificate.pem + private_key.pem).** Outside the repo (git confirmed). ⚠️ `.env.local` references them by ABSOLUTE path (`TELLER_CERT_PATH`/`TELLER_KEY_PATH`) — **if Scott moves the `projects` folder, update those paths.** `.env.local` is gitignored. A stray duplicate cert copy was at `C:\Users\ScottDeluke\teller\` — Scott can delete it.
- **Teller dev tier is RATE-LIMITED and stingy (429 too_many_requests).** Repeatedly re-paginating all ~3,867 txns exhausted it several times this session (resets in a few min). LESSON for T4: fetch ONCE, persist, never re-hit Teller for analysis. `fetchAllTransactions({sinceDate})` now early-stops at the cutoff to stay frugal.

### The 5 accounts + how Scott uses them (drives categorization)
- **Citi AAdvantage (3306) → `credit_card_1`** — THE main spending card. 1,514 txns, diverse. Was the 'other' pile (Teller returns no category for Citi).
- **CapOne Quicksilver (0114) → `credit_card_2`** — mostly recurring (subscriptions/utilities). 121 txns. Teller DID categorize these.
- **BoA Main Checking (8256) → `bofa_checking`** — real bills that can't go on a card (WF mortgage, Just Energy, Verizon, City of Fort Worth, Liberty Mutual insurance) + occasional ATM withdrawals. 53 kept.
- **BoA "Our stuffs" (1006)** — secondary/transfer-only. Fetched, 0 expenses (excluded by design).
- **BoA Super Savings (3784)** — savings, transfers + interest only. Fetched, 0 expenses (excluded).

### Double-count avoidance (the load-bearing mapping rule — see server/teller-map.ts)
- **Credit cards: purchases are POSITIVE amounts** → expenses. Negatives = payments/refunds → skip.
- **Checking: keep only genuine bills.** Exclude inflows, Teller transfer/card_payment/deposit/interest types, investment category, AND a payee-pattern filter for card payments / brokerage transfers Teller mislabels as plain `ach` (e.g. "CITI CARD ... DES:PAYMENT" — a $11,868 leak the dry-run caught). Mortgage ("WF HOME MTG") deliberately survives.
- **Savings / secondary accounts: skip entirely.**
- Deterministic ids (`teller_<txnId>`) = idempotent re-import. `importBatch` tag = reversible via `/api/expenses/delete {batchPrefix}`.

### Single-income transition (found empirically from deposit data)
- **Claire's last paycheck: Aug 1, 2025 = $69,199.42** (TriNet Ambrose — the severance/COBRA mega-check). No secondary income after. (Her regular pay was ~$3,568 semi-monthly before.)
- **Cutoff LOCKED at Sept 1, 2025** — first fully single-income month; cleanly excludes the $69k outlier. This is the budgeting baseline ("how far over our skis on one income").
- **Scott's income (single):** "Abnormal Sec-OSV" = base, semi-monthly (~$7,780 + larger month-end = variable/RSU). "Abnormal AI Inc · Coupa Pay" (~$3k sporadic) = **work-expense REIMBURSEMENTS, not salary** (Coupa = expense system).

### Backup
Pre-prune full backup at **`C:\Claude\projects\signal\backups\iris-backup-pre-teller-prune-2026-06-08.json`** (1.4MB, verified to contain the 638 old rows + 22 income sources + 45 collections + 12 settings).

## Categorization & work-expense approach — DECIDED 2026-06-08 eve (keep it simple)
Scott course-corrected AWAY from over-engineering. Locked decisions:
- **Work/personal can NOT be ruled.** Same merchants appear both ways (Marriott, Uber, United = work OR personal). No merchant/location/category rule works — the classifier even mislabeled Kona Village/Hawaii (a personal vacation) as `travel_work`.
- **HARD REQUIREMENT (Scott, stated twice, emphatic): manual work-expense classification.** Anything that *could* be a work expense, Scott must be able to flag BY HAND. Auto-categorization is only ever a starting point; manual override is mandatory. **SHIPPED this session (commit `45f82f4`):** the transaction list (Budget → Transactions) now has a clear per-row "Work?" column with a one-click **🏠 Personal ↔ 💼 Work** pill (was an undiscoverable unlabeled emoji under a "Tag" header). Clicking flips `isWorkExpense` + sets `reimbursementStatus` 'pending'/'not_reimbursable', persisted. Per-row category dropdown also already exists (learns merchant mapping on change). Validated in real Chrome; data left at 0 flagged. REMAINING follow-on: reimbursement matching against the Coupa deposits + gross-vs-net spend views.
- **WORK MODEL SHIPPED & UNIFIED (commits `ce22c78` + `e88923f`, 2026-06-09).** "Flag as work" and the "Work Expenses" category are now ONE concept (Scott's call): marking a row work sets isWorkExpense=true AND recategorizes it to `travel_work` (out of its old category) + reimbursementStatus 'pending'; unmarking restores the real category via guessCategory. Category dropdown is two-way synced (pick "Work Expenses" → flagged). Work is **pulled out of overall spend everywhere**: `computeMonthlySpending` excludes (isWorkExpense || travel_work) from totalExpenses (new `totalWork` field), and DashboardView's spend breakdown excludes travel_work too. Month-over-month work view = the existing `WorkReimbursementsCard` (Budget overview: This month / Last 90 / YTD, spent vs reimbursed vs net pending). Validated in real Chrome end-to-end. NEXT follow-on: reimbursement matching against the Coupa deposits (income cleanup) to turn "pending" into "reimbursed".
- **NO work-expense reconciliation engine.** Scott's cash-flow insight settles it: *until the reimbursement lands, the charge is a real cost.* So work charges simply count as spending; the **Coupa Pay deposits are the offset** that arrives later (net wash, true to cash position). Zero extra work. (Optional someday: he can export approved/submitted expenses, but he judged it more effort than it's worth.)
- **Amazon stays ONE bucket — on purpose.** Don't decompose it (Amazon billing is hostile; no API). The single "Amazon $X/mo" line IS the tool: Scott's goal is to *drive Amazon spend down* (fewer impulse buys → store trips) — a real savings lever. Rejected the Amazon order-history-CSV reconciliation idea.
- **Categorization rhythm = light manual upkeep every few weeks**, with the classifier LEARNING each merchant (saveMerchantMapping) so a merchant is only ever categorized once. Auto-pass already ran ('other' 736→200); remaining work is review/fix the stragglers, not re-run from scratch (re-categorization is cheap/idempotent — `/api/expenses/recategorize?all=1` anytime).
- Possibly collapse `travel_work`/`travel_personal` → one `travel` category (the work/personal distinction lives in cash-flow timing, not the category).

## 🔍 SYSTEM AUDIT (2026-06-09, 4 parallel agents) — read before the next phase
Ran architecture / packaging / code-health / security auditors. Summary + the actionable list:

- **Architecture — grade B; server A-.** Do NOT need to break it up to proceed, but 3 refactors are worth doing soon: (1) **extract `deriveBudgetFromExpenses()`** — the budget pipeline is copy-pasted in 3 places (BudgetView mount, AppDataContext mount, AppDataContext view-switch) — highest-leverage, correctness risk; (2) pull bank-statement parsing out of ExpenseManager (1,226 lines) into `utils/statementParsers.ts` (testable); (3) split BudgetView (1,643 lines) into tab shell + MonthlyDetailTab/BudgetEditorTable/CategoryDrilldownModal + `useBudgetData()` hook. Also: AppDataContext is a 735-line god-context with 6 inline migrations. IntelligenceView/PortfolioView are big (~1,250) but already internally decomposed — leave them.
- **Packaging — THE blocker for the personal-PC move: there is NO production server.** The entire API (DB, Teller mTLS, all `/api/*`) lives inside Vite dev-server middleware (`api-plugin.ts` `configureServer`) — it only runs under `npx vite`. The stale `dist/` is client-only; a packaged build would 404 every API call. **Highest-leverage next step = extract a standalone Node server** from the (already framework-agnostic) handlers; that unblocks ALL packaging. Then **Electron first** (runs the Node `server/` as-is) → **Tauri + SQLite** as the true local-first end-state (kills the Supabase dependency + the DevTools connection-string paste + absolute cert paths). Other portability blockers: absolute `TELLER_CERT_PATH` in `.env.local`, certs gitignored/outside-repo (must hand-carry), connection string in localStorage (manual paste on new PC), `.env.example` doesn't mention the Teller vars, migrations are loose `.sql` resolved by `import.meta.url` (must be copied in any bundle).
- **Code health — ZERO tests** (recommend vitest + test `classifyTellerTxn` double-count logic + `guessCategory` first), **18 real react-hooks lint issues** among ~114 total (rest cosmetic any/refresh noise; 3 are rules-of-hooks runtime-crash risk). **FIXED this session:** the double `client.release()` bug in teller.ts import + recategorize.ts (was release in both catch+finally → node-pg "already released" on error path). Dead code to delete eventually: `actionExecutor.verify.ts`, `migrate-indexeddb-to-postgres.ts` (one-shot, done), gitignored `public/teller-connect.html`.
- **Security — CLEAN. No critical/high.** Certs never logged/committed, `.env.local` gitignored, all SQL parameterized, no secrets in source, export endpoint excludes the connectors table. One cheap hardening win (LOW): `connectors/list` returns `access_token` to the client though nothing uses it — drop it from the SELECT to keep tokens off the wire.

**Recommended sequencing given the personal-PC move:** the standalone-server extraction (packaging blocker) is the thing that actually enables "move it and run it" — prioritize over the refactors. Then quick wins (vitest + first tests, the security token tweak), then the 3 architecture refactors.

### Data-layer direction — DECIDED 2026-06-09 (Scott), do NOT execute yet
Two things are still browser-local IndexedDB, not Postgres. Decisions on each:
1. **Net worth / portfolio (the $388,534) is a PLACEHOLDER to be broken & rebuilt from real data.** Scott: clear it; real wealth = **Teller account balances** (checking/savings = assets, credit cards = liabilities — Teller exposes balances, not just transactions) **+ manually-added assets** (house, investments, 401k) + later other connectors (Fidelity OFX / Coinbase). This is a Phase-2 net-worth rebuild (needs a balance-pull + an "add asset" entry UI). Clearing WITHOUT the rebuild just leaves a broken $0, so do it as one unit. NOT now.
2. **Merchant classification mappings must live in Supabase (device-agnostic), optionally cached locally + synced.** Currently in IndexedDB (`actionStore`), so manual merchant-category corrections do NOT travel to a new PC. Move to Postgres (a `merchant_mappings` table + swap `actionStore` calls to `/api/*`) — same pattern as the budgetStore migration. Scott: "no need to move stuff now." Deferred, documented.

## ⭐⭐ NEXT SESSION — START HERE

### 🔝 TOP PRIORITY (Scott, 2026-06-09): GET AWAY FROM BROWSER-BASED — "that change is needed now."
This is the lead task for the next session, ahead of the budget track below. It is the de-browserification, NOT distributable packaging. Scott was explicit: *"not ready to start packing up version after version"* (his other PC isn't set up yet) — so do the ARCHITECTURE shift, do NOT build Electron/Tauri installers yet.

What "get away from browser-based" concretely means (from the packaging audit):
1. **Extract a standalone Node server** from the Vite-dev-middleware API (`server/api-plugin.ts` `configureServer`). The handlers are already framework-agnostic `(req,res)` fns — create `server/standalone.ts` that registers the same routes via a shared function, so the backend runs WITHOUT `npx vite`. This is the keystone — today there is no server outside dev mode (the entire `/api/*` evaporates).
2. Reduce browser-storage dependence: the Supabase connection string lives in `localStorage` (manual DevTools paste on a new machine) and the merchant-mappings/action-items + portfolio still live in IndexedDB. Get config + data off the browser substrate. (Connection string → a config file/env the standalone server reads; merchant mappings → Postgres per the decision above.)
3. Keep Supabase for now (SQLite is the eventual local-first end-state but is a separate data-layer rewrite — not required for the de-browser step).
- Sets up: once the server runs standalone, packaging (Electron first, Tauri+SQLite later) becomes possible — but that's deferred until Scott's ready to package.

### Then — the budget track Scott aligned on (categorize → income cleanup → budget layout → T4):
1. **Income-side cleanup** — retire Claire's TriNet income source (one of the 22; predates single income), keep Scott's Abnormal base+variable, reclassify the Coupa deposits as `reimbursement` inflows (this also IS the work-expense offset — see decisions above). Income shows 0 in Monthly Detail because we imported only OUTFLOWS — decide whether to import inflows too or rely on income_sources config.
2. **Categorization is ~99% DONE** (only 14 'other' left, all legit fees/unknowns). Remaining work is a light merchant-learning review flow for stragglers as they appear on future syncs — NOT a bulk effort. Amazon stays one watch-line.
3. **Lay out budget targets** against the now-real categorized spending; show the single-income overspend trend by month.
4. **T4 — "Sync now" button + daily auto-sync.** MUST be frugal (rate limit). Investment-outflow tracking: classifier maps Fidelity/Coinbase→investing, but T3 import currently DROPS investment transfers — decide whether to KEEP them as `transactionType:investment` (watch double-count vs the existing "$2,000 investing" config figure). Coinbase connector = later.

### Open / non-blocking
- **Bulk-write perf:** T3 import (1,688 rows) and recategorize (751 rows) each do one-by-one UPDATEs to Supabase and exceed the 45s browser-eval timeout (they still COMMIT server-side; just check the DB after). Batch into multi-row writes when convenient.
- **Dashboard "current month" lag:** dashboard shows last-data month while Budget view correctly shows June. Known minor UX.
- **Net worth $388,534 is stale placeholder** (IndexedDB portfolio data, Phase 2) — Scott knows, deferred.
- Test suite still ZERO. Lint debt. BudgetView 1,643 lines. All post-this-work.

## Operating notes (NEW — apply going forward)
- **Validate in Scott's REAL Chrome by default via the Claude-in-Chrome extension** — navigate, screenshot, drive interactions myself. Do NOT make Scott narrate screenshots. (Scott stated this explicitly this session.) Browser deviceId pattern: list_connected_browsers → select → tabs_context_mcp createIfEmpty.
- Read-only Teller endpoints built this session for investigation: `/api/teller/status`, `/api/teller/accounts`, `/api/teller/probe`, `/api/teller/transactions` (?accountId, ?creditsOnly), plus `/api/teller/import` (?since, ?dryRun) and `/api/expenses/recategorize` (?all, ?dryRun).
- Partnership style held: dry-run before destructive writes (caught the double-count), import-then-verify-then-prune, explicit consent + verified backup before deleting the 638.

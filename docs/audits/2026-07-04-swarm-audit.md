# Iris Swarm Audit — 2026-07-04

53 agents · 44 raw findings → 32 verified (12 refuted) · 19 CONFIRMED · 5 high / 4 medium / 23 low.
Dimensions: money-math, data integrity, React correctness, dead code, type safety, security, resilience, packaging. Every finding adversarially re-verified before inclusion.

## Critical
*(None — no issue silently corrupts money in steady-state normal use without a triggering user action or fault.)*

## High
- **server/routes.ts:97** — No auth/authz on any `/api/*` route; server binds all interfaces, so any LAN device reads/exfiltrates all financial data and moves money — *fix:* shared-secret/PIN or session check in `requireContext()`, bind to loopback unless partner-mode is explicitly on. **CONFIRMED**
- **server/api-handlers/connectors.ts:47** — `handleConnectorsList` returns raw Teller bank bearer `access_token`s in the response body — *fix:* drop `access_token` from the SELECT/response. **CONFIRMED**
- **server/db-pool.ts:54** — Pool created with no `ssl` option and URI has no `sslmode`, so the DB link to remote Supabase runs plaintext (password + all rows) — *fix:* `ssl: { rejectUnauthorized: true }` + require `sslmode=require`. **CONFIRMED**
- **src/components/Settings/DataBackup.tsx:76** — Restore mixes REPLACE collections (buckets/stashes/funMoney — delete rows absent from backup) with upsert-only tables (expenses/accounts — stale rows survive), un-transactioned; an older/smaller backup silently deletes live data and a mid-loop failure leaves the DB half-restored — *fix:* wrap restore in a transaction / full-replace with rollback. **CONFIRMED**
- **.env.local:6** — Live Supabase URI with plaintext password copies verbatim when the folder moves off-machine — *fix:* exclude from any packaged artifact, `.env.example`-only distribution, rotate the password. **CONFIRMED**

## Medium
- **src/utils/savingsScorecard.ts:51** — `computeGuaranteedBase` uses `round(paycheckCount / distinctMonths)`, distorting the Safe-to-Spend take-home fallback in half-paycheck steps (worst in thin fresh/mid-import data; self-corrects with mature data) — *fix:* derive periods-per-month from pay cadence/date spacing. **CONFIRMED**
- **src/components/Budget/BudgetView.tsx:209** — `addBucket` keys on the slugged label; two labels that slug identically collide and the in-memory guard misses a bucket created on another device/tab, so `ON CONFLICT` overwrites budget/label and transactions merge into one lane — *fix:* re-fetch buckets before insert (as ExpenseManager does) / unique id independent of slug. **CONFIRMED**
- **collectionsClient / budgetStore `replaceCollection`** — list→save→N-deletes as separate un-transactioned round-trips with no version check; a mid-sequence drop resurrects deleted rows and two tabs/devices lost-update-clobber — *fix:* atomic server-side replace + `updated_at` version guard. **CONFIRMED**
- **src/lib/syncTellerTransactions.ts:135** — income-import fetch lacks the try/catch the tx fetch has and runs after the debounce is armed; a mid-sync drop skips `disarmDebounce()`, so for 5 min every retry short-circuits and the UI lies "Already up to date ✓" — *fix:* wrap the income fetch in the same try/catch. **CONFIRMED**

## Low
**Money/display consistency:** savingsScorecard.ts:123 (months with income=0 force-marked partial, drops real spend from banked/trend — CONFIRMED) · format.ts:3 (`$-2.5M` sign placement — PLAUSIBLE, unreachable at positive net worth) · ExpenseManager.tsx:38 (2-decimal formatter vs app's 0 — CONFIRMED) · GoalTracker.tsx:9 & ConnectorsPanel.tsx:195 (duplicate/divergent currency formatters — CONFIRMED).
**Crash/resilience (gated behind corrupted data / narrow fault windows):** dynamicActions.ts:103 (unguarded `equity.grants.filter()` — PLAUSIBLE) · IntelligenceView.tsx:1018 (`as any` pinned item `.action.toUpperCase()` — PLAUSIBLE) · main.tsx:22 (`boot()` no try/catch → white screen — PLAUSIBLE) · SyncStatus.tsx:68 (uncancellable reload can hit cold-start error — PLAUSIBLE) · budgetStore.ts:160 (`saveFunMoney` keys on `earnerId ?? person`, dup collapse — PLAUSIBLE) · db-pool.ts:38 (`ensureSingleUser` oldest-wins strands data if >1 user — PLAUSIBLE).
**Security hardening:** server/yf-proxy.ts:21 (Yahoo proxy forwards attacker-controlled path, host pinned — CONFIRMED, allow-list endpoints).
**State/UX:** BudgetView.tsx:128 (month selection resets on leave/return — cosmetic, PLAUSIBLE) · DashboardView.tsx:438 (`key={i}` on re-sorting lists → transient bar glitches — CONFIRMED) · GoalTracker.tsx:237 (no internal empty guard — PLAUSIBLE).
**Dead code:** IncomeSources.tsx, RecurringBills.tsx orphaned; InflowQuestions `compact` prop unreachable — delete (CONFIRMED, hygiene only).
**Packaging/DX:** package.json (server runs `.ts` directly, no build fallback — PLAUSIBLE; no `engines`/`.nvmrc` — CONFIRMED) · README.md stock Vite template (PLAUSIBLE) · vite.config.ts:20 port hardcoded (PLAUSIBLE).

## Ship-readiness
**Safe to live on for a month or two as-is, on the dev machine only** — single-user, loopback-usable desktop tool; no money-math or data-loss issue fires in steady-state normal use. The Medium money items are real but need thin data, label collisions, multi-tab/device concurrency, or a mid-sync drop to bite. **Immediate behavioral caution:** do NOT use Settings → Restore from backup with anything other than a current full backup until DataBackup.tsx:76 is fixed (an older backup silently deletes live buckets/stashes).

**Blocking before packaging off-machine with GitHub updates:**
1. Add auth to `/api/*` + stop binding all interfaces (routes.ts:97)
2. Stop returning Teller `access_token`s (connectors.ts:47)
3. Enforce DB TLS (db-pool.ts:54)
4. Keep `.env.local` out of the artifact + rotate the password (.env.local:6)
5. Make backup-restore transactional / non-destructive (DataBackup.tsx:76)

Strongly recommended alongside: pin Node (`engines`+`.nvmrc`), allow-list the Yahoo proxy, real README. Medium money-math/atomicity items scheduled next but not packaging blockers.

# Iris — Where We Are

**Last reviewed:** 2026-05-10 (Build-D2c shipped — app is now browser/laptop-agnostic, validated in real Chrome)
**Status:** Phase 0 foundation complete. Phase 1 mission widened (2026-05-02). **Storage migration to user-owned Postgres (ADR-0002) is functionally COMPLETE.** Foundation Build-B → D2c all shipped: middleware API + pool, schema runner + typed endpoints, income/expense + budget-config migration, budget store on Postgres, and now (Build-D2c) **settings + auth (PINs) + userProfile + audit log on Postgres**. Validated end-to-end in Scott's real Chrome: new-browser → paste connection string → log in → full identity + budget experience, all from Postgres. SimpleFIN removed. **Only IndexedDB residue left = Phase 2 investment stores** (holdings/equity/monthlyInvestments/snapshots/chat) — intentionally deferred, don't touch budget/auth. Cold-start error boundaries shipped 2026-05-10 (`dc5c734`) — a paused/unreachable DB now shows a recovery screen, never wedges on "Loading Iris…". **Next: connectors (Teller/OFX/Coinbase) for real auto-synced numbers (Foundation Session 4+) — gated on the connector-collision decision (recommended approach proposed, awaiting Scott's confirm).**

This doc is the single "where are we today" snapshot. It is overwritten every substantive session. It does NOT replace `north-star.md` (vision), `adr/0001-phase-1-scope.md` (scope), `phase-1-definition-of-done.md` (gates), or `post-phase-1-backlog.md` (deferrals). It pulls from all four into a single readable picture.

---

## Current state at a glance

**Locked:**
- Phase 1 scope (6 features) — `adr/0001-phase-1-scope.md`
- Phase 1 Definition of Done (8 binary criteria) — `phase-1-definition-of-done.md`
- Mission and target user — `north-star.md` (rewritten 2026-05-02 evening)
- Tone of voice and presentation — `north-star.md`
- Working principles (10 items, including new Co-op + Parallel-views + Multi-user-aware)
- Working agreement and engineering style — `north-star.md`
- Pre-commit hook (`tsc -b --noEmit`) — `scripts/hooks/pre-commit`
- Local-first, no SaaS, no cloud-storage of financial data — invariant across phases

**In progress / open:**
- **Phase 1 Foundation (NEW gate-zero per ADR-0002):** Session 3 only remaining.
  - **Session 1 (Build-B) — DONE 2026-05-04 evening, commit `6bb9843`.** Vite middleware API mounted at `/api/*` via `configureServer`. `pg.Pool` (max: 5) cached server-side. `POST /api/connect` opens the pool; `GET /api/health` round-trips `SELECT 1`. Client bootstrap reads `localStorage.iris_db_connection_string` on app boot and POSTs it.
  - **Session 2 (Build-C) — DONE 2026-05-05, commit `5e00bd3`.** Versioned schema migration runner (`server/schema/runner.ts`) with `schema_migrations` table + SHA-256 drift detection. First migration (`0001_init.sql`) creates `users`, `settings`, `income_sources`, `expenses` — every domain table has `user_id` from day one. Hybrid columns + jsonb `data` strategy keeps hot paths indexable without schema churn. `connect()` now also runs migrations and ensures-single-user before returning. Three resources of typed endpoints: settings (list/get/save), incomeSources (list/save), expenses (list/save with date range). All smoke-verified against Scott's Supabase: list-empty → save → get → list-one round-trips clean, ON CONFLICT DO UPDATE works, 404 + 400 paths return correct codes.
  - **Session 3 (next):** one-shot `scripts/migrate-indexeddb-to-postgres.ts` (idempotent, verifiable, reversible, logged); swap remaining store-call sites to `fetch('/api/...')`; verify each surface against the new layer; mark IndexedDB read-only for one fallback session. Cleanup of three smoke-test rows in DB (id prefix `smoke-test-`) happens here. JSON export endpoint (Layer 4 backup per ADR-0002) bundles in.
  - Multi-layer backup v1 (provider auto-backups + JSON export) lands alongside Session 3. Local SQLite cache + app-level encryption deferred to v1.1.
  - All other Phase 1 work waits until Foundation is verified.
- Phase 2 sequencing decision — Path A (Investments) vs Path B (Co-op Mechanics). Default Path A → Path B → Phase 3 but no longer fixed. Will be decided via ADR-0003 after Phase 1 ships. *(Was previously labeled ADR-0002; renumbered to ADR-0003 because storage architecture took the ADR-0002 slot.)*
- BudgetView refactor — 1,643-line file, deferred until after Foundation lands.
- Vitest data-layer test suite (~10 tests) — deferred until after Foundation lands; tests will exercise the new storage layer, not the deprecated IndexedDB calls.
- Coinbase / Teller / Fidelity OFX connectors — deferred until after Foundation. They write to the canonical store, so they wait for the canonical store.
- Income-source auto-classifier hardening — still queued. Multiple real-data mis-classifications surfaced 2026-05-03 (Cap One CC payment as base, dispute credits / AA refunds / intra-family Zelles as income, variable comp tagged as reimbursement). Sequencing: lands after Foundation so the fix runs against the new layer.
- DoD #5 verification — Variable Pay card lands on $7,918 floor on Scott's real data (correct). Pending re-verification on the new storage layer post-Foundation.
- DoD #6 verification — Work Expense card was wildly off due to classifier bug. Scott reclassified the variable source manually 2026-05-03. Re-verifies after Foundation + classifier hardening land.
- Onboarding for non-technical users (post-Phase-1) — manual paste-the-connection-string is fine for "just us." Real users will need an OAuth-provisioning wizard. Logged in `post-phase-1-backlog.md`.
- Lint debt (97 errors) — deferred to dedicated session.

**Most recent commits (most recent first):**
```
dc5c734 fix(resilience): cold-start error boundaries (app can't wedge on "Loading Iris…")
49c4903 docs: Build-D2c closeout — app is browser/laptop-agnostic
0e6160c feat(foundation): Build-D2c — settings + userProfile + audit log → Postgres (browser-agnostic)
5548e46 chore(connectors): remove deprecated SimpleFIN integration
1c793ef feat(foundation): complete Build-D2b — budget store reads/writes via Postgres
cac6201 feat(foundation): generic collections table + budget-config migration — Build-D2a
3585026 docs: Build-D1 closeout — state.md + cadence-log + backlog connector-collision decision
726f323 feat(foundation): IndexedDB → Postgres migration script — Phase 1 Foundation Build-D1
ac60107 docs(state): split Foundation Session 3 into Build-D1 and Build-D2
93b984a docs: log Build-C user-side validation + partnership-process pattern
b59d666 docs: log Foundation Session 2 (Build-C) in state.md + cadence-log
5e00bd3 feat(foundation): schema runner + first endpoints — Phase 1 Foundation Session 2 (Build-C)
7b08d6c docs(state): WF and Morgan Stanley confirmed NOT in Teller catalog
047683d docs(cadence): trajectory entry for 2026-05-05 Decision/Audit session
8a0c438 docs(state): full household institution map + connector strategy refinement
82caf4d docs(state): lock Teller coverage map (BoA, Citi, Cap One verified)
674704b docs(state): refresh Origin + Monarch competitive entries; sharpen differentiation
7f9ad05 docs(backlog): mark Foundation Session 1 done; sequence Sessions 2 + 3
a056293 docs: log Foundation Session 1 ship in state.md + cadence-log
6bb9843 feat(foundation): Vite middleware API + pg pool — Phase 1 Foundation Session 1 (Build-B)
d4dd7ab docs(cadence): trajectory entry for 2026-05-04 late afternoon
bd9e2d5 docs(cadence): security process rules + credential-rotation learning
e1ce260 docs: cadence-log.md — partnership trajectory tracking
eeb34f8 docs(state): pin commit hash for ADR-0002 landing
6d5f16e docs(adr-0002): storage architecture — user-owned cloud DB
4426317 feat(phase-1): plain-language sweep labels + custom destination on Variable Pay card
4e23bdc docs: log Scott-creep / vocabulary audit; close stale Variable Pay visibility item
53e8a97 docs: log 2026-05-03 ships and classifier hardening backlog
4896476 fix(variable-pay): require 3+ paychecks before declaring a pay-band change
80af74f feat(phase-1): trim sidebar to budget engine only via PHASE_1_LOCK
a202e03 docs(north-star): add state.md to reading order
41e04b6 docs: add state.md as the rolling current-state + drift-watch + evaluation snapshot
32c914f docs(north-star): widen mission to couples-first; lock tone principles and engineering style
0765cce chore: initial commit — Iris pre-Phase-1 baseline
```

---

## Vision anchors — the immovable rails

These are the ideas we agreed are central. If a future session drifts from any of these, that's a problem to call out, not silently accept.

1. **Couples-first, solo as single-player mode.** Iris's headline positioning is the partnership-around-money. Solo gets the full experience. The data model anticipates partner-mode from day one.
2. **Money from a chore into a hobby.** The reframe is the heart of the product. If a feature pulls toward "tracking" without "engagement," it's drifting.
3. **Both partners have agency, neither is a viewer.** Co-op, not shared visibility. Honeydue's mistake. If we ever ship a "partner can only read" mode, we've drifted.
4. **Parallel views, not consensus.** Two partners can interpret the same numbers differently. Iris honors both. Don't average opinions into mush.
5. **Money is binary; presentation is layered.** Every UI element either helps the truth or layers the journey. Anything that does neither gets cut.
6. **User-controlled storage, never Iris-hosted.** Iris does not own, run, or have access to a multi-tenant cloud holding user financial data. Storage lives in user-owned accounts (Supabase / Turso / Neon / etc.) accessed via a credential the user holds. SaaS-by-Iris is off the table; user-owned cloud DB is fine. *Revised 2026-05-04 in ADR-0002.*
7. **One-time purchase, not subscription.** Iris itself is sold once, not rented. User-paid third-party data services (Teller, Coinbase API) are separate.
8. **Phase 1 is the Budget Engine. No investment, no AI, no co-op mechanics in Phase 1.** The boring bones come first. Everything else is Phase 2+.
9. **One feature per session. Verify before declaring done.** The discipline rule that prevents the 2026-04-29 sprawl from recurring.
10. **Sessions, not weeks.** Scott's time is finite. The constraint is verification cycles, not coding speed.

---

## Recent shifts (drift detection log)

Append-only log of meaningful vision/scope shifts. Each entry: date, what changed, why, and whether it's a logical enhancement or a drift.

### 2026-05-10 — Cold-start error boundaries (resilience)

- **Changed:** wrapped the two "Loading Iris…" wedge points (commit `dc5c734`). (1) `App.tsx` auth-resolution effect (first Postgres reads — `auth_users`/`active_user`) had no try/catch; a paused/unreachable DB left `needsLock=null` forever. Now caught → renders a recovery screen ("if Supabase was paused, restore it and reload — your data is safe" + Reload button). (2) `AppDataContext.load()` body wrapped in try/catch/finally; `finally` always clears `setLoading(false)` so a mid-load throw renders the app (with defaults) instead of hanging.
- **Validated:** real Chrome, **healthy (NOT paused) Supabase** — `/api/health` 200 instantly, `auth_users` in 83ms, app loads clean, no regression. Error path is a textbook try/catch/finally + conditional render (not exercised live; would require breaking the DB).
- **Correction on the record:** the DB did **not** pause this session — it was responsive throughout. The one confirmed auto-pause was ~3 weeks earlier (Supabase emailed Scott). A transient ~8s "Loading Iris…" on first load was almost certainly the **Vite dev server cold-compiling after a restart**, not a DB wake (health/auth queries were fast, which a waking paused DB would not be). The error boundary is insurance against the *future* idle auto-pause (free tier, ~7 days), not a response to a current pause.
- **Enhancement or drift?** **Enhancement.** Pure resilience hardening; no scope change.

### 2026-05-10 — Build-D2c shipped: app is browser/laptop-agnostic (validated in real Chrome)

- **Changed:** the last budget/auth-relevant stores moved off per-browser IndexedDB to user-owned Postgres. Commit `0e6160c`.
  - `portfolioStore.getSetting/saveSetting` rewired to `/api/settings` — the keystone. Makes `auth_users` (PINs), `enabled_modules`, `onboarding_complete`, nudge dismisses, market annotations all browser-independent. Native jsonb round-trip (no manual stringify/parse).
  - `userProfile` → settings key `user_profile`. `auditLogStore` → `/api/audit` + new `0003_audit_log.sql`.
  - Migration v3 (`migration_v3_complete` flag) copies IndexedDB settings (decoding legacy JSON-stringified values) + userProfile + audit into Postgres.
- **Decision context:** Scott chose "make everything browser-independent, defer non-budget to later." Refined the cut: auth/settings/audit aren't "later" — auth PINs lived in IndexedDB, so the budget side wasn't truly portable without them. Holdings/equity/chat (Phase 2 investment side) correctly deferred.
- **Validated in Scott's real Chrome (the careful auth path):** first reload after the rewire showed the onboarding wizard (Postgres settings empty — expected, NOT data loss, IndexedDB intact). Ran `window.__irisMigrate({phases:['v3']})` → 11 settings (incl auth_users) + 1 profile + 2 audit, 0 errors. Reload → full identity restored ("Scott & Claire", dashboard, login, $388,534 / -$7,119 all intact), served from Postgres. Migration `[3]` applied clean. Cleaned 3 dead `simplefin_*` keys that rode along; 12 real settings keys remain.
- **The ADR-0002 promise is now real:** new browser/laptop → paste connection string → log in → full budget experience, zero per-machine data. (The connection string itself staying in localStorage is the one intentional per-browser paste.)
- **Note:** `gemini_api_key` now lives in the user's Postgres (was IndexedDB) — consistent with BYO-key + user-owned-DB model; it's the user's key in the user's DB.
- **Enhancement or drift?** **Enhancement.** Foundation's storage migration is functionally complete. Phase 1 scope unchanged. Investment stores remain IndexedDB by explicit deferral.

### 2026-05-10 — Reset & Reconnect + Build-D2b shipped (validated in real Chrome)

- **Context:** ~3-week gap (Scott: mom's surgery, job hunt, travel). Project decision reaffirmed — Iris continues, win-condition reframed as marriage tool + learning vehicle, commercial as lottery-ticket upside (not a Monarch competitor). External services drifted during the gap: Supabase auto-paused, SimpleFIN service shut down by Scott, Teller not logged in.
- **Reset:** Supabase restored — **all data survived the pause** (22 income / 638 expenses / 45 budget-config rows intact; migrations 1+2 already applied, no drift). The ADR-0002 "keep IndexedDB intact as fallback" decision was confirmed as the safety net (turned out unneeded — data survived — but validated the principle).
- **Build-D2b shipped (commit `1c793ef`):** budget store swapped from IndexedDB to Postgres `/api/*`. New endpoints (collections list/save/delete, expenses/incomeSources/settings delete, incomeSources save-batch, GET /api/export/full). `main.tsx` now awaits DB bootstrap before mounting (fixes a stuck-loading race). **Validated in Scott's real Chrome against live Supabase** — dashboard + full Budget view render correctly off Postgres.
- **Two bugs found via real-Chrome validation** (type-check + server smoke both missed them):
  1. `recurringDetector.normalizeMerchant()` crashed on expenses with no `description` — guarded.
  2. 5 garbage rows (`smoke-bucket-1..4` + a stray `undefined` key) left in `collections.buckets` from D2a smoke tests poisoned budget math into `$NaN` (Unbudgeted, Cash Flow, Cycle). Deleted via the new DELETE endpoint; also cleaned leftover smoke rows from settings/income/expenses. Counts now exact: 22 / 638 / 27.
- **SimpleFIN removed (commit `5548e46`):** deprecated per ADR-0001; the dead auto-sync was throwing 403 Forbidden on every launch. Removed service (524 lines), panel, auto-sync block, Vite proxy, type-union member, onboarding/settings usages. Console now clean.
- **Known remaining gap (split-brain) — NOT yet resolved:** auth/userProfile + audit log + portfolio holdings still read IndexedDB. Budget engine is on Postgres; the rest isn't. Net Worth ($388,534) on the dashboard still comes from IndexedDB. Decision pending: migrate auth+audit to finish Foundation properly, or log as next session.
- **Enhancement or drift?** **Enhancement.** Phase 1 scope unchanged. Foundation substantially advanced (budget engine now Postgres-backed and real-use validated). SimpleFIN removal aligns code with the 2026-05-01 ADR-0001 decision. The split-brain gap is documented, not silently shipped.

### 2026-05-05 midday — Build-D2a shipped (collections table + budget-config migration script)

- **Changed:** `0002_budget_config.sql` adds a generic `collections` table — `(user_id, name, key, data jsonb, updated_at)` — that holds the eight budget-config IndexedDB stores (`buckets`, `sinkingFunds`, `funMoney`, `paycheck`, `customCategories`, `recurringDecisions`, `inflowDecisions`, `earners`). One table, not eight, because these stores share the same shape and have no per-resource query needs. New `server/api-handlers/collections.ts` exposes `GET /api/collections/:name/list` + `POST /api/collections/:name/save` (single item or batch in transaction). Migration script (`migrate-indexeddb-to-postgres.ts`) restructured into v1/v2 phases — each independently flagged + idempotent. v2 attempts batched save, falls back to per-row on batch failure for granular error info. New `{ phases: ['v2'] }` option lets you run only v2. Commit `cac6201`.
- **Why generic-table over per-resource-tables:** typed columns earn their place when there are real queries (date ranges on expenses, status filters on income_sources). Budget-config stores have neither — they're "load full collection, save full collection" patterns. Generic beats specific here. We can split a collection into its own typed table later if a real query need emerges; the upsert pattern doesn't lock us in.
- **Verified server-side against Scott's live Supabase:**
  - `0002_budget_config.sql` ran cleanly on first /api/connect after server restart (`migrations.skipped: [1, 2]` after the second connect, confirming both migrations are in the schema_migrations table).
  - Smoke tests: list-empty / single-save / batch-save / list-after-save / cross-collection-isolation / 400-on-bad-name / 404-on-unknown-action / upsert-via-ON-CONFLICT — all green.
  - Four `smoke-bucket-*` rows now in `collections` (under name=`buckets`); Build-D2b cleans them as housekeeping.
- **Real-data v2 migration validated 2026-05-05 12:55 (Scott's return):** 45 rows across 7 non-empty stores migrated cleanly in 4.1 seconds, 0 errors. Per-collection counts: `buckets` 27/27, `sinkingFunds` 3/3, `funMoney` 0 (empty store), `paycheck` 1/1, `customCategories` 3/3, `recurringDecisions` 1/1, `inflowDecisions` 8/8, `earners` 2/2. `migration_v2_complete` flag set. Total Postgres rows in `collections`: 49 (45 real + 4 smoke-test in `buckets`).
- **What's still NOT done:** no store-call swap (the React app still reads IndexedDB), no JSON export endpoint, no DELETE, no UI changes. All Build-D2b territory.
- **Why the work happened solo:** Scott declared a 1-hour validation gap; I sized Build-D2a as "purely additive, no UI changes, no risk to running app." Even if anything went sideways, the worst case was a revert before he returned. Build-D2b (store-call swap + UI verification) explicitly waits for him because that's where the React app's data path actually flips.
- **Discipline notes:**
  - *Right-sized scope under solo execution.* Auto mode + 1-hour window + no human in the loop is exactly the failure mode the partnership doc names. Held the scope: schema + endpoint + migration extension + smoke. Stopped before store-call-swap.
  - *Generic-vs-specific architectural call documented.* The schema decision (one collections table vs eight) is a real call worth explaining; rationale lives in the commit message + this entry + the SQL file's leading comment.
  - *Same-session smoke under synthetic shapes proven before real data.* Build-D1 taught us synthetic ≠ real-data validation. Build-D2a's synthetic smoke proves the wiring; real-data run with Scott's IndexedDB will test shape compatibility.
- **Enhancement or drift?** **Enhancement.** Phase 1 scope unchanged. Foundation Build-D2a is purely additive — Postgres now has the table waiting for budget-config data, but no app behavior has changed. Build-D2b is the swap session.

### 2026-05-05 morning — Foundation Build-D1 shipped (IndexedDB → Postgres migration)

- **Changed:** First half of Foundation Session 3 landed. `src/lib/migrate-indexeddb-to-postgres.ts` reads `incomeSources` + `expenses` from IndexedDB and calls the upsert endpoints. Exposed on `window.__irisMigrate` from `main.tsx`. Idempotent (settings flag `migration_v1_complete`); per-row errors collected, never fatal. Commit: see most recent in log.
- **Real-data shake-out:** First run revealed the expenses endpoint was too strict on date format (only accepted `YYYY-MM-DD`). Real IndexedDB rows arrive in mixed shapes — ISO datetime (`2026-04-15T00:00:00.000Z`), MM/DD/YYYY (CSV imports), occasionally human-readable strings. Patched the endpoint with `normalizeDate()` (handles all four cases including `Date.parse` fallback) and `normalizeAmount()` (accepts numbers AND strings with `$`/commas/whitespace). Error response now returns `invalidFields` + `seenTypes` for fast future debugging.
- **Verified end-to-end on Scott's real Supabase:**
  - 22/22 income sources written, 0 errors
  - 638/638 expenses written, 0 errors
  - Total run time: 51.9 seconds (sequential, ~80ms/row average)
  - Counts confirmed via list endpoints: `income_sources` = 23 (22 + 1 smoke-test), `expenses` = 639 (638 + 1 smoke-test), `settings` = 2 (`migration_v1_complete` flag + `smoke-test-key`)
  - Schema validated: typed columns + jsonb data merge correctly on read; ON CONFLICT DO UPDATE worked for the second run with `force: true`.
- **What's still IndexedDB-only:** budget-config stores (`buckets`, `sinkingFunds`, `funMoney`, `paycheck`, `customCategories`, `recurringDecisions`, `inflowDecisions`, `earners`). Build-D2 handles them with a schema decision (own-tables vs settings-blobs).
- **What did NOT happen:** no store-call swap (the React app still reads from IndexedDB), no JSON export endpoint, no DELETE for the smoke-test rows, no migration of budget-config stores, no UI changes. All deferred to Build-D2.
- **Discipline notes:**
  - *Same-session diagnose-and-fix.* The first migration run failed for 638/638 expenses; root-caused via the 400 error pattern, fixed the validator, re-ran cleanly — all in one continuous session. Validation discipline pattern continues.
  - *Right-sized scope held.* Build-D was originally one big "Session 3 = migration + swap + export." Split into D1 + D2 this morning. D1 stayed at scope (migration only, no swap). Auto mode didn't break the line.
  - *Real-data over mocks.* Server-side smoke had passed in Build-C with synthetic shapes. The real shake-out came from Scott's actual data — exactly the failure mode the partnership doc names. Worth banking: synthetic smoke ≠ real-data validation.
- **Carry-forward (post-Phase-1-backlog):** Connector-collision decision logged. When Teller/OFX/Coinbase land in Foundation Session 4+, the migrated CSV-imported expenses won't auto-dedupe with connector-fetched transactions. Three paths (dedupe-on-import / reset-and-replay / tag-the-source) need a deliberate decision before the first connector ships. Not blocking; just flagged.
- **Enhancement or drift?** **Enhancement.** Phase 1 scope unchanged. Build-D1 stayed at the locked scope. Postgres now holds Scott's real data; the React app still reads IndexedDB until Build-D2.

### 2026-05-05 morning — Build-D split scope-lock

- **Changed:** Foundation Session 3 (originally scoped as one big Build-D: migration script + store-call swap + JSON export) now splits into **Build-D1** and **Build-D2**.
- **Build-D1 scope (today, ~45-60 min target):** read-only migration script that copies the two highest-volume IndexedDB stores (`incomeSources`, `expenses`) into Postgres via the existing upsert endpoints. Lives at `src/lib/migrate-indexeddb-to-postgres.ts`. Callable from DevTools console as `window.__irisMigrate()`. Sets a `migration_v1_complete` settings flag so it doesn't re-run unprompted. Logs a transcript with row counts on both sides for verification.
- **Build-D1 explicitly does NOT:**
  - Swap any store-call sites (the React app still reads from IndexedDB)
  - Migrate the budget-config stores (`buckets`, `sinkingFunds`, `funMoney`, `paycheck`, `customCategories`, `recurringDecisions`, `inflowDecisions`, `earners`) — those need a schema decision (own-tables vs settings-blobs) which is a Build-D2 design call
  - Add the JSON export endpoint (Build-D2)
  - Delete the smoke-test rows (Build-D2 housekeeping)
- **Why split:** Build-D1 is purely additive — it copies data INTO Postgres without touching what the running app reads. Even mid-write, the app keeps working. Tighter feedback loop, real rollback point if data shapes mismatch. Build-D2 is the riskier session because that's where the React app's data path actually flips; better on a fresh brain with a wider verification surface.
- **Enhancement or drift?** **Enhancement.** Right-sized methodology — the original Session 3 was 2-3 hours of work compressed into one session-mode declaration. Splitting respects the partnership doc's "Scott's time is finite — 1-2 hours at a time" reality without changing what gets built.

### 2026-05-05 late evening — Foundation Session 2 (Build-C) shipped

- **Changed:** Schema migration runner + 3 resources of typed endpoints landed (commit `5e00bd3`). Postgres now holds the canonical schema for `users`, `settings`, `income_sources`, `expenses`. The Vite middleware API can do real read/write round-trips against it. Eight handlers live: `/api/settings/{list,get/:key,save}`, `/api/incomeSources/{list,save}`, `/api/expenses/{list,save}`. `/api/connect` and `/api/health` now also surface migration status.
- **Why:** Foundation gate-zero work needed both schema and endpoints before Session 3 can write the IndexedDB → Postgres migration script. The schema lives. The endpoints work. Session 3's migration script can call them directly.
- **Server-side verified:** Each endpoint smoke-tested end-to-end against Scott's live Supabase Postgres. `applied: [1]` means the first migration ran cleanly inside a transaction. Settings round-trip (list → save → get → list one), incomeSources round-trip (list empty → save → list one with full shape preserved), expenses round-trip with date range. ON CONFLICT DO UPDATE works for upserts. 404 for missing settings key, 400 for invalid expense shape — both correct. Type-check green; pre-commit hook ran on the commit.
- **User-side verified (Scott, 2026-05-05 late evening):** App tab at `http://localhost:5173/` loads clean — console shows `[iris] db bootstrap: {status: 'connected'}`, no red errors. `/api/health` from Chrome returns `{"ok":true,"db":"connected","migrations":{"applied":[1],...}}`. Supabase Database Tables view confirms all five tables exist (`users`, `schema_migrations`, `settings`, `income_sources`, `expenses`) with the expected one row each. Foreign-key relationships correct in Schema Visualizer (every domain table's `user_id` wires to `users.id`). Foundation Session 2 is fully validated — both ends.
- **Honest scope-hold:** Session 2 stayed at "schema + read/write endpoints, no migration script, no store-call swap, no DELETE." All three temptations to scope-creep got declined. Three smoke-test rows (id prefix `smoke-test-`) sit in the live DB; Session 3's housekeeping handles them.
- **Hybrid schema strategy locked:** typed columns for queryable fields (`id`, `user_id`, `date`, `status`, `key`, `payer`, `subtype`); jsonb `data` column for the rest. Lets the row shape evolve without schema churn while keeping hot paths indexable. Pattern applies to all three domain tables.
- **Single-user model in code:** `db-pool.ts` ensures exactly one user exists in the `users` table after migrations run. All handlers use `getCurrentUserId()` implicitly. Partner mode adds real auth in Phase 2; the schema is already partner-ready (`user_id` on every domain row).
- **Enhancement or drift?** **Enhancement.** Foundation gate-zero work as scoped in ADR-0002. Six locked Phase 1 features unchanged. Architecture milestone — this is the moment Postgres becomes a real participant, even though the app itself still reads/writes from IndexedDB until Session 3.

### 2026-05-05 — Full institution map locked + Teller coverage verified

- **Changed:** Scott's full household financial-institution inventory documented. Connector strategy refined accordingly.

**Institution map (Scott's household, May 2026):**

| Institution | Holdings | Connector | Status |
|---|---|---|---|
| Bank of America | Bank + CC | Teller | ✅ Verified 2026-05-04 |
| Citibank | Bank + CC | Teller | ✅ Verified 2026-05-05 |
| Capital One | Bank + CC | Teller | ✅ Verified 2026-05-05 |
| Wells Fargo | **Mortgage only** (no bank/CC) | OFX or manual entry | ❌ NOT in Teller (verified 2026-05-05) |
| Fidelity | 401k (NetBenefits) + investments | OFX (Direct Connect) | Planned, untested |
| Morgan Stanley | Equity (RSUs/ESPP, post-E*Trade migration) | OFX (messy — see notes) | ❌ NOT in Teller (verified 2026-05-05); OFX still untested |
| Coinbase | Crypto | Coinbase personal API | Planned, untested |

**Connector strategy (3 connectors, 7 institutions):**

- **Teller** — covers **only** BoA, Citi, Cap One for Scott's household (verified). Wells Fargo and Morgan Stanley are not in Teller's catalog (verified by failed enrollment attempts 2026-05-05). Three of three bank/CC verifications passed end-to-end via the scratch launcher.
- **OFX Direct Connect** — covers Fidelity (canonical path), Wells Fargo (mortgage — likely supported, untested), and Morgan Stanley (post-2023 E*Trade migration is workable but reportedly clunky; OFX Error 16503 is a known issue some users solved with VPN). All three require enabling third-party data sharing in their respective Security/Settings panels before OFX works. **Mortgage data is low-frequency** — if WF OFX is more friction than it's worth, manual monthly entry in Iris is a reasonable fallback (one balance + payment + interest YTD per month).
- **Coinbase API** — direct integration, simplest of the three.

**Open empirical questions (resolved later via scratch tests, not blocking):**

1. **Wells Fargo OFX** — does WF support OFX Direct Connect for mortgage data? Try via Quicken or similar OFX client. If it works → use OFX. If not → manual monthly entry in Iris (low-frequency data, fine fallback).
2. **Morgan Stanley OFX viability** — try OFX Direct Connect from Quicken or similar OFX client first to confirm it works at all on Scott's account, before writing Iris connector code. Several reported failures post-E*Trade-migration; want ground truth before committing.
3. **Fidelity OFX** — likewise, try OFX from a known client before integration. Should be cleanest of the three brokerages.

**Architecture footnote:** Teller Connect requires a non-null HTTP origin because it uses `postMessage` between iframes. `file://` URLs are treated as null-origin and break the wizard mid-flow. Iris's in-app embed will satisfy this naturally, but worth documenting before Foundation Session 4 connector work starts. The scratch launcher (`public/teller-connect.html`, gitignored) lives at `http://localhost:5173/teller-connect.html` to satisfy this constraint.

- **Why:** Ground-truth the connector map before writing any connector code in Foundation Session 4+. The institution inventory shifts the picture: 7 institutions across 3 connector types, with 2 of the 3 connectors still untested in any client at all (OFX-Fidelity, OFX-MorganStanley, Coinbase-API). Teller is the only verified leg.
- **Enhancement or drift?** **Enhancement, scope-clean.** No code in Iris source. Phase 1 scope unchanged. ADR-0001's three-connector architecture (Teller + OFX + Coinbase) holds — Morgan Stanley adds an OFX enrollment, not a fourth connector type.

### 2026-05-04 evening — Competitive landscape refreshed + Teller BoA verified

- **Changed:** Two threads landed in a Decision/Audit pause after Build-B shipped.
  1. **Origin and Monarch deep-dive** — corrected stale notes on both. Origin pivoted from advisor-led to all-in-one platform with three-view Partner Mode at $99/yr; Monarch ships "Shared Views" (mine/theirs/ours labeling + per-transaction privacy toggle) at $14.99/mo. Both are reviewer-rated weak on budgeting and on data-sync-2FA-breakage respectively. Iris's differentiation refines to (privacy + one-time-pay + budget-engine-quality + co-op-as-gameplay) — see refreshed Other-finance-apps section + Conclusion + Open-decisions table above.
  2. **Teller real-coverage check** — Scott set up the "Iris Finance" app at teller.io (certificates issued, Getting Started 100%) and successfully connected Bank of America via Teller Connect. First successful real-bank handshake on the connector side. Citi attempt failed on first try; needs a retry pass. Fidelity confirmed not in Teller's catalog (expected — brokerage stays on the OFX path per ADR-0001).
- **Why:** Scott explicitly pulled the session into Decision/Audit mode after Build-B to validate where we stand against actual competitors and to ground-truth Teller before Foundation Session 2 opens with assumptions about it.
- **Enhancement or drift?** **Enhancement, scope-clean.** No code, no scope changes. Reading the landscape honestly + verifying connector reality. Phase 1 scope, ADR-0002, and the locked six features are unchanged. Phase 2 sequencing inputs got new evidence (Path B leans up), but the actual decision still happens in ADR-0003 after Phase 1 ships.

### 2026-05-04 evening — Foundation Session 1 (Build-B) shipped

- **Changed:** Vite middleware API now mounted at `/api/*` via `configureServer` (`server/api-plugin.ts`). `pg.Pool` (max: 5) lives in module state (`server/db-pool.ts`), keyed off the user-owned connection string. Two endpoints: `POST /api/connect` opens the pool, `GET /api/health` round-trips `SELECT 1`. Client bootstrap (`src/lib/db-client.ts`) reads `localStorage.iris_db_connection_string` on app boot and POSTs it. `tsconfig.node.json` extended to type-check `server/**/*.ts`. Commit `6bb9843`.
- **Why:** ADR-0002 needed a real foundation to build on. Build-B was the smallest possible end-to-end slice — no schema, no data endpoints — that proves the pieces fit: client → middleware → pg → Supabase → response.
- **Verified:** Smoke passed end-to-end against Scott's real Supabase Session Pooler URI. Client console: `[iris] db bootstrap: {status: 'connected'}`. `curl http://localhost:5173/api/health` from a separate process: `{"ok":true,"db":"connected"}` 200. Pool is shared across all clients on the dev server (the point of putting it in Node, not the browser).
- **Honest scope-hold:** Session 1 stayed locked at scaffold + smoke. No drift into schema or real endpoints despite auto mode being on. Token usage ended well under the budget — fresh context for Session 2.
- **Enhancement or drift?** **Enhancement.** Foundation gate-zero work as scoped in ADR-0002. Six locked Phase 1 features unchanged.

### 2026-05-04 — Storage architecture revised (ADR-0002)

- **Changed:** Working Principle #1 in north-star revised from "data lives on user's machine" to "user-controlled storage, never Iris-hosted." Phase 1 splits into Foundation (storage migration) → Features (the original six, unchanged) → DoD soak. ADR-0002 captures the decision in full. Phase 2 sequencing ADR renumbered from ADR-0002 to ADR-0003.
- **Why:** Two real constraints surfaced 2026-05-03 / 2026-05-04. (1) Per-browser IndexedDB causes data divergence across browsers — biting partnership work directly when Claude's preview-tool browser and Scott's Chrome can't see each other's data. (2) Scott's hardware churns on a normal cadence (work laptop replacement in days; gaming PC fails eventually); single-machine storage makes the data fragile by design. Original Working Principle #1 conflated "user-controlled" (mission-relevant) with "single-machine-resident" (implementation choice that's now wrong).
- **Architecture:** user-owned cloud DB on Supabase free tier (Postgres). Vite middleware API on the same port. Schema includes `user_id` from day one to make partner-mode a flag-flip, not a retrofit. Multi-layer backup (cloud DB + provider auto-backup + JSON export in v1; local SQLite cache + encryption deferred to v1.1).
- **Honest cost:** delays 30-day soak clock by ~3 sessions (the migration work). Adds onboarding friction (manual connection-string paste in v1). Internet dependency until v1.1's local cache lands.
- **Bonus:** gaming-PC-as-server constraint dissolves. Static frontend can run anywhere. QA seat shared between Scott and Claude — no more screenshots-and-DevTools snippets to bridge data invisibility.
- **Enhancement or drift?** **Enhancement, scope amendment.** Six locked features remain locked. The amendment adds a Foundation prerequisite that ADR-0001 implicitly assumed was solved. Open via partnership process (ADR conversation), not silent expansion.

### 2026-05-03 — First Phase 1 ships + income-source classifier diagnosed

- **Changed:** Two code changes shipped: sidebar trimmed to Phase 1 visible views (PHASE_1_LOCK in `useEnabledModules`), and Variable Pay band-detection algorithm hardened with a 3-paycheck minimum-band-size guard (prevents single bonuses/RSU vests from being mistaken for new pay rates). Verified in preview against sample data; verified on Scott's real data — floor lands on his actual $7,918 base.
- **Diagnosed (not yet fixed):** The Work Reimbursements card on Scott's real data shows YTD reimbursed = $38,617 against $8,131 spent — way out of balance. Root cause identified via DevTools query: `inc-abnormal-sec-osv-variable` was mis-classified as `subtype: 'reimbursement'` instead of `'variable'`. Scott reclassified manually. Other classifier oddities surfaced (Cap One credit card payment as 'base', dispute-credit refunds as income, intra-family Zelle transfers as base/variable, restaurant refunds as base) — all logged for a future auto-classifier hardening pass.
- **Why:** First real-shipping moment after the foundation work. Real-use feedback against Scott's data exposed both that the Variable Pay fix worked and that the income-source auto-classifier needs tightening.
- **Enhancement or drift?** **Enhancement.** Scope-clean: stayed within Phase 1 features. The classifier issues feed Phase 1's auto-sync hardening, not a new feature.

### 2026-05-02 evening — Mission widened to couples-first
- **Changed:** target user from "financially literate with literacy floor" → couples-first / solo-mode-supported. Mission paragraph rewritten. Tone principles added. Phase 2 sequencing made open (Path A vs Path B).
- **Why:** Scott explicitly named that he had narrowed the original vision too far. The original incubation was about helping his marriage with money, not about "investment intelligence for financially literate users." The widening returns the product to its original purpose.
- **Enhancement or drift?** **Enhancement.** Returns to original incubation purpose; doesn't expand scope unproperly because Phase 1 features are unchanged.

### 2026-05-02 morning — Phase 0 foundation
- **Changed:** Git initialized; pre-commit hook installed; 33 TS errors fixed; three governing docs committed.
- **Why:** Foundation work to make future feature work less fragile.
- **Enhancement or drift?** Pure enhancement. No vision change.

### 2026-05-01 — Hard reset
- **Changed:** Scope locked at 6 features (ADR-0001 created). Data-layer plan changed from SimpleFIN to Teller dev tier + Coinbase API + Fidelity OFX. Discipline rules adopted.
- **Why:** Recovery from 2026-04-29 sprawl spiral.
- **Enhancement or drift?** Enhancement of process discipline; the data-layer pivot was forced by SimpleFIN limitations.

---

## Honest evaluation: is this a good idea?

This section runs the reality checks Scott asked for. Updated each substantive session.

### Broader competitive / comparable landscape

Beyond the Honeydue / Zeta / YNAB / Monarch / Copilot baseline:

**Co-op gaming references (the mechanics we're trying to port from):**

- **Pokémon Go (Niantic).** Solo + co-op raids + community days. Solo activity always meaningful; co-op multiplies it. Reference for "couples can each do solo and the co-op moments are bonus, not required."
- **It Takes Two (Hazelight Studios).** A literal couples-only video game — designed so neither player can play alone. Won Game of the Year 2021. Proof-point that mechanics designed *only* for two-person play can be both commercially successful and artistically credible. Caveat: the only-two-can-play model is too restrictive for Iris (we want solo-mode-fully-supported), but the design philosophy is instructive.
- **Dark Pictures Anthology (Supermassive Games).** Choose-your-own-adventure horror with drop-in/drop-out co-op for 2–5 players. Each player has perspective on different scenes; choices affect outcomes; partial information drives discussion. Reference for "scheduled co-op moments" — the Movie Night mode is exactly the kind of structured shared experience Iris's Phase 2 Path B could borrow from.
- **Pandemic (Z-Man Games, board game).** 2–4 player full co-op against the game. Specialized roles (Medic, Scientist, Researcher) — different agency, same goal. Reference for "different roles for different partners" — Scott (financial driver) and his wife (financial passenger today, partner tomorrow) have different specialties; Iris should make those specialties productive instead of one-dominant.
- **Codenames Duet (CGE, board game).** 2-player co-op variant of Codenames. Both players see partial information. Each gives clues to the other. Reference for "parallel views with partial information" — exactly the partner-mode UX problem when each partner has different financial visibility.
- **Spiritfarer (Thunder Lotus).** 1–2 player resource management with emotional narrative. Demonstrates co-op + emotional weight + non-combat mechanics — closest tonal cousin to what Iris should feel like.
- **Overcooked (Ghost Town Games).** 1–4 player co-op chaos. Reference for "co-op in real-time" — Iris's "dancing not choreography" principle has analog here.

**Habit / wellness / social-engagement apps (reference for solo-feeds-shared mechanics):**

- **Strava.** Solo activity (running, cycling) feeds shared club challenges, kudos, segments. Strong example of "your solo workout helps the team." Adoption pattern Iris should mirror.
- **Duolingo Friends Quest.** Solo lessons feed a shared streak with a friend. Both must contribute or the streak breaks. Closer to Iris's structure than Strava because the social pressure is bilateral.
- **Apple Fitness+ Group Workouts (SharePlay).** Two people can work out together remotely. Reference for "synchronized but separate" — both partners doing the activity at the same time, not the same physical space.
- **Headspace Buddies (limited rollout).** Shared meditation streaks. Less polished than Duolingo's version; mostly a counter, not a real cooperative mechanic.
- **Strong (workout tracking).** Solo, but social via shared programs. Mostly relevant for what NOT to do — the social layer feels bolted on.

**Other finance apps not previously mentioned:**

- **Splitwise.** Bill splitting between roommates / couples. Transactional, not collaborative. Solves "who owes whom." Doesn't try to do shared financial planning. Reference for what couples *currently* use; people pay for Splitwise Pro because the gap is real.
- **Acorns Together / Family.** Joint investing accounts with kids. Cute but the parent-child framing doesn't translate to spousal partnership.
- **GreenLight / FamZoo.** Family financial education for kids. Different audience but proves families pay for software that ties money to relationships.
- **Goodbudget.** Envelope budgeting with family sharing (free + paid tiers). Closest existing example of "couples sharing a budget tool" but the UX is dated and boring.
- **Lunch Money.** Solo budget app with strong /r/personalfinance fan base. Modern, lovable, $40/yr. Solo-focused. Proof-point that small subscriptions for budget apps can sustain.
- **Origin Financial.** *(Refreshed 2026-05-04 — prior entry was wrong.)* Pivoted from advisor-led to all-in-one platform: budgeting + investing + estate planning + tax filing + SEC-regulated AI advisor. **Partner Mode** ships three views — partner A, partner B, together — for one price. Pricing $99/yr (with $1 promo first-year, Sept 2025), $12.99/mo. Connectors: Plaid + MX + Finicity. Forbes "Best Budgeting App" 2024. **Reviewer-rated weak on budgeting** ("not Origin's strongest feature" — Rob Berger) and investment tracking. **The closest direct competitor for our couples thesis.** Their weakness (budgeting) is exactly our Phase 1 focus.
- **Monarch Money.** Couples-aware budget + net-worth platform. **"Shared Views"** lets each transaction or account be labeled mine / theirs / ours, with a per-transaction privacy toggle (eye icon) hiding from partner. Free unlimited partner access, separate logins. AI Assistant + cash-flow projections. Pricing $14.99/mo or $99.99/yr (Core), $199/yr (Plus); 50%-off code MONARCHVIP through end of 2026. Connectors: Plaid + MX. NerdWallet 30-day review noted real weaknesses: **2FA accounts repeatedly pause syncing**, **savings buckets don't sync**, **custom categories tedious to create**, no mortgage account support, investment tracking less sophisticated than Quicken Simplifi. Reviewer ultimately went back to her spreadsheet. **The most mechanically sophisticated couples competitor — but the mechanic is visibility management, not gameplay.**
- **Empower (formerly Personal Capital).** Free wealth tracking, sells advisory services. Very polished. Solo-mental-model. Comp for what Iris's Phase 2 investment layer should reach toward visually.
- **Quicken Premier (desktop, perpetual + subscription tiers).** The dinosaur — clunky but trusted. Reference for "you can charge for desktop financial software."
- **Tiller Money.** Spreadsheet-based finance. Power-user audience. Proof that some users want flexibility over polish; Iris is NOT trying to be Tiller (we're polished + opinionated).

**Conclusion from the broader scan (refreshed 2026-05-04):**

Earlier framing was that the **(couples + co-op + fun + private + local-first)** intersection was empty. After the Origin / Monarch deep-dive, that's now sharper:

- **(couples + finance)** is *contested*. Origin and Monarch are both shipping real partner-mode mechanics with momentum.
- **(couples + co-op-as-gameplay + private + one-time-pay)** is still *empty*.

Pieces of the intersection exist in adjacent products:
- Strava / Duolingo Friends Quest = solo-feeds-shared mechanic, not in finance
- Honeydue / Zeta = couples in finance, not co-op-fun
- Origin = couples in finance with shared dashboard + filter-by-member, but cloud + subscription + budgeting-is-weak
- Monarch = couples in finance with the most sophisticated visibility mechanic shipping (mine/theirs/ours + per-transaction privacy), but cloud + subscription + reviewer-noted sync friction
- Goodbudget = couples in budgeting, not modern or fun
- Splitwise = couples transactional finance, not planning or fun
- Pandemic / Codenames Duet = different-roles-same-goal, in board games not software

**Iris's actual differentiation, sharpened:**

1. **Privacy / user-owned data** — Origin and Monarch are multi-tenant cloud. ADR-0002 makes this real and committed.
2. **One-time pricing** — both competitors are subscription. Quicken-style perpetual license is a credible alternative.
3. **Budget engine quality** — both competitors are reviewer-rated weak/tedious here. Variable Pay floor + sweep + Work Expense aggregate are mechanics neither covers. **The reviewer evidence validates that the seam is real.**
4. **Co-op as gameplay, not co-presence** — Monarch's mine/theirs/ours is the most sophisticated couples mechanic shipping today, and it's still about *managing visibility*, not *playing together*. The Pokémon-cards / scheduled-co-op-moments / joint-collection thesis (Phase 2 Path B) is still wide open.

The thesis still holds — but the bar is higher than "no one is doing couples." It's now "no one is doing couples *the way Iris will*."

### Reality checks

#### 1. Can we actually build co-op with the local-first constraint?

**Engineering complexity:** Real. Two devices, one shared dataset, no cloud means the sync layer needs careful design. Options:

- **LAN sync (gaming-PC server, family clients):** works at home, breaks when partners are apart. Phase 1 doesn't need this — single device only. Phase 2+ needs it for couples-mode.
- **Encrypted P2P over internet (e.g., Tailscale-like):** works anywhere; Scott already runs Tailscale-style infra at home. Plausible.
- **Shared file via Dropbox/iCloud as transport, e2e encrypted:** simplest; user already has cloud storage. The "cloud" is the user's, not Iris's. Doesn't violate local-first.
- **CRDT-based merge layer:** more rigorous; useful if both partners can edit offline simultaneously. Probably overkill for v1.

**Verdict:** **Solvable, not trivial.** Phase 1 builds single-device only — no sync work needed. Phase 2 design must pick one of the options above. Recommendation: e2e-encrypted-file-on-user-cloud is the smallest defensible path; CRDTs only if real conflicts emerge.

#### 2. Is the dopamine hook designable for finance?

**Risk:** Money tracking is intrinsically NOT delightful. Pokémon Go is fun because catching creatures is intrinsically delightful. Iris's entire delight has to come from the presentation layer.

**Sources of dopamine to investigate during Phase 2 Path B design:**

- **Streaks** — proven (YNAB has them; Duolingo has them). Easy to implement, medium engagement value.
- **Goal progress visualization** — proven. The "you're 67% of the way to Cabo" feeling. Mint-style but better.
- **Surprise wins** — under-explored. "You have $400 surplus you didn't notice this month" hits differently than "your monthly summary."
- **Joint achievements** — Scott's Pokémon-cards-with-his-son model. The "joint book of pulled rares." Untested in finance; designable.
- **Level-ups / tier crossings** — "you've hit Saver Tier 3" — corny in isolation but powerful when paired with real meaning.
- **Scheduled reveal moments** — the "weekly raid" equivalent. A scheduled time the app says "let's look at this together" with prepared content.

**Verdict:** **Designable but requires creative work.** Not a given. We'll need a dedicated Path B design session to actually pick mechanics, not just list them.

#### 3. Are gaming mechanics translatable to finance?

**Translates cleanly:** streaks, leveling, achievements, social progress, goal collisions ("you want X, here's what it costs you in terms of Y").

**Translates with care:** randomness (gambling regulation concerns), competitive ranking (creates marriage stress — bad for Iris), loot boxes (predatory — never).

**Translates poorly:** the "discovery" mechanic (Pokémon Go's "find creatures") — there's nothing intrinsically delightful to discover in your bank account. The "battle" mechanic — money should not be adversarial between partners.

**Verdict:** Selective import. Cherry-pick mechanics, don't wholesale-port a game.

#### 4. Will couples actually adopt it?

**The unproven part of the thesis.** Honeydue claims 1M+ users. Zeta claims 100K+. Both smaller than Mint (24M+) / YNAB (~750K+) / Monarch (1M+). The fun-couples hypothesis is testable but unproven.

Mitigations:
- **Solo-mode-fully-supported** breaks chicken-and-egg. If your partner doesn't sign up, Iris is still useful. Honeydue collapses without partner adoption; Iris doesn't.
- **Authentic founder motivation** — Scott has lived the pain. That correlates with apps that don't get thrown away in three months.
- **Local-first** as differentiator gives a non-couples reason to adopt — privacy-conscious solo users come for that, partner-mode is upsell.

**Verdict:** **Real risk. Not project-killing.** Phase 1 ships even if partner-mode never lands. The couples premium thesis is the upside bet.

#### 5. Can we charge $50–150 one-time?

Comparable pricing:
- Lunch Money: $40/yr
- Tiller: $79/yr
- YNAB: $99/yr
- Monarch: $100/yr
- Copilot: $95/yr
- Quicken Premier: ~$100/yr (subscription) or perpetual $50–80
- Origin Money: $200/yr (advisor-led)
- Honeydue / Zeta: free (freemium)

$50–150 one-time = ~1–1.5 years of competitor subscription. Privacy-and-local-first justifies premium. Quicken's perpetual-license precedent exists.

**Verdict:** **Defensible at $50–80 one-time, more aggressive at $150.** Pricing not locked. Final figure depends on perceived value at launch.

#### 6. Is the engineering capacity (Scott + Claude) realistic?

Comparison:
- Pokémon Go: 100+ engineers
- Honeydue: 10–20 engineers
- YNAB: 50–100 engineers
- Monarch: ~30 engineers
- Lunch Money: solo founder + occasional contractors

Iris is closer to the Lunch Money pattern. Phase 1 (boring bones) is achievable in N sessions because most patterns are proven. Phase 2 Path A (investments) is straightforward portfolio math. Phase 2 Path B (co-op mechanics) is harder — design-novel + sync architecture. Phase 3 (intelligence) is hardest — LLM cost, accuracy, latency.

**Verdict:** **Phase 1 realistic. Phase 2 doable. Phase 3 ambitious.** The engineering bottleneck is Scott's time, not Claude's output.

### Strong ideas vs. maybe-not ideas

**Strong (high-confidence keep):**
- Couples-first positioning + solo-also-fully-supported
- Money-as-hobby reframe
- Local-first as differentiator
- Joint collection model (Scott's Pokémon-cards analog)
- Scheduled co-op moments (Dark-Pictures-Anthology pattern)
- Streak / leveling / goal-progress dopamine sources
- Tone principles (best-friend voice, dancing-not-choreography, money-binary-presentation-layered)
- Validation-before-reassurance engineering style
- Sessions-not-weeks timeline framing

**Medium (designable, not yet validated):**
- D&D dice-roll for ties — fun but niche; v3+ candidate
- Personalization-by-interest (racing/games/etc.) — strong v5 concept; far future
- Surprise wins as a first-class feature — needs design work
- Different-roles-different-partners (Pandemic-style) — interesting but partner-mode UX must come first
- Evolution arc — works in Duolingo / Strava; needs Iris-native flavor
- E2E-encrypted-file-on-user-cloud as sync layer — defensible but unproven for finance

**Maybe-not (flagged risks):**
- Literal "Pokémon Finance" with creature characters — Scott self-flagged as too niche
- Mobile-first — Scott explicitly ruled out
- Cloud sync as primary — violates local-first
- Random rewards / loot boxes — predatory pattern, never
- Competitive ranking between partners — creates marriage stress, anti-mission
- "Battle" or adversarial mechanics — money shouldn't be a fight

### Overall assessment

**Positioning:** ~30% of total design work, done well. The thesis is defensible against the broader competitive landscape — no competitor combines couples + co-op-as-gameplay + private + one-time-pay. **However**, the (couples + finance) space is now actively contested by Origin and Monarch with real momentum, so Iris's differentiation is pulled toward privacy + pricing + co-op-as-gameplay + budget-engine-quality, not toward "we're the first to think couples need a money tool."

**Mechanics:** ~5% done. We have a list of candidates from gaming and adjacent apps; we have not yet designed Iris-native mechanics. This is Phase 2 Path B work.

**Engineering:** ~10% done. Foundation laid. Phase 1 features designed but not built. Sync architecture for partner-mode is unsolved.

**Reality-check verdict:** **Yes, this is a good idea that's worth building.** The risks are real (partner-mode adoption is unproven; local-first sync is non-trivial; money is intrinsically boring under the hood) but none are project-killing. The path through Phase 1 is clear and doesn't depend on the unproven parts.

The hardest thing left is designing the co-op mechanics that turn a working budget engine into something couples come back to. That's a Phase 2 Path B problem, not a Phase 1 problem. **Phase 1 is the right thing to build now.**

---

## Open decisions and bets

These are the things we know are unresolved. They don't need to be resolved now, but they shouldn't be forgotten.

| Decision | When it gets made | Inputs needed |
|---|---|---|
| Phase 2 sequencing: Path A (Investments) vs Path B (Co-op Mechanics) | ADR-0003, after Phase 1 ships | Scott + wife real-use feedback; Path B mechanics design sketches. *2026-05-04 evidence tilts toward Path B-first*: Origin and Monarch already cover investment tracking decently; co-op-as-gameplay is still empty space. Building Path A first risks landing in catch-up territory; Path B first lands in white space. Decision is still ADR-0003's, but the inputs lean.* |
| Sync architecture for partner-mode | Phase 2 design | Pick: LAN-only, e2e-encrypted-file, CRDT, or hybrid |
| Pricing at v1.0 launch | Just before v1.0 release | Comparable pricing audit; perceived value at that point |
| Native mobile companion (mobile-glance mode) | Beyond Phase 3 | Whether desktop adoption produces real demand for it |
| Lint cleanup session | Between end of Phase 1 dogfood and start of Phase 2 | Decide whether to fix in one pass or roll into Phase 2 |
| Whether to publish openly (GitHub) before v1.0 | Personal preference, no engineering blocker | Scott's comfort with public-WIP visibility |

---

## Drift watch — things to call out next session if they show up

If the next session does any of these without an explicit ADR conversation, push back:

- Adds a feature outside the locked Phase 1 six
- Drops one of the locked Phase 1 six
- Builds anything Phase 2 / Phase 3 in Phase 1
- Designs partner-mode UI before the data layer is multi-user-aware
- Switches to cloud-storage of financial data
- Adds SaaS plumbing, hosted accounts, or cloud-required features
- Bypasses the pre-commit hook (`--no-verify`) without explicit permission
- Skips the verification step for a "shipped" feature
- Drops the partnership-as-equals frame (e.g., reverts to deferential mode or flips to bossy mode)
- Adds finance jargon to user-facing copy (HYSA, sinking fund, reimbursable, etc.) without a plain-language alternative — the audience widening to non-financially-literate partners makes this a real failure mode
- Assumes machine-resident storage (e.g. "save to user's local file system," "the gaming PC always running," "IndexedDB persists") — ADR-0002 made user-owned cloud DB canonical. Any work that assumes data lives on a specific physical machine has drifted.

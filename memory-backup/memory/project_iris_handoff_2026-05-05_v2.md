---
name: Iris session handoff (2026-05-05 late evening — Foundation Session 2 / Build-C shipped)
description: Schema migration runner + first 3 resources of typed endpoints landed. Postgres is now a real participant — schema lives, endpoints round-trip, smoke-verified end-to-end against Scott's Supabase. Two new commits today (`5e00bd3`, `b59d666`) on top of the morning's Decision/Audit work. Session 3 (IndexedDB → Postgres migration + store-call swap) is the last Foundation session.
type: project
originSessionId: 2026-05-05-foundation-session-2-buildc
---

## What this session was about

Build mode declared after the morning's Decision/Audit pause. Phase 1 Foundation Session 2 of ~3, sized to **Build-C**: schema migration runner + `0001_init.sql` + first 3-4 typed endpoints. Scope held cleanly — no migration script, no store-call swap, no DELETE endpoint. Same-session ship-to-verify landed for the second day in a row.

## What shipped

**Two new commits on top of the morning's `7b08d6c`:**

```
b59d666  docs: log Foundation Session 2 (Build-C) in state.md + cadence-log
5e00bd3  feat(foundation): schema runner + first endpoints — Phase 1 Foundation Session 2 (Build-C)
```

### Schema (commit `5e00bd3`)

- **`server/schema/runner.ts`** — versioned migration runner. `schema_migrations` table tracks `version, name, checksum, applied_at`. SHA-256 checksum per file detects post-apply drift. One transaction per migration; commits on success, rolls back on error. Idempotent: re-runs skip already-applied versions.
- **`server/schema/migrations/0001_init.sql`** — first migration. Creates `users`, `settings`, `income_sources`, `expenses`. **Every domain table has `user_id uuid not null` from day one** (Working Principle #5). Hybrid schema: typed columns for queryable fields (id, user_id, date, status, key, payer, subtype), `data jsonb` for the rest. Indexes on `(user_id, status)` for income_sources and `(user_id, date)` for expenses.

### Pool extensions (commit `5e00bd3`)

- **`server/db-pool.ts`** — `connect()` now also runs migrations and ensures a single user exists in the `users` table. `getCurrentUserId()` exposes the cached id; handlers use it implicitly. `getLastMigrationResult()` exposes `{applied, skipped, driftDetected}` for `/api/health` and `/api/connect` to surface.

### Endpoints (commit `5e00bd3`)

- **`server/api-handlers/http-utils.ts`** — `sendJson`, `readJsonBody`, `requireContext` (returns `{pool, userId}` or 503), `methodNotAllowed`, `errorMessage`.
- **`server/api-handlers/settings.ts`** — `GET /api/settings/list`, `GET /api/settings/get/:key`, `POST /api/settings/save {key, value}`. Upsert via ON CONFLICT DO UPDATE.
- **`server/api-handlers/income-sources.ts`** — `GET /api/incomeSources/list`, `POST /api/incomeSources/save {source}`. Promotes `id, payer, subtype, status, includeInBudget` to typed columns; rest in `data` jsonb.
- **`server/api-handlers/expenses.ts`** — `GET /api/expenses/list?from=YYYY-MM-DD&to=YYYY-MM-DD`, `POST /api/expenses/save {expense}`. Validates ISO dates; promotes `id, date, amount` to typed columns.
- **`server/api-plugin.ts`** — mounts all of the above. `/api/connect` and `/api/health` now return `migrations: {applied, skipped, driftDetected}` alongside their existing fields.

## Smoke verification (real Postgres, not mocked)

End-to-end against Scott's live Supabase — every endpoint round-trips:

| Endpoint | Result |
|---|---|
| `/api/health` post-restart | `{ok:true, db:'connected', migrations:{applied:[1], skipped:[], driftDetected:[]}}` |
| `/api/settings/list` (empty) | `{ok:true, items:[]}` |
| `/api/settings/save` | `{ok:true}` |
| `/api/settings/get/smoke-test-key` | `{ok:true, value:{...}}` |
| `/api/settings/list` (one) | `{ok:true, items:[{key, value, updatedAt}]}` |
| `/api/settings/save` (update) | `{ok:true}` (ON CONFLICT path verified) |
| `/api/settings/get/missing-key` | 404 `{ok:false, error:'not_found'}` |
| `/api/incomeSources/list` (empty → save → list) | full shape preserved (typed columns + jsonb data merged on read) |
| `/api/expenses/save` (with ISO date) | `{ok:true}` |
| `/api/expenses/list?from=&to=` | `{ok:true, items:[...]}` (date range filter working) |
| `/api/expenses/save` (invalid shape) | 400 `{ok:false, error:'invalid_expense_shape'}` |

## Discipline notes worth banking

- **Same-session ship-to-verify is now a pattern**, not a one-off. Build-B (yesterday): scaffold + smoke-tested `/api/health` against real Postgres in the same session. Build-C (tonight): schema + 3 resources of endpoints, smoke-tested end-to-end against real Postgres in the same session. The validation-discipline gap (~65%) keeps closing.
- **Hybrid schema decision was a real architectural call** made quickly and documented (commit message + state.md). Three options were on the table: column-per-field, full jsonb, hybrid. Picked hybrid in seconds and moved. No analysis-paralysis. Pattern: queryable fields get typed columns; everything else lives in `data` jsonb so the row shape can evolve without schema churn.
- **Auto mode held scope.** Three temptations declined: (a) no DELETE endpoints, (b) no migration script (Session 3), (c) no store-call swap (Session 3). The handoff said "first 3-4 typed endpoints" and that's what shipped — six handler functions across three resources.
- **Smoke-test rows acknowledged, not hidden.** Three rows with id prefix `smoke-test-` sit in the live DB. Cleanup is Session 3's housekeeping step. Logged in commit message and state.md so future-Claude doesn't trip over them.
- **Single-user model is on the schema, not in the auth.** `user_id` is mandatory on every domain row. Phase 1 has exactly one user (auto-created on first connect). Phase 2 partner mode adds real auth — schema doesn't change, auth gets layered on. Cheap to seam now.

## What's now true in the repo

- 24 commits total. Working tree clean. Type-check green. Pre-commit hook running on every commit.
- Postgres schema lives at the user's Supabase: `users`, `settings`, `income_sources`, `expenses`, `schema_migrations` (5 tables).
- API surface: 9 endpoints (`/api/{connect, health, settings/list, settings/get, settings/save, incomeSources/list, incomeSources/save, expenses/list, expenses/save}`).
- App still reads/writes from IndexedDB for everything user-facing — Postgres is a real participant but not yet canonical. **That swap is Session 3.**

## Next session — Foundation Session 3 (Build-D)

**Mode:** Build (declare at start).

**Scope:** IndexedDB → Postgres migration script + store-call swap + JSON export endpoint. The last Foundation session.

1. **Open by reading** `docs/north-star.md`, `docs/state.md`, `docs/adr/0001-phase-1-scope.md`, `docs/adr/0002-storage-architecture.md`, `docs/phase-1-definition-of-done.md`, `docs/cadence-log.md`. Then this handoff.

2. **Build-D specifics:**

   **a. Migration script — `scripts/migrate-indexeddb-to-postgres.ts` (or browser-side equivalent):**
   - Reads everything from IndexedDB (`iris-budget` v4 schema; stores: `buckets`, `sinkingFunds`, `funMoney`, `paycheck`, `expenses`, `customCategories`, `recurringDecisions`, `incomeSources`, `inflowDecisions`, `earners`).
   - For Phase 1's locked feature set, prioritize: `incomeSources`, `expenses`, plus settings (which today live across `buckets`/`sinkingFunds`/`funMoney`/`paycheck`/`customCategories` etc. — likely fold those into the `settings` table as keyed entries, OR add a second migration `0002_phase1_supplements.sql` for the rest).
   - **Idempotent.** Running twice should produce the same end state. Use the existing UPSERT endpoints.
   - **Verifiable.** Record counts match between IndexedDB source and Postgres destination. Spot-check sample rows.
   - **Reversible.** IndexedDB stays read-only intact for at least one fallback session before being marked deprecated.
   - **Logged.** Migration writes a transcript (browser console + a `migration_log` table or settings entry) so any data discrepancies are debuggable.
   - Lives in its own commit, NOT bundled with the store-swap.

   **b. Store-call swap:** the ~100 IndexedDB call sites in `src/stores/budgetStore.ts` (and elsewhere) switch from `idb` calls to `fetch('/api/...')`. Strategy options:
   - **Option 1 (recommended):** swap the implementations inside the existing store functions. The signatures stay the same; only internals change. Minimizes blast radius. Each function becomes a fetch wrapper.
   - **Option 2:** introduce a new `apiStore` module and migrate call sites one by one. More explicit but more touch points. More risk of half-state.
   - Verify each surface (Pulse, Edit Budget overlay, Variable Pay, Work Expense, etc.) against the new layer before declaring the swap done.

   **c. JSON export endpoint** (Layer 4 backup per ADR-0002):
   - `GET /api/export/full` — streams everything for the current user as a single JSON blob.
   - Settings UI: "Download backup" button that hits the endpoint and saves `iris-backup-YYYY-MM-DD.json`.

   **d. Smoke-test row cleanup:** delete the three `smoke-test-` rows during the migration (the migration script can include a `DELETE FROM ... WHERE id LIKE 'smoke-test-%'` step).

3. **Stop after Session 3.** Foundation is done. Phase 1 Features (the six locked in ADR-0001) and the 30-day DoD soak come next.

## Carryovers from the day (still valid, non-blocking)

- **Wells Fargo / Fidelity / Morgan Stanley OFX viability** — empirical tests via Quicken or similar before any connector code (Foundation Session 4+).
- **Other banks Scott / wife use** — Chase, Amex, Discover etc. through the Teller scratch launcher when convenient.
- **Path A vs Path B sequencing** — ADR-0003 happens after Phase 1 ships. Evidence still leans Path B-first based on competitive scan.
- **Lint debt** (97 errors) — dedicated session between end of Phase 1 dogfood and start of Phase 2.
- **BudgetView refactor** (1,643-line file) — after Foundation lands.
- **Vitest data-layer test suite** — after Foundation lands.

## Final repo state at session close

```
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

24 commits total. Working tree clean. Type-check green. Pre-commit hook verified at every commit.

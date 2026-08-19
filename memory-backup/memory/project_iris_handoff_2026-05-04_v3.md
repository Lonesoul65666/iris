---
name: Iris session handoff (2026-05-04 evening — Foundation Session 1 / Build-B shipped)
description: Vite middleware API at /api/* live. pg.Pool (max 5) cached server-side, smoke-verified end-to-end against Scott's Supabase URI. Build-B scope held — schema + real endpoints next session. Two commits — 6bb9843 (code) + a056293 (docs).
type: project
originSessionId: 2026-05-04-foundation-session-1-buildb
---

## What this session was about

Build mode declared at the top. Phase 1 Foundation Session 1 of ~3, sized strictly to **Build-B** (scaffold + smoke test only, no schema, no real endpoints). Scope held under auto mode despite token budget being available.

## What shipped

**Two commits on top of yesterday's `d4dd7ab`:**

```
a056293 docs: log Foundation Session 1 ship in state.md + cadence-log
6bb9843 feat(foundation): Vite middleware API + pg pool — Phase 1 Foundation Session 1 (Build-B)
```

### Code (commit `6bb9843`)
- **`server/db-pool.ts`** — singleton `pg.Pool` manager. `connect(uri)` opens the pool with `max: 5`, runs a `SELECT 1` smoke before handing it out, and tears down any prior pool on re-connect. `getPool()` / `hasPool()` for callers.
- **`server/api-plugin.ts`** — Vite plugin that mounts two endpoints via `configureServer`:
  - `POST /api/connect` `{connectionString}` → `{ok:true}` after successful pool open. Returns 400 on missing string, 500 on connect failure (error message included; connection string never echoed back).
  - `GET /api/health` → `{ok:true, db:'connected'}` 200 after live `SELECT 1` round-trip. `{ok:false, db:'not_configured'}` 503 if no pool seeded yet. `{ok:false, db:'error', message}` 500 on query failure.
- **`src/lib/db-client.ts`** — `bootstrapDbConnection()` reads `localStorage.getItem('iris_db_connection_string')`, POSTs it to `/api/connect`, returns `{status: 'connected'|'no_credential'|'error'}`.
- **`src/main.tsx`** — calls `bootstrapDbConnection()` on app boot, logs the result via `console.info('[iris] db bootstrap:', r)`.
- **`vite.config.ts`** — adds `irisApi()` to plugin list (before `react()`).
- **`tsconfig.node.json`** — `include` extended to `["vite.config.ts", "server/**/*.ts"]` so the plugin gets type-checked.
- **`package.json`** — `pg@8.20.0` + `@types/pg@8.20.0` added.

### Docs (commit `a056293`)
- `docs/state.md` — Foundation Session 1 noted as DONE; commit list updated; new Recent Shifts entry.
- `docs/cadence-log.md` — trajectory entry for the evening session; called out same-session ship-to-verify as the validation-discipline pattern finally landing.

## Smoke verification (real-data, not mocked)

End-to-end against Scott's Supabase Session Pooler URI:
1. Scott seeded `localStorage.iris_db_connection_string` via Chrome DevTools.
2. Reload → client console: `[iris] db bootstrap: {status: 'connected'}`.
3. From a separate process: `curl http://localhost:5173/api/health` → `{"ok":true,"db":"connected"}` 200.

Pool is server-side (Node module state), so once any client seeds it, every client (other tabs, curl, the preview tool) sees the same connected pool. This is the property that lets Scott's Chrome and Claude's preview-tool finally agree on data state — once the migration lands.

## Discipline observations to repeat

- **Mode declared at session start.** "Build mode. Phase 1 Foundation, Session 1 of ~3, sized to Build-B." Set the rules explicitly.
- **Auto mode did not break scope.** Schema, migration script, real endpoints all stayed in Session 2 / 3 buckets. No "while I'm in here" creep.
- **Credential audit before commit.** Grep'd the working tree for `postgresql://`, the project ID, and the AWS region pattern before staging. Only hit was the abstract example in cadence-log. No leaks.
- **Connection string never touched chat.** When Scott pasted a URI template with `[YOUR-PASSWORD]` placeholder asking for confirmation, response did NOT echo it back — confirmed shape, asked him to substitute his real password locally, and moved on. Per cadence-log security rules.
- **Same-session ship-to-verify.** This was the validation-discipline-65% gap. It got closed cleanly today: scaffold shipped, real Postgres round-trip verified, commit lands with proof. Worth pointing at when the next milestone re-grade happens.

## Next session — Foundation Session 2

**Mode:** Build (declare at start).

**Scope: schema runner + first 3-4 endpoints.** No migration script yet (Session 3).

1. **Open by reading** `docs/north-star.md`, `docs/state.md`, `docs/adr/0001-phase-1-scope.md`, `docs/adr/0002-storage-architecture.md`, `docs/phase-1-definition-of-done.md`, `docs/cadence-log.md`. Then this handoff.
2. **Schema migration runner** at `server/schema/runner.ts` (or similar):
   - Versioned: `schema_migrations` table tracks `version, applied_at, checksum`.
   - Idempotent: on `/api/connect` (or first request after connect), runs pending migrations in order inside a transaction.
   - Migrations live as plain `.sql` files at `server/schema/migrations/0001_init.sql`, etc.
   - `0001_init.sql` creates the `schema_migrations` table itself + the first set of tables (see below).
3. **Tables to create in `0001_init.sql` (every one with `user_id uuid not null`):**
   - `users` (`id uuid pk`, `created_at`, `display_name text`)
   - `settings` (`user_id`, `key text`, `value jsonb`, `updated_at`, pk on `(user_id, key)`)
   - `income_sources` — match the IndexedDB shape; carry `id`, `subtype`, `confirmed`, the band fields, `created_at`, `updated_at`.
   - `expenses` (transactions) — match IndexedDB shape; date, amount, payee, category, subtype, source-account, etc.
   - That's enough for Session 2. Other tables roll into 0002 / 0003 as needed.
4. **First 3-4 typed endpoints** at `/api/{settings,incomeSources,expenses}` — pick the highest-traffic IndexedDB store calls and write the matching server side. Suggest:
   - `GET /api/settings/:key` / `POST /api/settings/save` `{key, value}`
   - `GET /api/incomeSources/list` / `POST /api/incomeSources/save`
   - `GET /api/expenses/list?from=&to=` / `POST /api/expenses/save`
5. **Smoke each endpoint** against the live DB before committing — same pattern as Build-B.
6. **Stop.** Migration script + remaining endpoints + store-call swap is Session 3.

**Build-C sizing target:** scaffolded migration runner, four endpoints, smoke each. ~150-250 LOC. Should fit one session if discipline holds.

## What did NOT happen this session (correctly deferred)

- Schema runner — Session 2.
- Real endpoints (settings/incomeSources/expenses/etc.) — Session 2.
- IndexedDB → Postgres migration script — Session 3.
- Store-call swap (the ~100 call sites switching from IndexedDB to fetch) — Session 3.
- JSON export endpoint (Layer 4 backup per ADR-0002) — bundled with Session 3 store-swap or its own small commit.
- Teller signup / Fidelity coverage check — Scott's choice; still deferred from yesterday. Several sessions out anyway.
- DoD #5 + #6 re-verification — happens after Foundation lands on the new layer.
- Classifier hardening — sequenced after Foundation per the standing plan.

## Final repo state at session close

```
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

15 commits total. Working tree clean. Type-check green. Dev server running on port 5173, pool seeded, `/api/health` returning 200.

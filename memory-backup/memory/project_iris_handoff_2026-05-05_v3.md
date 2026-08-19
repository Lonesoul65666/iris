---
name: Iris session handoff (2026-05-05 morning — Foundation Build-D1 shipped, IndexedDB → Postgres migration)
description: Build-D1 landed cleanly — 22/22 income sources + 638/638 expenses migrated to Scott's Supabase Postgres. Real-data shake-out fixed expenses date-format validation in same session. App still reads IndexedDB until Build-D2 swaps store calls. 3 commits today (`726f323`, `3585026`, plus the morning's split-scope `ac60107`). Connector-collision decision logged for post-Foundation Session 4 gate.
type: project
originSessionId: 2026-05-05-foundation-build-d1
---

## What this session was about

Foundation Session 3 was originally scoped as one big Build-D (migration + store-call swap + JSON export). Scott declared Decision/Audit mode mid-morning, sized down to **Build-D1 = migration script only**. Build-D2 (store-call swap + budget-config stores + JSON export + smoke-test row cleanup) is the next session.

## What shipped (3 commits today on top of yesterday's `93b984a`)

```
3585026  docs: Build-D1 closeout — state.md + cadence-log + backlog connector-collision decision
726f323  feat(foundation): IndexedDB → Postgres migration script — Foundation Build-D1
ac60107  docs(state): split Foundation Session 3 into Build-D1 and Build-D2
```

### Code (`726f323`)

- **`src/lib/migrate-indexeddb-to-postgres.ts`** — read-only migration for `incomeSources` + `expenses`. Calls existing upsert endpoints. Idempotent via `migration_v1_complete` settings flag. Per-row errors collected in transcript, never fatal. Logs progress every 100 expenses.
- **`src/main.tsx`** — exposes migration as `window.__irisMigrate` for DevTools-console invocation. Not auto-run; explicit user action.
- **`server/api-handlers/expenses.ts`** — patched validators after first run revealed real-data shape mismatch:
  - `normalizeDate()` accepts ISO date, ISO datetime (strips T-suffix), MM/DD/YYYY (CSV imports), and `Date.parse` fallback. Output canonical `YYYY-MM-DD`.
  - `normalizeAmount()` accepts numbers AND strings (strips `$`/commas/whitespace).
  - 400 response now returns `invalidFields` + `seenTypes` for fast diagnostic.
  - Normalized values land in BOTH typed columns AND jsonb data so reads stay consistent.

### Migration verified end-to-end on Scott's real Supabase

- **22/22 income sources written, 0 errors**
- **638/638 expenses written, 0 errors**
- **Total run time:** 51.9 seconds (sequential, ~80ms/row average)
- **Postgres counts confirmed via list endpoints:**
  - `income_sources` = 23 (22 migrated + 1 smoke-test from Build-C)
  - `expenses` = 639 (638 migrated + 1 smoke-test)
  - `settings` = 2 (`migration_v1_complete` flag + `smoke-test-key`)

### What's still in IndexedDB only (Build-D2 territory)

- `buckets` — budget bucket per category
- `sinkingFunds` — savings goal entries
- `funMoney` — per-person personal spending pools
- `paycheck` — current paycheck breakdown (single row)
- `customCategories` — user-created expense categories
- `recurringDecisions` — user decisions on recurring transactions
- `inflowDecisions` — user decisions on individual inflows ("what is this $150 from Venmo?")
- `earners` — household earners

These need a schema decision before D2 starts: own-tables vs settings-blobs. See "Build-D2 specifics" below.

## Discipline notes worth banking

- **Same-session diagnose-and-fix is now a 3-session pattern.** Build-B (yesterday): scaffold + smoke real Postgres. Build-C (last night): schema + endpoints + smoke. Build-D1 (this morning): migration + real-data shake-out + fix + re-run. Validation discipline ~65% gap is closing across all three sessions.
- **Synthetic smoke ≠ real-data validation.** Build-C's tests passed with synthetic shapes; Build-D1 hit real-world data and immediately found a shape mismatch. Both forms of testing matter; neither substitutes for the other.
- **Right-sized split held under auto mode.** Scott split Build-D into D1 + D2 deliberately at session open. D1 stayed at scope (migration only, no store-call swap) despite auto mode being on and "just keep going" being available.
- **Connector-collision decision was flagged, not silently absorbed.** When connectors land in Foundation Session 4+, migrated CSV-imported rows won't auto-dedupe with connector-fetched transactions. Three candidate paths (dedupe-on-import / reset-and-replay / tag-the-source) logged in `post-phase-1-backlog.md`. Decision belongs in a future ADR.
- **Cross-browser validation declined as ritual.** Architecturally guaranteed by ADR-0002; automatically surfaces in Build-D2 when store calls swap. Skipping a validation step that doesn't unblock anything is itself good discipline.

## Next session — Foundation Session 3 / Build-D2 (the last Foundation session)

**Mode:** Build (declare at start). Maybe split further depending on time.

**Scope:**

1. **Schema decision for budget-config stores.** Either:
   - **0002_budget_config.sql** that adds tables: `buckets`, `sinking_funds`, `fun_money`, `paycheck`, `custom_categories`, `recurring_decisions`, `inflow_decisions`, `earners`. Each with `user_id` + typed columns + jsonb `data`. Same hybrid pattern as Build-C.
   - **OR** fold them all into existing `settings` table as keyed JSON blobs (e.g., `settings.key = 'budget_buckets'`, `value = [...]`). Simpler but loses queryability.
   - **Recommendation: own tables.** They're row-data, not config. Settings table is for app-level config. The pattern from Build-C scales cleanly.

2. **Endpoints for the new tables.** GET list / POST save for each. Probably 4-6 new resources.

3. **Migration script v2.** Extend `migrate-indexeddb-to-postgres.ts` to handle the budget-config stores. Same idempotent pattern; `migration_v2_complete` flag. Run it via DevTools console.

4. **Store-call swap.** `src/stores/budgetStore.ts` (and others) flip from `idb` calls to `fetch('/api/...')` internals. Function signatures stay the same. Verify each surface (Pulse view, Edit Budget overlay, Variable Pay, Work Expense card, etc.) against the new layer.

5. **JSON export endpoint.** `GET /api/export/full` — streams all user data as JSON. Settings UI button: "Download backup". Layer 4 backup per ADR-0002.

6. **Smoke-test row cleanup.** Delete the three `smoke-test-*` rows from settings/incomeSources/expenses as housekeeping.

**Sizing call:** This is bigger than Build-D1. Honest read: 90+ minutes, possibly 2 sessions. If next sit-down is short, do schema + migration v2 only (D2a) and save store-swap + export for D2b.

## Carryovers (still valid, non-blocking)

- **Wells Fargo / Fidelity / Morgan Stanley OFX viability** — empirical tests via Quicken or similar before Foundation Session 4 connector code. **WF and MS confirmed NOT in Teller catalog.**
- **Other banks Scott / wife use** — Chase, Amex, Discover etc. through the Teller scratch launcher when convenient.
- **Connector-collision decision (NEW carryover from D1)** — Path A/B/C in `post-phase-1-backlog.md`. Decide before Foundation Session 4 ships.
- **Path A vs Path B Phase-2 sequencing** — ADR-0003 happens after Phase 1 ships. Evidence still leans Path B-first.
- **Lint debt** (97 errors), **BudgetView refactor**, **Vitest data-layer tests** — all post-Foundation.
- **Classifier hardening** — separate from migration. Will run against Postgres data when it lands.

## Final repo state at session close

```
3585026 docs: Build-D1 closeout — state.md + cadence-log + backlog connector-collision decision
726f323 feat(foundation): IndexedDB → Postgres migration script — Foundation Build-D1
ac60107 docs(state): split Foundation Session 3 into Build-D1 and Build-D2
93b984a docs: log Build-C user-side validation + partnership-process pattern
b59d666 docs: log Foundation Session 2 (Build-C) in state.md + cadence-log
5e00bd3 feat(foundation): schema runner + first endpoints — Foundation Session 2 (Build-C)
7b08d6c docs(state): WF and Morgan Stanley confirmed NOT in Teller catalog
047683d docs(cadence): trajectory entry for 2026-05-05 Decision/Audit session
8a0c438 docs(state): full household institution map + connector strategy refinement
82caf4d docs(state): lock Teller coverage map (BoA, Citi, Cap One verified)
674704b docs(state): refresh Origin + Monarch competitive entries
7f9ad05 docs(backlog): mark Foundation Session 1 done; sequence Sessions 2 + 3
a056293 docs: log Foundation Session 1 ship in state.md + cadence-log
6bb9843 feat(foundation): Vite middleware API + pg pool — Foundation Session 1 (Build-B)
... [pre-Foundation history]
```

27 commits total. Working tree clean. Type-check green. Pre-commit hook verified at every commit. Postgres holds Scott's real data; React app still reads IndexedDB until Build-D2.

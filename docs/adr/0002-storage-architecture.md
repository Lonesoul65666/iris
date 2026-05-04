# ADR-0002: Storage Architecture — User-Owned Cloud Database

**Status:** Accepted
**Date:** 2026-05-04
**Decision-makers:** Scott (designer / project lead), Claude (engineering partner)

## Context

ADR-0001 locked Phase 1 scope at six budget-engine features and assumed storage was effectively solved by the existing per-browser IndexedDB layer. That assumption broke during the 2026-05-03 / 2026-05-04 sessions when two real-world constraints surfaced:

1. **IndexedDB is per-browser-per-origin, which makes the data invisible to anyone using a different browser.** During an active diagnostic session on 2026-05-03, the preview-tool's headless Chromium and Scott's actual Chrome session held different IndexedDBs. The same constraint affects partners on different devices, the same user on a second browser, or anyone who clears browsing data. The friction was immediate during partnership work — Scott had to paste DevTools snippets to share his data state.

2. **The user's hardware churns on a normal cadence.** Scott's work laptop is being replaced within days; gaming PCs fail; personal machines change every few years. A storage architecture rooted in "this specific physical machine" makes data fragile by design — every machine event becomes a manual-export-and-pray migration.

The original Working Principle #1 in `docs/north-star.md` — *"Data lives in IndexedDB / SQLite on the user's machine. No cloud storage of financial data. Ever."* — conflated two separate ideas:

- **User-controlled storage** (Iris never hosts or owns the user's data) — the actual mission-relevant principle, tied to privacy positioning vs. Mint / Monarch / Copilot.
- **Single-machine-resident storage** (data sits on one specific physical box) — an implementation choice that's now wrong for real-world use.

We need to keep the first idea and abandon the second.

## Decision

Iris's canonical storage moves to a **user-owned cloud database** with a bring-your-own connection-string model, mirroring the existing BYO-LLM-API-key pattern.

### Architecture

- **Database:** PostgreSQL on **Supabase free tier** (conservative pick — biggest community, generous free limits, mature tooling). Turso and Neon remain valid alternatives if Supabase changes terms; the architecture is portable across any Postgres-compatible provider.
- **Server layer:** Vite dev server with API middleware via `configureServer`. All endpoints live at `/api/*` on the same port (5173) — single URL for clients, no CORS issues, no second port to manage.
- **Driver:** Node + connection pool to Supabase via `pg` (or equivalent Postgres client). Conservative, mature, well-documented.
- **Client layer:** the existing store-call signatures (`getSetting`, `saveSetting`, `getIncomeSources`, etc.) remain identical; their *implementations* swap from IndexedDB calls to `fetch('/api/...')` calls. Minimizes blast radius across the ~100+ call sites.
- **Schema:** every relevant table includes a `user_id` column from day one, even though Phase 1 is single-user. Cheap to seam now; expensive to retrofit when partner-mode lands. Honors Working Principle #5 (multi-user-aware from day one).
- **Schema migrations:** versioned migration runner from day one. On app start, the API checks the schema version and runs pending migrations once. Standard pattern; explicit from the start so future-us doesn't ad-hoc it.
- **Connection string storage:** `localStorage` on the client (small config, single credential, never sent to source control or the database itself). Future packaging will move this to OS keychain.

### Multi-layer backup

Defense-in-depth from day one:

1. **Cloud DB itself** — primary store, lives forever
2. **Provider's auto-backups** — Supabase free tier ~7-day rolling backups (managed by provider, not Iris)
3. **Local SQLite cache** *(deferred to v1.1)* — offline-readable copy, auto-syncs when online
4. **User-initiated JSON export** *(v1)* — Settings button: download everything as `iris-backup-YYYY-MM-DD.json`
5. **Scheduled JSON export** *(deferred to v1.2)* — auto-write snapshots to a chosen folder weekly/monthly

Layers 1 and 4 ship with the storage migration. Layer 2 is automatic. Layers 3 and 5 are future polish.

### Encryption deferred to v1.1

Application-level encryption of descriptive fields (transaction memos, payee names) was considered and **deliberately deferred** to v1.1. Rationale: encrypted columns break `LIKE` searches; passphrase loss permanently strands descriptive data; key-rotation is a real engineering burden. v1 ships with TLS-only protection (provider connection encryption + at-rest encryption that all major providers default to). The encryption layer can land in v1.1 without a schema overhaul.

### Migration plan

A one-shot migration script reads the user's existing IndexedDB and POSTs the contents to the new API to seed Postgres. Required properties:

- **Idempotent** — running twice produces the same end state
- **Verifiable** — record counts match between source and destination; spot-check samples match
- **Reversible** — IndexedDB stays intact (read-only) for one full session as fallback before being marked deprecated
- **Logged** — migration writes a transcript so any data discrepancies are debuggable

The migration is its own commit, not bundled with the rest of the storage swap. Treated as a first-class piece of work.

## Phase 1 scope amendment

ADR-0001's six features remain unchanged. This ADR adds a **Phase 1 Foundation** sequence that precedes feature soak:

- **Phase 1 Foundation (NEW):** storage migration to user-owned cloud DB; multi-layer backup (layers 1 + 4 in v1); migration of existing IndexedDB data; schema runner; connection string handling.
- **Phase 1 Features (UNCHANGED):** the six in ADR-0001 — Pulse, Edit Budget overlay, Work Expense aggregate, Variable Pay floor + sweep, Daily auto-sync, Merchant memory.
- **Phase 1 DoD (UNCHANGED CRITERIA, NEW START LINE):** the eight binary criteria still hold; the 30-day soak clock starts only after Foundation + Features are both verified.

**This is a scope amendment, not feature creep.** ADR-0001 implicitly assumed storage was solved. It wasn't. We are amending the ADR to reflect that an architectural prerequisite was missing from the original scope — not adding a seventh feature.

## Working Principle #1 — revised

Old (`docs/north-star.md`):
> **Local-first.** Data lives in IndexedDB / SQLite on the user's machine. No cloud storage of financial data. Ever.

New:
> **User-controlled storage.** Iris never hosts or owns the user's data. The user's data lives in storage they control — a database account at a provider they signed up for (Supabase, Turso, Neon, etc.) using a connection string they own. Iris connects to that storage on the user's behalf; Iris-the-vendor has no access. The user can export, migrate, or delete their data at any time without going through Iris.

The privacy posture (no Iris-hosted multi-tenant cloud, no Iris staff with access to user data, no Iris-owned data analytics) is preserved. The implementation no longer assumes a single physical machine.

## Consequences

### Positive

- **Machine-agnostic.** Hardware churn (work laptop replacement, gaming PC failure, browser changes) no longer threatens data. Paste connection string on the new device, you're back.
- **Partner mode trivially supported.** Couples sharing a connection string share a database. Working Principle #3 (co-op, not shared visibility) gets a real implementation path.
- **Connectors land in stable storage.** Coinbase / Teller / Fidelity sync to one canonical place that survives device events.
- **QA seat shared.** Both Scott and Claude can verify against the same data state instead of trading screenshots and DevTools snippets. Materially faster diagnostic loops.
- **Deployment simplifies.** Gaming-PC-as-server constraint dissolves — the static frontend can run anywhere (localhost, any hosted static-site service); the cloud DB is already user-controlled. LAN-tethering is no longer load-bearing.
- **Partner-mode data model is free** thanks to `user_id` from day one.
- **Free tier covers indefinite personal use.** Supabase 500 MB DB / 5 GB egress per month — orders of magnitude over what Iris needs.

### Negative

- **30-day soak clock delayed** by ~3 focused sessions (the migration work). Foundation must be verified before features can soak.
- **Onboarding step gains friction.** Manual paste-the-connection-string in v1 is more involved than "download and run." OAuth-provisioning wizard is post-Phase-1.
- **Internet dependency.** No internet = no Iris (until v1.1's local cache lands). Acceptable given Scott's "always online" reality but real for users in different situations.
- **Working Principle #1 marketing language changes.** Less "Mint can't see your data because it's on your machine" and more "you own the database; Iris never hosts it." Honest revision, not retreat — but the public-facing copy needs work.
- **Provider technical access exists.** Supabase staff with database privileges *could* read raw data (mitigated by SOC2-level controls + at-rest encryption, fully mitigated only by app-level encryption in v1.1). Different threat model than physical-machine-only.

### Mitigations

- **Deferred items get explicit Phase 1.x slots** in the backlog (encryption layer, local cache, OAuth onboarding wizard) — none are forgotten.
- **Multi-layer backup** (provider backups + JSON export) protects against provider outages and user mistakes.
- **`user_id` schema decision now** prevents painful retrofitting later.
- **Conservative provider pick** (Supabase) reduces risk of free-tier surprises; if terms change, the architecture is portable to Turso / Neon / self-hosted Postgres.

## Alternatives considered

**Alt 1 — SQLite on a single machine + LAN access (the original ADR-conversation proposal):** rejected. Single-machine-fragile, manual export-and-pray on hardware events, doesn't scale to partner mode without further architectural change.

**Alt 2 — SQLite file in user's Dropbox / OneDrive / iCloud Drive:** rejected. SQLite over file-sync services is famously dangerous (mid-write file corruption); officially unsupported. Even with lock-file conventions and "single live machine" rules, the silent-corruption failure mode disqualifies it.

**Alt 3 — Origin Private File System / browser-shared storage:** rejected. Same per-browser-per-origin limitation as IndexedDB. Doesn't solve the underlying problem.

**Alt 4 — Iris-hosted multi-tenant cloud:** rejected. Violates the no-SaaS principle and the "user-controlled storage" framing. Also brings PCI / SOC2 / incident-response burdens that require a full-time team Iris does not have.

**Alt 5 — Local-first CRDT layer (Automerge / Yjs):** rejected for v1. Real solution to multi-device sync, but adds significant complexity and the tooling for app-state-with-financial-numbers is still maturing. Worth revisiting as a v3+ option if multi-machine offline editing becomes a real need.

## Revisitation

This ADR is revisited if:

- Supabase changes free-tier terms in a way that breaks the model (migrate to Turso / Neon / self-hosted Postgres — architecture is portable)
- Encryption layer lands in v1.1 (separate ADR documenting the encryption design)
- Onboarding wizard for non-technical users lands in v2 (separate ADR for the OAuth-provisioning flow)
- A meaningful real-world failure mode emerges in dogfood that this design doesn't anticipate

Until then: this ADR is the canonical storage decision. ADR-0001's feature scope and DoD criteria stand alongside it, both authoritative.

## Notes for next-session implementer

These details should land in the implementation but are out of scope for the ADR text:

- API endpoint shape: typed RPC over HTTP (one endpoint per business operation: `POST /api/incomeSources/save`, `GET /api/expenses/list`, etc.) — easy to evolve, no premature GraphQL / REST-resource modeling
- Auth between client and Vite server: LAN trust for Phase 1 (single-user-on-localhost). Phase 2+ packaging adds proper auth.
- Migration script lives at `scripts/migrate-indexeddb-to-postgres.ts` (or similar); runs once on first launch after the swap, prompts user before executing
- Pre-flight verification: connection string validation, schema initialization, smoke test of read/write before declaring migration successful
- Existing IndexedDB stays read-only intact for at least one session post-migration as fallback; only deleted after user confirms the new layer is working

---
name: Iris session handoff (2026-05-04 — ADR-0002 + cadence framework + security rules + Foundation pre-work)
description: Architecture-decision day. Storage moves from per-browser IndexedDB to user-owned cloud DB (Supabase + Postgres). Phase 1 amends to Foundation gate-zero. Cadence log + security rules also landed. Supabase project live, credentials rotated and saved locally. Build mode opens NEXT session.
type: project
originSessionId: 2026-05-04-architecture-and-foundation-prep
---

## What this session was about

Long, deliberate, multi-arc session. Started as a Build session (Phase 1 sidebar trim, Variable Pay band-detection fix, sweep-label cleanup) — those landed earlier. Then shifted to architectural decision-mode when Scott raised the IndexedDB-per-browser problem and the imminent work-laptop replacement. We talked through three storage architectures, picked user-owned cloud DB via ADR-0002 conversation, codified a cadence-tracking framework, encoded security-process rules after a credential exposure-and-rotate learning, and Scott completed the Supabase pre-work for next session's Build.

**No Foundation code shipped.** Architecture decision documented, pre-work done, ready for Build mode next session.

## What shipped today (commit history)

```
bd9e2d5 docs(cadence): security process rules + credential-rotation learning
e1ce260 docs: cadence-log.md — partnership trajectory tracking
eeb34f8 docs(state): pin commit hash for ADR-0002 landing
6d5f16e docs(adr-0002): storage architecture — user-owned cloud DB
4426317 feat(phase-1): plain-language sweep labels + custom destination on Variable Pay card
4e23bdc docs: log Scott-creep / vocabulary audit; close stale Variable Pay visibility item
```

(Plus prior commits from yesterday: 53e8a97, 4896476, 80af74f, etc.)

## What's now true in the repo

### `docs/adr/0002-storage-architecture.md` (NEW)
- Full ADR. Storage moves from per-browser IndexedDB to user-owned cloud DB (Supabase + Postgres, BYO connection-string model).
- Architecture: Vite middleware API at `/api/*` (same port, no CORS), schema with `user_id` from day one, versioned migration runner, connection string in `localStorage`.
- Multi-layer backup v1: cloud DB + provider auto-backups + JSON export. Local SQLite cache + app-level encryption deferred to v1.1.
- Migration plan: idempotent, verifiable, reversible (IndexedDB stays read-only intact for one session as fallback).
- Phase 1 scope amendment: Foundation → Features (unchanged six) → DoD soak. The six locked features remain locked.
- Phase-2-sequencing ADR renumbered to ADR-0003.

### `docs/north-star.md` (modified)
- Working Principle #1 revised: "data lives on user's machine" → "user-controlled storage, never Iris-hosted."
- Phase 1 roadmap section gains Foundation → Features → DoD soak sequencing.
- Reading order adds ADR-0002 and cadence-log.md.

### `docs/state.md` (modified)
- Vision anchor #6 updated to match Working Principle #1 revision.
- Recent shifts log gains 2026-05-04 entry with honest cost ledger.
- Open items refreshed: Foundation is gate-zero; everything else (BudgetView refactor, Vitest, connectors, classifier hardening, DoD verifications) sequences after.
- Drift watch gains "assumes machine-resident storage" entry.

### `docs/post-phase-1-backlog.md` (modified)
- New "Phase 1 Foundation" section — gate-zero work in detail with sequencing.
- New "Phase 1.1 follow-ups" — local cache, encryption, scheduled JSON export.
- New "Post-Phase-1 onboarding wizard" — three candidate paths for non-technical users.
- Existing IndexedDB-settings-migration item marked SUPERSEDED.

### `docs/cadence-log.md` (NEW)
- Partnership trajectory tracking. Five dimensions (Vision / Scope / Process / Validation / Decision Velocity) with current scores and 85%-by-v2 target.
- Five session modes — Riff / Decision / Build / Validation / Audit — declared at session start; riffs are NOT scored as drift.
- Vocabulary section: drift patterns and positive patterns both named, both call-outable in real time.
- New "Security process (permanent rules)" subsection: credentials never in chat; confirm shape not content; leak → rotate immediately; storage rule; no re-paste after correction.
- Trajectory log section appended every substantive session. Two entries today.

## What's complete on Scott's side (Foundation pre-work)

- ✅ Supabase account created (free tier, no card)
- ✅ Project created — `pddhvrdelhahrzbrdeoo`
- ✅ Session Pooler URI selected (correct pick for IPv4 free tier; Direct connection requires IPv6 / paid IPv4 add-on which we skipped)
- ✅ Database password rotated after credential exposure incident (encoded as permanent learning in cadence log security rules)
- ✅ New connection string saved locally on Scott's machine (NOT in chat, NOT in source, NOT in commits)
- ✅ Auto-RLS left disabled (correct for our server-mediated trusted-connection architecture)

## What's deferred (carryovers)

- **Teller signup + Fidelity-and-banks coverage check** — Scott explicitly chose to defer this to next session rather than do it today. Single 10-min exercise: sign up at teller.io, open Connect widget, search for Fidelity (note whether one connector covers both brokerage and NetBenefits 401k, or whether they're separate), search for BoA / Citi / Cap One, report coverage. **This consolidates the previously-listed "Teller signup" + "NetBenefits OFX check" into one verification — see partnership note below.**
- **DoD #5 verification** — Variable Pay surplus reconcile against Scott's actual paychecks. Re-verifies after Foundation lands anyway.
- **DoD #6 verification** — Work Expense card reconcile against Coupa within $50 over 90d. Same as above.

## Important partnership-process correction (Scott catching me)

I had originally listed two separate carryovers — "Teller signup" AND "NetBenefits OFX Direct Connect check." Scott pushed back: if Teller covers Fidelity, why maintain a redundant OFX path? OFX is dying; double connectors for one institution is unnecessary maintenance. **He was right.** The carryover is now a single consolidated verification — does Teller's Fidelity connector cover both brokerage and NetBenefits 401k? If yes, OFX is dead weight and gets dropped. If no, then we revisit OFX.

This was a clean *self-flag* + *anchor return* pattern from Scott. Worth noting for the cadence trajectory.

## What did NOT happen

- **No Foundation code shipped.** Architecture decision documented, pre-work done. Build mode opens next session.
- **No Foundation Build-B started.** Token-count discipline kicked in (~42% used, with build estimated at +60-200k+ depending on scope). Right-sized: stop here, ship Build-B with a fresh context window next session.
- **No Teller signup / coverage check.** Scott deferred to next session. Not blocking — connector work is several sessions out anyway.

## Next-session priorities (Build mode opens)

1. **Open by reading** `docs/north-star.md`, `docs/state.md`, `docs/adr/0001-phase-1-scope.md`, `docs/adr/0002-storage-architecture.md`, `docs/phase-1-definition-of-done.md`, `docs/post-phase-1-backlog.md`, `docs/cadence-log.md`.
2. **Declare mode: Build.** Phase 1 Foundation, Session 1 of ~3. Sized to **Build-B**: scaffold + smoke test only.
3. **Build-B specifics:**
   - Scaffold Vite middleware API at `/api/*` via `configureServer`
   - Code expects connection string at `localStorage.getItem('iris_db_connection_string')` — Scott pastes via DevTools once scaffold is in place. **Connection string never touches chat.**
   - Connection pool with `pg` driver, `max: 5` (free-tier-safe)
   - One trivial endpoint: `GET /api/health` returns `{ok: true, db: 'connected'}` after a real `SELECT 1` round-trip
   - Verify in preview: `curl http://localhost:5173/api/health` returns the expected payload
   - Stop. Schema and real endpoints next session.
4. **After Build-B passes:** ADR-0002 implementation continues in Session 2 (schema, migration runner, first 3-4 endpoints) and Session 3 (migration script, swap remaining store calls, verify each surface).
5. **THEN, in order:** classifier hardening, DoD #5 + #6 re-verification on new layer, BudgetView refactor, Vitest, connectors (Teller verification first), 30-day soak.

## Discipline reminders for tomorrow-Claude

- **Auto mode does NOT override scope discipline.** Foundation Session 1 sized to Build-B. Don't sprawl into schema and endpoints in the same session.
- **Connection string never touches chat.** Period. Even partial pastes count. See cadence-log security rules.
- **Mode declaration at session start** — say "Build mode" out loud. Sets the rules.
- **Real-use feedback over preview-tool checks** — but the whole point of the migration is that those views finally agree. Once Foundation lands, both Scott's Chrome and the preview headless browser will see the same data.
- **The cadence log is the receipt for milestone re-grades.** Append to trajectory at end of substantive sessions. Pattern-flag in real time using the vocabulary.

## Cadence trajectory observation (today's session)

Strong day. Specific positive patterns logged:
- Multiple **self-flags** during visionary spiral catching ("we're still just conceptually riffing")
- **Anchor returns** explicit ("make sure it fits our mandates," "validate it against and rewrite our focus")
- **Joint affirms** before any commit — Scott insisted on "we BOTH agree" before drafting ADR-0002
- **Stop-and-verify** before action ("let's not build yet, let's just keep talking")
- **Right-sized** decision-making (Build-B over Build-A, then deferred entirely when token-count discipline kicked in)
- **Self-flag on partner correction** — Scott caught my redundant Teller-and-OFX carryover, consolidated to one verification
- **Process discipline under pressure** — credential rotation immediate, no negotiation

Specific things to keep working on:
- *Validation discipline* dimension still ~65% — remains the highest-leverage gap. Same-session ship-to-verify is the pattern to build.

## Final repo state at session close

```
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

Thirteen commits. Working tree clean. Type-check green. Pre-commit hook verified at every commit.

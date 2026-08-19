---
name: Iris session handoff (2026-05-05 — Decision/Audit pause + competitive refresh + Teller coverage + institution map)
description: Decision/Audit session after Build-B. Origin + Monarch competitive deep-dive corrected stale notes; Teller verified for BoA/Citi/Cap One; full household institution map locked (7 institutions, 3 connector types). Six doc commits today. No Iris code changes. Foundation Session 2 opens next session.
type: project
originSessionId: 2026-05-05-decision-audit-connector-verification
---

## What this session was about

Scott explicitly pulled the wheel from Build mode into Decision/Audit mid-session. Quote: "before we move and develop any further, let's understand." The whole session ran by that frame — no new Iris code, just doc updates plus a throwaway scratch launcher to verify Teller. That discipline held under auto mode despite multiple "could-build-now" moments.

## What shipped today (six commits on top of yesterday's Build-B)

```
047683d  docs(cadence): trajectory entry for 2026-05-05 Decision/Audit session
8a0c438                   docs(state): full household institution map + connector strategy refinement
82caf4d                   docs(state): lock Teller coverage map (BoA, Citi, Cap One verified)
674704b                   docs(state): refresh Origin + Monarch competitive entries; sharpen differentiation
7f9ad05                   docs(backlog): mark Foundation Session 1 done; sequence Sessions 2 + 3
a056293                   docs: log Foundation Session 1 ship in state.md + cadence-log
```

Note: yesterday evening's `6bb9843` (Build-B Vite middleware + pg pool) is the last code commit. Everything since is doc-only.

## Three threads landed

### Thread 1 — Competitive landscape refresh

State.md previously said "Origin Money. $200/yr advisor-led, different segment." That was wrong. Origin pivoted to a $99/yr all-in-one platform with three-view Partner Mode (A, B, together), Plaid/MX/Finicity for connectors, and SEC-regulated AI advisor. Reviewer-rated weak on budgeting (Rob Berger) — which is exactly Iris's Phase 1 strength.

Monarch is the most mechanically sophisticated couples competitor: "Shared Views" labels accounts/transactions as mine/theirs/ours, per-transaction privacy toggle hides specific transactions from a partner. $14.99/mo or $99.99/yr. NerdWallet hands-on review noted real friction: 2FA accounts pause syncing, savings buckets don't sync, custom categories tedious; reviewer ultimately went back to her spreadsheet.

**Iris's differentiation refined to four legs:**

1. **Privacy / user-owned data** — Origin and Monarch are multi-tenant cloud + Plaid. ADR-0002's user-owned cloud DB makes this real.
2. **One-time pricing** — both competitors are subscription. $50-150 once is a real moat.
3. **Budget engine quality** — both reviewer-rated weak/tedious here. Variable Pay floor + sweep + Work Expense aggregate are mechanics neither covers.
4. **Co-op as gameplay** — Monarch's mine/theirs/ours is *visibility management*, not gameplay. Pokémon-cards / scheduled-co-op / joint-collection thesis (Phase 2 Path B) is still wide open.

**Phase 2 sequencing has new evidence**: Path B (co-op mechanics) leans up vs Path A (investments). Both competitors already cover investing decently, so Path A first lands in catch-up; Path B first lands in white space. **Decision still happens in ADR-0003** after Phase 1 ships — but the input has shifted.

### Thread 2 — Teller coverage verified

Scott registered the "Iris Finance" app at teller.io, downloaded mTLS certificates, and ran Teller Connect via a throwaway scratch launcher (`public/teller-connect.html`, gitignored). Three enrollments verified end-to-end:

- **Bank of America** — works (verified 2026-05-04)
- **Citibank** — works (verified 2026-05-05; Citi failed first attempt due to a `file://` null-origin bug in the launcher, NOT a coverage gap. Serving via Vite at `http://localhost:5173/teller-connect.html` resolved it.)
- **Capital One** — works
- **Fidelity** — confirmed not in Teller catalog (expected per ADR-0001)

**Architecture footnote logged for Foundation Session 4+:** Teller Connect uses `postMessage` between iframes, requires a non-null HTTP origin. Iris's in-app embed will satisfy that naturally. Don't try to launch Connect from a `file://` URL.

### Thread 3 — Full household institution map locked

Scott's actual financial inventory:

| Institution | Holdings | Connector | Status |
|---|---|---|---|
| Bank of America | Bank + CC | Teller | ✅ Verified |
| Citibank | Bank + CC | Teller | ✅ Verified |
| Capital One | Bank + CC | Teller | ✅ Verified |
| Wells Fargo | Mortgage only | Teller (try) or manual | ⚠ Untested |
| Fidelity | 401k + investments | OFX Direct Connect | ⚠ Untested |
| Morgan Stanley | Equity (post-E*Trade) | OFX Direct Connect | ⚠ Untested + risky |
| Coinbase | Crypto | Coinbase API | ⚠ Untested |

Three connector types, seven institutions. ADR-0001's three-connector architecture (Teller + OFX + Coinbase) holds — Morgan Stanley adds an OFX enrollment, not a fourth connector type.

**Risks flagged:**
- **Morgan Stanley OFX is reportedly clunky** post-E*Trade migration (Sept 2023). Multiple users report OFX Error 16503. Needs Quicken-or-similar smoke test before Iris connector code commits to it.
- **Wells Fargo mortgage** may or may not surface via Teller. Likely shows up as a `loan` account type with balance only (no transaction stream beyond the monthly payment). Empirical test needed. Either way, mortgage data is low-frequency — manual entry in Iris is a fine fallback if Teller doesn't cover it.
- **Fidelity OFX** untested. Should be cleanest of the three brokerages — needs a smoke test anyway.

## Discipline notes worth banking

- **Mode declarations work.** Scott named Decision/Audit at the top, Claude held it through the whole session despite auto mode. No premature code.
- **Same-session ship-to-verify is now repeatable.** Build-B (yesterday) and the `file://` bug fix (today) both went find → fix → verify in one continuous loop. The validation-discipline ~65% gap is closing.
- **Honest competitive reads land cleanly.** State.md's "Origin Money $200/yr advisor-led" was outdated by ~2 years. Catching it now means Iris's positioning narrative is more honest going forward.
- **No re-paste of credentials** — when Scott exposed the Supabase password yesterday it got rotated; today the application_id (non-secret per Teller's docs) was handled cleanly without echoing.
- **Throwaway tooling stays throwaway.** The Teller Connect launcher is in `public/` and gitignored. Not part of Iris source. When Foundation Session 4 lands, the real embed will live in Iris itself.

## What did NOT happen this session (correctly deferred)

- No Foundation Session 2 (schema runner + first endpoints).
- No connector code (Teller, OFX, Coinbase API integration).
- No Wells Fargo / Fidelity / Morgan Stanley empirical tests yet (Scott's choice; not blocking).
- No Path A vs Path B ADR-0003 — premature; happens after Phase 1 ships.

## Next-session priorities (Foundation Session 2)

1. **Open by reading** `docs/north-star.md`, `docs/state.md`, `docs/adr/0001-phase-1-scope.md`, `docs/adr/0002-storage-architecture.md`, `docs/phase-1-definition-of-done.md`, `docs/post-phase-1-backlog.md`, `docs/cadence-log.md`. Then this handoff and the v3 handoff.
2. **Declare mode: Build.** Phase 1 Foundation, Session 2 of ~3. Sized to Build-C: schema runner + first 3-4 endpoints. No migration script (that's Session 3). No store-call swap (also Session 3).
3. **Build-C specifics:**
   - Schema migration runner at `server/schema/runner.ts`
   - Migrations live as plain `.sql` files at `server/schema/migrations/0001_init.sql`, etc.
   - `schema_migrations` table tracks `version, applied_at, checksum`
   - Idempotent: on `/api/connect` (or first `/api/*` request after connect), runs pending migrations in order inside a transaction
   - **`0001_init.sql` creates** (every table with `user_id uuid not null` from day one):
     - `users` (`id uuid pk`, `created_at`, `display_name text`)
     - `settings` (`user_id`, `key text`, `value jsonb`, `updated_at`, pk on `(user_id, key)`)
     - `income_sources` — match IndexedDB shape (`id`, `subtype`, `confirmed`, band fields, timestamps)
     - `expenses` — match IndexedDB shape (date, amount, payee, category, subtype, source-account, etc.)
   - **First 3-4 typed endpoints** at the highest-traffic IndexedDB paths:
     - `GET /api/settings/:key` / `POST /api/settings/save` `{key, value}`
     - `GET /api/incomeSources/list` / `POST /api/incomeSources/save`
     - `GET /api/expenses/list?from=&to=` / `POST /api/expenses/save`
   - Smoke each endpoint against the live DB before committing.
4. **Stop.** Migration script + remaining endpoints + store-call swap is Session 3.

## Carryovers / open empirical tests (any time, not blocking)

- **Wells Fargo via Teller Connect** — does the mortgage surface? 60-second test in the existing scratch launcher.
- **Fidelity OFX** — does Direct Connect work cleanly? Try via Quicken or similar OFX client first.
- **Morgan Stanley OFX** — same. Higher risk per the post-E*Trade reports. Worth a Quicken smoke before any Iris code commits.
- **Other banks** — Chase / Amex / Discover etc. if Scott or his wife uses any not-yet-tested institution.

Each result populates the launcher's localStorage history table AND the `state.md` institution map.

## Final repo state at session close

```
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

21 commits total. Working tree clean. Type-check green. Pre-commit hook running on every commit.

---
name: Iris session handoff (2026-05-10 — Reset & Reconnect + Build-D2b + Build-D2c shipped; app now browser-agnostic)
description: After a ~3-week gap, restored Supabase (data survived), shipped Build-D2b (budget store→Postgres, 2 bugs fixed in real Chrome), removed SimpleFIN, then Build-D2c (settings+auth/PINs+userProfile+audit→Postgres). App is now FULLY browser/laptop-agnostic — validated end-to-end in real Chrome. ADR-0002 storage migration functionally COMPLETE. Commits 1c793ef, 5548e46, 847efce, 3ee36c2, 0e6160c, 49c4903.
type: project
originSessionId: 2026-05-10-reset-reconnect-d2b-d2c
---

## ⭐ LATEST STATE (read first): Build-D2c shipped — app is browser/laptop-agnostic

**📍 REPO: `C:\Claude\projects\signal\signal-app`** (Iris = product name; repo/project = `signal`. There is NO folder named "iris" — don't search for one. `cd C:\Claude\projects\signal\signal-app`.)


Build-D2c (commits `0e6160c` + docs `49c4903`, plan `3ee36c2`) moved the LAST budget/auth stores to Postgres, AFTER the D2b/reset work described below. **This supersedes the "remaining gap (split-brain)" section later in this file — that gap is now RESOLVED.**

- `portfolioStore.getSetting/saveSetting` → `/api/settings` (keystone: auth_users/PINs, enabled_modules, onboarding_complete, nudges, market annotations now browser-independent).
- `userProfile` → settings key `user_profile`. `auditLogStore` → `/api/audit` + new `0003_audit_log.sql`.
- Migration v3 (`migration_v3_complete`) copied IndexedDB settings (decoding legacy JSON-stringified values) + userProfile + audit → Postgres.
- **Validated in Scott's real Chrome through the delicate auth path:** first reload showed onboarding wizard (Postgres settings empty — expected, NOT data loss); ran `window.__irisMigrate({phases:['v3']})` (11 settings incl auth_users + 1 profile + 2 audit, 0 errors); reload restored full identity ("Scott & Claire", login, $388,534 / -$7,119). Migration `[3]` applied. Cleaned 3 dead simplefin_* keys; 12 real settings keys remain.
- **ADR-0002 promise now real:** new browser/laptop → paste connection string → log in → full experience. Connection string stays in localStorage by design (the one intentional per-browser paste). `gemini_api_key` now in user's Postgres (BYO-key model, fine).
- **Still IndexedDB by explicit deferral (Phase 2 investment side):** accounts/holdings, equity, monthlyInvestments, snapshots, chatHistory. Do NOT touch these for budget/auth work.

### Updates since D2c (all committed, working tree clean)
- **Cold-start error boundaries — DONE (`dc5c734`).** App.tsx auth effect + `AppDataContext.load()` wrapped so a paused/unreachable DB shows a recovery screen instead of wedging on "Loading Iris…". Validated no-regression in real Chrome.
- **Connector-collision decision — LOCKED (`3aa7759`).** Approach = **tag-the-source + empirical per-account high-water-mark cutoff.** Teller verified to have NO universal history cap (`start_date`/`end_date` + `from_id` backward pagination; depth is institution-dependent, discovered at connect time). The earlier "~90-day shallow" premise was WRONG — corrected.
- **Correction banked:** the DB was NOT paused this session (health 200 instant, auth 83ms). A transient ~8s "Loading Iris…" was Vite dev-server cold-compile, not a DB wake. Only one confirmed auto-pause ever (~3 weeks ago).

## ⭐⭐ NEXT SESSION = BUILD TELLER CONNECTOR (T1+T2 first). START HERE.

**Goal:** real auto-synced bank/card transactions. Scott's data is frozen at ~April 21 (last CSV import); Teller is the fix and the chosen source-of-truth going forward. Coinbase/OFX come later — Teller first because it feeds the (stale) budget spending data.

**🚨 CRITICAL GOTCHA — do NOT assume tokens exist:** Scott enrolled BoA/Citi/Cap One earlier via a *throwaway scratch launcher* (`public/teller-connect.html`, gitignored). Those access tokens were shown once, truncated, and **NEVER persisted.** They are GONE. Teller shows access tokens only once. **You must build in-app enrollment (T2) and have Scott RE-ENROLL his banks inside Iris.** Do not go looking for saved tokens — there aren't any.

**What we HAVE:** Teller Application ID `app_prt5j01vo1ij37cq5i000` (PUBLIC, fine in code — used by the Connect widget). Teller dev app named "Iris Finance" (Scott set up earlier; he should confirm it's still active after the gap).

**What's a SECRET (never in chat):** the mTLS `certificate.pem` + `private_key.pem` (on Scott's disk). Server reads them from a FILE PATH Scott provides — never paste contents. Access tokens get captured server-side by the enrollment flow and stored in the user's own Postgres.

**Build breakdown:**
- **T1** — server-side Teller client: load cert+key from a configurable path, build an `https.Agent` (mTLS), call `api.teller.io`. NEEDS the cert path from Scott.
- **T2** — in-app enrollment: embed Teller Connect in Settings ("Connect a bank"), capture access token on success, persist to a new `connectors` table (`0004_connectors.sql`: user_id, institution, enrollment_id, access_token, created_at). Only needs the public app_id — buildable + testable WITHOUT certs.
- **T3** — fetch transactions (cert + token) → map to Iris expense shape → **empirical per-account cutoff** (probe how far back each bank returns; only import newer than the account's latest CSV txn) → **tag `source: 'teller-<institution>'`** → upsert to Postgres `expenses`. NEEDS certs.
- **T4** — "Sync now" button (manual v1; daily auto-sync = the last unbuilt Phase 1 feature).

**Recommended first step:** build T1 + T2 (server client + in-app enrollment + connectors table). Scott then re-enrolls one bank in-app → token persisted → `/api/teller/accounts` returns real accounts. T3+T4 next session.

**TWO PREREQUISITES from Scott before T3:** (1) the cert file path (e.g. `C:\Users\...\teller\certificate.pem` + key) — path only, not contents; (2) confirm the Teller dev app is still active (log into teller.io).

### Other open (non-blocking)
- Test suite — STILL ZERO; highest-leverage de-risk per the swarm. Slot in after first connector.
- Lint (14 real react-hooks errors among ~91), BudgetView refactor (1,643 lines) — post-Foundation debt.
- "Show the wife" validation — now unblocked by browser-agnostic; highest-value thesis test, low code.
- WF + Morgan Stanley confirmed NOT in Teller catalog → those route to Fidelity OFX (separate connector, later).
- Minor UX: app may show last-data month (April) as "this month" rather than current (June) — worth a look when convenient.

**Repo at close:** working tree clean, type-check green, **latest commit `3aa7759`**. Everything below this line is the earlier D2b/reset narrative from the same day.

---

## Context: returned after ~3 weeks

Scott stepped away ~3 weeks (mom's open-heart surgery, job hunt, Hawaii trip). Opened by asking "is this a good project to do?" — answered honestly: commercial success vs funded competitors (Origin, Monarch) is a long shot; but as a marriage tool + learning vehicle it's genuinely worth it, and that's the real win-condition. **Decision: continue.** Win reframed — build it for the marriage + the learning; commercial is lottery-ticket upside; he doesn't want to keep paying Monarch $50/yr.

Model note: Scott switched to Opus 4.8 this session and asked for a "swarm" review.

## What shipped (3 commits on top of f0706d7)

```
847efce docs: Reset & Reconnect + Build-D2b + SimpleFIN removal closeout
5548e46 chore(connectors): remove deprecated SimpleFIN integration
1c793ef feat(foundation): complete Build-D2b — budget store reads/writes via Postgres
```

### Reset & Reconnect
- **Supabase auto-paused during the gap.** Scott restored it. **All data survived** — 22 income / 638 expenses / 45 budget-config rows intact, migrations 1+2 already applied, no drift. (The ADR-0002 keep-IndexedDB-as-fallback safety net was confirmed but turned out unneeded.)
- SimpleFIN service: Scott shut it down. Teller: not logged in (fine — connectors not built yet).

### Swarm review (4 parallel agents, before resuming)
Surfaced: split-brain storage (only budgetStore swapped), cold-start risk (paused-DB timeout + no load() error boundary), SimpleFIN still live + erroring, ZERO tests, 14 real react-hooks lint errors among ~95 mostly-cosmetic, file-size monsters (BudgetView 1643 lines), ~54 `any` casts. Committed Foundation core praised as well-built (parameterized SQL, user_id from day one, clean transactions).

### Build-D2b (commit 1c793ef) — VALIDATED IN REAL CHROME
- `src/stores/budgetStore.ts` flipped from IndexedDB → `/api/*` Postgres. Signatures unchanged; ~100 call sites untouched.
- New endpoints: collections list/save/delete, expenses/incomeSources/settings delete, incomeSources save-batch, `GET /api/export/full` (Layer 4 JSON backup).
- `main.tsx` now AWAITS `bootstrapDbConnection()` before mounting `<App/>` (fixes fire-and-forget race that wedged "Loading Iris…"). Added clean no_credential / error UI.
- **Validated in Scott's actual Chrome via Claude-in-Chrome extension** (not the preview browser — Scott insisted, and it paid off). Dashboard + full Budget view render off Postgres: Gross $26,490, Net $19,073, Monthly Spend $26,682, Unbudgeted $17,073, Cash Flow -$7,609.

### Two bugs found ONLY via real-Chrome validation (type-check + server curl both missed)
1. `recurringDetector.normalizeMerchant()` crashed on expenses with no `description` (`undefined.toLowerCase()`). Guarded — returns '' for missing input.
2. **5 garbage rows in `collections.buckets`** (`smoke-bucket-1..4` + a stray `undefined` key) from D2a smoke tests poisoned budget math → `$NaN` in Unbudgeted/CashFlow/Cycle. Deleted via the new DELETE endpoint; also cleaned leftover smoke rows from settings/income/expenses. **Counts now exact: 22 income / 638 expenses / 27 buckets.**

### SimpleFIN removed (commit 5548e46)
Deprecated per ADR-0001; dead auto-sync threw 403 Forbidden every launch. Removed `services/simplefin.ts` (524 lines), `SimpleFinPanel.tsx`, the auto-sync block in AppDataContext, `/api/simplefin` Vite proxy, the `'simplefin'` type-union member, and onboarding/settings usages. Console now clean. Type-check clean, zero residual code refs.

## THE remaining gap — split-brain storage (next decision)

Only `budgetStore` was swapped. Still on IndexedDB:
- `portfolioStore` — **user profile, PIN auth, connector creds, holdings/equity**
- `auditLogStore` — **Phase 1 audit data** (Edit Budget overlay writes here)
- `actionStore` — action items

ADR-0002's promise ("paste connection string on a new machine, you're back") is NOT yet met — on a new machine, budget data comes from Postgres but auth/audit/networth are gone. Visible proof: dashboard Net Worth ($388,534) still reads IndexedDB.

**Recommended split:** migrate `auth/userProfile` + `auditLogStore` to Postgres to truly finish Foundation. `portfolio` holdings/equity/chat are Phase 2 — leave on IndexedDB behind a flag.

## Open task list (TaskCreate IDs from this session)
- #3 PENDING: cold-start resilience — db-pool connect retry/backoff + `AppDataContext.load()` error boundary (try/catch/finally). NOTE: app connected fine after the pause this time, so this dropped from "required" to "good hygiene." The load() error boundary is still genuinely valuable.
- #5 PENDING: the split-brain decision above (D2b itself is committed; this is the remaining scope call).

## Next-session priorities
1. Read north-star, state.md, ADR-0001, ADR-0002, phase-1-DoD, cadence-log, then this handoff.
2. **Decide split-brain scope** (migrate auth+audit now, or accept budget-only). This is the last thing before Foundation = done.
3. Then: cold-start `load()` error boundary (#3), and eventually the test suite (swarm's highest-leverage de-risk — still ZERO tests).
4. Connectors (Teller/OFX/Coinbase) remain Foundation Session 4+. Before wiring: settle the connector-collision decision in post-phase-1-backlog (CSV-imported rows won't auto-dedupe with connector-fetched ones).

## Carryovers (unchanged, non-blocking)
- Teller re-login + WF/Fidelity/Morgan Stanley OFX viability tests (WF + MS confirmed NOT in Teller).
- Lint debt (~91 errors, 14 are real react-hooks), BudgetView refactor, test suite — all post-Foundation.
- Classifier hardening — runs against Postgres data when it lands.

## Repo state at close
Working tree clean. Type-check green. Pre-commit hook ran on every commit. App running on port 5173, validated in Scott's Chrome. Latest commit `847efce`.

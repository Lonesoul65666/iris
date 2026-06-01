# Post-Phase-1 Backlog

**Last updated:** 2026-05-02
**Purpose:** Captures known debt and deferrals that are out-of-scope for Phase 1 but should not be lost. Items here get pulled into a phase / session when their phase opens.

## Lint cleanup — known debt

**Status:** Tracked debt. Pre-commit hook does NOT run lint.

`npx eslint . --max-warnings=0` reports **97 errors and 4 warnings** as of 2026-05-02. The largest category is `react-hooks/set-state-in-effect` — a strict rule fighting patterns the codebase uses widely.

**Why it's deferred:**
- Type-check (the bug catcher) is in the hook and passes
- Lint enforcement on top would block all commits until 97 fixes ship
- The 97 errors aren't producing user-visible bugs today; they're best-practice/style
- Cleanup deserves a dedicated focused session, not a forced fix mid-Phase-1

**When it returns:**
A dedicated "lint cleanup" session somewhere between end-of-Phase-1 dogfood and start-of-Phase-2. Approximate scope: half-day to a day, depending on how mechanical the rule fixes are.

**Manual lint runs anytime:**
```
npm run lint
```

## BudgetView refactor — deferred from 2026-05-02 session

**Status:** Foundation work that didn't ship today.

`src/components/Budget/BudgetView.tsx` is ~1500 lines. Plan was to split it into 5+ smaller components in this session, but the session was consumed by:

1. Establishing pre-commit hook (foundation)
2. Resolving 33 pre-existing TypeScript errors (foundation cleanup)

**What the refactor should achieve:**
- Extract Edit Mode chrome wrapper (already partially done via `BudgetEditOverlay`)
- Extract daily-view sections into focused components
- Extract the drilldown modal into its own component
- Extract the priority-waterfall computation into a util
- Result: no single component file > 400 lines

**When it returns:**
Next session, after Phase 0 foundation work is verified. Roughly 1 day of focused refactoring with type-check guarding each move.

## Data-layer test suite — Phase 0 foundation

**Status:** Not started.

Per the previous session's "5 things to push us to 75% pro alignment," a small Vitest test suite for the data layer was identified as critical. Specifically:

- Pulse classification (`classify` function in `BudgetPulse.tsx`) — over / pacing / on track / untouched
- Reimbursement matcher subset-sum (`matchReimbursementInflow`)
- Pay-band detection (`VariableSurplusCard.tsx` `currentBand` logic)
- Audit log diffing (`computeBudgetDiffs` in `BudgetView.tsx`)
- Transaction categorization for ~5 common merchant patterns

**When it returns:**
Phase 0 work item, alongside or after BudgetView refactor. ~half a day for initial 10-test suite.

## Variable Pay card visibility bug — CLOSED 2026-05-03

**Status:** Closed. The original bug per memory (card not rendering on Scott's screen) was already resolved by intervening work — the income-source auto-detection now correctly classifies the base stream as `subtype: 'base'` with confirmed status. Verified during the 2026-05-03 diagnostic: card renders on Scott's real data, floor lands on his actual $7,918 base (after the band-detection fix in commit 4896476).

A separate bug surfaced during that diagnostic — pay-band detection treating a single bonus / RSU vest as a new pay band — and was fixed in the same session. See commit 4896476.

DoD #5 status: Variable Pay card is *visible and accurate* on real data. Pending: Scott confirming surplus totals reconcile against his actual paychecks.

## Coinbase API connector

**Status:** Designed, not built.

Smallest of the three connectors needed for Phase 1's "daily auto-sync" criterion. Coinbase has an official personal API. Scott has crypto on Coinbase that needs to flow into Iris.

**When it returns:**
First connector to wire after foundation work is verified. ~100 lines, no auth complexity beyond an API key.

## Teller connector — verify coverage first

**Status:** Plan locked, not yet built. Verification of bank coverage pending Scott's signup.

Required for daily auto-sync of BoA, Citi, Cap One. Free dev tier (100 enrollments, real bank data, no KYB) confirmed via Teller's docs.

**Pre-build steps Scott needs to do:**
1. Sign up at teller.io for the free dev account (~3 min)
2. In their Connect widget, search for BoA, Citi, Cap One, Fidelity, NetBenefits — confirm which appear
3. Report findings to next session

**When it returns:**
After Coinbase connector ships and verifies the connector pattern works.

## Fidelity OFX Direct Connect — verify plan support first

**Status:** Plan-dependent.

If Scott's NetBenefits 401k plan supports OFX Direct Connect, we wire OFX as a clean Fidelity connector (free, stable). If not, Fidelity falls under Teller (assuming Teller covers it) or stays manual.

**Pre-build step Scott needs to do:**
Log into NetBenefits, look under Account Information → Download for "Quicken Web Connect" or "Direct Connect" option. Report Yes/No to next session.

**When it returns:**
After Teller verification, since Fidelity routing depends on what Teller covers.

## Connector-collision decision (pre-Teller, pre-OFX, pre-Coinbase)

**Status:** Surfaced during Build-D1 (2026-05-05). Needs a decision before Foundation Session 4+ wires the first connector.

**Problem:** Build-D1 migrated 638 expenses + 22 income sources from IndexedDB (CSV-imported) to Postgres. When real connectors land, they'll fetch the same real-world transactions from a different source, with different transaction IDs and slightly different payee strings. The upsert path is keyed on `(user_id, id)`, so Teller-fetched transactions land as **new rows alongside** existing CSV rows. Budget aggregates double.

**Three candidate paths:**

- **Path A — Dedupe on import.** Connector-side fuzzy matching: `(source, date, amount, normalized_payee)` similarity tolerance. Skip or merge near-matches. Most surgical, preserves history, more code. Risk of false positives (real duplicate transactions get collapsed).
- **Path B — Reset and replay.** At first Teller connect, wipe the CSV-imported rows for that account/source and let Teller backfill. Loses CSV history but cleaner. One-time cost paid at connector wire-up.
- **Path C — Tag the source.** Keep both, mark each row with `source: 'csv-import' | 'teller-{institution}' | ...`. Downstream code (budget aggregator, Pulse classifier) filters as needed. Costs schema work + every read site has to be source-aware.

**Decision belongs in:** A new ADR or addendum to ADR-0001 right before connector code starts. Don't sleepwalk into it.

**Note on classifier-staleness:** Separate from this question. Some migrated rows have known mis-classifications (Cap One CC payment as 'base', dispute credits as income, etc. — see 2026-05-03 diagnostic). That's a classifier-hardening pass, not a connector decision. Will run against whatever data is in Postgres at the time.

## Existing IndexedDB settings migration — SUPERSEDED by ADR-0002

**Status:** Superseded 2026-05-04. Folded into the broader IndexedDB → Postgres migration script that's part of Phase 1 Foundation. The settings JSON-encoding edge case still applies; it's handled inside the migration script's idempotent read step.

## Phase 1 Foundation — storage migration to user-owned cloud DB (NEW per ADR-0002)

**Status:** ✅ **COMPLETE (2026-05-10).** All of Build-B → D2c shipped and validated in real Chrome; cold-start error boundaries added. App is browser/laptop-agnostic. Only the connector layer (Teller/OFX/Coinbase) remains, and that's gated on the connector-collision decision below.

**Scope:**
- Vite middleware API at `/api/*` (same port as dev server, no CORS, no second port)
- Postgres schema with versioned migration runner
- Every relevant table includes `user_id` column from day one (partner-mode prep)
- Connection string stored in `localStorage` on the client (never in source, never in DB)
- IndexedDB → Postgres migration script — idempotent, verifiable, reversible (IndexedDB stays read-only intact for one session as fallback)
- Multi-layer backup v1: cloud DB (primary) + provider auto-backups (managed) + JSON export button in Settings (Layer 4)
- Onboarding flow for connection-string paste (manual in v1; OAuth wizard is v2+ per below)

**Sequencing within Foundation:**
1. **Build-B (DONE 2026-05-04, `6bb9843`):** Vite middleware API + `pg.Pool` + `/api/connect` + `/api/health`.
2. **Build-C (DONE 2026-05-05, `5e00bd3`):** schema runner; `0001_init.sql` (users, settings, income_sources, expenses); typed endpoints.
3. **Build-D1 (DONE 2026-05-05, `726f323`):** IndexedDB→Postgres migration of income_sources + expenses (22 + 638 rows).
4. **Build-D2a (DONE 2026-05-05, `cac6201`):** `0002_budget_config.sql` generic `collections` table; migration of the 8 budget-config stores (45 rows).
5. **Build-D2b (DONE 2026-05-10, `1c793ef`):** budget store reads/writes via Postgres; DELETE + export endpoints; boot race fixed; validated in real Chrome (2 bugs fixed).
6. **Build-D2c (DONE 2026-05-10, `0e6160c`):** settings + auth/PINs + userProfile + audit log → Postgres; migration v3. Validated in real Chrome through the auth path. App now browser/laptop-agnostic. See below.
7. **Cold-start error boundaries (DONE 2026-05-10, `dc5c734`):** App.tsx auth effect + AppDataContext.load() wrapped so a paused/unreachable DB shows a recovery screen instead of wedging on "Loading Iris…".

### Build-D2c — settings + userProfile + audit log → Postgres (the browser-agnostic finish)

**Why:** After D2b, the *budget engine* runs on Postgres, but auth/identity/audit still live in IndexedDB. Critically, **login PINs (`auth_users`) live in `iris-portfolio.settings` (IndexedDB)** via `portfolioStore.getSetting/saveSetting` — so on a new laptop, "paste connection string" recovers budget data but you **can't log in**. D2c closes that. Decided 2026-05-10.

**The split-brain mapped:**
- `iris-portfolio.settings` (IndexedDB) holds: `auth_users` (PINs), `enabled_modules`, `onboarding_complete`, visit timestamps, `nudge_dismiss::*`, market annotations. ← MOVE
- `iris-portfolio.userProfile` (IndexedDB) holds identity. ← MOVE
- `auditLogStore` (IndexedDB) holds budget-edit + account audit entries — a Phase 1 budget feature. ← MOVE
- `iris-portfolio`: accounts/holdings, equity, monthlyInvestments, snapshots, chatHistory. ← **DEFER to Phase 2/3** (investment side; doesn't touch budget or auth).

**Scope:**
1. **Settings layer rewire** — reimplement `portfolioStore.getSetting/saveSetting` (+ `listNudgeDismisses`, `deleteNudgeDismiss`, `clearAllNudgeDismisses`, market report/annotations helpers) to call the existing `/api/settings/*` endpoints. No double JSON-encode — Postgres stores jsonb natively. This is the keystone: one rewire makes auth/PIN + modules + onboarding + nudges browser-independent. (Postgres `settings` table + endpoints already exist from Build-C.)
2. **userProfile** — `getUserProfile/saveUserProfile/clearUserProfile` use settings key `user_profile` (single JSON blob). Keeps the Postgres `users` table (identity/user_id) separate from the app profile object.
3. **Audit log** — `0003_audit_log.sql`: `audit_log(user_id, id pk, ts timestamptz, data jsonb)`. Endpoints `GET /api/audit/list` + `POST /api/audit/append`. Rewire `auditLogStore.ts` to fetch.
4. **Migration v3** — extend `migrate-indexeddb-to-postgres.ts` with a v3 phase + `migration_v3_complete` flag: IndexedDB settings → `/api/settings/save` (incl `auth_users`), userProfile → settings `user_profile`, audit entries → `/api/audit/append`. Idempotent. IndexedDB stays intact as fallback.
5. **Validate in real Chrome — especially login/PIN.** Don't lock Scott out: keep IndexedDB fallback, validate before committing.

**Intentional non-goal:** the connection string itself stays in `localStorage` (per ADR-0002). "Browser-independent" = your *data* travels; you still paste the string once per browser. That one paste is by design, not a gap.

**After D2c:** ✅ Foundation functionally done — new laptop → paste connection string → log in → full budget experience (validated in real Chrome 2026-05-10). Plus cold-start error boundaries (`dc5c734`). Next is connectors (Teller/OFX/Coinbase) for real auto-synced numbers — gated on the connector-collision decision below.

**Status:** ✅ DONE 2026-05-10.

### Connector-collision decision (RESOLVE before any Teller/OFX/Coinbase code)

**Status:** Open — recommended approach proposed 2026-05-10, awaiting Scott's confirmation.

**Problem:** 638 CSV-imported expenses are in Postgres. When a connector (Teller first) starts fetching, the same real-world transaction can land twice (different IDs) → budget totals double.

**Recommended approach (proposed): tag-the-source + high-water-mark cutoff.**
- Teller's history is shallow (~90 days); the CSV data is deeper. That **rules out reset-and-replay** (would lose older history Teller can't replace).
- **Tag every expense with `source`** (`csv-import`, `teller-<institution>`, `coinbase`, …) — provenance needed regardless.
- **On first connector sync for an account, only import transactions newer than the latest CSV transaction for that account** (high-water mark). No overlap window → no dupes, no data loss. CSV = historical record; connector = live going-forward.
- Small fallback dedupe (date + amount + normalized payee) at the boundary date for the one-day seam.
- Pure fuzzy-dedupe (Path A) rejected as primary: false-positives on legit same-day/same-amount transactions.

**Once confirmed:** this becomes the spec the connector work (Foundation Session 4+) builds against.

## Phase 1.1 follow-ups (after Foundation + Features verified)

- **Local SQLite cache layer for offline mode.** Read-through cache; queued writes when online. Restores Iris's pre-cloud behavior of "always works even without internet."
- **Application-level encryption of descriptive fields.** Memos, payee names, custom labels encrypted with a user-set passphrase before sending to Postgres. Numbers, dates, categories stay queryable. Neutralizes the "provider staff can read your data" concern.
- **Scheduled JSON export (Layer 5).** Auto-write a snapshot to a user-chosen folder weekly/monthly so archives accumulate without effort.

## Post-Phase-1 onboarding wizard (v2+)

**Status:** Logged 2026-05-04. Manual paste-the-connection-string is fine for "just us" during Phase 1 dogfood. For real users it's friction we'll need to remove.

**Candidate paths:**
- **OAuth-provisioning via Supabase API:** user signs into Supabase via OAuth; Iris auto-creates the project and configures the schema; user never sees a connection string. Likely the right v2 answer.
- **Guided in-app browser flow:** Iris opens browser tabs at the right places, walks the user through clicks, captures the connection string at the end. Lower-tech bridge.
- **Bundled local-only mode:** for users who don't want cloud, accept single-machine constraint. Reuse Foundation work but point at local SQLite instead of remote Postgres. Dual-mode storage adapter.

**When it returns:** v2.0 cycle, after Phase 1 ships and dogfood validates the architecture.

## Co-op mechanics ideas (Phase 2 Path B candidates)

**Status:** Riff-captured 2026-05-02 evening session. None designed; none committed. North-star now treats Phase 2 as an open Path A (Investments) vs Path B (Co-op Mechanics) decision.

Ideas worth not losing:

- **Evolution / leveling arc.** Progress feels like the user / couple is becoming something better — not just tracking numbers. Level-ups tied to real behavior milestones (e.g. "you crossed your variable-pay floor sweep target three months in a row").
- **Joint collection model.** Inspired by Scott's Pokémon-card-collecting with his son: a shared "good cards" book of joint achievements both partners contributed to, plus duplicates / leftovers each partner can do whatever they want with individually. Shared progression + individual agency.
- **D&D-style dice-roll for ties.** When partners disagree on a non-destructive decision, the app offers a "let the machine decide" option as a fun fallback. Like "blame the budget" but for tie-breaking. Only for decisions that don't actually matter long-term.
- **Dopamine of next-catch.** The actual hook that makes you want to open the app again tomorrow. Whatever it ends up being — streak, surprise win celebration, scheduled reveal — needs to be designed alongside the rest of Path B, not bolted on.
- **Scheduled co-op moments.** Pokémon-Go-weekly-raids equivalent. A weekly or bi-weekly ritual where both partners come together and do something — review, decide, plan, celebrate — that the app structures as a fun activity, not a meeting.

**When this returns:** When ADR-0002 opens after Phase 1 ships, both Path A and Path B candidates need design work before sequencing. These ideas seed Path B's mechanics design.

## Phase 2 sequencing decision (open)

**Status:** Open — to be decided via ADR-0002 after Phase 1 DoD is achieved.

The original plan was Phase 1 (Budget) → Phase 2 (Investments) → Phase 3 (Intelligence). The 2026-05-02 mission widening introduced the Co-op Mechanics layer as a real candidate to slot before Investments. The decision affects v1.0 release composition and the early-user experience materially.

**Path A — Investments first:** ships a more "complete" personal-finance tool earlier; co-op layer waits.

**Path B — Co-op mechanics first:** ships the engagement hook earlier and tests the couples-fun thesis sooner with real users; investments wait.

**Inputs needed before deciding:**
- Real-use data from Phase 1 (does Scott + wife actually want investment tracking sooner, or do they want the engagement hook sooner?)
- Mechanics design sketches for Path B (without these, Path A wins by default)
- Market signal (any movement from Honeydue / Zeta / Monarch toward the co-op-fun lane)

## Income-source auto-classifier hardening (Phase 1 — needed before DoD #6)

**Status:** Surfaced 2026-05-03 by real-data diagnostic against Scott's IndexedDB. Documented for next session's fix.

**Symptom:** Work Reimbursements card on real data showed YTD reimbursed $38,617 against $8,131 spent — wildly out of balance. Diagnostic via DevTools console snippet revealed multiple mis-classifications.

**Root cause for the YTD-reimbursed inflation:** the "Abnormal Sec-osv" payer produces both base paychecks and variable-comp paychecks. The auto-classifier created a second IncomeSource for the variable stream and mis-tagged it `subtype: 'reimbursement'`. The Work Reimbursements card sums every paycheck linked to any `subtype='reimbursement'` source (status !== 'dismissed'), so the variable comp got counted as work-expense reimbursement. Scott reclassified the source manually 2026-05-03; structural fix is still needed.

**Other classifier oddities observed in the same data:**
- `inc-capital-one-mobile-base` — Cap One credit-card payment classified as base income (it's an outflow disguised as inflow because the CC payment lands on the destination account)
- `inc-citibank-conditional-credit-*` — dispute resolution credits classified as base/sale (they're chargebacks, not income)
- `inc-julep-base` — restaurant refunds classified as base (5 occurrences same day, $16-$18 — clearly a refund pattern)
- `inc-zelle-payment-from-base` / `inc-zelle-payment-from-variable` — intra-family Zelle transfers (presumably from his wife / household members) classified as base/variable income
- `inc-american0012301...` — multiple AA flight credits / refunds classified as `sale` income with TRN/ACT GUIDs in the IDs
- Generally: any inflow gets considered for income classification, even when it's structurally an expense reversal or a transfer

**Two structural fixes needed:**

1. **Multi-stream payer disambiguation.** When a single payer (e.g. "Abnormal Sec-osv") generates multiple inflow streams with different shapes, the high-variance / large-amount stream should default to `subtype: 'variable'`, not `'reimbursement'`. Reimbursements are typically smaller and more irregular than commission/bonus payments. Heuristic: if the per-stream coefficient of variation is high (e.g. >0.5) AND the average is comparable to or larger than the base stream's average, lean variable.

2. **Income detection filtering.** Stop creating IncomeSource records at all for transactions matching these patterns:
   - Credit card payments (`CAPITAL ONE MOBILE PYMT`, `BANK OF AMERICA PYMT`, etc.)
   - Dispute credits (`CONDITIONAL CREDIT FOR DISPUTE`, `CHARGEBACK`)
   - Merchant refunds where the payer matches a known merchant the user has spent at recently (matching descriptor / merchant ID)
   - Intra-family transfers (Zelle / Venmo from a contact also configured as a household member)
   - Card rebates / cashback (`PEACOCK MASTERCARD OFFER`, `PREFERRED REWARDS-ATM OPER REBATE`)

**When this returns:** Phase 1 — required to satisfy DoD #6 ("Work Expense card reconciles against Coupa within $50 over 90d") on real data without manual reclassification every session. The manual fix Scott did 2026-05-03 doesn't generalize and won't survive a re-detection sweep.

**Next-session test data:** Scott's IndexedDB still has all the noisy classifications — easy real-world fixture for verifying the structural fix lands correctly. Don't wipe.

## Scott-creep / vocabulary audit (Phase 1 — partner-mode prep)

**Status:** Surfaced 2026-05-03 by Scott noticing "HYSA" jargon in the Variable Pay card sweep destinations. Logged for next session.

**Context:** The 2026-05-02 mission widening expanded the target audience to include partners with different financial literacy levels (couples-first), single parents, teachers, CPAs, etc. Anywhere the UI uses Scott-vocabulary instead of plain language, a non-financially-literate partner using partner-mode (or any non-finance-savvy user) is going to bounce. This is a "presentation layers the truth" principle violation (north-star Tone #1).

**Pass needs to cover at least:**

1. **Sweep destination labels** in `src/components/Budget/VariableSurplusCard.tsx:14-20`:
   - `HYSA → Savings` (HYSA = high-yield-savings-account, jargon)
   - `Extra Mortgage Payment → Pay down debt` (generalizes — not all users have a mortgage)
   - `Stash → ?` (verify whether "Stash" is intentional brand language or a leaked variable name; if leaked, "Goal" or "Savings goal" is plainer)
   - `Investing → Invest` (verb form, more direct)
   - `Manual / decide later → Decide later` (drop the "Manual" prefix)

2. **Other Iris surfaces likely to have similar leaks** — needs a real pass:
   - "Variable surplus" / "above base" framing on the Variable Pay card itself (CFO-grade vocabulary)
   - "Sinking fund" terminology (Goodbudget-era — plain version is "Goal" or "Savings for [thing]")
   - "Reimbursement matching" / "reimbursable" language on Work Expenses card
   - Income source subtype names exposed in any UI: `base / variable / reimbursement / dividend / sale`
   - Action item / nudge copy in general
   - Chart labels, tooltip text, term-labels across the budget views

3. **Deeper question Scott raised but didn't decide:** instead of fixed destination buckets (HYSA / mortgage / stash / investing), should the choices be the user's own actual connected accounts ("Ally Savings," "Schwab Brokerage," "Joint Emergency Fund")? That's a UX shift, not a label rename. Worth deciding before the rename so we're not renaming labels we're about to remove.

**When it returns:**
Phase 1 work — pairs naturally with the income-source auto-classifier hardening session (both are "stop making the app speak Scott's language" passes). Likely a half-day session: audit pass first, then label changes, then evaluate whether the destination-bucket UX needs the deeper rethink.

**Drift signal for future sessions:** any new copy that gets added during a feature commit should be eyeballed against this principle. If a non-financially-literate partner can't understand it at a glance, push back.

## Lessons learned to encode

After Phase 1 ships, write a `docs/lessons-learned.md` capturing:

- The pre-commit-hook discovery surfacing 33 hidden TS errors (proof that `tsc --noEmit` without `-b` was misleading us)
- The "spec-first, build-second" discipline that produced this backlog file
- What the working agreement actually felt like in practice during Phase 1
- Anti-patterns identified (1500-line files, six-features-in-one-session, dismissing/confirming UX confusion, oversold aggregator coverage)

This becomes a reference for Phase 2 and Phase 3 — and for anyone else who eventually contributes to Iris.

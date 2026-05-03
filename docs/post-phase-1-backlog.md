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

## Variable Pay card visibility bug — open

**Status:** Reported by Scott on 2026-04-29; not yet diagnosed.

Card was built but Scott couldn't see it on his screen. Likely cause: his "Abnormal Sec-osv" base source isn't classified as `subtype: 'base'`, OR `effectiveFloor` computes ≤ 0, OR browser cache. The render gates on these conditions.

**When it returns:**
Phase 1 work — required to satisfy DoD criterion 5. Diagnose by either DOM inspection on Scott's machine or by walking through the IncomeSources panel together.

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

## Existing IndexedDB settings migration

**Status:** Risk mitigation needed for the new generic `getSetting`/`saveSetting`.

The settings storage now JSON-encodes on write. Reads attempt JSON.parse first, fall back to raw string for legacy data. **Edge case:** legacy raw string values that happen to look like valid JSON (e.g. `"42"`) will parse to non-string types at runtime, which could surprise callers using the default `getSetting<string>`.

For Scott's personal use (single user, can wipe IndexedDB if anything goes sideways), risk is low. But before shipping to multiple users, a write-time migration that re-encodes legacy entries is worth doing.

**When it returns:**
Pre-distribution prep, beyond Phase 3.

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

## Lessons learned to encode

After Phase 1 ships, write a `docs/lessons-learned.md` capturing:

- The pre-commit-hook discovery surfacing 33 hidden TS errors (proof that `tsc --noEmit` without `-b` was misleading us)
- The "spec-first, build-second" discipline that produced this backlog file
- What the working agreement actually felt like in practice during Phase 1
- Anti-patterns identified (1500-line files, six-features-in-one-session, dismissing/confirming UX confusion, oversold aggregator coverage)

This becomes a reference for Phase 2 and Phase 3 — and for anyone else who eventually contributes to Iris.

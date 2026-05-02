# Phase 1 — Definition of Done

**Status:** Active
**Last updated:** 2026-05-02
**Reference:** `docs/adr/0001-phase-1-scope.md`

## Purpose

This document is the single binary criterion for "Phase 1 is complete." Each criterion below must be true. If any are false, Phase 1 is not done — regardless of how much work has shipped or how good it feels.

A criterion that's "almost true" is **false.**

Verification happens in Scott's real use, not in Claude's claims. "I think it works" is not verification. "I used it for 30 days and it didn't break my weekly review" is verification.

## The eight criteria

### 1. Data freshness

When Scott opens Iris on any morning, every transaction from BoA, Citi, Cap One, Fidelity, and Coinbase has either auto-synced or is one-click importable. No transaction older than 3 business days is missing without a clear reason (e.g., "BoA hasn't posted yet").

### 2. Merchant memory works end-to-end

When Scott categorizes a new merchant once, every future transaction from that merchant auto-categorizes correctly without him touching it. The merchant cache survives reloads, syncs, and re-imports.

### 3. Pulse is correct and useful

The Pulse view shows month-to-date spend per bucket with pace-aware status (over / pacing / on track / untouched). Classification is correct against Scott's actual real data (not just sample data). At a glance, Scott can tell whether he's doing OK this month — and the answer matches reality.

### 4. Edit Budget is reliable

Scott can hit Edit Budget, change any number across Monthly Budget / Stashes / Fun Money, save, and see the change reflected in Pulse on the next render. Cancel restores the snapshot exactly. The audit log captures what changed with old → new values.

### 5. Variable Pay card works for Scott specifically

The Variable Pay card shows his current pay band's floor (correctly identifying the post-Feb-2026 pay change), the surplus above floor for this month / 90d / YTD, and lets him set a sweep destination preference. The numbers reconcile against his actual paychecks within a few dollars.

### 6. Work Expense card shows three windows of totals only

This month / last 90d / YTD, with spent vs reimbursed vs net per window. **No per-line UI. No mark-paid clutter.** Numbers reconcile against Coupa output within $50 over a 90-day window.

### 7. Thirty-day live use without scope additions

Scott has used Iris as his primary personal-finance tool for 30 consecutive days. During those 30 days, no new features were added — bug fixes only. He trusts the numbers enough that he does NOT open his bank apps for routine checks.

### 8. No regressions blocking daily use

At the end of those 30 days, no bug exists that prevents Scott from completing a routine weekly review. Cosmetic bugs and edge cases are acceptable; data-loss or trust-breaking bugs are not.

## What this DoD does NOT include

- Investment tracking (Phase 2)
- AI insights (Phase 3)
- Tax-aware decisions (Phase 3)
- Polished onboarding for outside users (Iris is single-user-Scott in Phase 1)
- Marketing site, distribution, license-key check, auto-updater
- Mobile / phone companion
- Any of the deferred features in `docs/adr/0001-phase-1-scope.md`

## Verification process

1. Each criterion is checked against Scott's lived experience, not against my claims about the code.
2. Any "yes" Claude gives without Scott confirming has zero weight.
3. The 30-day clock (criterion 7) only starts when criteria 1–6 are independently confirmed working. Counting days while bugs are still landing doesn't count.
4. At the end of the 30 days, Scott explicitly declares Phase 1 done, in writing, by closing this DoD as "Achieved" and dating it.

## Claude's role in defending the DoD

At the start of every session, Claude opens by reading this file and `docs/adr/0001-phase-1-scope.md`. Any work proposed in the session that isn't on the IN list of the ADR or doesn't move a criterion above closer to true gets pushed back on.

When in doubt: the DoD wins.

## When this is achieved

Phase 1 is declared done. ADR-0002 opens, defining Phase 2 scope. This DoD is closed and archived.

Until then: the DoD holds.

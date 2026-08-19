---
name: Iris session handoff (2026-05-03 — first Phase 1 ships + classifier diagnosis)
description: Two code commits shipped — sidebar trim to Phase 1 visible views via PHASE_1_LOCK, and Variable Pay band-detection algorithm hardened with a 3-paycheck minimum-band-size guard. Verified on Scott's real data ($7,918 base correctly detected). Real-data diagnostic also surfaced an income-source auto-classifier bug — Scott's variable comp was tagged as reimbursement, inflating Work Reimbursement totals. Scott reclassified manually; structural fix logged in backlog for next session.
type: project
originSessionId: 2026-05-03-first-phase-1-ships
---

## What this session was about

First real shipping moments after the foundation work. Two small bounded changes landed and verified, plus a real-data diagnostic surfaced the next problem cleanly.

## What shipped (committed)

```
53e8a97 docs: log 2026-05-03 ships and classifier hardening backlog
4896476 fix(variable-pay): require 3+ paychecks before declaring a pay-band change
80af74f feat(phase-1): trim sidebar to budget engine only via PHASE_1_LOCK
```

### Sidebar trim (80af74f)
- Phase 1 sidebar now matches ADR-0001: visible Dashboard / Budget / Settings; hidden Investments / Health Check / Equity / Watchlist / Intelligence / Ask Iris / First Report.
- Implementation: `PHASE_1_LOCK = true` constant in `src/hooks/useEnabledModules.ts`. When true, the hook ignores stored module preferences and forces budget-only. Stored preferences are not touched — flip the constant to false in ADR-0002 to re-enable.
- Also: Ask Iris FAB hidden when chat is not in allowed views; sidebar header click goes to dashboard (not chat) when chat hidden; mobile bottom nav filters by allowed and falls back to settings; first-report auto-route gated on `modules.investments` so Phase 1 users with a portfolio aren't auto-routed into a hidden view.
- Verified in preview: snapshot showed exactly Dashboard / Budget / Settings in sidebar; FAB hidden; no console errors.
- Verified by Scott on his real instance: confirmed Dashboard / Budget / Settings only.

### Variable Pay band-detection fix (4896476)
- `src/components/Budget/VariableSurplusCard.tsx` band-detection algorithm previously walked backward looking for a >6% paycheck-amount jump and treated the first one found as a band boundary — even if the new band held only 1-2 paychecks. A single bonus / RSU vest / commission spike would falsely declare "pay change detected" and pin the floor to that outlier.
- Fix: `MIN_BAND_SIZE = 3`. When a >6% jump is detected, only treat it as a band boundary if the proposed new band contains at least 3 paychecks. Otherwise keep walking backward. Tradeoff: a true pay change requires 3 paychecks at the new rate before the algorithm picks it up (~6 weeks at semi-monthly). User can override the floor manually via the existing edit UI in the meantime.
- Verified in preview against sample data: floor was $10,700 from 1 paycheck (wrong); after fix $4,200 from 4 paychecks (correct).
- Verified on Scott's real data: floor lands on his actual $7,918 base, detected from 3 paychecks since 2026-03-13.

### State + backlog updates (53e8a97)
- `docs/state.md` Recent-shifts log gains the 2026-05-03 entry (enhancement, not drift).
- `docs/state.md` open-items list updated: DoD #5 verification (Variable Pay) and DoD #6 verification (Work Expense reconcile against Coupa) replace the old "Variable Pay visibility bug" line. New item added for income-source classifier hardening.
- `docs/post-phase-1-backlog.md` gains a full "Income-source auto-classifier hardening" section (see below).

## What did NOT change (still locked)

- Phase 1 scope (ADR-0001) — six features unchanged.
- DoD criteria — eight binary criteria unchanged. Now have a clearer picture of #5 (passing) and #6 (failing pending classifier fix).
- Mission, target user, tone principles, working principles — unchanged.
- 1,643-line BudgetView.tsx — still the deferred refactor.
- Connectors — Coinbase / Teller / Fidelity OFX still pending.
- Lint debt (97 errors) — still deferred.

## Real-data diagnostic finding (the big discovery)

After shipping the band-detection fix and seeing it produced $7,918 correctly on Scott's data, the Work Reimbursements card still showed nonsense — YTD reimbursed $38,617 against $8,131 spent. ~$30K excess.

Diagnosed via DevTools console snippet (Scott pasted, returned 22 IncomeSource records). Smoking gun:

```
inc-abnormal-sec-osv-variable
  subtype: "reimbursement"   ← WRONG
  status: "confirmed"
  avgAmount: 3940.85, range $932-$8,000
  cadence: biweekly
  count: 3
```

Scott's variable comp from Abnormal Security (commission / RSU / bonus) was auto-classified as `subtype: 'reimbursement'` instead of `'variable'`. The Work Reimbursements card sums every paycheck linked to any `subtype='reimbursement'` source, so variable comp got double-counted as work-expense reimbursement.

Scott reclassified the source manually. **Verification confirmed at session end (2026-05-03):**

| | Before reclassification | After reclassification |
|---|---|---|
| YTD spent | $8,131 | $8,131 |
| YTD reimbursed | $38,617 | $3,040 |
| YTD net | -$30,486 ahead | +$5,091 pending |
| Last 90d net | -$19,678 ahead | +$5,091 pending |

The +$5,091 pending matches the realistic shape of "submitted but not yet reimbursed" — DoD #6 is now in the realm of passing pending Scott reconciling against Coupa's view of outstanding submissions.

**Same classifier bug surfaced on a second UI today:** the "Variable surplus: $2,360 ready to sweep" nudge on the Budget tab was sourced from Lillah Claire's intra-family Zelle payments (classified as `variable`). If Scott had acted on that nudge he'd have wrongly moved $2,360 to HYSA. Single root cause (over-eager income classifier), multiple downstream impact surfaces. Reinforces the backlog priority.

The diagnostic also surfaced a broader pattern of inflow mis-classification in his real data:
- Cap One credit-card payment → tagged as `base`
- Citibank dispute resolution credits → tagged as `base`/`sale`
- Restaurant refunds (Julep) → tagged as `base`
- Intra-family Zelle transfers → tagged as `base`/`variable`
- AA flight credits / refunds → tagged as `sale`
- Card rebates / cashback (Peacock Mastercard, BoA Preferred Rewards) → tagged as `sale`

These are all noise the auto-classifier should reject. Logged as Phase 1 work in `docs/post-phase-1-backlog.md` under "Income-source auto-classifier hardening" — required before DoD #6 can pass on real data without manual cleanup.

## Constraint to remember (important for next session)

The `mcp__Claude_Preview__*` tools run their own headless browser with its own IndexedDB. **Tomorrow-Claude cannot directly query Scott's real IndexedDB.** Diagnostic flow is: write a read-only DevTools snippet, ask Scott to paste it into his real Chrome, copy the JSON output back. That's how the income-source diagnosis worked tonight.

## Partnership notes

- The "what Claude needs from Scott" principle (real-use feedback over screenshots) was load-bearing tonight. Scott confirmed visually that Variable Pay = $7,918 on his real data. Without that we'd have shipped a fix without knowing it worked.
- Sarcastic accountability worked — Scott shared real numbers, didn't sandbag.
- Two ships in one session is technically more than the "one feature per session" rule — but the second was a bugfix to an existing feature triggered by the first ship's verification, not a new feature. Within the spirit of the rule.
- Auto mode behaved well. No sprawl. Each ship was scope-clean and verified before commit.

## Next-session priorities (in order)

1. **Open by reading `docs/north-star.md`, `docs/state.md`, `docs/adr/0001-phase-1-scope.md`, `docs/phase-1-definition-of-done.md`, `docs/post-phase-1-backlog.md`.** State.md is the fastest "where are we" loader.
2. **Verify with Scott** that his manual reclassification produced sane Work Reimbursement totals. If yes, DoD #6 is closer to passing. If totals are still off, dig further — there may be more mis-classified sources or `transactionType: 'reimbursement'` set on individual expense records.
3. **Income-source auto-classifier hardening** (Phase 1 work, per backlog). Two parts: multi-stream payer disambiguation (variable vs reimbursement), and income-detection filtering (drop CC payments, dispute credits, refunds, intra-family transfers).
4. **THEN BudgetView refactor** — the long-deferred foundation item.
5. **THEN Vitest data-layer tests** — also deferred foundation.
6. **THEN connectors** — Coinbase first, then Teller after Scott verifies coverage, then Fidelity OFX after NetBenefits check.

## Discipline reminders

- Auto mode does NOT override scope discipline.
- One feature per session unless it's a small bounded follow-up (like tonight's bugfix-after-ship).
- Don't bypass the pre-commit hook.
- Verify before declaring done; "I built X" without Scott's lived confirmation has zero weight.
- Real-use feedback > preview-tool verification when they conflict (the preview server has separate data from Scott's real instance).

## Commit history at session end

```
53e8a97 docs: log 2026-05-03 ships and classifier hardening backlog
4896476 fix(variable-pay): require 3+ paychecks before declaring a pay-band change
80af74f feat(phase-1): trim sidebar to budget engine only via PHASE_1_LOCK
a202e03 docs(north-star): add state.md to reading order
41e04b6 docs: add state.md as the rolling current-state + drift-watch + evaluation snapshot
32c914f docs(north-star): widen mission to couples-first; lock tone principles and engineering style
0765cce chore: initial commit — Iris pre-Phase-1 baseline
```

Seven commits. Working tree clean. Type-check green.

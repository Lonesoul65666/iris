---
name: Iris budget architecture (locked 2026-04-24)
description: The 8 architectural decisions for Iris's budget engine, settled after extensive brainstorm + competitive audit against Monarch/YNAB/Copilot/Rocket Money/Empower/Simplifi/Tiller. Iris is ahead of the field on 7 of 8 — these are the decisions to defend.
type: project
originSessionId: ab3880cf-d0b1-4774-9ee9-5fdbbd57f650
---
**Context:** Brainstormed 2026-04-24 across many turns. User pushed back on premature implementation (twice). Locked only after web research confirmed parity-or-better against the competitive landscape.

## Big mental-model shift (the thing that simplified everything)

**Budget engine runs on bank-statement reality (net-up), not on gross-salary spreadsheet (gross-down).** The existing `PaycheckBreakdown` (gross/tax/401k/HSA/net) becomes a **secondary, optional, educational sidebar** — NOT the primary engine. Pre-tax stuff is invisible to bank imports anyway, and the investment side of Iris already tracks 401k contributions. The Budget tab does NOT need to re-derive any of that. This collapses the schema dramatically.

## The 8 locked decisions

### 1. Baseline period: 3/6/12 month tiers, opportunistic upward
- Pull whatever source allows, capped at 12 months. Never *require* a year.
- 3 months = ready to operate (biweekly/monthly cadences confident)
- 6 months = well-calibrated (quarterly stuff online)
- 12 months = stable (annual bonuses, tax refunds, seasonal patterns)
- Jan-1 anchor is a **display** concern, not detection. Detection uses what's available; display offers YTD/last-90/last-12 views.
- **Manual classification is bounded** — system only asks about *ambiguous* inflows. Even with 12mo pulled, user typically resolves 5–15 items, not hundreds.
- **Iris ahead of field** — competitors silently work with whatever the bank gave them.

### 2. Multi-source income: split internally, simplified toggle for UI
- Always split internally by source (paycheck base / variable / bonus / dividends / side / reimbursement).
- Headline UI shows total; breakdown sits beneath (stock-app pattern: total at top, breakdown below).
- Simplified-view toggle collapses to one number for users who want it.
- Source-type aware (bank vs. brokerage vs. credit card vs. cash app vs. crypto — different inflow meanings).
- **Iris parity with Monarch, ahead of Copilot/YNAB.** Copilot famously doesn't categorize income at all.

### 3. Cold-start manual seed: 5 questions per earner
- For brand-new users with no bank history yet:
  1. Working? Y/N
  2. Pay shape? salary / salary+bonus / salary+commission / hourly / 1099 / mix
  3. Typical take-home per check?
  4. Submit work expenses for reimbursement? Y/N
  5. Side income? (free-form, optional)
- Once SimpleFIN/imports flow, **detected values replace seeded values**. Manual seed is a placeholder.
- Repeat per earner. Multi-earner = multi-source — no special "earner" abstraction in the schema.
- **Iris ahead of field** — closest analog is YNAB's manual-first, but they don't profile the earner.

### 4. Reimbursement loop: standalone auto-match, bundled flag-and-ask, mixed-card split
- Outflow tagged `isWorkExpense: true` + `reimbursementStatus: 'submitted'` (existing fields).
- Inflow from matching employer → scan trailing 30–60 days of `submitted` expenses.
- Match within ±2% or ±$5 → auto-mark expenses `reimbursed`, surface "✓ $X matched to N expenses."
- Bundled-into-paycheck case → flag for user, never auto-split. False positives erode trust.
- Mixed credit card (Costco = personal + work) → transaction-split UI (future tweak: not core for v1).
- **Iris ahead — meaningfully.** This is an unsolved gap across Monarch/Copilot/Rocket. Forum threads consistently surface this as user pain. Worth marketing as a flagship differentiator.

### 5. Inflow disambiguation prompt: ask only when uncertain
- Detected paychecks don't ask. Ambiguous one-offs ($150 from Venmo) do.
- One-tap card: Gift / Side income / Reimbursement / Sale of stuff / Snooze.
- Snooze is the safety valve against prompt fatigue.
- **Iris ahead of field.** Competitors silently bucket and let user fix later.

### 6. Anti-duplication guardrail
- When account is auto-syncing via SimpleFIN, warn before manual transaction entry.
- "This account is auto-syncing. Add manually anyway?"
- **Iris ahead of field** — competitors handle reactively (cleanup tools), not preventively.

### 7. Per-category budgeting primary, opt-in group-level flex
- **Default:** budget at category level. Groceries, Dining, etc. each have their own line.
- **Opt-in (Copilot pattern):** users can mark a group as "flex" — set one budget for "Food: $1,100" and let it flow between Groceries + Dining.
- Group views always available as read-only context, but enforcement defaults to per-category.
- **Iris parity with Monarch/YNAB on default; matched Copilot's flex-group as an opt-in power feature.**

### 8. Notification tiers: Critical / Helpful / Nice-to-know
- **Critical** (always on, can't fully disable): bill won't clear, paycheck missing, fraud, suspicious charge
- **Helpful** (on by default): pace warnings (80/90%), reimbursement matches, surplus available, missed expected deposit
- **Nice-to-know** (opt-in): weekly summary, monthly trends, goal-pace check-ins
- **The acid test:** "What action does the user take when this fires?" If "nothing" → noise. If a clear decision/deadline → useful.
- Frequency rules: critical real-time; pace once-per-threshold; goals monthly; summaries user-chosen.
- **Iris ahead of field.** Competitors ship flat toggle lists; the explicit tier framework is cleaner.

## What survives from existing Iris code

| Existing | Status |
|---|---|
| `recurringDetector.ts` (cadence + variance scoring) | Reusable for income detection (same math, different dataset) |
| `RecurringBills` UI component pattern | Reusable shape for "Detected Income Sources" panel |
| `PaycheckBreakdown` type + waterfall UI | **Demote** to optional sidebar; existing data migrates as "Earner 1, manually entered" |
| Budget bucket math | Reusable — already runs on `monthlyActual` from transactions, source-agnostic |
| `transactionType` field on Expense | Extend with `'reimbursement'`, `'bonus'`, `'variable'`, `'side_income'` |
| SimpleFIN integration | Extend to capture **account-type** per account |

## Differentiators worth marketing

1. **Reimbursement matching** — unsolved across the field. Pairs with W-2 worker target + "blame the budget" framing.
2. **Earner-shape cold-start** — nobody profiles the earner, just the categories.
3. **Tiered notifications** — explicit Critical/Helpful/Nice-to-know prevents the ambient phase from getting noisy.

## Patterns worth stealing later (backlog)

- **Copilot's `#copilot` hashtag-in-memo** for Venmo self-classification. Power-user shortcut. Complements (doesn't replace) the prompt UX.

## What this overrides

- Earlier dual-earner schema brainstorm (manual base/variable/bonus/sideIncome fields per earner) — **superseded** by the detection-first approach. Profile is a thin shell (name, isWorking, company), the income data lives in detected sources.
- Earlier "trailing 6mo average" forecast for variable pay — **superseded** by "variable = surplus by default, sweep destination user-configurable."

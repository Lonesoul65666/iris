# Budget Guts — feature-by-feature QA pass

Systematic top-to-bottom review of the Budget page (the engine), then the Dashboard
(the downstream mirror). Goal: every field works, makes sense, and is interconnected
correctly — BEFORE any redesign. Durable map; survives context resets.

Status key: ⬜ not reviewed · 🔍 reviewing · 🛠️ fix in progress · ✅ pass · 💬 needs Scott decision

## Budget page — Overview (top → bottom)

| # | Section | Status | Findings / actions |
|---|---------|--------|--------------------|
| 1 | 7-day transactions prompt (`BudgetView:473`) | ✅ | FIXED: parseLocalDate (off-by-one at window edge) + count now spending-only (income/transfers/refunds excluded). Enhancement (Scott): "reviewed/reconciled" check-off — logged, not built yet. |
| 2 | Month navigator (prev/next/avg + in-progress badge) (`:889`) | ⬜ | Verify edge months + avg toggle. |
| 3 | Safe to Spend banner (`:941`) | ✅ | Solid. Visible breakdown (take-home − fixed − reserve set-asides − flex). The "reserve set-asides" line IS the stash aggregate — partial answer to Scott's "show it leaving the month." |
| 4 | Savings Rate tile (`:990`) | ✅ | FIXED: now shows "Green at 20% — ~$X/mo more (fixed savings; variable sweep not counted)" when under target. Answers "where's green?" + keeps the honest caveat. |
| 5 | Net Take Home / Monthly Spend tiles (`:975`) | ✅ | `totalBucketSpend` confirmed operating-only (= summary.realActual). COHERENCE FIXED (Scott approved): Safe to Spend = THE spendable number; the tile now shows "On Pace to Save $X" (projection) in-progress / "Saved This Month" when complete — no longer a competing "Left" number; dashboard cash-flow relabeled to pacing ("$X spent so far · on pace to save $Y"), bar segment "Left" → "Surplus". Three numbers, three distinct jobs. |
| 6 | Budget Health + sub-scores + housing ratio (`:1019`) | ⬜ | Verify sub-scores + housing-ratio detail. |
| 7 | Spending Breakdown (`:1019`) | ⬜ | |
| 8 | Budget Pulse — live read | ✅ | BUG FIXED: header "spent / budgeted" was summing ALL buckets incl. reserve — but reserve has a $0 bucket budget (stash-funded), so a lumpy taxes/travel payment landed in "spent" with no matching "budget" → looked over-budget (opposite of the lane model, and contradicted Pulse's own reserve-excluding projection). Now operating-lanes only → matches Monthly Spend tile + the rest of the page. This was the source of the "$14,584 / $13,227 — why am I over?" confusion. |
| 9 | **Stashes card** (`:1181`) | 💬 | The big interconnection rework (5 decisions: surface forward calc/due date, recurring-vs-goal type, base-funded + variable top-up, visible set-aside line, scorecard "covered" link). See conversation. |
| 10 | Fun Money card (`:1192`) | ⬜ | |
| 11 | Variable / overage card (`:1195`) | ✅ | Reworked this session (modal floor, all paychecks, free-to-deploy). Re-confirm after stash work. |

## UI / redesign parking lot (waits for Fable — captured so they're out of Scott's head)

These are pure visual/layout — substance underneath is fine, looks need work. Do NOT
spend pre-Fable effort here; this list is the memory so we can let them go for now.

- **7-day transactions bar** — content's good ("27 in the last 7 days · N need categorizing"), styling "looks like garbage." Restyle.
- **Month selector** should sit ABOVE the 7-day bar (currently below). Trivial reorder — parked as UI.
- **Excess white space** across the overview.
- **Net Take Home tile** — it's a constant ($15,800); a static big-number tile is the wrong treatment. Show it differently (a watermark line, not a "stat").
- **Savings Rate placement** — Scott: may belong on the Dashboard, not the budget page (Dashboard already surfaces it via insights). DECISION pending: keep on budget (now reordered after On-Pace) or remove here since Dashboard covers it.

## Added during the pass

- ✅ **Inline reclassify from the category drilldown** (`BudgetView` drilldown modal). Click a category → each transaction now has a **Move** button → pick a new category, with: **one-off by default**, a **"Apply to all [merchant] — now & future"** checkbox (bulk-updates same-merchant txns + writes a merchant mapping for future imports), and a **💼 Mark as work** toggle (moves it to the work lane / out of spend). Reuses the existing engine (`saveExpense` + `saveMerchantMapping`); `loadExpenses()` refreshes the drilldown + bars after. Fix-where-you-find-it; keeps categorization clean post-Claude. Audit-log of reclassifications = parked (actor already stamped on writes). Open: whether to add a distinct "car mods/upgrades" category (Scott's call).

- ✅ **Investment transfers now imported (not dropped)** (`server/teller-map.ts`). Investigating "do we see Fidelity charges?" revealed the import classifier was *recognizing* brokerage transfers (FID BKG SVG LLC, Schwab, Vanguard…) and **dropping them** as non-spend → investing was invisible / the $1,000/mo was a Settings guess. Now brokerage transfers out of checking import as `transactionType='investment'`: counted toward investing, excluded from spend, and **feed-validatable** (which makes the deploy-confirmation idea viable for investments, not just savings). Requires dev-server restart + re-sync to pull them in. Follow-up: reconcile the budget's investing figure to derive from these real transactions vs the Settings number.

- 🔍 **Money Map v1** (`src/components/Budget/MoneyMap.tsx`, top of budget overview) — Scott's "track the whole $15,800." Stacked bar: Everyday budget + Investing + Reserves + **Free** (leftover), summing to base income. Free = the win to deploy; goal = trim everyday → Free grows. ALLOCATION view (budgeted, sums to income) with everyday-spent noted. Pulse stays the spending-pace detail below. v1 — awaiting Scott's redline (allocation-vs-actual framing, placement, what counts as "Reserves/savings"). Foundation for the gamified surplus-deploy + Month-in-Review.

## Budget page — other tabs
| Section | Status | Findings |
|---------|--------|----------|
| Monthly tab (Income/Spend/Surplus/Work tiles + lane rows) (`:521`) | ⬜ | |
| Expenses tab (ExpenseManager) (`:511`) | ⬜ | Reconciliation check-off would live here. |
| Actions tab (`:516`) | ⬜ | |

## Dashboard (downstream — review last)
| Section | Status | Findings |
|---------|--------|----------|
| Net worth hero | ✅ | Audit-verified $544,574; incomplete (no RSU/401k balances — Phase 2). |
| Safe to Spend hero | ✅ | |
| "Iris noticed" insights | 🛠️ | Savings-rate insight: add target/gap, soften for variable earners. |
| Spending this month (donut) | ⬜ | |
| Recent activity | ✅ | Transfer guard added this session. |
| Cash flow bar | ✅ | Relabeled to pacing ("$X spent so far · on pace to save $Y by month-end"); bar segment "Left" → "Surplus". No longer competes with Safe to Spend. |
| Living under the base (scorecard) | ✅ | Option A (total spend vs base), verified 3/9. |
| Spend by account | ⬜ | |
| Equity / wealth | ⬜ | Equity = $0 (RSUs not entered — Phase 2). |

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
| 5 | Net Take Home / Monthly Spend tiles (`:975`) | 💬 | Verify `totalBucketSpend` composition (reserve? investing? work?). COHERENCE ISSUE: "Saved/Left This Month" tile (`:1000`) is a THIRD "money left" number alongside Safe to Spend + dashboard cash-flow — same juxtaposition Scott flagged. Decide THE number + how the others relate. |
| 6 | Budget Health + sub-scores + housing ratio (`:1019`) | ⬜ | Verify sub-scores + housing-ratio detail. |
| 7 | Spending Breakdown (`:1019`) | ⬜ | |
| 8 | Budget Pulse — live read (`:1167`) | ⬜ | |
| 9 | **Stashes card** (`:1181`) | 💬 | The big interconnection rework (5 decisions: surface forward calc/due date, recurring-vs-goal type, base-funded + variable top-up, visible set-aside line, scorecard "covered" link). See conversation. |
| 10 | Fun Money card (`:1192`) | ⬜ | |
| 11 | Variable / overage card (`:1195`) | ✅ | Reworked this session (modal floor, all paychecks, free-to-deploy). Re-confirm after stash work. |

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
| Cash flow bar | 💬 | Relabel "left so far" vs Safe to Spend (the juxtaposition). |
| Living under the base (scorecard) | ✅ | Option A (total spend vs base), verified 3/9. |
| Spend by account | ⬜ | |
| Equity / wealth | ⬜ | Equity = $0 (RSUs not entered — Phase 2). |

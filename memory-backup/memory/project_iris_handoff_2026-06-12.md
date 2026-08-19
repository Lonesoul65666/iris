---
name: project-iris-handoff-2026-06-12
description: "Iris handoff 2026-06-12 — COUPLES DATA MODEL SHIPPED (fun-money month fix + seed, partner identity + audit actor, spender attribution + account owners, FunMoneyCard + GoalTracker mounted). 121 tests, npm test now in pre-commit. Branch 29 commits over master. NEXT = UI/UX redesign. READ FIRST."
metadata: 
  node_type: memory
  type: project
  originSessionId: d39b9d1a-4b4d-47b2-ab70-ee9477148a27
---

# Iris handoff — 2026-06-12 (couples data model session)

**MOST RECENT. Supersedes the 2026-06-11 evening handoff's queue (its shipped-work notes still valid).** Branch `overnight-polish-2026-06-11` now **29 commits over master, unmerged — Scott reviews/merges.** Repo `C:\Claude\projects\signal\signal-app`, dev server :5173 (restarted this session — server-side teller.ts change live). `NEXT_STEPS.md` canonical, updated.

## Shipped (5 commits: `1d2cf94` `a57074d` `83c93ea` `b5a4342` `cfddfb7` — tsc clean, 121/121 tests, all browser-verified in Scott's Chrome)

1. **Fun-money THIS-MONTH fix + identity** (`1d2cf94`): monthlySpent = current calendar month spend (refund-netted via computeMonthlySpending), replacing computeCategoryAverages. `src/utils/funMoney.ts` pure +10 tests. **Live fun_money collection was EMPTY** (wizard never ran for pre-existing installs) → pots now seed from Earner profiles (`earner-scott`/`earner-claire` exist in the earners collection — THE identity spine, don't invent a new one). FunMoney gains earnerId/category/emoji; legacy name→category mapping (scott→fun_scott, claire→fun_wife) contained in seed code only. Verified live: Claire $34.99 June MTD (a car wash), Scott $0. ONE syncFunMoney path replaced both inline context copies. Edit-mode spent input removed (derived now).
2. **Partner identity + audit actor** (`a57074d`): activeUser un-discarded (`activeUser: _activeUser` is dead); context exposes activeUser/activeEarner/earners. AuditEntry.actor stamped via module-level setAuditActor. **No audit viewer exists yet** — redesign work; history accrues correctly from now.
3. **Spender attribution** (`83c93ea`): `Expense.spender?: Earner.id | 'ours'` + `sourceOwners` collection. Resolution: override → account owner → 'ours' (unattributed = JOINT, never guessed) in `src/utils/attribution.ts` (+8 tests). Settings → Account Owners panel (ACCOUNT_META 5 sources). Expense Manager "Who?" cycle toggle (inherit → Claire → Scott → ours → inherit; earner order = collection order, Claire first). Persists via expenses jsonb data blob — no schema change. **Teller re-sync preserve-list now carries spender (BOTH upsert blocks in server/api-handlers/teller.ts) — server change, restart done.** Full cycle verified persisting to Postgres.
4. **Surfaces** (`b5a4342`): FunMoneyCard on Budget Overview next to StashesCard (spent recomputed from transactions on render; $0-budget pots show "Set a budget" → Edit Budget). GoalTracker mounted on Dashboard: stashes WITH targetAmount/targetDate only, balances DERIVED (stashMath), date-pacing live. **Hidden today — no stash has a target; appears when Scott's homework lands.** Emergency goal reads `type==='bank' && /sav/i` account balances.
5. **Gate crumb** (`cfddfb7`): `npm test` (vitest, ~1.3s) wired into scripts/hooks/pre-commit alongside tsc.

## Scott's homework (updated — items 1–3 unchanged from 06-11)
Real budget targets via Edit Budget · stash opening balances + category links + **targets/dates (makes GoalTracker appear)** · 401k/HSA in Paycheck panel · **NEW: fun-money budgets ("Set a budget" chips) + Account Owners assignments (all currently Ours)** · delete the leftover "New stash" · merge the branch.

## ⭐ NEXT SESSION: THE UI/UX REDESIGN (couples scoreboard folded in)
Pre-paint gate is DONE (couples data model was the last blocker). Fold in: scoreboard centerpiece (Safe to Spend = the shared number; per-person rollups now computable from `effectiveSpender`), month-in-review (computeMonthComparison consumed by NOTHING), sankey, bills-due strip, paycheck anatomy, stash target-date pacing, **audit-log viewer (actor now recorded)**, BudgetView 10-seam decomposition — which also fixes the sluggish full-table re-render per toggle (1,752 rows refetch+rerender on every saveExpense; click events can time out in automation).

## Gotchas (new this session)
- PowerShell multiline git commits: the `@'...'@` here-string got mangled once — write commit msg to a file + `git commit -F` when it has quotes.
- The "VARIABLE PAY base paycheck $39 (detected from 3 paychecks)" card on Budget Overview looked suspicious in passing — NOT touched this session, worth a look during redesign.
- Standing: watermark not versioned (job-switch); June income $0 until first June paycheck = honest; Teller 100-enrollment cap; never auto-poll.

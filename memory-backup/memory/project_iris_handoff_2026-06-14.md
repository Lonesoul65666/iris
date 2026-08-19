---
name: project-iris-handoff-2026-06-14
description: "Iris handoff 2026-06-14 — DATA-HONESTY session: import-classifier overhaul (savings buckets visible, Zelle=real by description, savings-withdrawal tripwire), fun-money phantom-pot fix + dynamic earner labels, income-sources model explained + variable-pay tracker revived, categorization cleanup, dashboard layout. Branch now 35 commits over master. READ FIRST."
metadata: 
  node_type: memory
  type: project
  originSessionId: d39b9d1a-4b4d-47b2-ab70-ee9477148a27
---

# Iris handoff — 2026-06-14 (data-honesty marathon)

**MOST RECENT. Supersedes 2026-06-12's queue (its shipped notes still valid).** Branch `overnight-polish-2026-06-11`, repo `C:\Claude\projects\signal\signal-app`, dev :5173. Long working session with Scott driving in his real Chrome. Theme he set: **"what matters is moving forward — June + end-of-July are the real watermarks; historical data will be a bit junky and that's fine."** All money is now "working every month" (budget set bar ~$600 still unplaced).

## Shipped this session (commits 1d2cf94 → c9bea06, ~10 commits; 121/121 tests, npm test in pre-commit)

1. **Categorization cleanup** (data, via API): EXXON 7-Eleven mappings groceries→transportation (2 mappings + rows); **Xbox/Microsoft split** — game purchases→fun_scott, the 2 real subs (Game Pass 11th, M365 15th) stay subscriptions; Pokémon GO + Google One→subscriptions; new **`atm_cash` 💵** custom category (3 weed-mapped ATM rows moved); **NORTHWEST ISD→childcare** (Scott: "school stuff"); **Dubai $871 Saudi German refund→travel_personal** (matches the $12,297 charge bucket). Built `scripts/scan-category-drift.mts` (untracked) = mapping-vs-rows drift scanner. Car washes STAY fun_wife (Scott: you can wash a car yourself → it's fun spend).
2. **Fun-money phantom fix** (`d04155e`): legacy `fun-money` action item (executeFunMoney) was OVERWRITING fun_money with generic "Person A"/"Person B" $400 pots; upsert-only let them linger beside real Scott/Claire → 4 cards. Deleted phantoms; **saveFunMoney now uses replaceCollection**; executeFunMoney now adjusts existing pots only, never invents people. **Dynamic earner labels**: fun_scott/fun_wife now display "Scott's/Claire's Fun Money" app-wide via `registerEarnerFunLabels` (transactionAnalysis) + ExpenseManager dropdown + bucket labels — tied to earner names, not hardcoded.
3. **Income Sources model** (taught Scott, no code): the panel is INFORMATIONAL — `monthlyBudgetableIncome` feeds only the panel's own tile, NOT the budget (budget income = paycheck transactions). `includeInBudget` on irregular rows = inert (monthlyEquivalent('irregular')=0). Refunds/sales → dismiss (sticky), don't delete (detector re-creates from live txns). **Un-dismissed the Abnormal base+variable sources** → revived VariableSurplusCard ("Live on base, sweep the rest"); base now $7,918 (was bogus $39).
4. **⭐ IMPORT-CLASSIFIER OVERHAUL** (`8708331`, server/teller-map.ts — the big one). Was dropping Zelle + 2 of 3 BoA accounts wholesale. Now: **(a)** "Our Stuffs" (1006) + "Super Savings" (3784) import as `transactionType='transfer'` — VISIBLE in account-activity (parity w/ checking) but excluded from budget spend; **(b)** Zelle classified by DESCRIPTION not Teller type (type is always 'transfer'/'payment' — same trap as card credits): Zelle to/from spouse (`SPOUSE_ZELLE = /LILLAH|ANDERSON/i`) = transfer, to/from anyone else = real money (outbound=spend); **(c)** savings-withdrawal TRIPWIRE — real spend leaving a savings bucket counts AND fires a warning insight (`detectSavingsWithdrawals` in insightsEngine). Removed 'ZELLE' from NON_SPEND_PAYEE. MappedExpense gained transactionType='transfer' + notes. **One full re-pull (since 2025-09-01) done** + a recent-window pull: backfilled both savings buckets, all Zelle, 9 Dubai ATM withdrawals flagged, and the **$475 "Zelle to Jason Albarran for Tint"** (now car_maintenance spend on checking — proof the engine self-classifies going forward).
5. **Dashboard layout** (`c9bea06`): Recent Activity now fills the empty slot beside "Spending this month" when investments module is off (was dead space Scott circled); extracted `recentActivityCard()` helper.

## Standing gotchas reaffirmed
- **Refresh ≠ Sync.** Browser reload re-reads Postgres; only the ↻ Sync button pulls from Teller. Teller skips PENDING txns (a fresh Zelle is often pending → appears a sync or two later). Sync-via-tokens is free; ENROLLMENT is the scarce resource; space full-history pulls.
- All 3 BoA accounts ARE enrolled (Teller sees 1006/3784/8256 + Citi + CapOne). Net-worth hero ANIMATES on load (count-up) — a mid-animation screenshot looked like $384k but real value $544,574 (snapshots confirm). Don't mistake the animation for a data change.
- Server-side (teller-map.ts) changes need a dev-server restart before the next sync uses them (done this session).

## Parked (Scott's explicit "later" calls)
- **"Living under the guarantee" all-green scorecard** — Scott: "no way in hell we were green." Suspect it compares OPERATING spend (excludes reserve lanes = taxes/travel/lumpy) vs $15,800 base, so it reads rosy. Investigate.
- **VariableSurplusCard YTD understated**: shows ~$16.5k "current band" but true 2026 over-base ≈ $33.8k (all-time $56.5k). Band detector false-flagged a 4/30 "pay change" (it's variable comp, not a raise). Decide: true-YTD vs relabel "since pay change."
- **Inbound Zelle from outside people NOT captured as income** (income importer only knows payroll/reimbursement). Low priority.
- **Claire round-trip reconciliation**: ~$1,400 went to her (now-CLOSED separate account); some spent there (invisible — Iris never saw it). Can't auto-compute (inbound legs skipped). One-time; Scott OK to let it go unless he recalls the net spent → then book one manual expense.
- **The ~$600 unplaced** — Scott's last budget gap. Leaning stash/investing over idle buffer (he's carrying too much cash, wants to move to high-yield). NOT yet placed.

## Late-session adds (after the import overhaul, same session)
- **$475 Zelle to Jason Albarran "for Tint"** surfaced on a post-fix sync → imported as real spend on checking, set to car_maintenance. Proof the new classifier self-classifies Zelle going forward.
- **Taxes/Travel double-count KILLED**: Scott had both a category bucket AND a stash for each (Taxes $1,000 bucket + $1,500 stash; Travel $500 bucket + $1,000 stash). Collapsed to single source: **Taxes stash → $1,000/mo, Trips stash stays $1,000/mo, both buckets zeroed.** Real unallocated after cleanup ≈ **$1,553/mo** (the old "~$600" was a pre-cleanup guess). DESIGN RULE for redesign: a category is either a monthly bucket OR a stash-funded reserve — link to a stash → it leaves the budget editor (impossible to double up).
- **Stash spend mechanics confirmed for Scott**: spending a stash-linked (reserve) category draws the stash down and NEVER hits the monthly Safe-to-Spend; under-saved → stash goes honestly negative ("spent before saved"), monthly stays clean. His current personal interview-trip travel = NOT reimbursable → draws Trips stash negative, which is fine.
- **Plane trigger → offline architecture decision** (new memory [[project_iris_offline_architecture]]): keep Supabase cloud canonical + add a local CACHE layer; mobile later; formalize as ADR. Fixed Google-Fonts render-block (`703c692`, non-blocking). Real offline-speed fix = production build (Vite dev is heavy).

## ⭐ THE AUDIT (2026-06-14, swarm) — drives the next session
14-agent workflow recomputed every headline number from live data + adversarially verified each high finding (NONE refuted). Report: **`docs/audits/2026-06-14-numbers-audit.md`** (committed `eba196c`). Scott's instincts confirmed on all 3 he flagged + 9 more. **Branch now 34 commits over master.**

**Fix queue (next session — number/logic fixes, NO Fable needed):**
1. Scorecard under-base verdict operating-only → hides $57,078 reserve spend, shows 9/9 green vs honest **3/9** (`savingsScorecard.ts:96`; trend line :111-115 too). **DECISION to confirm first (in NEXT_STEPS):** A) judge vs total real spend (blunt, 3/9) vs B) judge vs `base − stash set-aside ($2k) − operating` (matches how Scott budgets via stashes) — **Claude leans B**, Scott confirms at build-session start.
2. Variable-pay false 4/30 "pay change" drops ~$17.3k; $16.5k shown vs **$33,816** true (`VariableSurplusCard.tsx:87-131`) — also add a "free to deploy / fast-forward vacation·reno" tile.
3. Cash-flow time-axis: MTD spend vs full-month income overstates "left this month" ~$7–10k (`DashboardView.tsx:394-396`). **Fix before the $1k→$2k investing call** — real room is tighter.
4. Savings-rate false "critical 5%" — 401k/HSA = $0; real ~**10.7%** (`insightsEngine.ts:220-221` +2 dupes). Populate real 401k(~$658)/HSA(~$692).
5. Investing $20 vs $1,000 fat-finger snapshot (`transactionAnalysis.ts:226-227` + 3 sites). 6–12 = medium/low in the report.

**Verified CLEAN:** net worth $544,574 (to the penny) · import integrity ($105k transfers never leak) · Safe-to-Spend $2,735 · stash math · cash-flow investing not double-subtracted.

**Scott's open decisions (gated on fixes):** $1k→$2k investing (after #3) · 401k% vs direct-market (after #4) · taxes $1,000 likely UNDER-funds (real ~$1,400/mo) · **equity = $0: Abnormal RSUs not entered — get them in (he's leaving Abnormal).**

## Next
**Work the audit fix queue** (canonical in repo `NEXT_STEPS.md` "START HERE" + `docs/audits/2026-06-14-numbers-audit.md`). THEN, once numbers are trusted + Fable's back: **UI/UX redesign (commercial-grade) + couples scoreboard** (pre-paint gate done; `effectiveSpender` ready). Session switched at ~620k tokens / multi-monitor for visual validation.

## Resolved this session (was parked)
- ~~$600 unplaced~~ → was over-allocation from the taxes/travel double-count; real leftover ~$1,553/mo, placement gated on cash-flow fix #3.
- ~~green scorecard / variable-pay~~ → now AUDITED + confirmed, in the fix queue above.
- Inbound-Zelle-as-income + Claire round-trip → still parked (low priority / one-time, account closed).

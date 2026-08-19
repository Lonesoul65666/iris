---
name: project-iris-handoff-2026-07-05
description: "Iris handoff 2026-07-05 — READ FIRST. Shipped: 4 audit-Medium money-math fixes, per-account full-activity drawer + mapper now KEEPS transfers/card-payments (re-imported May+), commit-driven stash balances, AND the big one — the AI advisor: comparative budget planner + 'Iris's Take' grounded full-send coach voice. Branch 130 over master, tsc clean, 183/183."
metadata: 
  node_type: memory
  type: project
  originSessionId: 7baa4833-7664-4353-a346-61241654bfe4
---

# Iris handoff — 2026-07-05 · READ FIRST

Supersedes [[project_iris_handoff_2026-07-04_v3]] as read-first (v3's swarm-audit + shipped context still valid). Repo `C:\Claude\projects\signal\signal-app`, branch **`overnight-polish-2026-06-11` — 137 commits over master, UNMERGED**. **tsc -b clean · 190/190 · pre-commit runs tsc+vitest.** Dev: preview MCP server name is **`iris`** (not "signal") on :5173; or `npm run server` standalone.

## Shipped this session (all committed, browser-verified)

**Audit Medium money-math fixes (all 4 from the 2026-07-04 swarm audit):**
- `collections`: **atomic `replaceCollection`** — new `/api/collections/:name/replace` deletes-missing + upserts in ONE txn; both client copies use it. Killed the mid-sequence-drop resurrection + two-tab clobber. (verified via throwaway-collection probe)
- `savingsScorecard.ts`: **cadence-aware guaranteed base** — pay-periods/mo from MEDIAN day-gap, not `round(count/distinctMonths)` (which halved base on thin data).
- `BudgetView.addBucket`: re-fetch before insert → slug-collision guard.
- `syncTellerTransactions.ts`: income fetch wrapped in try/catch → a mid-sync throw marks partial instead of the 5-min "up to date ✓" lie.

**"See all my bank activity" (Scott's ask):**
- **Per-account drawer**: click any "Spend by account" panel → a modal lists EVERY stored txn for that account (transfers/investments/income/refunds tagged, inflows green). Account titles bumped to header size.
- **Mapper now KEEPS internal moves** (`server/teller-map.ts`): card payments (shown as inflow via new `flowOverride`), account-to-account transfers, deposits, interest, non-employer inflows — all kept as `transactionType='transfer'` (VISIBLE, never spend; employer pay still owned by the income importer; brokerage still `investment`). **Re-imported since 2026-05-01** (23 new rows; spend/safe-to-spend/net-worth unchanged — double-count guard holds). Deeper history NOT backfilled (Scott chose recent-window-first; full re-pull is the rate-limit-riskier option if he wants it later). Mapper unit test lives at `server/__tests__/teller-map.test.ts` (node tsconfig scope; vitest include now covers `server/__tests__`).

**Commit-driven stash balances:** a Have-To/Want-To balance = opening + COMMITTED moves (DeployConfirmations on its lane) − draws. No more phantom `contribution × monthsElapsed` accrual. `computeStashStatus`/`computeAllStashes` take a `confirms` arg; threaded via BudgetView `deployConfirms` + dashboard `dashDeployConfirms` (newly exposed on AppDataContext). Scott's current pots read identically ($2,067) since all July-committed; the fix only shows a fresh/uncommitted pot as $0.

**⭐ THE AI ADVISOR (the "point of AI" piece Scott flagged) — built BOTH tracks:**
1. **Comparative budget planner** (`src/utils/budgetComparison.ts` + `BudgetCompareHelper.tsx`): edit-mode helper "How <last month> actually landed" — over/under columns + per-category **"meet in the middle" target tweaks** with Apply / Apply-all. **REWORKED per Scott (same session):** originally did zero-sum cross-bucket transfers ("move $457 from Scott's Fun Money → Dining") — he rejected that (fun money is UNTOUCHABLE, and he'd never rob one bucket for another). Now each category adapts its OWN target to the midpoint of plan & actual (raise blowouts, trim slack); `isAdjustable` = flexible lane AND not `fun_*`; fixed/reserve/fun never suggested. Full month label ("June 2026", was "Jun"). Reversible via edit-mode Cancel.
2. **"Iris's Take"** (`src/utils/advisorFacts.ts` + `src/services/budgetAdvisor.ts` + `MonthlyReviewCard.tsx`, on Budget overview): grounded facts brief (real over/under, the target tweaks, scorecard trend, uncategorized "what are these" charges) → LLM narrates as a **full-send R-rated coach** (roast the behavior, hype the wins, name the one move; emojis off; **hard rule: never suggest moving money between buckets or raiding fun money**). Routes through the multi-provider LLM router. Button-triggered, cached in setting `budget_advisor_review`. **Live-verified**: every $ real, no hallucination. Presentation polished — gradient avatar + spark, verdict headline + speaking-quote body. ⚠️ `gemini-2.5-flash` is a THINKING model — needs generous `maxTokens` (8192) or it truncates mid-sentence.

**Fun money is now a 70/30 LEDGER + gamified "fun box"** (`src/utils/funMoney.ts`, `FunMoney` type, BudgetView): each COMPLETED month settles — came in under → configurable share (default 70%) BANKS into the pot, the rest (30%) PROMOTES to savings; overspend rides the full overage forward and reduces the pot. **Savings is one-way (never clawed back).** Underwater + a good month → the surplus digs the pot back to $0 FIRST (100%, no save), only the excess past zero gets 70/30 (dig-out-first, Scott 2026-07-05). Current month is live on top of the carried pot. Name stays **"Fun Money"** (Scott declined a rename). `startMonth`+`openingBalance` persisted (anchored on first sight by `linkFunMoneyToEarners`; not commit-driven — the allowance just accrues). The **split is a slider** (setting `fun_savings_rate`). The 30% surfaces as a **"Move to savings" confirm on the non-stash `fun-savings` lane** → flows through Scott's monthly commit run, stays OUT of Safe-to-Spend (already-budgeted money redirected = ZERO budget impact; committedReserves only counts `stash-` lanes). Daily-overview **fun box** = Scott-vs-Claire head-to-head (race status line, per-person banked + "→ savings" counters, household restraint-savings total, slider). **Emojis dropped** in fun money per Scott. computeFunMoneySpent signature: `(funMoney, expenses, now, savingsRate=0.30)`.

## ⏭️ NEXT — queue (things discussed this session, NOT built; Scott gates priority)
0. ✅ **DONE 2026-07-06 (40cb302).** Stash cards creation-forward: `stashExistedBy(stash, month)` in stashMath (anchored on `startMonth`, legacy no-startMonth pots stay always-visible), filters the BudgetPulse commit-run rows so a July pot never shows in June. Only month-scoped stash surface that leaked; StashesCard (daily "now"), Monthly tab, Iris's Take card, edit-mode list all confirmed clean. 4 unit tests.
   **Also shipped 2026-07-06:** branch merged to master (ff, 9013e26); ⭐ **zero-AI gamification streak engine** (351e08d) — `src/utils/gamification.ts` (streakOf/underBaseStreak/funMoneyStreaks/computeGameState/gameGreeting), live streak chip + templated announcer greeting on the dashboard, `dashFunMoney` now on AppDataContext, 16 tests. **Roadmap locked → [[project-iris-gamification-roadmap]] (READ). Forward-only rule locked (no retroactive/backfilled achievements; balance milestones re-baseline on new data-source connect).**
1. **Advisor Stage 3 — proactive Iris.** Regenerating weekly nudges + a dismiss/learning loop ("you ignored this 3×"). This is [[project_iris_dynamic_action_items]]. Scaffolding (insightsEngine, triggerDetector, dynamicActions, action templates) is all there to build on. The big next swing.
2. **Meet-in-the-middle tuning.** The comparative planner suggests the exact midpoint of plan & actual (Dining $1,000→$1,400). Scott mused he'd lean more conservative (~$1,000–1,200 on that one). Make the blend a setting/slider (e.g. "raise X% of the gap") or default less aggressive. Small.
3. **Fun-money gamification flourishes** (first pass shipped): streak counter ("N months banking in a row"), annualized projection ("on pace for $X/yr from restraint"), round-number celebrations, more race-line/callout variety.
4. **Fun-money balance-over-time graph** — Scott explicitly deferred to "someday."
5. **Full-history Teller re-pull** — only the recent window (2026-05→) was re-imported with transfers/card-payments kept; older card payments/transfers aren't backfilled. Scott chose recent-first; full-history pull is the rate-limit-riskier option if he wants deeper history.
6. **Packaging off-machine** (from v3): real **PIN → server session** API auth so LAN/partner-mode is safe; rotate the `.env.local` password; add a server build step. Loopback-default bind covers it until then.
7. **Remaining audit items** (non-blockers) from `docs/audits/2026-07-04-swarm-audit.md` beyond the 4 Medium fixed this session — the PLAUSIBLE crash/resilience set (dynamicActions `equity.grants`, IntelligenceView `as any`, main.tsx `boot()` try/catch, SyncStatus reload, `saveFunMoney` dup collapse, db-pool `ensureSingleUser`) + format.ts sign placement.

## Scott's homework / open (his actions)
- **Review + merge the branch (137 commits over master).**
- **Set fun-money opening balances** for Scott + Claire (Edit Budget → Fun Money) if they've already got fun money banked — accrual anchored to July, starts fresh otherwise.
- **Set real stash cadences** (car-insurance renewal month, etc.) so the ETAs go live (from v3).
- **Check the $200k car value** in Settings (from v3).
- **Reconcile July investing at month-end** — may read ~$2k if an early Fidelity pull fired before he fixed the schedule to monthly-on-the-16th. (June "mystery" SOLVED: bank was double-pulling — $1k on 1st + 15th = $2k/mo + a one-off $1k on Jun 29 = $3k. Iris was accurate; nothing to fix.)
- **Once a fun-money month settles**, do the "Move to savings" on the commit run (it stays grayed "Settling…" until the new month shows activity).

## Gotchas (still true)
- **Shared-DB clobber** unchanged — preview :5173 and Scott's Chrome hit the SAME Postgres; don't edit stashes/buckets in two places at once. Backed up expenses to `scripts/backups/expenses-backup-2026-07-05-preimport.json` before the re-import.
- Bash cwd resets to `C:\Claude` — `cd /c/Claude/projects/signal/signal-app` first; write probe scripts with the Write tool (heredoc lands in the wrong dir).
- Backgrounded `npm run`/vite leaves a child node on the port after `kill %1` — `Stop-Process -Id <pid>` the lingering listener.
- vitest include = `src/utils/__tests__/**` + `server/__tests__/**`; server-side pure fns tested there (importing them from src breaks `tsc -b` — app project lacks node types).

---
name: project-iris-handoff-2026-08-17
description: "Iris handoff 2026-08-17 — READ FIRST. Big day: stash pacing rewrite, ingest fix (vanishing mortgage), user-reclassifiable types, refund recategorization, dispute lifecycle + 'Needs your call' queue, Pulse visibility. THEN a 5-agent review found ~35 defects incl. 10 money/intent-corrupting; the worst (paycheck→spend in one click) is FIXED. 10 commits pushed to origin/master through 2661e20. HOST UPDATE PENDING — safe to deploy. Remaining defect queue is enumerated below and is the next session's work."
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-17T21:22:09.054Z
  originSessionId: 8ecf5ce7-c2fd-4f6b-8b9e-475084d971f3
---

# Iris handoff — 2026-08-17 · READ FIRST

Supersedes [[project-iris-handoff-2026-08-13]] as read-first (its content still
valid — the stash model, opening balances, and the release convention all hold).
Per [[feedback-iris-release-flow]]: **everything below is PUSHED to GitHub
(`origin/master`, through `b3a8d98`), shipping as version `2026.08.17.v1`.
The HOST UPDATE IS STILL PENDING.**

## 🚀 Deploy state

11 commits today, `f2a1470 → b3a8d98`. `tsc -b --noEmit` clean, **406 tests pass**.
**Scott's verdict: safe to deploy now**, remaining defects to be fixed after.

**`b3a8d98` — versioning restored.** Scott caught that I'd stopped bumping it:
`src/updates.ts` still said `2026.07.13`, so Settings claimed a month-old build
and the one-time What's New card hadn't fired since July — **Claire was never
told about milestones, Moments, disputes, or the Pulse fix.** Backfilled
`2026.07.20.v1` / `2026.08.13.v1` / `2026.08.17.v1` and adopted the
**`YYYY.MM.DD.vN`** format he asked for. Convention now recorded in
[[feedback-iris-release-flow]] so it can't lapse again. Updating the host will
fire the `2026.08.17.v1` card for both of them.
Host update = Settings → Updates → **Update Iris** on the always-on box, or
`git pull --ff-only && npm install && npm run build` in its app root, then
**Ctrl+Shift+R** (frontend-only changes).

⚠️ **DATA changes are ALREADY live** (shared Postgres): stash opening balances,
22 backfilled cash-out/mortgage rows. Only CODE waits on the host.

## ⚠️ TWO OPEN ITEMS FOR SCOTT

1. **`scripts/` was accidentally committed in `1fbbcaa`** — 93 files including real
   transaction backups (`networth-backfill-backup.json`,
   `expenses-backup-2026-07-05-preimport.json`, ~1.1MB of transactions).
   Untracked + gitignored in `02f31ee`, **but the data is still in git history.**
   Repo is private (unverified this session — `gh` not installed on the dev box).
   Stripping history needs a rewrite + force-push = **Scott's call, not done.**
2. **`npx tsc --noEmit` SILENTLY CHECKS NOTHING in this project** — it exited 0 on
   six missing imports. **ALWAYS use `npx tsc -b --noEmit`** (what the pre-commit
   hook uses). This cost real time; don't repeat it.

## What shipped (all pushed)

- `62f87bf` **Stash pacing rewrite.** `commitMonthsRemaining()` replaces
  `daysToDue/30.44`. Pots were ALL reading "behind" with a required that climbed
  daily. Plus the commit-run layer + "move this from checking" total on both
  surfaces. Verified: `commitMonthsRemaining` is correct on every probed edge.
- `e8378d2` **The vanishing mortgage.** WF HOME MTG arrived `transactionType:
  'transfer'` on its FIRST Plaid-era payment (11 months of Teller had it as
  `expense`; July's landed before the 2026-07-07 cutover). Housing read
  `$0 / $3,205 UNTOUCHED`, August understated ~45%. Fixed via `isDefiniteSpend()`
  allowlist checked BEFORE the skip branch + `LOAN_PAYMENTS` split in `pfcToType`.
  Also unified cash-out → `atm_cash`.
- `137f9f3` **Reclassifiable types + `typeOverride`** that survives sync.
- `94e4284` **Refunds recategorizable** (a refund nets by CATEGORY — Citi dispute
  credits are described generically so they landed in `other`).
- `38412fb` + `3590936` **Dispute lifecycle + "Needs your call" queue.**
- `c2dd15b` + `2661e20` **Pulse visibility.** $76,948 over 12 months was invisible
  AND missing from the total.
- `1fbbcaa` **Review fixes** (below). `02f31ee` scripts/ untrack.

## 🔍 The 5-agent review (Scott asked for it before deploying — it earned its keep)

Found **~35 real defects, ~10 corrupting money or intent**. Tests were good at the
pure-math layer and **absent everywhere the wiring lives** — `computeCommitRun`, the
headline money fix, was never imported by any test.

### ✅ FIXED in `1fbbcaa` / `2661e20`
1. 🔴 **Paycheck → spend in ONE CLICK.** The Type `<select>` offered only
   expense/transfer/investment/refund; `income` (23 rows, $233,516) and
   `reimbursement` (7 rows, $21,106) matched no option → browser fell back to
   index 0 → **every paycheck displayed "Expense"**, and one click wrote
   `expense` + `typeOverride: true` = permanent. Now: select renders ONLY for the
   four editable types, everything else is a read-only badge. Verified live +
   confirmed **0 rows carry typeOverride** (nothing was converted).
2. 🔴 **"Not related" conceded the dispute** (called `resolveDisputeLost`). Now
   "Not this credit" → new `disputeRejectedCreditIds`, keeps it open, never
   re-offers.
3. 🔴 **Won-before-credit-posts was unlinkable** → credit later netted against an
   already-excluded charge = phantom savings in one click. `listOpenDisputes` now
   also surfaces `won && !disputeCreditId` as `awaitingCredit`.
4. 🔴 **Win was fail-unsafe** — now writes the **credit FIRST** so a failure
   overstates spend (safe) and stays queued. *Do not reorder.*
5. 🟡 One credit could be offered to two disputes (`claimed` never mutated).
6. 🔴 **Dispute exclusion honored in 1 of 7 aggregators** → Budget $5,665 vs
   Dashboard $5,700. All six inline predicates now use `isRealExpense`.
7. 🔴 **Pulse "still free" double-charged reserve** (contradicted `safeToSpend`).
   Split: headline = all spend; headroom = non-reserve only; reserve gets its own
   "· $X lumpy ·". Clamp dropped so a busted month can say "OVER base".
8. 🔴 **New-month clean-slate regression** — averaged unbudgeted rows on any month
   with no transactions yet. Would have hit Sept 1.

### ❌ STILL OPEN — the next session's queue, roughly prioritized
**Stash (all real, from the stash reviewer):**
- 🔴 **Partial commit reports "fully funded."** `thisMonthAsk` is 0 whenever
  anything is committed. Fix: `ask = max(0, requiredPerMonth − committedThisMonth)`
  and key `pendingCount`/footer copy off the residual. Also no UI path to top up
  (re-click UNDOES — strict toggle).
- 🔴 **`committedReserves` vs `computeCommitRun` disagree.** `committedReserves`
  matches `lane.startsWith('stash-')` so **legacy `sf-vacation`/`sf-holidays`/
  `sf-emergency` ids seeded by `budgetDefaults.ts:353` leave checking but never
  leave the $15,800** — feeds the inflated "free to deploy". Also retired/deleted
  pots' confirms. Fix: one shared helper.
- 🔴 **`past_due` sets `thisMonthAsk = needed`** (whole balance as a commit button)
  AND fires early — `daysToDue` uses `Math.round`, flips ~lunchtime the day before.
- 🔴 **`requiredMonthlyForGoal` disagrees with the card's ask** for recurring pots
  with draws (forecast uses `biggestDraw`, autofill uses `target/2`). Latent for
  Scott (no pot links a category). Fix: delegate to one source.
- 🟡 **Paging the Pulse back shows FUTURE money** — balances sum confirms from all
  months, draws capped at today. Viewing July reads "funded" off an August commit.
  Fix: filter `deployConfirms` to `c.month <= pulseCommitMonth`.
- 🟡 **NaN vector**: malformed `targetDate` → `nextDueDate` returns Invalid Date
  (truthy), every guard passes (`NaN <= 0` is false), card renders "$NaN", autofill
  **persists NaN → null**. Fix: `Number.isFinite` guards.
- 🟡 `monthlyContribution` vs `monthlyFill` divergence — card writes one, edit mode
  writes both, ask prefers the stale one.
- 🟡 **`GoalTracker.tsx` (Dashboard) is a THIRD surface** with the same section
  title running the OLD pacing + a UTC date parse (loses a month for `-06:00`).
  Contradicts the Budget page.

**Pulse / display:**
- 🟡 NO BUDGET rows are a **dead click** (drilldown looks up `filteredBuckets`).
- 🟡 A bucket-less category that nets NEGATIVE is filtered out by both gates.
- 🟢 `nobudget` sorts BELOW `untouched`, so the biggest numbers sink to the bottom
  with an empty bar.
- 🟢 Monthly Spend tile still shows a different "spent" than the Pulse.
- 🟢 **Zero test coverage on `pulseRows`/`unbudgetedRows`.**

**Ingest (mostly latent for BoA, live the moment a non-BoA checking is linked —
Scott banks with Wells Fargo):**
- 🔴 **`isCashOut`'s bare `withdrawal` substring beats the payee guard.**
  `ELECTRONIC WITHDRAWAL CAPITAL ONE CRCARDPMT` → **counted as SPEND**. Dormant
  only because BoA spells it `WITHDRWL`. Fix: gate cash-out on the non-spend payee
  regex, or anchor `isCashOut` on the real ATM shape.
- 🟡 `LOAN_PAYMENTS → ''` still drops an auto loan **at a card issuer**
  (`CAPITAL ONE AUTO FINANCE` → payee regex → transfer). Fix: keep Plaid's
  `detailed` signal instead of re-deriving from a payee regex.
- 🟡 **`typeOverride` is a one-way latch** — nothing ever writes `false`, so
  type+flow are frozen forever. Fix: store the feed's type and latch against it.
- 🟡 **`recategorize.ts` ignores `typeOverride`** → `?all=1` reverts the very
  override the new SQL protects.
- 🟢 ATM **fee** rows each trip the savings `unexpectedOutflow` tripwire (~8 alerts
  for 3 Dubai cash pulls).

**Disputes / half-wired:**
- 🟡 **Deleting a disputed charge orphans its credit** — `disputeCreditFor` points
  at a dead id, credit suppressed forever, no UI path (badge only renders when
  `disputeStatus` is set, which a credit never has). SQL is the only exit.
- 🟡 **`totalDisputed` is computed and displayed NOWHERE.** On the OPEN-dispute
  path the money genuinely does vanish from every surface — the opposite of what
  its comment claims. Either surface it in the Pulse or drop it.
- 🟡 **The "staleness nudge" does not exist.** No `Nudge` is produced; it's amber
  text in the queue. Comment corrected to say so. A real `disputeNudges()` builder
  wired into `DashboardView` is outstanding — this is the one part of Scott's
  "what's my reminder recourse" answer that doesn't work.
- 🟢 `DISPUTE_LABELS` is a dead export that DISAGREES with the shipped strings.
- 🟢 The "dispute" button is `opacity-0` until hover — the sole entry point,
  invisible at rest and unreachable on touch.
- 🟢 Nudge's "Find the charge" **cannot reach Transactions** (`NudgeAction` has no
  budget-sub-section field).
- 🟢 `isBankFee`'s `surcharge` branch is unreachable (guard short-circuits on
  `fee`). `CASH_OUT_CATEGORY` is duplicated as a literal in
  `transactionCategorize.ts:117`. `atm_cash` exists in **no** default, lane, or
  label table — it only has a label because Scott has a custom-category row.
  `credi_card_memberships` (missing `t`) now renders misspelled in the Pulse.

### Stale/false comments — FIX THESE FIRST, they actively mislead
- `BudgetPulse.tsx` + `StashesCard.tsx` both assert the two commit footers **"can
  never show different numbers for the same month."** **They can** — StashesCard
  uses the live month, the Pulse uses the VIEWED month. Same function, different
  call, and the differing parameter decides the answer.
- `BudgetView.tsx:1768` passes `curMonthKey` to StashesCard while the Pulse gets
  `pulseCommitMonth` — so while viewing July, committing from the lower card writes
  an **August** confirm not shown in the footer above it.

## Model decisions confirmed this session (Scott's words)
- **travel_personal keeps NO budget bucket** — ad-hoc by nature. Big trips (Dubai,
  Abu Dhabi, Royal Atlantis, Baglioni, Kona) move to **planned Want-To stashes**
  going forward; small spontaneous ones (Gaylord Texan staycation) stay
  travel_personal. Historical $50,558 is "what it is" — do not re-litigate.
- **You do NOT differentiate planned vs ad-hoc on the transaction.** Category
  answers "what kind of spend"; the STASH answers "did we pre-fund it". Different
  axes. No new category, no "unbudgeted" checkbox.
- **"Paid from pot" is the wanted next feature** — one explicit button, no
  inference. Fixes taxes never drawing down, budgeted-trip realization, AND gives
  ad-hoc-vs-planned for free. This is the resolution of the earlier
  "no auto draw-down" decision.
- Saudi German Dubai ($12,297 + $1,906, currently travel) — **leave it.**

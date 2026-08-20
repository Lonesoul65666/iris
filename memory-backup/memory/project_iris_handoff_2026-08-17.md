---
name: project-iris-handoff-2026-08-17
description: "Iris handoff 2026-08-17 — READ FIRST. Big day: stash pacing rewrite, ingest fix (vanishing mortgage), user-reclassifiable types, refund recategorization, dispute lifecycle + 'Needs your call' queue, Pulse visibility. THEN a 5-agent review found ~35 defects incl. 10 money/intent-corrupting; the worst (paycheck→spend in one click) is FIXED. 10 commits pushed to origin/master through 2661e20. HOST UPDATE PENDING — safe to deploy. Remaining defect queue is enumerated below and is the next session's work."
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-19T04:23:45.910Z
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

## 🧨 HISTORY REWRITTEN 2026-08-17 — ALL PRE-REWRITE SHAS ARE DEAD

`scripts/` was purged from **every commit** via `git filter-repo --path scripts
--invert-paths`, then force-pushed. **Verified: 0 objects matching
`expenses-backup|networth-backfill|preimport|scripts/backups` remain in history.**
The ~1.1MB of real transaction backups accidentally committed in the old `1fbbcaa`
is genuinely gone, so the repo is now safe to point a third-party AI (Gemini CLI,
Code Assist) at.

⚠️ **Every sha in this file and all older handoffs is now a historical label, not
something you can `git show`.** Rough map of the new history: `023c8f9` = memory
backup (was `6040a92`), `2028a70` = partial-commit fix (was `4530349`),
`6f6b403` = design docs (was `958a358`). `scripts/` itself is untouched ON DISK
(78 `.mjs` probes still there) and gitignored — only history changed.

⚠️ **THE HOST WILL FAIL ITS NEXT UPDATE.** `C:\ProjectIris\iris` has a clone of the
OLD history, so `git pull --ff-only` (and the "Update Iris" button, which uses it)
dies with a non-fast-forward error. Fix, run once on the host:
`git fetch origin && git reset --hard origin/master`. Not yet done — Scott hadn't
updated the host for `2026.08.17.v2` at the time of the rewrite, so **that pending
update is the moment this bites.**

## 🌙 Even later (same day) — memory backup relocated into the iris repo

Tried a separate `iris-context` GitHub repo first; couldn't create it (no `gh`
CLI, browser tool disconnected). Scott's fix: "can you not create a folder in
Iris or something?" — obviously right. **Moved the whole memory backup into
`Lonesoul65666/iris` at `memory-backup/` (commit `6040a92`), pushed.**
`C:\Claude\projects\iris-context` is now dead — don't reference it as current,
don't push there. One repo, one place, going forward.

## 🌙 Late session (same day) — pushed, HOST UPDATE PENDING for `2026.08.17.v2`

Scott updated the host for `v1`, then this landed on top. **Pushed through
`4530349`; host needs one more update.**

- **`b3a8d98` versioning restored** (see above).
- **`958a358`** — the 5 design docs the backlog cites are now tracked (they were
  untracked, single-copy). `public/*-mockup.html` deliberately still untracked.
- **`4530349` partial-commit fix + `2026.08.17.v2`.** `thisMonthAsk` was
  `committedThisMonth > 0 ? 0 : …` — a boolean where money belonged. Now paces on
  `monthNeeded = needed + committedThisMonth` (so `requiredPerMonth` is STABLE for
  the whole month instead of shrinking as you fund it) and
  `thisMonthAsk = max(0, requiredPerMonth − committedThisMonth)`. New
  `partialCount` + `StashCommitRow.isFullyFunded` separate "a confirm exists" from
  "the month is done." UI: strict toggle broke top-ups (the only way to add was
  undo-and-redo), so part-funded pots now get **"Top up $X"** (`toggleStashCommit`
  gained a `topUp` flag that RAISES the existing confirm) plus a separate undo, on
  both surfaces. Also fixed the false "can never show different numbers" comment.
  **414 tests.**

### ⚠️ I GOT A DIAGNOSIS WRONG — don't repeat it
I told Scott August was partially funded and "Income Taxes is ~$646 short." **It
isn't.** I compared his commits against each pot's `monthlyContribution` ("plan")
instead of the PACED `requiredPerMonth`. Verified by running the real
`computeCommitRun` against live Postgres for Aug 2026: **every committed pot
matches its paced ask exactly** (Insurance 342, Kitchen Table 202, Income Taxes
436, Scott's Office 408, Credit Card Membership 33). Income Taxes = $10,000 target,
$6,082 banked, 9 moves to 2027-04-09 → $436/mo is correct. The only pending pot is
**Savings $336** (no confirm), which already displayed correctly.
**So the bug was REAL but LATENT** — it only bites when Scott commits an amount
different from the offered ask, which he never does because he clicks the button.
⚠️ **`monthlyContribution` is the stale user-entered "plan"; the paced ask is
authoritative.** The card labels it "plan" for exactly this reason.

### Live-data facts learned this session (save re-probing)
- **Scott's bulk categorization did NOT break anything.** 21 buckets $13,397 + 6
  pots $2,403 = **$15,800 exactly**; **zero** blank categories across 2,192 rows;
  **zero** `typeOverride` rows.
- What he hit with "apply this savings amount to this category — it added it to
  it": custom categories `savings` and `weed` exist with **no bucket and no
  transactions**, and all six pots still have `categories: []`. Creating a custom
  category does NOT create a budget bucket, so it lands as an orphan. Nothing
  persisted; nothing corrupted.
- **DB shape gotchas:** pots are stored under collection name **`sinkingFunds`**
  (not `stashes`); **`expenses` is its own TABLE** (2,192 rows), not a
  `collections` name. `computeStashStatus` only reads confirms when
  **`startMonth` is set** (`derived`) — fixtures without it silently get
  `committedThisMonth: 0` and test nothing. All six live pots are derived.
- **The `committedReserves` 🔴 is DOWNGRADED.** The legacy `sf-vacation`/
  `sf-holidays`/`sf-emergency` ids **do not exist** in his data — all six pots are
  `stash-<timestamp>`, which the prefix match catches. Only non-stash lane is one
  `2026-06:investing` $1,000 confirm. So it's ~$1,000 in one month, not ~$13.6k.
  **`VariableSurplusCard:118` is the real source of the inflated "free to deploy."**
- **Fidelity is live but totals-only.** 3 accounts (Abnormal 401k $75,006 ·
  Individual TOD $331,482 · Mimecast 401k $59,782 = **$466,270**), and they DO
  track the market ($436,931 → $466,270 across August). But each account carries
  ONE synthetic holding: `ticker: 'HOLDINGS'`, `shares: 1`, `avgCostBasis ===
  currentPrice`, so **`totalGainLoss` is structurally $0** — any performance view
  built on this is a lie by construction. Cause: `server/plaid-client.ts:108`
  requests `products: ['transactions']` only. Holdings need Plaid's `investments`
  product, which **requires Scott to RE-LINK Fidelity through Plaid Link** — not a
  code-only change. This is the agreed next project.
- Flat stretches in the net-worth trend = days the app wasn't opened (snapshots are
  client-generated — Bucket 2 #3).

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
- ✅ **FIXED + PUSHED `4530349` (`2026.08.17.v2`) — partial commit reported "fully
  funded."** Plus the top-up path. Detail in the late-session section above.
- 🟡 **(DOWNGRADED from 🔴 — verified against live data) `committedReserves` vs
  `computeCommitRun` disagree.** `committedReserves` matches
  `lane.startsWith('stash-')`. The feared legacy `sf-vacation`/`sf-holidays`/
  `sf-emergency` ids **are not in Scott's data** — all six pots are
  `stash-<timestamp>`. Real exposure is one `2026-06:investing` $1,000 confirm, not
  ~$13.6k. Still worth one shared helper (and retired/deleted pots' confirms), but
  it is NOT the source of the inflated "free to deploy" —
  **`VariableSurplusCard:118` is** (backlog Bucket 0 #9).
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

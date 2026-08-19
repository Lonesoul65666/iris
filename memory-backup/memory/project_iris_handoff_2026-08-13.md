---
name: project-iris-handoff-2026-08-13
description: "Iris handoff 2026-08-13 — READ FIRST (with [[project-iris-backlog]]). SHIPPED the Have-To's/Want-To's pacing fix: replaced fractional-calendar pacing with discrete commit-month counting, so pots stop reading 'behind' and drifting daily. Added the commit-run layer (thisMonthAsk + computeCommitRun) and the running 'move this from checking' total on BOTH surfaces. Locked Scott's stash model in his own words. Verified live in browser incl. a commit→undo round trip against the real DB. 357 tests. Two known holes left UNFIXED: no pot links a category (nothing draws down), and VariableSurplusCard 'free to deploy' is inflated."
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-13T05:50:58.236Z
  originSessionId: 8ecf5ce7-c2fd-4f6b-8b9e-475084d971f3
---

# Iris handoff — 2026-08-13 · READ FIRST (+ [[project-iris-backlog]])

## 🚀 SHIPPED — commit `62f87bf` pushed to origin/master (f2a1470 → 62f87bf)
6 source files, 360 tests, pre-commit hook passed. `scripts/` and `docs/` are
untracked in this repo by convention — did NOT add them.
**Host update was still PENDING at end of session** — `C:\ProjectIris\iris` is a
SEPARATE always-on machine (not the dev laptop; confirmed absent here), so Claude
can't drive its update. Scott clicks **Settings → Updates → Update Iris** there, or
`git pull --ff-only && npm install && npm run build` in the app root.
⚠️ **Ordering trap:** the opening-balance DATA edits are already live on the host
(shared Postgres), but the host still runs the OLD pacing math until it updates —
so it shows inflated asks against the new balances. **Update the host BEFORE
committing real moves.**

## 💰 Opening balances applied (Scott, 2026-08-13)
Scott: "I already had the money saved — assume we've been saving since January."
`openingBalance` was 0 on all six pots, so Iris was demanding catch-up on cash that
already existed. Applied = pot's own steady rate (annual total ÷ 12) × months saved
before July tracking began. Script (idempotent, dry-run by default):
`scripts/set-stash-opening-balances.mjs`.
- **Credit Card Membership** $730/yr → $61/mo × 6 (Jan–Jun) = **$365**
- **Income Taxes** $10,000/yr → $833/mo × 6 (Jan–Jun) = **$5,000**
- **Insurance** $3,300/yr → $275/mo × 1 (**June only** — the May payment consumed
  the Jan–Apr savings so this cycle restarted; Scott's "the month before last")
  = **$275**
- Want-tos stay at **0** — genuinely new goals.

**Result: month's ask $2,444 → $1,757.** All three have-tos now read on-track ✓
(CC ask $33, Taxes $436, Insurance $342 — his $350 plan now covers it), and the
"first cycle is short" warning correctly disappeared. Want-tos unchanged
(Office $408, Kitchen Table $202, Savings $336).

**Also locked:** the date IS the dial — moving a want-to's target date re-prices the
ask (Office at Nov = $408, pushed to Feb = **$233**, pulled to Sep = **$815**);
tested. And `steadyStateLine` now suppresses the compression warning when the pot is
on track (it was noise once opening balances covered the first hit).

Supersedes [[project-iris-handoff-2026-08-12]] as read-first (its design locks all
still valid — the rail/persona/quest work is untouched and still next).
Repo `C:\Claude\projects\signal\signal-app` on **master**. **Uncommitted** —
5 modified files + the untracked `docs/`. `tsc` clean, **357/357 tests** (was 341).

Scott's ask: "start with the Have To's / Want To's — I'm committing stuff and the
numbers are looking interesting, I want to figure out why."

## 🐞 The bug (root cause, worth remembering)

**The pacing denominator was continuous calendar time; funding is discrete monthly
commits.** `requiredMonthlyForGoal` and `computeStashForecast` both divided by
`daysToDue / 30.44` — a fraction that shrinks EVERY DAY while the balance only
jumps once a month when you hit commit. So a drip set to exactly hit the goal read
"behind" the next morning, and the "bump to $X/mo" number climbed daily.
**All five goal-bearing pots read behind; requireds were inflated 5–30%**, worst on
short-horizon pots (Insurance $489 vs the honest $434, Office $501 vs $408).

Fix = **`commitMonthsRemaining(due, now)`** — count the MOVES left, this month
inclusive, excluding the due month when the bill lands on the 1st (an October move
can't cover an Oct 1 bill). Regression tests pin that the number is flat across
every day of a month and steps exactly once when the month turns.

## ⭐ Scott's stash model — LOCKED (his words, this is the spec)

- **Have-to's** = a known yearly total; the pot is a **standing monthly payment**
  toward the next hit. Started mid-year → roll it forward over the months left.
  **"Behind" is the wrong frame** — he knows his yearly insurance/taxes/card fee.
  A big check that drops $2,000 at once knocks down the remaining total.
- **Want-to's** = target + a date HE picked → `remaining ÷ moves left`. Recalculates
  **on month boundaries, never by the day**. "If you only do $300 you're gonna have
  to do $400 next month; if you do $450 it should commit less for that final month."
  Picking the date IS choosing the payment size.
- **Savings** = the leftover, not a planned drip.
- **Insurance $3,300 = the ANNUAL total** (two $1,650 payments), steady state $275/mo.
- **Mid-year start → show BOTH numbers** (his pick): "$434/mo over 3 moves left to
  cover Nov 1, 2026" + "First cycle is short — settles to $275/mo after Nov 1, 2026."
  Never grade a pot for what the calendar did.
- **The commit total is LOAD-BEARING, not a summary.** His real workflow: hit commit
  commit commit, add up the total by hand, then transfer exactly that from checking
  into the special savings account. Wanted it shown **at the bottom of BOTH** the
  Have-To/Want-To section AND the budget area that gets committed.
- His words on the old UX: **"I do not like the confusion about commit to show
  change but no indicator or vice versa."**

## ✅ Shipped this session

- **`stashMath.ts`**: `commitMonthsRemaining()`; `requiredMonthlyForGoal` reworked;
  `StashStatus.committedThisMonth`; forecast gains `commitMonthsLeft`,
  `thisMonthAsk`, `steadyStatePerMonth`, `firstCycleCompressed`.
  **`computeCommitRun()`** = the single source of truth (rows + `committedTotal` +
  `remainingAsk` + `pendingCount`) that BOTH surfaces render from, so they can't
  diverge. `thisMonthAsk` self-corrects: overpay → future asks shrink, underpay →
  they grow, once per month.
- **`StashesCard.tsx`**: killed the "behind / bump to $X/mo" copy — it's a payment
  schedule now (`$202/mo × 5 moves left → Dec 15, 2026`). Per-pot **commit button
  ON the card that shows the numbers** (`Commit $434 for August` ↔ `✓ $434
  committed for August · undo`). Footer = the transfer total. Name moved to its own
  row (was truncating to "Credit Car"); $/mo relabelled **"/mo plan"** to
  distinguish plan from ask.
- **`BudgetPulse.tsx`**: takes `commitRun` instead of `stashes`+`committedStashIds`.
  **Fixed a real money bug** — the footer summed each pot's PLANNED fill for
  committed pots, so a $640 move against a $240 plan reported $240, i.e. the wrong
  amount to transfer. Now sums what was actually committed.
- **`BudgetView.tsx`**: builds the run, anchored to the month being VIEWED (paging
  back to July shows July's asks); passes `onCommitStash` to StashesCard too.

**Before → after on the real pots (Aug 12):** CC Membership $77→**$73** (now on
track), Income Taxes $1,132→**$991** (on track), Insurance $489→**$434** (genuinely
short, plan is $350), Office $501→**$408**, Kitchen Table $246→**$202**,
Savings **$336**. Month total asked = **$2,444**.

## 🔍 Two mysteries solved

1. **The $336 "Savings" drip**: 21 buckets = $13,397 + 6 pots = $2,403 →
   **exactly $15,800.00, leftover $0.00.** It's the plug Scott used to close the
   zero-based budget against the guaranteed base. Probe: `scripts/probe-budget-plan.mjs`.
2. **Why everything said "behind"** — see the bug section. Two of the five never were.

## 🚫 Draw-down: DECIDED AGAINST (Scott, same session)

Found that no pot links a category, so nothing ever draws them down. Scott's
answer: **"we definitely don't want to draw down."** Stashes stay **pure
accumulators**; category-linked automatic draw-down is off the table — don't
re-propose it. ⚠️ Consequence left open: a pot still reads fully funded after its
bill is paid, and the legacy `RESERVE_ALLOCATIONS` ($2,000) keep driving the
reserve lane instead of the $2,403 stash plan. If it ever needs solving, the shape
he'd likely accept is an explicit **"paid this bill from this pot"** action, never
category inference.

## 🗑️ Deleted: the "Monthly Auto-Investment" settings panel

Scott: remove the legacy Settings area "if that's not attached to anything."
Deleted the **Monthly Auto-Investment** panel (`SettingsView.tsx`) — a per-ticker
DCA allocation editor (SOXQ/XLK) + a "diversify beyond SOXQ + XLK" nag, straight
from Signal's market-intelligence era. Safe because `monthlyInv.allocations` was
read ONLY by `nextDeploymentBrief` → `IntelligenceView` / `FirstReportView`, both
unreachable behind `PHASE_1_LOCK`. The `amount` IS still live (GoalTracker,
insightsEngine, `calculateBudgetSummary`) so it stays editable as **Your Profile →
Monthly Investment**, which already writes both the profile and the
`monthlyInvestments` store. Verified live: panel gone, no SOXQ anywhere, Monthly
Investment still reads $2,000.

**⚠️ Did NOT delete "Your Profile"** (the other Settings block with tax +
investment fields — likely the one Scott was picturing). It **fails his own
"not attached to anything" test**: `gemini.ts:51-55` feeds all of it into Ask
Iris's context; `AppDataContext:600` retirement projection uses
monthlyInvestment/retirementAge/age; `useHasRealData` gates on name/annualIncome;
`dynamicActions.ts:260,336` uses spouseName/annualIncome; `DashboardView:224` uses
spouseName; OnboardingView writes all of it. A narrower trim (Risk Tolerance,
Retirement Age — investor-only) is available but unasked.

## ⚠️ Found but NOT fixed

1. 🟡 **`VariableSurplusCard` "free to deploy" is inflated.** `:118`
   `setAsideYtd = totalReserveSetAside() * monthsElapsed` = $2,000 × 8 = **$16,000**
   credited against the $2,403 actually committed → understates
   `lumpyBeyondSetAside` → overstates what's free by up to ~$13.6k.

## 🧪 Verification (how it was proven)

- 16 new tests incl. the anti-drift regression and Scott's under/overpay rules.
- **Live in the browser** (Scott logged in; Claude never enters passwords):
  both surfaces showed identical asks, then a **commit → undo round trip** was run
  against the real Postgres — $73 write confirmed in `deployConfirmations`, undo
  confirmed, ledger restored to its original 7 rows with zero August entries.
- Console 404s are all `/api/settings/get/<unset key>` — pre-existing, unrelated.

## Gotchas learned/confirmed
- **`preview_start` resolves `launch.json` from the session root `C:\Claude`**, not
  the app dir — added an **`iris`** config there (`npm --prefix projects/signal/signal-app
  run dev -- --port 5173 --host`). The app-dir `launch.json` is invisible to it.
- `npx tsc` still needs `cd /c/Claude/projects/signal/signal-app` first (squatter).
- Probes added: `scripts/probe-stash-numbers.mjs`, `scripts/probe-budget-plan.mjs`.
- Pattern that worked well: dump real rows from Postgres → run them through the real
  TS math in a scratch vitest file (`--reporter=verbose --silent=false` to see
  `console.log`) → delete the scratch. Beats re-implementing the math in a probe.

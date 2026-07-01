# Budget Engine — how it actually works today (2026-07-01 audit)

The wiring-level truth of Iris's budget engine, mapped by a 5-agent read-only
audit. This is the reference for the "how the budget is set up + displayed"
redesign. Paired with a prioritized findings/bug queue at the end.

**The intended model (Scott's north star):** the budget is a TAKE-HOME view.
The guaranteed monthly base (~**$15,800** net) is the frame. Allocate it to **$0**
— every dollar gets a job (a spend cap or a destination). Landing under = the
win. **Variable/bonus/commission/RSU and the work float are SEPARATE and must
never dilute the $15,800.** Reimbursements (Coupa) are work-expense payback, not
income.

---

## 1. Income & the $15,800 base

- **Base is a statistical MODE, not a tagged value.** `computeGuaranteedBase`
  (`src/utils/savingsScorecard.ts:31-53`) filters to `flow==='inflow' &&
  transactionType==='income'`, takes the modal paycheck (rounded to $50), and
  multiplies by `perMonth = round(income.length / distinctMonths)`. Comment:
  `$7,917 × 2 ≈ $15,800`.
- **Teller imports never set `incomeSubtype`** (`server/teller-map.ts:344-387`
  only set `transactionType`). So the base/variable subtype taxonomy that exists
  in the types is unused by real data — the base is heuristic-only. A parallel
  classifier in `incomeDetector.ts` / `IncomeSources.tsx` recomputes base for the
  *display* panel but does NOT feed `computeGuaranteedBase` or the paycheck.
- **`netTakeHome` is the allocation target.** BudgetView seeds it once from
  `computeGuaranteedBase` (`BudgetView.tsx:379-390`, only when paycheck is 0/0),
  sets `grossMonthly = base / 0.72` (hardcoded 28%-deduction assumption), and
  leaves 401k/HSA/tax at 0. `unallocated = netTakeHome − Σ caps`
  (`BudgetView.tsx:454-455`) is the "every dollar has a job" engine.
- **Variable held out** in three agreeing places: `computeGuaranteedBase` (mode),
  the detector's base±variable split (`incomeDetector.ts:342-402`,
  `includeInBudget:false` for variable/bonus/reimbursement), and
  `VariableSurplusCard`'s above-floor sums. **Reimbursements excluded** from income
  at `transactionAnalysis.ts:150` and budgetable income at `incomeDetector.ts:528`.

## 2. Buckets, caps, lanes, actuals

- **Bucket** (`src/types/budget.ts`): `{ category, label, monthlyBudget (cap),
  monthlyActual (DERIVED, never persisted), ... }`. Defaults ship at
  `monthlyBudget:0`; `sampleBudgetBuckets` (real numbers) load only via Settings.
- **Lanes** (`src/utils/budgetLanes.ts`): `fixed` (bills; over only past ×1.15),
  `flexible` (discretionary; over the moment actual>budget), `reserve`
  (taxes/travel; never a monthly "over", funded by set-asides). Default fall-through
  is **flexible**. `investing` is in `FIXED_CATEGORIES`. Reserve membership is
  reconfigured at runtime by Stashes (`configureStashLanes`).
- **Actuals — two kinds:**
  - `buckets` state carries the **blended multi-month AVERAGE** (`computeCategoryAverages`
    → `applyTransactionsToBuckets`, `transactionAnalysis.ts:184-222`).
  - `overviewBuckets` is **month-specific** (`applyMonthToBuckets`) for a selected
    month, using historical targets; falls back to `buckets` (averages) for
    'avg'/'latest'. Most tiles/summary derive from `overviewBuckets` (correct).
- **Targets are versioned** (`src/utils/budgetHistory.ts`, append-only snapshots);
  a past month is judged against the caps in effect then. **Lane membership is
  NOT versioned** — reconfiguring stashes rewrites past operating/reserve splits.
- Nothing enforces caps summing to $15,800; `unallocated` is display-only.

## 3. Work-expense segregation

- **Classification:** Teller stamps `isWorkExpense:false` always and carries
  work-ness ONLY via `category:'travel_work'` (airlines/hotels/rental/airport, via
  `classifyBankTransaction`). CSV/manual uses `guessWorkExpense()` (flag) +
  `guessCategory()`. `isWorkSpend` (`transactionAnalysis.ts:38-40`) = `isWorkExpense
  || category==='travel_work'` — the one definition.
- **Single dollar-removal point:** `computeMonthlySpending:161-165` routes work
  outflows to `totalWork` + `byCategory['travel_work']` and `continue`s — they
  never reach `totalExpenses`/operating/personal categories. Every downstream
  surface re-excludes an already-zeroed value (belt-and-suspenders, **not** a
  double-subtraction of dollars — this was explicitly ruled out).
- **Reimbursements:** typed `reimbursement` on import, routed to
  `totalReimbursement` (never income). `WorkReimbursementsCard` is display-only,
  not wired into budget math. Scorecard `banked`/`surplusVsBase` are work-free — clean.
- **The real leak:** over-broad AUTO-classification (see BUG-W1) hides *personal*
  trips in the work bucket → removed from "what we spent." Not double-counting —
  mis-classification dropping personal spend.

## 4. Investing

- The monthly $1,000 is a **Settings value force-written as the bucket's
  `monthlyActual`** in ~4 places (`BudgetView.tsx:241, 307, 314, 369`);
  `applyMonthToBuckets` deliberately skips investing (`transactionAnalysis.ts:240-242`).
  So `investingAmt` is ALWAYS $1,000 — even on day 1 of a fresh month, before it drafts.
- **The confirm system is cosmetic.** `deployConfirmations` + `toggleInvestConfirm`
  drive only the Money Map slice's dashed/solid styling; the docstring admits
  "confirming doesn't change the math" (`MoneyMap.tsx:13-14`). Five surfaces count
  the $1,000 as banked regardless: Money Map "Free", Pulse "$1,000/$1,000 ON TRACK",
  Savings Rate tile, dashboard summary, "On Pace to Save". Only the **scorecard** is
  honest (derives from real txns).
- **Real Fidelity transfer is imported but ignored** — `transactionType:'investment'`
  goes to `totalInvestments` and `continue`s (`transactionAnalysis.ts:127`), never
  reaching the investing bucket. The promised feed-validation isn't wired.

## 5. Display surfaces & their denominators (the confusion)

| Surface | Value | Denominator |
|---|---|---|
| Money Map | base − everydaySpent − investing − reserves = free | **$15,800** ✅ (the correct frame) |
| Budget Pulse header | Σ actual / Σ operating caps | **~$13,227**; its own sub-line uses $15,800 |
| Dashboard donut | spend / operating caps (excl. investing too) | **~$12,200** |
| Safe to Spend | takeHome − fixed − reserve − flexSpent | **$15,800** (different partition than Money Map) |
| Net Take Home / Monthly Spend / On Pace tiles | vs netIncome | **$15,800** |
| Savings Rate tile + Housing Ratio sub-score | / grossMonthly | **~$21,900 gross** |
| Cash Flow / Surplus sub-scores | vs net | **$15,800** |
| Scorecard | surplusVsBase ($15,800) AND banked (full income incl. variable) | **two frames in one card** |

**Money Map is the only correct single frame.** The fix is to make the other
surfaces consume its $15,800 partition (or explicitly label themselves as
detail/gross), rather than each recomputing its own denominator.

---

## Findings & bug queue (prioritized)

### P0 — Reality-diluting (make "what we have to spend" wrong; Scott flagged both)
- **BUG-INV1 — Investing shows "done" before it drafts.** $1,000 force-written as
  actual; confirm is cosmetic; counted as banked on 5 surfaces. Fix: one resolver
  `investingActual(month) = confirmed ? planned : (this month's real investment
  txns, else 0)`; stop force-writing `monthlyActual`; wire feed-validation.
  (§4; call sites listed in the investing audit.)
- **BUG-W1 — Work auto-classifier hides personal spend.** Any hotel / `airport` /
  `uber *trip` / rental auto-flags `travel_work` → removed from spend → Safe-to-
  Spend & Monthly Spend too generous; personal spend hides in the work bucket that
  never gets reimbursed. This is the "siphoning" feeling. Fix: tighten the
  classifier + surface a "review auto-flagged work" list (the inline Move button
  already exists). **Confirm with data:** Σ `(travel_work OR isWorkExpense) AND
  reimbursementStatus='not_reimbursable'` per month vs Coupa inflows — a growing
  gap = personal spend siphoned in.

### P1 — Coherence / the "spouse test" ($15,800 as the one number)
- **DENOM — Unify every surface on Money Map's $15,800 partition.** Pulse header
  ($13,227 + a conflicting $15,800 sub-line), Dashboard donut ($12,200), and the
  gross-vs-net split inside Budget Health all disagree. (§5)
- **SPEND-SPLIT — Monthly Spend tile includes investing; Money Map "everyday"
  excludes it** → two "spend" numbers on one page differ by ~$1,000. Pick one rule.

### P2 — Accuracy of derived numbers
- **GROSS — `grossMonthly = base/0.72`** assumes 28% deductions; real ~47%, so gross
  is ~$21,900 vs real ~$30,000 → inflates savings rate, deflates housing ratio.
- **HOUSING-AVG — housing ratio uses the blended average**, not the selected month
  (`BudgetView.tsx:464`) — off when navigating months.
- **BASE-DRIFT — base can drift:** `perMonth = round(count/months)` counts every
  inflow (extra variable deposits can round 2→3 and over-multiply); and
  `netTakeHome` is frozen after first derive (won't update if pay changes).
- **LANE-VER — lane membership isn't versioned** — linking a category to a stash
  retroactively rewrites past months' operating/reserve split + scorecard.

### P3 — Latent / edge
- **CAP0 — zeroed caps are invisible to the "over budget" count** — spend in an
  unbudgeted flexible category never flags.
- **TAX-UNDER — reserve under-funds taxes** (~$1,000 set vs ~$1,400 real).
- **BUG-W2 — Teller work is `not_reimbursable`** → the reimbursement matcher can
  never close it (matcher may be dormant — confirm callers).
- **BUG-W3 — WorkReimbursementsCard "reimbursed" rule is looser** than budget math
  (counts `travel_work` inflows) — cosmetic divergence.
- **LANE-DUP — `travel_work` double-membership** (reserve lane + name filters) is a
  latent regression hazard if someone removes it from `RESERVE_CATEGORIES`.
- **COUPA-REGEX — reimbursement exclusion depends on `REIMBURSEMENT_HINT` matching**
  the bank description; a miss would leak Coupa into income + base. Verify real descs.

### Explicitly ruled OUT
- Double-counting/double-subtraction of work dollars (single removal point).
- Reimbursements leaking into income/base (excluded across all layers).

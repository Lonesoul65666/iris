# Iris Budget Numbers Audit — 2026-06-14

## Executive Summary

This audit recomputed Iris's headline budget numbers independently from the live data (1,786 expense transactions, full months Sept 2025–May 2026) and traced every discrepancy to a file:line root cause. The dashboard is honest about net worth and import integrity — the $544,574 net-worth hero reconciles to the penny, and not a single dollar of the $105,291 in account transfers leaks into any spend total. But four high-severity number bugs systematically read **rosy**: (1) the "Living under the guarantee" scorecard judges discipline on operating spend only, hiding $57,078 of taxes/travel reserve spend, so it shows green 9/9 months when the honest count is 3/9; (2) the variable-pay "sweep the rest" tile false-detects a pay change on 2026-04-30 and silently discards ~$17.3k of real YTD surplus ($16,495 shown vs $33,816 true); (3) the cash-flow bar mixes a half-month of spend against a full month of income, overstating "left this month" by roughly half a paycheck (~$7,940 shown on June 15 when the like-for-like figure is roughly break-even or negative); and (4) the investing budget shows $20 against a real $1,000, while the savings-rate alarm fires "critical 5%" because pre-tax 401k/HSA are recorded as $0. The fix queue below is ordered by dollar distortion.

---

## CONFIRMED Findings (high → low)

### HIGH

#### 1. Scorecard "under base" verdict counts operating spend only — 6 over-base months show green
**Displayed vs actual:** The scorecard reads "Under base 9/9 months" with every monthly bar green and an all-positive banked-since strip. Recomputing total real personal spend (operating + reserve lanes + investing) against the $15,800 base, only **3/9** full months were genuinely under base. The six over-base months and their true surplus: 2025-11 −$529, 2026-01 −$12,817, 2026-02 −$12,611, 2026-03 −$4,756, 2026-04 −$8,478, 2026-05 −$1,937 (sum of overage ≈ **−$41,128**). The under-base months: 2025-09 +$3,097, 2025-10 +$2,639, 2025-12 +$2,170. The hidden reserve spend the discipline number never sees totals **$57,078** ($40,354 personal travel + $16,724 taxes ≈ $6,342/mo). A $13k tax payment costs $0 in the discipline number.
**Root cause:** `src/utils/savingsScorecard.ts:96` — `surplusVsBase: Math.round(base - m.totalOperating)`. `computeMonthlySpending` (`src/utils/transactionAnalysis.ts:155-160`) routes reserve categories (taxes, travel_personal, travel_work — `src/utils/budgetLanes.ts:33-35`) into `totalReserve`, never `totalOperating`, and investments out entirely. The downstream count (`savingsScorecard.ts:106`) and the green/red bars + X/Y display (`src/components/Dashboard/SavingsScorecard.tsx:45,65`) all inherit the operating-only verdict.
**Recommended fix:** Make the verdict match the label. Honest option: add `totalRealSpend = totalOperating + totalReserve + totalInvestments` and compute `surplusVsBase = base - totalRealSpend` at `savingsScorecard.ts:96` (yields 3/9, matching reality). If reserves are meant to be pre-funded from a separate set-aside, subtract that monthly set-aside from base (`base − reserveSetAside − operating`) rather than silently dropping lumpy reserve spend. Surface reserve spend in the bar verdict, not just the tooltip. Keep `banked` (line 97) as-is — it already counts everything and is honest.
*Verifier: real, high confidence — recomputed from the live feed; per-month figures matched to the dollar.*

#### 2. Variable-pay tile false-detects a 2026-04-30 "pay change," dropping 7 months of YTD surplus
**Displayed vs actual:** Card shows **+$16,495** YTD above base, floor $7,917.63 labeled "(detected from 3 paychecks since 2026-04-30 — pay change detected)," counting only the 4/30, 5/15, 5/29 paychecks. True 2026 YTD over-base is **$33,816** (floor $7,306.99) or $28,319 (floor $7,917.63 modal base); all-time is $56,511. The card omits Jan–Apr surplus entirely (Jan $2,890 + Feb $8,001 + Apr $2,970), understating true YTD by **~$17,321**. The base is steady ~$7,917 every month — the 4/30 "pay change" is a false positive.
**Root cause:** `src/components/Budget/VariableSurplusCard.tsx:87-101` — the band loop treats any >6% consecutive diff (line 93) as a pay-band break needing `MIN_BAND_SIZE>=3` (line 95). Scott's pay is semi-monthly: a base-only mid-month check (~$7,917) alternates with a base+variable end-month check ($10k–$22k), so nearly every consecutive diff exceeds 6% (observed 35.9%, 34.7%, 133.4%…). The walk stops at index 15 (2026-04-30), slices to that band (line 103), and the YTD sum (lines 121-131, iterating `currentBand.paychecks`) discards everything before 4/30.
**Recommended fix:** Replace consecutive-diff detection with a robust recurring-base floor: (1) floor = modal/low-cluster recurring paycheck (median of the bottom ~40% in a trailing window → the $7,917 cluster), not min-of-current-band; (2) sum over-base across ALL base paychecks in each window — change `sumAboveFloor` (lines 123-126) to iterate `paychecks`, not `currentBand.paychecks`; (3) only break the floor on a sustained level shift in the recurring-low cluster, not a single >6% jump. Keep the headline as true full-year YTD; when a genuine base raise is detected, ADD a secondary "since pay change" line rather than truncating. Consider a "Free to deploy" tile = banked YTD over-base minus already-swept, plus a forward run-rate (~$5.7k/mo trailing) so Scott can size vacation/reno sweeps.
*Verifier: real, high confidence — replicated the exact band algorithm against the live feed; $33,814 vs $33,816 (rounding), understatement $17,319 vs $17,321.*

#### 3. Cash-flow bar mixes time axes — MTD spend vs full-month income/investing overstates "left this month"
**Displayed vs actual:** "Cash flow this month → $7,940 left this month"; bar = Spent ~$6,860 / Investing $1,000 / Left ~$7,940 (June 15). The $7,940 is mostly "the month isn't over." Income ($15,800) and investing ($1,000) are full-month; spent ($6,860) is only month-to-date (~half the month). Recurring flex spend (groceries $524, dining $568, childcare $768) roughly doubles by month-end. Like-for-like: at frac=0.40 (June 12, latest txn) MTD-vs-MTD surplus = −$940 (projected full-month −$2,350); at frac=0.50 ≈ +$540 to +$1,080. The bar overstates uncommitted cash by roughly **$7,000–$10,000** — about half the take-home.
**Root cause:** `src/views/DashboardView.tsx:394-396` — `mtdSpent = monthToDate.totalOperating` (month-to-date, `transactionAnalysis.ts` groups by txn date) is subtracted from `budgetSummary.netIncome` (`paycheck.netTakeHome`, full month, `budgetDefaults.ts:384`) and `budgetSummary.investing` (full month, `budgetDefaults.ts:374-375`). Three time windows in one equation. `CashFlowBar` (`DashboardView.tsx:594-598`) renders the mismatch.
**Recommended fix:** Make all three terms the same window — either prorate `netIncome` and `investing` by `today.getDate()/daysInMonth` before computing surplus, OR relabel honestly to "left so far" and show on-pace math (projected month-end spend = `mtdSpent / fractionElapsed`). Do NOT swap `mtdSpent` for the full-month bucket actual — that reintroduces the multi-month-average problem the MTD rewrite intentionally fixed.
*Verifier: real, high confidence — every term reproduced from live data; $7,940 reproduces to the dollar, overstatement ~half the monthly take-home in the user's favor.*

#### 4. Investing bucket shows $20 budget while cash-flow counts $1,000 — a 50x gap
**Displayed vs actual:** Bucket budget column shows **$20**; dashboard cash-flow counts **$1,000** investing. `monthlyInvestments.amount = 1000` is authoritative; cash-flow is right (but only by accident), the $20 budget is stale.
**Root cause:** Cash-flow reads `investingBucket.monthlyActual` (`budgetDefaults.ts:375`, set to 1000 by the sync). The bucket card renders `monthlyBudget` (`BudgetView.tsx:1323`), which the sync sets in memory only and never persists (`AppDataContext.tsx:342-343`, `BudgetView.tsx:228-234`). On historical months `applyMonthToBuckets` overrides `monthlyBudget` from the budgetTargets snapshot = 20 (`transactionAnalysis.ts:226-227`). The 20 is a fat-finger: 2026-06-14 budgetTargets snapshots go 1000 → 2 → 2000 → 200 → 20, each keystroke firing `saveBudgetBuckets` then `snapshotBudgetTargets` (`budgetStore.ts:137-139`).
**Recommended fix:** (1) `transactionAnalysis.ts:226-227` — return the investing bucket unchanged (don't apply historical target). (2) Exclude investing from snapshots in `targetsOf` (`budgetHistory.ts:23-26`). (3) Repair the persisted buckets row 20→1000. (4) Make the investing budget input read-only (`BudgetView.tsx:1323`). (5) Invert `budgetDefaults.ts:375` to prefer `monthlyInvestmentAmount` over the bucket fields so cash-flow is right by design, not coincidence.
*Verifier: real, high confidence — live data confirms the 50x split; whether the card literally shows $20 vs $1,000 depends on the selected month (in-progress months get the in-memory $1,000; completed months replay the snapshot $20).*

#### 5. Savings-rate alarm blind to pre-tax 401k and HSA — fires "critical 5%" on a floor, not the real rate
**Displayed vs actual:** Savings rate shows **5%, marked critical** ("saving $1k/mo"). The paycheck record has gross $21,944, net $15,800, but `retirement401k = 0`, `hsaContribution = 0`, and every deduction field = 0 — leaving **$6,144/mo of gross unallocated**. Displayed: (1000+0+0)/21944 = 4.56% → rounds to 5% → critical. With 401k $658/mo: 7.6% (still critical). Adding HSA $692/mo: **10.7% → flips critical to warning**. The real rate is unknowable from the data; 5% is a floor, not the truth.
**Root cause:** `src/utils/insightsEngine.ts:220-221` (and duplicated at 523-525) sum `retirement401k + hsaContribution`, both 0. Same blind spot in `calculateBudgetSummary` (`src/stores/budgetDefaults.ts:378-379`) and a third copy at `BudgetView.tsx:415-416`. Income-wiring set gross and net but left the pre-tax breakdown at zero.
**Recommended fix:** Populate `retirement401k` (~$658) and `hsaContribution` (~$692) from real pay-stub numbers and allocate the $6,144 gap into the real deduction fields. Interim guard in `checkSavingsRate` (and the two duplicate call sites): when both 401k and HSA are 0 AND gross−net is large, emit an info note that pre-tax savings aren't visible and 5% is a floor — not a critical alarm. Extract the savings-rate formula into one shared helper to kill all three copies.
*Verifier: real, high confidence — confirmed via API: every deduction field is 0, $6,144/mo unallocated; the 5% critical alarm drives wrong advice (telling Scott to start a 401k he may already fund).*

### MEDIUM

#### 6. Scorecard trend line also runs on operating-only spend
**Displayed vs actual:** Footer reads "Trend: spending less/more (operating $X vs $Y)." Example: 2026-04 operating was only $9,999 (looks like the best month) while its reserve spend was $14,279 (total $24,278, ~$8.5k over base). The trend can call a month with a massive tax/travel outflow "spending less."
**Root cause:** `src/utils/savingsScorecard.ts:111-115` compares `lastFull.spend` vs `priorFull.spend`, where `spend = m.totalOperating` (line 94). Rendered at `SavingsScorecard.tsx:69`.
**Recommended fix:** Point the trend at the same total real spend as the corrected under-base verdict so headline, bars, and trend tell one story. At minimum, label it "operating spend" so it isn't mistaken for total.

#### 7. Travel stash has an empty name string — renders as a blank, unlabeled pot
**Displayed vs actual:** The Travel stash card shows a $921.60 balance with an EMPTY name field; only the linked "Travel (Personal)" chip hints at what it is. The math is fine ($1,000 contrib, $78.40 drawn in June); only the label is missing.
**Root cause:** Data, not code — `collections/sinkingFunds` key `stash-travel` has `data.name === ""` (seed at `stashMath.ts:147` would set "Trips & Travel"; later overwritten to empty). `StashesCard.tsx:98` renders whatever is stored.
**Recommended fix:** PATCH the `sinkingFunds` record `stash-travel` with `data.name = 'Trips'` (Scott's preferred term). Optionally add a placeholder fallback in `StashesCard.tsx` so future blank-outs are visually obvious.

#### 8. In-code reserve constants still seed $1,500 taxes — contradicts the live $1,000 and re-seeds wrong
**Displayed vs actual:** Live stashes are Taxes $1,000/mo and Travel $1,000/mo (correct). But `budgetLanes.ts:40-44` `RESERVE_ALLOCATIONS = { taxes: 1500, travel_personal: 1000, travel_work: 0 }` and `seedDefaultStashes` (`stashMath.ts:139-150`) seed Taxes at $1,500. If the Taxes stash were ever deleted, the seed would silently revert Scott's $1,000 to $1,500.
**Root cause:** `budgetLanes.ts:40` (stale seed value); consumed at `stashMath.ts:139-143`; assertion at `stashMath.test.ts:135` expects 1500.
**Recommended fix:** Decide the canonical set-aside. Real taxes spend is ~$16,724 over 4 months ≈ $1,400/mo amortized, so $1,000/mo under-funds taxes long-term. If $1,000 is intentional, update `budgetLanes.ts:41` to `taxes: 1000` and the test to expect 1000. If ~$1,400 is right, raise the live Taxes stash. Align the constant, seed, and test either way.

#### 9. US Treasury payment — row is right (taxes), saved mapping is stale (other)
**Displayed vs actual:** The drift scanner flags "US TREASURY PMNT": the saved merchant mapping says `category=other`, the live row says `taxes` — the scanner implies the row is wrong. Actually the **row is correct** ($13,715 Treasury payment IS taxes); the mapping is stale and was never refreshed from the `other` default. Largest drift by dollars, but safe direction.
**Root cause:** `scan-category-drift.mts:19` assumes mapping = truth; here it's inverted. The merchant mapping entry has `category: other`.
**Recommended fix:** Set the saved mapping for the US Treasury merchant to `taxes`; leave the row. The scanner should report drift direction, not assume the mapping is authoritative.

### LOW

#### 10. Two reimbursement income-sources flagged `includeInBudget: true`
**Displayed vs actual:** `incomeSources` has two reimbursement sources (Coupa 3028, Abnormal Ai Inc 3040) with `includeInBudget: true`. `monthlyBudgetableIncome` (`IncomeSources:236`) adds any `includeInBudget` source regardless of subtype. Zero leak today (both cadence irregular → `monthlyEquivalent` returns 0), but a real gap if re-cadenced. Sibling `totalMonthlyAll` (line 238) guards `subtype reimbursement`; `monthlyBudgetableIncome` does not.
**Root cause:** `incomeDetector:521` only checks `includeInBudget`, never excludes `subtype reimbursement` (default false at line 126; two rows overridden to true).
**Recommended fix:** Guard `subtype reimbursement` in `monthlyBudgetableIncome`; data-fix the two rows to `includeInBudget: false`.

#### 11. Recent-activity widget filters on flow only — an outbound transfer can render as fake spend (dormant)
**Displayed vs actual:** The Recent-activity card shows the 5 most recent `flow === outflow` rows as `-amount`, as if purchases. Today the top 5 are genuine expenses (June has no outbound transfers), so nothing wrong shows now. But the filter doesn't exclude `transactionType: transfer` — the 30,000 savings-to-checking on 2026-04-02 would have appeared as −$30,000, as would the three Jan $20,000 moves and the $400/$1,000 spouse-Zelle transfers. Cosmetic only; does NOT feed any spend total.
**Root cause:** `src/views/DashboardView.tsx:129` filters on `flow` only. Compare `ExpenseManager.tsx:576`, which correctly requires both `flow outflow` AND `transactionType expense`.
**Recommended fix:** Add the `transactionType` guard at `DashboardView.tsx:129` (or reuse `isRealExpense` from `transactionAnalysis.ts:33-35`) so refunds/transfers/investments stay out of the spend-styled feed.

#### 12. Both active stashes have `targetAmount: 0` — GoalTracker progress bar never renders
**Displayed vs actual:** Taxes and Travel cards show a balance but no progress bar; the Goal field reads $0. Expected, not a bug — `computeStashStatus` returns `targetProgress = null` when `targetAmount <= 0` (`stashMath.ts:86`), and `StashesCard.tsx:122` only renders the bar when non-null. But it means the stashes give no funding-vs-goal signal yet.
**Root cause:** Data — `stash-taxes.targetAmount = 0` and `stash-travel.targetAmount = 0` (no code defect).
**Recommended fix:** Scott sets realistic targets via the Stashes card (Settings → Goal). No code change required.

---

## Investigated, Not Real

No findings were refuted by the adversarial verifier. Every high-severity finding carried a `real: true` verdict. Several dimensions were verified **clean / working as intended** and are worth recording so they aren't re-litigated:

- **Net worth hero ($544,574) is correct** — independent recompute = $544,574.12 to the penny (liquid $161,440.12 + equity $0 + home equity $183,134 + car $200,000). `AppDataContext.tsx:519`. The $5,400 drop from the 06-10 snapshot is explained by Scott editing homeValue 590,000→585,000, not a math error. (Note: equity = $0 because the `equity` collection is empty — unvested/vested Abnormal RSUs are absent; worth flagging given a likely equity event.)
- **Investing is NOT double-subtracted in the cash-flow bar** — the documented fix is correctly in place; `computeMonthlySpending` books investment-type rows to `totalInvestments` and `continue`s (`transactionAnalysis.ts:115`), so subtracting `investing` once is right.
- **mtdSpent composition is clean** — June operating recompute = $6,860.39; correctly excludes work ($923.66 → travel_work), reserve ($78.40 → totalReserve), transfers, investments, and reimbursements ($4,292.09 Coupa → totalReimbursement). The only problem with `spent` is the time-axis mismatch (finding #3), not its composition.
- **Import integrity is clean** — the $105,291.14 in 19 transfers never reaches any spend total; the single chokepoint `computeMonthlySpending` (`transactionAnalysis.ts:114`) discards transfers before they touch any aggregate. The Dubai ATM savings-withdrawal expenses (23 rows, $4,137.49 — larger than the prior ~$1.6k estimate) count exactly once: no duplicate ids/tellerTxnIds, none mis-typed as expense.
- **Safe-to-Spend reconciles** — $15,800 − $9,417 fixed − $2,000 set-aside − $1,648 flex = $2,735, reserve counted once.
- **Stash math reconciles** — Taxes $1,000 (0 + $1,000×1 − $0) and Travel $921.60 (0 + $1,000×1 − $78.40) match the formula exactly; both linked categories correctly sit in the reserve lane, so no false monthly over-budget alarm.

---

## Fix Queue (biggest distortion first)

1. **Scorecard under-base verdict (#1)** — flip operating-only to total real spend at `savingsScorecard.ts:96`. Biggest distortion: hides $57,078 of reserve spend, flips 6 months green→red, turns 9/9 into the honest 3/9. Highest-trust dashboard claim is the most wrong.
2. **Variable-pay band detection (#2)** — replace consecutive-diff detection with a modal-low floor and sum across all base paychecks (`VariableSurplusCard.tsx:87-131`). Silently discards ~$17.3k of real YTD surplus Scott would deploy toward vacation/reno.
3. **Cash-flow time-axis mismatch (#3)** — prorate income/investing or relabel to "left so far" (`DashboardView.tsx:394-396`). Overstates "left this month" by ~half a paycheck ($7k–$10k) mid-month.
4. **Savings-rate 401k/HSA blindness (#5)** — populate `retirement401k`/`hsaContribution` and guard `checkSavingsRate` (`insightsEngine.ts:220-221` + two duplicates). Confidently-wrong critical alarm driving wrong advice; allocate the $6,144 gap.
5. **Investing budget $20 vs $1,000 (#4)** — stop applying the historical target to investing, exclude it from snapshots, repair the row to $1,000, make the input read-only (`transactionAnalysis.ts:226-227`, `budgetHistory.ts:23-26`, `BudgetView.tsx:1323`, `budgetDefaults.ts:375`). 50x display gap; cash-flow currently right only by accident.
6. **Scorecard trend line (#6)** — point trend at the same total real spend as the corrected verdict (`savingsScorecard.ts:111-115`). Should land with #1.
7. **Reserve constant $1,500 vs live $1,000 (#8)** — align constant/seed/test (`budgetLanes.ts:41`, `stashMath.test.ts:135`); decide canonical taxes set-aside (note $1,000 likely under-funds vs ~$1,400/mo actuals).
8. **US Treasury mapping drift (#9)** — set saved mapping to `taxes`; make scanner report drift direction (`scan-category-drift.mts:19`).
9. **Travel stash blank name (#7)** — PATCH `stash-travel` `data.name = 'Trips'`; add placeholder fallback.
10. **Reimbursement income guard (#10)** — guard `subtype reimbursement` in `monthlyBudgetableIncome`; data-fix two rows to `false`.
11. **Recent-activity transfer leak (#11)** — add `transactionType` guard at `DashboardView.tsx:129` (cosmetic, dormant).
12. **Stash targets = $0 (#12)** — Scott sets real targets to light up GoalTracker (no code change).

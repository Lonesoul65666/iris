# Iris — what's left, written 2026-08-19

Input for the next session. Three lists, then the Amazon item-level investigation.

State at time of writing: pushed through `2748d87`, ships `2026.08.19.v2`, **host
update pending**. 443 tests.

---

## 1. MUST DO — money or stored data is wrong, or at risk

Ordered by damage.

- **Amend policy for late data.** The settle lag (`9f6dabb`) stops a month being
  judged too early, but does NOT handle data landing *after* judgement. A $3k
  charge posting on day 5 makes the "beat the clock" earned on day 4 wrong — and
  the idempotency key blocks it from ever being corrected. **This is the missing
  half of the fix I just shipped.** Needs: detect a settled month whose total
  moved, then either re-open or explicitly supersede the record.
- **Explain the 3-day "in progress" window.** Same commit made the just-ended
  month read *in progress* until day 4. Nothing tells the user why, so it looks
  like a bug. One honest sentence ("holding August until charges settle") turns a
  constraint into a feature. Backlog already wanted this beat.
- **`GoalTracker.tsx` is a THIRD pacing surface.** Runs the OLD pacing math plus
  a UTC date parse that loses a month in a `-06:00` timezone, under the same
  section title as the budget page. Two surfaces can state different things about
  the same pot.
- **`past_due` behaviour.** Sets `thisMonthAsk` to the pot's whole balance (one
  giant commit button) and fires early — `daysToDue` uses `Math.round`, so it
  flips around lunchtime the day before.
- **The `$NaN` path.** A malformed `targetDate` makes `nextDueDate` return an
  Invalid Date, which is truthy; every guard passes (`NaN <= 0` is false), the
  card renders `$NaN`, and autofill **persists NaN as null**.
- **Paging the Pulse backwards shows FUTURE money.** Balances sum confirms from
  all months while draws are capped at today, so viewing July can read as funded
  off an August commit. Fix: filter `deployConfirms` to `c.month <= pulseCommitMonth`.
- **`isCashOut`'s bare `withdrawal` substring beats the payee guard.** An
  `ELECTRONIC WITHDRAWAL … CRCARDPMT` would count as SPEND. Dormant only because
  Wells Fargo spells it `WITHDRWL` — **live the moment a non-BoA checking is linked.**
- **`typeOverride` is a one-way latch.** Nothing ever writes `false`, so once a
  row's type is hand-edited its type+flow are frozen forever. Fix: store the
  feed's type and latch against it.
- **`recategorize.ts` ignores `typeOverride`** → running it with `?all=1` reverts
  the very override the sync SQL protects.
- **Deleting a disputed charge orphans its credit.** `disputeCreditFor` points at
  a dead id, the credit is suppressed forever, and there's no UI path back
  (the badge only renders when `disputeStatus` is set, which a credit never has).
  SQL is currently the only exit.
- **`totalDisputed` is computed and displayed NOWHERE.** On the open-dispute path
  the money genuinely vanishes from every surface.
- **The dispute staleness nudge does not exist.** It's amber text in a queue, not
  a `Nudge`. This is the one part of Scott's "what's my reminder recourse"
  question that was never answered.
- **TEMU is inside the `amazon` bucket** — 8 rows, $111.43 (found 2026-08-19).
  Small money, but it is literally "spend hidden in the wrong place". Needs a
  Temu category (or `shopping_other`) and a classifier rule.
- **`stashAllocationsByCategory` splits a pot's contribution evenly across its
  categories** and the comment calls the dollar split "advisory". It stops being
  advisory the instant categories get linked, because it feeds
  `getReserveAllocations()`.
- **Drop the dead `_expenses` param** from `computeStashStatus` /
  `computeAllStashes` / `computeCommitRun` (29 call sites; the compiler will find
  them all).
- **SCOTT'S TASK: link categories to pots.** Safe now that draw-down is explicit.
  This is what switches the reserve lane from the $2,000 legacy constant to the
  real $2,403.

---

## 2. LIKE TO DO — real value, nothing is broken

- **Amazon item-level ingestion** (see section 4 — this is the interesting one).
- **Coinbase → net worth.** ⚠️ Must re-baseline the milestone floor when the
  contributing-account set changes, or connecting an account false-fires a
  celebration for money already held.
- **Robinhood → net worth.** Same re-baseline guard.
- **Multi-line toggleable investment chart** (cash / Fidelity / Coinbase /
  Robinhood). Scott's genuinely excited about this one.
- **Fidelity holdings.** OPTIONAL, not required — net worth already works. Only
  buys positions / allocation / real gain-loss, and needs Scott to re-link
  through Plaid Link for the `investments` product.
- **Mobile / responsive.** Confirmed cramped at 361px. Deprioritised behind the
  guts by Scott's own rule, but it gates whether the thing gets used on a phone.
- **A visual pass.** Scott: "it could be so much more professional and awesome."
  The month-by-month wave chart is explicitly the part he likes — that's the
  reference, not the thing to change.
- **Dispute credit auto-matcher.** Citi dispute credits pair perfectly with their
  charge on SAME AMOUNT + SAME DAY, so a post-import pass could inherit the
  charge's category instead of hand-fixing each one.
- **Moments phase 5** (count-based achievements) — safe anytime. Phase 4 (the
  collection grid) stays deferred until the Quest Engine is designed, since it's
  the display case for quest completions too.
- **Small display fixes:** "VA" capitalisation in Spend-by-account · NO BUDGET
  rows are a dead click · `nobudget` sorts below `untouched` so the biggest
  numbers sink · Monthly Spend tile still disagrees with the Pulse · a
  bucket-less category that nets NEGATIVE is filtered out by both gates.
- **Server-side daily snapshots** so the net-worth line ticks when the app is
  closed. Previously judged not worth it; still true.

---

## 3. THINGS I THINK WE SHOULD DO THAT AREN'T ON SCOTT'S RADAR

These are mine, ordered by how much grief they'd save.

### 3a. One canonical number per concept, enforced by a test
**The single loudest theme of the last four sessions.** Every one of these was
the same bug wearing a different hat: Pulse vs Monthly Spend tile · StashesCard
footer vs Pulse footer · `GoalTracker` vs the budget page · `committedReserves`
vs `computeCommitRun` · over-budget vs under-budget insights · lifetime vs
trailing averages. **I made the same class of error twice myself**, hand-rolling
a SQL total instead of calling `computeScorecard`, and told Scott two wrong things
as a result.

Proposal: a `reconciliation.test.ts` that asserts, on the real fixture set, that
every surface's number for a concept derives from one function. Any new surface
that computes its own total fails the build. This is cheap and it structurally
ends a bug class we keep paying for.

### 3b. Iris should audit her own numbers
Every defect this session was found by Scott squinting at a card, or by a
commissioned review. Nothing in the app notices when its own arithmetic stops
hanging together. Proposal: a self-check on each sync that flags —
- buckets + pots ≠ the $15,800 base
- a category with spend but no bucket (the orphan class)
- a **settled** month whose total changed (feeds 1's amend policy)
- a pot balance going negative, or a draw exceeding a balance
- the `typeOverride` count moving without a UI edit

Surface it as a single "Iris checked her math" line. Honest, cheap, and it turns
a human-noticing problem into a machine-noticing one.

### 3c. A tested restore path for the Postgres data
Code is on GitHub. Memory is on GitHub. **The financial history — the thing that
is actually irreplaceable — lives in exactly one Supabase project with no
verified restore.** There's a `DataBackup.tsx` export, but an export nobody has
ever restored from is a hope, not a backup. Proposal: scheduled `pg_dump` to
local/private storage, and **actually restore it once into a scratch database** to
prove it works. Everything else we backed up this session is replaceable by
comparison.

### 3d. Delete the dead code that disagrees with the live code
The 2026-08-12 review found ~7,400 dead lines, chat unreachable behind
`PHASE_1_LOCK`, a `SYSTEM_PROMPT` still carrying the old market-intelligence
persona, `DISPUTE_LABELS` as a dead export whose strings **contradict** what
ships, and an unreachable `isBankFee` branch. Dead code that merely sits there is
debt; dead code that *disagrees* with reality actively misleads whoever reads it
next — it sent me down at least two wrong paths. One deliberate deletion pass.

### 3e. Talk to Claire before building the big swing
The north star is "make money not suck, for Claire." Every design decision so far
is Scott's model, Scott's voice, Scott's data, and Claire's preferences are being
inferred. The Quest Engine is the biggest project on the board and the one most
dependent on a person who hasn't been asked. Proposal: before building it, put
**one** small thing in front of her and watch. Cheapest possible de-risk on the
most expensive project.

### 3f. Decide what happens when a pot is over-drawn
Draws are now explicit and can take a pot negative (deliberately — design D4).
`computeShortfall` describes the gap, but there's no policy: does it self-heal
from next month's ask, borrow from another pot, or just sit red? Worth deciding
before the first real over-draw rather than during it.

---

## 4. Amazon item-level detail — investigation

**Goal (Scott):** "I don't want items hidden in places and the budget abused."
Amazon is $13,604 across 433 charges — currently a black box with a $550/mo cap.

### What the data looks like now
- 433 Amazon charges, **$13,604** total.
- **98% (432/443) carry a payment reference code**: `Amazon.com*5A04174U0`,
  `AMAZON MKTPL*5A1WQ54S1`, `AMAZON DIGIT*…`. This is a real, per-charge
  identifier — not a guess.
- Charges are small and numerous: **six separate charges on 2026-08-16 alone**,
  because Amazon bills per *shipment*, not per order.
- 8 TEMU rows are misfiled in this bucket (see must-do list).

### Paths evaluated

| Path | Verdict |
|---|---|
| **Parse order emails from the connected Gmail** | ❌ **Ruled out — tested.** Zero Amazon mail in the connected mailbox; it's the *work* account and Amazon receipts go to a personal address. |
| **Amazon "Request My Data"** | ✅ **Best for backfill.** Account → Data & Privacy → Request Your Information → "Your Orders". Returns `Retail.OrderHistory.csv`: order id, date, **product name**, ASIN, quantity, unit price, total, payment instrument. Free, official, complete history, no ToS risk. Manual request, arrives in hours–days. Re-requestable monthly. |
| **Personal mailbox / forwarding rule** | ✅ **Only real-time option.** Auto-forward Amazon order mail to something Iris can read, or connect the personal account. Incremental, no scraping. |
| **Scrape `amazon.com/cpe/yourpayments/transactions`** | ⚠️ Possible — that page shows the `*ref` code *and* the order it belongs to, so it's the one place the deterministic join exists. But fragile, ToS-sensitive, needs a logged-in browser. Fallback only. |
| **Commercial order-linking APIs (Knot etc.)** | ❌ Paid, built for fintechs, overkill for a two-person household. |
| **Plaid enrichment** | ❌ Does not return merchant line items. |

### The hard part, stated honestly
**One order → many charges.** Amazon splits an order across shipments and bills
each separately, and can combine items across orders. So item↔charge is
many-to-many, and no matcher will be 100%. Design for it: attribute at the
**order** level, match orders to charges on amount+date, and leave unmatched
charges visibly unmatched rather than guessing.

Also: `Retail.OrderHistory.csv` does **not** contain the `*ref` code, so the
export alone can't do a deterministic join — that's why the reference code is
interesting but not sufficient on its own.

### Proposed build
1. **Importer** — parse `Retail.OrderHistory.csv` into a new `amazonOrders`
   collection (orderId, orderDate, itemName, ASIN, qty, unitPrice, itemTotal).
   Pure function + tests; the CSV is stable and well-formed.
2. **Matcher** — group items by order, then match order/shipment totals to
   `amazon`-category charges within a date window. Store `amazonOrderId` on the
   expense. Report a match rate and list the unmatched — never silently guess.
3. **Drill-down** — click an Amazon charge, see the items. Plus a monthly "what
   we actually bought" view.
4. **⭐ The actual payoff: re-attribution.** Once items are known, a $180 Amazon
   charge that was a car part can move to `car_maintenance`, and diapers to
   `kids`. That's the real answer to "items hidden in places" — Amazon stops
   being a $550 black box and becomes a *payment method* whose spend lands in
   honest categories. Worth building the first three steps just to get here.

**Recommended start:** Scott requests the data export (a few clicks, then wait),
and meanwhile step 1 gets built and tested against a sample CSV. Step 4 is where
the value is, so don't stop at step 3.

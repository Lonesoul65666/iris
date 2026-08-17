# Data-integrity queue — found at the Aug 2026 month rollover

> Scott's field report from the July→August rollover (reported 2026-08-12), with each
> item pinned to real code. **None of these are built.** These are correctness bugs in
> the money math and the achievement/celebration layer — they should land BEFORE the
> rail/quest work, because the Quest Engine will build on top of this data and inherit
> any wrongness.
>
> Context: July was a **win** — the couple crushed it. Two of these were found *because*
> the system worked (the dispute watchdog fired correctly).

---

## 1. 🔴 Achievements/Moments realize too early — no settle lag

**Scott:** *"the achievements are being realized too early — if they hit at the end of
the month and everything hasn't been realized back then, it's giving improper data."*

**Root cause (confirmed):** `isCompleteMonth` is a pure **string comparison** —

```ts
// src/utils/transactionAnalysis.ts:14
export function isCompleteMonth(ym: string, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}$/.test(ym) && ym < currentMonthKey(now);
}
```

That flows straight into the scorecard:

```ts
// src/utils/savingsScorecard.ts:146
partial: !isCompleteMonth(m.month) || m.totalIncome === 0,
```

…and `partial` is the gate for **every** downstream win:
- `moments.ts:116` — Beat the Clock fires on `!m.partial && m.surplusVsBase >= 0`
- `moments.ts:169` — streaks computed from `!m.partial` months
- `gamification.ts:67` — `full` months
- achievements/celebrations chain off the same

**So at 00:00 on the 1st, the prior month is instantly "final."** But Plaid
transactions **settle with a lag** (typically 1–3 days, longer for some credit cards).
Late-posting end-of-month charges arrive *after* the celebration has already fired on
an understated spend total.

**Why it's worse than a cosmetic glitch:** Moments are **forward-only and idempotent on
`(type, periodKey, person)`**, and the logged record stores `magnitude`
(`moments.ts:50-59`). Fire early → the wrong dollar figure is persisted → the idempotency
key blocks a clean re-fire → the trophy/tally now permanently disagrees with the ledger.
This corrupts the substrate the whole Quest Engine will reward against.

**Fix shape (to design):** introduce a **settle lag** — a month is only *closable* for
celebration purposes after N days into the next month, and/or after a sync confirms no
new transactions dated inside it. Note the split:
- **Display/tally** can update live (that's honest and useful).
- **Celebration + log write** must wait for close.

Decide: fixed lag (e.g. 3–5 days), or sync-confirmed quiet period, or both. Also decide
whether an already-logged Moment can be **amended** if late data changes the magnitude
(probably yes, with no re-celebration).

**Also affected:** `budgetComparison.ts:87` uses `isCompleteMonth` — check whether it
wants the same guard or genuinely wants calendar-complete.

---

## 2. 🟡 Cash-out transfers are categorized inconsistently

**Scott:** *"ATM payments and other cash-app payments should probably be lumped into
Venmo and all those others."*

**Current state** (`src/utils/transactionCategorize.ts`):

```ts
:71  if (d.includes('venmo'))                              → category: 'personal'
:72  if (d.includes('zelle payment to'))                   → category: 'other'
:73  if (d.includes('withdrwl') || d.includes('withdrawal')) → category: 'personal'  // "ATM/cash → personal (was 'other')"
```

Two problems:
1. **Inconsistent** — Venmo and ATM land in `personal`, Zelle-out lands in `other`.
   Same real-world act (money leaving as untracked cash/peer transfer), three
   different treatments.
2. **Cash App isn't matched at all** — no `cash app` pattern exists. Those charges are
   falling through to whatever the generic fallback is.

**Fix shape:** one **cash-out / peer-transfer** concept covering Venmo, Zelle-out, Cash
App, Apple Cash, PayPal-to-person, ATM withdrawals. Decide whether that's a single
category or a `transactionType` flag. Note `zelle payment from` (`:33`) is correctly
handled separately as an *inflow* — don't break it.

**Watch out:** changing a category retroactively re-scores historical months, which can
move `surplusVsBase` and therefore **change which Moments qualify**. Coordinate with
item 1 — decide the amend policy before running this migration.

---

## 3. 🔴 No way to mark a transaction as disputed

**Scott:** *"I had another dispute for my credit card right away which is awesome — we
caught it and the system did exactly what it's supposed to do. However there's no way
for you to mark it as being under dispute or whatnot. I already got the dispute
settled."*

**Confirmed gap:** the `Expense` interface (`src/types/budget.ts:70-91`) has
`reimbursementStatus` (the work-expense loop) but **no dispute/pending state of any
kind.** Fields today: `id, date, description, amount, category, reimbursementStatus,
isWorkExpense, recurring, notes?, flow?, transactionType?, source?, importBatch?,
incomeSubtype?, incomeSourceId?, spender?`.

**Why it matters for the money math:** a disputed charge is money that *looks* spent but
probably isn't. Left untreated it inflates the month's spend, understates the buffer,
and can flip a Beat-the-Clock win into a loss (or the reverse when the credit posts).
The refund/credit arriving later is a **second** row, so the month can double-count.

**Fix shape:** add a dispute lifecycle — `disputeStatus?: 'open' | 'won' | 'lost'` (or
similar) with a date, plus a decision on how each state is treated in the scorecard:
- `open` → exclude from spend? flag but include? (Recommend: exclude, and surface the
  exclusion visibly so the number is explainable.)
- `won` → charge excluded permanently; the matching credit row must be **suppressed** to
  avoid a phantom inflow.
- `lost` → charge stands as normal spend.

Pairs naturally with the **subscription watchdog** UI, which is already the surface
that catches these. This is also the first real test of item 1's amend policy — a
dispute resolving in September changes July's number.

---

## 4. 🟡 Charges that can't be traced going out

**Scott:** *"there's a couple of places where I have charges that I can't realize going
out."*

**⚠️ NEEDS CLARIFICATION before work starts.** Two very different readings:
- **(a)** Charges visible on a statement that never appear in Iris's outflow (an
  ingest/mapping gap — a `source` not mapped, or a flow misclassified as inflow).
- **(b)** Charges Iris *shows* that Scott can't identify or trace to an account (a
  display/attribution gap).

Reading (a) is a **data-completeness bug** and serious — it means the base math is
understating spend. Reading (b) is a UX/labeling problem. Ask Scott which, ideally with
one concrete example, before touching code.

Relevant surfaces if (a): `server/plaid-map.ts`, `server/api-handlers/plaid.ts`,
`src/utils/txDisplay.ts` (which already notes "stray legacy sources: credit_card_3,
venmo, other, unknown" at `:35`).

---

## 5. 🟢 "VA" capitalization in Spend-by-account

Carried over from the existing backlog (Bucket 1 #5) — a label rendering lowercase.
Still pending the exact label from Scott. Likely lives in `src/utils/txDisplay.ts`
(the `SOURCE_LABELS`-style map around `:35-41`).

---

## 6. 🟡 Month-rollover freshness / "I was slow getting everything updated"

**Scott:** *"we went into the new month and I kind of was slow in getting everything
updated."*

Not obviously a bug, but worth a look: the rollover is the moment the app most needs to
be *self-updating* and most needs to **not** draw conclusions yet (item 1). Possible
small win: a rollover state on the dashboard/rail — "July is closing, holding the
scorecard until charges settle" — which turns a data-integrity constraint into an
honest, legible narrative beat. That's rung-1 material and it's the kind of thing the
rail exists to say.

---

## Sequencing note

Items **1 and 3** are the ones that corrupt stored state, so they come first. Item 2 is
a migration that interacts with item 1's amend policy — do it after the policy exists.
Item 4 needs a question answered. Items 5–6 are small/opportunistic.

**All of this should land before the Quest Engine**, per the reasoning in
`iris-front-and-center-design.md` §3: quests reward against Moments, Moments are
computed from this data, and a quest engine built on early-firing or double-counted
months inherits every one of these bugs and makes them load-bearing.

# "Make Every Dolla Holla" — zero-based budget + Have-to/Want-to stashes

**Status:** SPEC — approved in concept 2026-07-04. Data move-list awaits Scott's sign-off (see §6) before any data mutation.
**Supersedes/extends:** `budget-pulse` naming, `docs/stashes-design.md` (stash mechanic), `docs/money-map-design.md` (the $15,800 frame).

## 1. The idea
Give every dollar of the guaranteed base ($15,800) a job. At month-end, assigned ≈ $15,800 (or under). Under = dollars left idle → save more / adapt. YNAB-style, but fun.

## 2. Naming + look
- **"Budget Pulse" card → titled "Make Every Dolla Holla"** (big purple title). Functional subline "how's the month going."
- **Status chips redesigned** — the top summary filters ("7 on track / 16 untouched") AND the per-row status pills → one matching, attractive button style on both sides.

## 3. Layout — two stacked cards
1. **"Make Every Dolla Holla"** (top): the month's spending pace (existing category rows, redesigned chips) + the Free nudge.
2. **"Have-tos & Want-tos"** (big card, directly below — KEEP it big; it's the watch-it-grow surface):
   - **Have-tos** group — obligations pre-funded monthly: Taxes, Insurance (annual chunk), Credit-card fees.
   - **Want-tos** group — goals: Trips, and future dreams (remodel, Italy, …).
   - Grouping is organizational only; the mechanic is identical for both.

## 4. The mechanic (ONE rule: a dollar leaves the $15,800 only when it's REAL)
Generalizes the Investing confirm pattern (`deployConfirmations`, status feed/confirmed/planned) to stashes.

Each stash has:
- **planned monthly fill** (user-set per stash; the split is Scott's) — the one-tap default when confirming
- **balance** + **goal/target** + **ETA**
- **"Confirm moved"** (per stash, per month) → subtracts that amount from the month's $15,800, adds to balance, advances ETA

Rules:
- Planned-but-not-confirmed = **$0 impact** on the month. Skipping a month = **no penalty**, no distortion.
- **Money Map "Reserves" slice = confirmed stash moves only** (same rule as investing), so the whole partition runs on "counts when real."
- Month math: `Free = 15,800 − everyday spent − confirmed investing − confirmed stash moves`.
- **Behavior change:** today reserves auto-deduct $2,000 regardless. New model = $0 until confirmed → Free reads higher until moves are confirmed. Correct and intended.

## 5. Envelope truth
Stashes are **virtual buckets over the ONE big savings (~$130k)**. Confirming = "earmarked $X of savings to this stash." App tracks the split; the real account holds the pool. Month-end: sweep leftover checking → savings, confirm the moves, app matches reality ("off the top").

## 6. Data move-list — NEEDS SCOTT'S SIGN-OFF before touching data
Current monthly buckets + 2 stashes → target state:

| Item | Today | Proposed | Notes |
|---|---|---|---|
| **Taxes** | already a stash ($10k target, $1,000/mo) | **Have-to** stash (no move) | already correct |
| **Trips** | already a stash ($1,000/mo, no target) | **Want-to** stash (no move) | maybe set a target for an ETA |
| **Credit Card Memberships** | monthly bucket `credi_card_memberships` $70/mo | **Have-to** stash; remove monthly bucket | annual card fees — confirm total $/yr |
| **Insurance** | monthly bucket `insurance` $450/mo | **SPLIT**: keep monthly bill in `insurance`, annual premium → **Have-to** stash | NEED real numbers ↓ |

**Numbers to confirm:**
1. **Insurance** — monthly recurring bill (you said ~$68) and the annual Liberty-Mutual premium (the current $450/mo bucket looks like it may already be amortizing the annual). What's the true monthly $ and annual $?
2. **Credit-card memberships** — annual total (current bucket is $70/mo = ~$840/yr; confirm).
3. **Per-stash fills** — you own the split. Default proposal to start: Taxes $1,000, Trips $1,000 (unchanged), + new CC and Insurance fills sized to their annual/12. You adjust freely.

## 7. Free nudge
When Free > 0 near month-end: adult-funny "give it a job" nudge (assign to a stash / investing / goal). Personality, not a scold.

## 8. Build phases (after move-list sign-off)
1. Rename card + redesign status buttons (cosmetic, safe).
2. Stash model: add `kind: 'have_to' | 'want_to'` + `monthlyFill` + a per-month confirm (generalize `deployConfirmations` → stash confirmations). Have-to/Want-to grouping on the big card.
3. Data moves (§6) — only after approval + a backup.
4. Money Map Reserves → confirmed-only; Free nudge.
5. Fun layer: ETA / "N months to goal" / growth animation on confirm (later, its own pass).

## Open decisions carried in
- Stashes rename to "Have-tos & Want-tos" grouping confirmed; the *collection* stays "sinkingFunds"/"stashes" internally for now.
- Reconciliation of virtual stash balances against the real synced savings balance: later.

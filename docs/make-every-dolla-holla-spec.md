# "Make Every Dolla Holla" — every dollar to work (v2, simpler)

**Status:** SPEC v2 — confirmed by Scott 2026-07-04. Replaces the v1 reserve-lane-cascade approach with a simpler, additive commit model. Extends `docs/stashes-design.md`, `docs/money-map-design.md`.

## The idea
Give every dollar of the $15,800 base a job: everyday spending + investing + **committed** moves into Have-To/Want-To pots. "Reserved" (the old $2,000 auto-set-aside) goes away — a dollar only leaves the budget when you actually **move it** and hit **Commit**.

## The pieces

### 1. Rename "Stashes" → "Have To's / Want To's"
Same card, new identity. Every pot has a `kind`:
- **Have-to** — obligations you pre-fund: taxes, insurance, yearly things.
- **Want-to** — goals: trips, theater room, kitchen table, office, a repair.

Grouping only — the mechanic is identical. Cards differentiated by color/label. Playful, not clinical.

### 2. "+ New Have-To / Want-To" button
Was "+ New stash." On click, pick the kind; the new card shows which.

### 3. They also list at the BOTTOM of the budget
Inside "Make Every Dolla Holla," right under the last category (Transportation/Gas), a divider **"Have To's / Want To's,"** then each pot as a line like the budget rows. Shows **all** of them (have-tos + want-tos). Each line:
- a **planned "move" amount** (one number; editable here OR on the big card — same value)
- a **Commit** button

They live in TWO places: the big cards up top (create + watch grow) and these budget lines.

### 4. Commit mechanic (the core)
- The planned move just sits there — it does **NOT** touch the $15,800.
- Hit **Commit** = "I physically moved that cash from checking → savings." Now it:
  - counts against the month's $15,800 (that dollar went to work),
  - funds the pot (balance += amount),
  - ticks the goal's ETA down.
- Reuse the existing `DeployConfirmation` store (`{month, lane, amount}`) with `lane = stash.id` — already built for investing, comment says it extends to stash ids.

### 5. "Reserved" → "Committed"
- Kill the $2,000 auto-`totalReserveSetAside` off the top.
- Header "$2,000 reserved · $10,470 free" → **"$X committed · $Y free"**, starting at $0 and climbing as you move money.
- Money Map "Reserves" slice → **committed moves this month**.
- `Free = 15,800 − everyday spent − confirmed investing − committed moves`.
- Touches: `safeToSpend.ts`, `MoneyMap.tsx`, `BudgetPulse.tsx` header, scorecard cash-flow line.

### 6. Lumpy-bill alarm (SECOND layer — after the core)
A lumpy bill (e.g. $1,600 car insurance) alarms **only if the pot didn't cover it**:
- bill draws its Have-To pot down; pot ≥ bill → silent (you planned ahead); pot short → flag it.
- Needs a bill→pot association (which category/merchant draws which pot). Build after the core lands.

## Build order
- **A (core, safe/additive):** `kind` on pots + tag Taxes=have_to, Trips=want_to; rename card + group + type-picker on +New. No reserve-math change.
- **B:** budget-bottom "Have To's / Want To's" lines (move amount + Commit) + commit mechanic (DeployConfirmation lane=stashId) → funds pot + ETA.
- **C:** "reserved → committed" across header / Money Map / Safe-to-Spend / scorecard.
- **D:** lumpy-bill draw-down alarm (§6).
- **E:** Free "give it a job" nudge, adult-funny.

## Dropped from v1 (deliberately)
No reserve-lane category cascade, no Liberty-Mutual transaction recategorization required for the core. Simpler + safe.

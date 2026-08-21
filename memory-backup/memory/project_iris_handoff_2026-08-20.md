---
name: project-iris-handoff-2026-08-20
description: "Iris handoff 2026-08-20 — READ FIRST. Two halves. (1) The whole §1 MUST-DO list is CLEARED (17 commits). (2) Coinbase/Robinhood now linkable (Plaid products fix), the link-account trophy guard, and the multi-line net-worth pool chart. Plus: the Amazon bucket is now ONE Online Shopping bucket at Scott's direction. 526 tests, pushed through 071043d — HOST NOT UPDATED; updates.ts = 2026.08.20.v1."
metadata: 
  node_type: memory
  type: project
  originSessionId: 6ae34ea1-3160-4ca1-b76f-833ee45a737d
  modified: 2026-08-20T23:53:42.784Z
---

# Iris handoff — 2026-08-20 · READ FIRST

Supersedes [[project-iris-handoff-2026-08-19]] as read-first. Per
[[feedback-iris-release-flow]]:

> ✅ **PUSHED to `origin/master`** — 17 commits, `6c11190..d6e2043`.
> 🚨 **HOST NOT UPDATED.** `src/updates.ts` is at **`2026.08.20.v1`**
> ("Iris corrects herself, and disputes come find you", 10 notes). Scott has to
> hit **Update Iris** on the host machine — I can't reach it. Postgres is shared,
> so the DATA changes below are already live on the host's old code.

## What this session was

`docs/next-session-plan-2026-08-19.md` **§1 MUST DO is CLEARED**, worked in the §5
block order, one commit per item, `tsc -b` + full suite green at every step.
**503 tests** (was 443). The status table in that doc maps every item to its
commit — read it rather than re-deriving.

Block 1 (settle lag) · Block 2 (contradicting surfaces) · Block 3 (latent traps) ·
Block 4 (disputes) · Block 5 (small + safe). Highlights worth carrying:

- **Amend policy** (`reconcileMoments` in `moments.ts`): the moments log already
  persists `magnitude`, so the log IS its own snapshot — no new collection. Three
  explicit outcomes per record: **amended / revoked / reinstated**, surfaced as a
  WARNING nudge ranked ABOVE celebrations. Guard `hasEvidenceFor()` is
  load-bearing: reconciliation must never fire off MISSING context (empty
  `funMonthly` on a cold load would have revoked the whole log), and a `partial`
  month is explicitly not evidence.
- **`GoalTracker` no longer does pacing math at all** — it takes `StashStatus[]`
  and reads `computeStashForecast`. It had a `new Date('YYYY-MM-DD')` UTC parse
  that lost a whole month on any 1st-of-month deadline.
- **`typeOverride` is a latch now**, not a trapdoor: rows remember `feedType`
  (refreshed by all three sync upserts) and an edit counts as an override only
  while it DISAGREES with the feed. `recategorize.ts` stops reverting overrides.
- **`monthlyFill` is deleted.** `getSinkingFunds` folds any stored value into
  `monthlyContribution` on read; REPLACE-semantics saves persist the collapse.
- **`disputeNudges()` exists** and is wired into `DashboardView` — the "what's my
  reminder recourse" question is finally answered outside the queue.
- `computeStashStatus` / `computeAllStashes` / `computeCommitRun` **no longer take
  an expenses list at all** (the dead `_expenses` param, 29 call sites).

## ⚠️ Two LIVE data changes (already visible to Scott on the old host code)

1. **July's Beat the Clock self-corrected.** The record was written on Aug 1,
   before the settle lag existed, with `banked = −$2,854`. True figure **$8,770** —
   an **$11,624** error the idempotency key had frozen. The amend policy caught it
   on first run against the real ledger and wrote the correction card. **This is
   the proof the feature works; don't "fix" it.**
2. **Temu re-filed** — then REVERSED the same day, see the second half below.
   Scott had put those rows under `amazon` on purpose. They are back in it, and
   the bucket is now called "Online Shopping".

## Still Scott's, and now safe

**Link pot categories.** Item 17 was the last thing making that risky: the Budget
page's "$1,000/mo reserved" line read the frozen `RESERVE_ALLOCATIONS` constant
instead of the live registry, and `stashAllocationsByCategory` invented an even
per-category split. Both fixed — a shared pot now reports the whole pool and says
it's shared. Linking flips the reserve lane from the $2,000 legacy constant to
the real $2,403.

## Deliberately NOT done

- **§3a's `reconciliation.test.ts`.** Every Block 2 item applied the
  one-canonical-number principle where it bit, but the structural test that fails
  the build when a NEW surface computes its own total is still unwritten. It's the
  cheapest way to close the bug class permanently — good candidate for next time.
- **Achievements are not amendable.** `UnlockRecord` stores no magnitude, and
  un-earning a trophy off the permanent wall is a product decision, not a bug fix.
  Ask Scott before building it.
- §2 (like-to-do) and §3 (my suggestions) in the plan doc are untouched and still
  stand — Coinbase/Robinhood, the multi-line chart, mobile/visuals, the tested
  Postgres restore path, talking to Claire before the big swing.

## Working notes that saved time

- **Probe the live DB before claiming a fix matters.** Four of the five Block 3/5
  items turned out to be traps that hadn't fired yet (0 rows with `typeOverride`,
  0 `monthlyFill`, 0 surcharge rows, no card-payment withdrawals) — worth saying
  in the commit message rather than implying a number moved. Scripts are on disk
  in `scripts/` (gitignored): `check-typeoverride`, `check-monthlyfill`,
  `check-withdrawals`, `check-disputes`, `check-temu`, `check-moments-log`.
- **The dev server writes to the SHARED Postgres.** Loading `localhost:5173` to
  verify runs the real engines against the real ledger — that's how the July
  amendment landed. Fine, but know it before opening the app "just to look".
- 🔒 Still true, twice-learned: **never hand-roll a spend aggregate in SQL** —
  call `computeScorecard`.
- Python heredocs eat `\'`; use the typographic `’` inside single-quoted TS
  strings (which is what `updates.ts` already does).
- Two untracked mockups sit in `public/` (`fusion-mockup.html`,
  `redesign-mockup.html`) from an earlier session. Left alone — ask Scott.


# ── Second half of 2026-08-20 (after the must-do list) ──

Scott picked both next steps himself.

## 1. ONE "Online Shopping" bucket — I had this backwards

He said: *"I put them there cause they were Online Shopping… I would like to see
us for the most part get away from online shopping but wasn't sure how to bucket
the 'other' ones like Alibaba."* The 8 Temu rows were **not** hidden in the wrong
place — he had filed them under `amazon` deliberately, because to him that bucket
means online shopping. The audit called it a defect; it was a naming problem.

- The `amazon` bucket now DISPLAYS as **"Online Shopping"** and the classifier
  sends Amazon + Temu + Shein + AliExpress + Wish + Alibaba to it. `shopping_other`
  is deleted; its rows moved back (`scripts/fix-shopping-bucket.mjs`).
- The KEY stays `amazon` — same legacy-key/re-labelled-display trick as
  `fun_scott`/`fun_wife`; renaming it would mean rewriting 441 rows to change a
  word on screen.
- ⚠️ **A stored bucket row carries its OWN label**, so a code default only reaches
  fresh installs. His row needed `scripts/rename-amazon-bucket.mjs`. Remember this
  for any future bucket rename.
- Why one bucket: one habit he wants to shrink → one number, and the category
  drill-down already shows which merchant, so a rising Temu stays visible without
  needing its own line to police it.

## 2. Coinbase + Robinhood → net worth, and the pool chart

⚠️ **CORRECTED LATER THE SAME DAY — Scott asked "i dont think plaid supports
robinhood or coinbase do they?" and he was half right.** Verified by search:
**Robinhood IS on Plaid** (Investments; named in Plaid's own crypto-exchange
announcement). **Coinbase is NOT** — the Plaid↔Coinbase link runs the other way
(Coinbase uses Plaid to verify YOUR BANK); Plaid's exchange coverage is
Binance.US / Kraken / Gemini, and Coinbase bought Zabo instead of joining. So
Coinbase got its own key-based connector (see the bottom of this note). Lesson:
**I asserted institution coverage from memory instead of checking it.**

**The Plaid blocker was the front door, not the balance code.** `createLinkToken`
asked for `products: ['transactions']`, and Plaid filters Link's institution list
to institutions supporting every product requested — brokerages expose
`investments`. So:

- `createLinkToken(userId, products)`, `/api/plaid/link-token?products=investments`,
  a second **"Connect a brokerage or crypto"** button, and the choice recorded in
  the connector's existing `data` jsonb (no migration).
- The transaction importers **skip** investments-only connectors (`hasTransactions`)
  — otherwise every sync calls /transactions/get on Coinbase, fails, and shows a
  permanent "failed refresh" in the sync-health nudges.
- `investmentAccountType` recognises a crypto subtype → typed `crypto`, asset class
  `crypto` (it was falling through to brokerage / mutual_fund).
- 🚨 **UNFLOWN:** Plaid isn't configured on the dev laptop (`/api/plaid/*` → 503),
  so the Link flow has to be exercised on the HOST. **Scott's action: Settings →
  Connectors → "Connect a brokerage or crypto" for Coinbase and Robinhood, then
  "Sync bank balances".**

**Trophy guard** (the ⚠️ the backlog warned about). Linking jumps net worth by
money already held. Two mechanisms, both tested:
- the baseline records `netWorthSourceIds` (per account + equity/home/car); an
  unseen id raises the start line by its balance, so delta achievements ("net
  worth up $100k since…") ignore the jump. If the raise lifts the line past a
  rung, that rung is grandfathered — forward-only working as designed.
- `crossedByNewSources` catches what a baseline raise cannot: long install, real
  growth, then a link that tips it over a rung. The rung unlocks (it's true) but is
  written `celebrated: true` — on the wall, no takeover, no confetti.

**The pool chart** (`src/utils/netWorthSeries.ts` + the dashboard hero card):
- Built from `PortfolioSnapshot.accountTotals`, recorded all along, so the history
  goes back as far as the chart does. Non-account pool = totalNetWorth −
  totalLiquidNetWorth.
- Colour follows the ENTITY (cash = slot 1, assets = a reserved slot, institutions
  by first appearance), so linking Coinbase cannot repaint Fidelity. Six-hue cap,
  then a neutral "Other".
- Palette **validated with the dataviz skill's checker** against surface `#12121a`
  — all five checks PASS. Don't swap hues without re-running it.
- The chip row is legend + filter; default is Total only. ONE y-axis: turn Total
  off and it zooms to the pools. Live: Cash $180,342 + Fidelity $454,367 + Equity
  & assets $385,205 = the $1.02M headline.

## Where things stand
- Pushed through **`071043d`**; **526 tests**. Host still on `2026.08.19.v2`, so
  everything from today waits on **Update Iris**.
- `updates.ts` = `2026.08.20.v1`, notes extended with the second batch (same card,
  since it hasn't been shown yet).
- Still open on the like-to-do list: §3a reconciliation test, mobile/visuals, the
  dispute credit auto-matcher, Moments phase 5, the small display fixes.


## 3. The Coinbase connector (after Scott's push-back)

Plaid can't reach Coinbase, so it has its own door — which the 2026-05-01 scope
reset had already planned ("Coinbase API").

- `server/coinbase-client.ts` — **ES256 JWT per request**, 2-min life, `uri` claim
  binds method+host+path so a token can't be replayed elsewhere. ⚠️ Signed with
  `dsaEncoding: 'ieee-p1363'`: JWS needs raw r||s, and Node's DER default gets an
  unhelpful 401. Balances from `/api/v3/brokerage/accounts` (paged; a Coinbase
  account has a wallet per asset, nearly all empty), priced off the PUBLIC
  `/v2/prices/{PAIR}/spot` endpoint — no extra JWTs.
- `/api/coinbase/{status,connect,balances}`; the key is verified by a live
  read-only call BEFORE storage, kept in the same `connectors` table
  (provider='coinbase', id `coinbase-api`).
- Writes REAL per-coin holdings (not the Plaid single-lump), USD-in-Coinbase typed
  `cash`, an unpriceable asset left OUT of the total and NAMED, gain/loss $0
  because no cost basis is available.
- ⚠️ **Scott's part:** portal.cdp.coinbase.com → API keys → Create, permission
  **View**, algorithm **ECDSA** (Ed25519 is rejected), then paste key name + PEM
  into Settings → Connectors → Coinbase. Untestable here without his key.

## Fidelity re-link — asked and answered
Scott: *"Did you say I needed to reconnect my fidelity account as well?"* **No, not
yet.** The Fidelity BALANCE already flows into net worth ($454k, visible on the
new pool chart). A re-link through the `investments` product only buys real
POSITIONS — and nothing changes until the app actually calls
`/investments/holdings/get`, which is NOT built. So re-linking today is a no-op.
Build the holdings fetch first, then ask him to re-link.

---
name: project-iris-handoff-2026-08-19
description: "Iris handoff 2026-08-19 — READ FIRST. Two batches: (a) explicit pot draws + reserve-lane untangle (5b9636c, 2026.08.19.v1), (b) the six-item dashboard-honesty run (through 2748d87, 2026.08.19.v2). All pushed AND the host is updated (confirmed 2026-08-20) — nothing pending deploy. Also: git history was rewritten (scripts/ purged) so every pre-2026-08-19 sha is dead, and the memory backup now lives IN the iris repo under memory-backup/."
metadata: 
  node_type: memory
  type: project
  originSessionId: c5a9072b-f2ba-4779-930c-32f8d1ec07e0
  modified: 2026-08-20T21:45:43.745Z
---

# Iris handoff — 2026-08-19 · READ FIRST

Supersedes [[project-iris-handoff-2026-08-17]] as read-first. Per
[[feedback-iris-release-flow]]: **everything below is PUSHED to `origin/master`
(docs through `f846ad5`) and the HOST IS UPDATED to `2026.08.19.v2` — confirmed by
Scott 2026-08-20. Nothing is waiting to deploy.**

➡️ **NEXT SESSION STARTS HERE:** `docs/next-session-plan-2026-08-19.md` §1
(must-do), in the execution order at the bottom of that file. Scott 2026-08-20:
*"lets get started on the must do as I want to start wrapping up some final
features."*

## ⚠️ Two structural facts that invalidate older notes

1. **HISTORY REWRITTEN.** `scripts/` was purged from every commit and
   force-pushed. **Every sha in handoffs before this one is a dead label.**
   Verified 0 objects matching the transaction backups remain. `scripts/` still
   exists ON DISK (gitignored, ~80 probe scripts). The host hit the expected
   non-fast-forward failure and was fixed with
   `git fetch origin && git reset --hard origin/master`.
2. **Memory backup lives in the iris repo** at `memory-backup/memory/` (66
   notes). The separate `iris-context` repo idea was abandoned — creating a new
   GitHub repo needs `gh` (absent) or a browser (extension flaky), and one repo
   is simpler. `C:\Claude\projects\iris-context` is a DEAD staging path.
   Personal non-Iris material rescued from work Drive stays gitignored at
   `iris-context/rescued/personal/` — see [[feedback-no-personal-in-work-drive]].

## Batch A — pots (`5b9636c`, `2026.08.19.v1`)

**`stash.categories` was doing two jobs**: classifying the reserve LANE *and*
arming auto-draw-down. Scott rejected draw-down, so all six pots had
`categories: []` — which also silently disabled `applyStashLaneConfig` (it
no-ops without categories), so the app ran the **legacy constants
`{taxes:1000, travel_personal:1000}` = $2,000/mo** instead of the real $2,403
six-pot plan.

- New **`PotDraw`** (own collection, SIGNED amounts so a refunded bill puts money
  back). `balance = opening + committed − Σ draws`. `computeStashStatus` no
  longer reads transactions at all.
- **`committedReservesForYear()`** replaced `totalReserveSetAside() × monthsElapsed`
  in `VariableSurplusCard`. Live: **$16,000 → $3,824**, a **$12,176**
  overstatement of set-aside removed.
- `seedDefaultStashes` gained a NAME guard — its `covered.has('taxes')` and
  `existingIds.has('stash-taxes')` guards both miss a user pot called "Income
  Taxes" with a `stash-<timestamp>` id, so it would have created a DUPLICATE
  taxes pot whose `categories` would then flip the whole reserve lane. Scott only
  escaped because `stashes_seeded_v1` was set 2026-07-04.
- UI: "I paid something from this" + removable withdrawal list per pot.
  **Verified live**: Savings $336 → $335, row in Postgres, undone, back to $336.

⚠️ **STILL SCOTT'S TO DO: link categories to pots.** It's safe now (no
draw-down) and it's what switches the reserve lane from $2,000 to the real
$2,403. Data change, deliberately left to him.

## Batch B — the six-item dashboard-honesty run (through `2748d87`)

Done in order, each tested + committed separately, per Scott's instruction.

1. **`9f6dabb` settle lag** — see [[project-iris-backlog]] Bucket 0 #1.
2. **`593efcd` the invisible dismiss button.** `NudgeCard` computed
   `resolvedSnoozeLabel` then rendered the raw optional `snoozeLabel` prop —
   `undefined` by default, so a **oneShot nudge's dismiss button had NO TEXT**
   (present, clickable, zero-width). oneShot also hides the snooze button, so
   achievements, Moments AND What's New were all undismissable and stacked
   forever. The plumbing was fine the whole way down. **This was the single
   highest-annoyance bug and it was one word.**
3. **`cb9dfca` judging window.** `computeCategoryAverages` averaged ALL history,
   so over-budget alarms relitigated old spikes. **Amazon: $1,200/mo lifetime →
   "118% over, critical"; trailing 3 = $517 vs $550 = 6% UNDER.** New
   `JUDGING_WINDOW_MONTHS = 3`, opt-in `{ trailingMonths }`, used by BOTH the
   over- and under-budget insights (mixing windows would let them contradict).
   Copy states the window. A test proves a CURRENT overspend still alarms.
4. **`7627273` savings tripwire.** Scanned ALL history with no window, so a Feb
   cash run still warned in August. The mysterious "$1.6k spent straight from
   savings" = a $150 Dec Zelle + **one Dubai trip as NINE rows**, five of them
   $5–8 ATM fees each counted as a separate "charge". New
   `SAVINGS_TRIPWIRE_DAYS = 60` (deliberately shorter than the budget window — a
   tripwire is only useful while you can react), fees fold into the total but not
   the count. `generateInsights` now takes an injectable `now`.
5. **`8fc1274` clickable celebrations.** `achievementToNudge` gained
   `primary: { label: 'Show me' }` (no `view` — the dashboard handles it),
   opening the existing full-screen overlay and clearing the card. `openReplay`
   takes a mode so a first look reads **"Milestone Unlocked" / "Hell yeah →"**
   with confetti instead of "Trophy Replay". ⚠️ `AppShell`'s overlay dismiss now
   routes by **SOURCE not mode** — keying it off mode would have called
   `dismissMilestone` for a live-mode replay and stuck the overlay open.
6. **`e36ffcf` quest card.** Now leads with the objective: *"Keep Aug 2026 under
   $15,800. You've spent $7,805, so $7,995 left to play with and 13 days to hold
   it."* (was a buffer + countdown with no stated goal — Scott: "What's the
   fucking clock?"). Test asserts `spent + buffer === target`. **Plus a real bug:**
   `currentMonthQuest` used `find(m => m.partial)`, which after the settle lag
   would have shown AUGUST's quest on Sept 1–3.

**443 tests** (was 416). `tsc -b` clean, build clean.

## ⚠️ I was wrong twice — both from hand-rolled SQL
I told Scott the "5th beat the clock" count was inflated and that `streak-2`
fired with no streak. **Both wrong.** I summed raw `transactionType='expense'`
rows; the app excludes work expenses, reimbursements and investing. June was
**$14,531 (under base)**, not the $16,009 I quoted. Real under-base months:
**Sep '25, Oct '25, Jun '26, Jul '26 = 4**, so August is genuinely the 5th, and
Jun+Jul is a genuine 2-streak.
🔒 **RULE: call `computeScorecard` / the app's own functions. Never hand-roll a
spend aggregate in SQL.** Same class of error as the 2026-08-17 paced-ask mistake.

## Open / next
- ✅ **HOST UPDATED to `2026.08.19.v2`** (confirmed by Scott 2026-08-20). Nothing
  is pending deploy — repo and host are level at `f846ad5`/`v2`.
- **Scott: link pot categories** (above). The one remaining user-side task.
- `computeStashStatus` still takes an unused `_expenses` param (29 call sites) —
  drop in a follow-up.
- `stashAllocationsByCategory` splits a pot's contribution evenly across its
  categories and calls the $ split "advisory" — it stops being advisory the
  moment categories are linked.
- **Visuals / mobile.** Scott: "this program kind of sucks [visually]… extra
  horrific on mobile" but "if the guts aren't working, then nothing else really
  matters." Confirmed cramped at 361px. Deliberately deprioritised behind the
  guts; items 5–6 above were half the visual win anyway.
- **Fidelity holdings is OPTIONAL, not the next project.** Net worth already
  works ($466k, tracks the market). Only positions/allocation/real gain-loss
  need the Plaid `investments` product + a **re-link by Scott**. He pushed back
  on this being framed as necessary — it isn't.
- 🚫 **Gemini API key: Scott explicitly said stop raising it.** Don't mention it
  again.

## 📋 The next-session plan lives in the repo
`docs/next-session-plan-2026-08-19.md` (commit `f846ad5`). Three lists —
must-do / like-to-do / things Scott isn't considering — plus the parked Amazon
investigation. **Read it instead of re-deriving any of this.**

## ⚠️ I overstated "dead code" — Scott caught it (2026-08-19)
He asked: *"Is that dead code for real or the backend of stuff we haven't
finished like the equity play and Fidelity tracking and investing stuff?"* He was
right and I was wrong. I'd repeated the "~7,400 dead lines" figure from the
2026-08-12 review without checking what it covered.

- **`investments` / `equity` / `wealth` / Watchlist / Intelligence / Ask Iris /
  First Report are PARKED, NOT DEAD.** One flag: `PHASE_1_LOCK = true` in
  `hooks/useEnabledModules.ts`, documented in `docs/adr/0001-phase-1-scope.md`.
  Still imported and routed in `App.tsx`; stored user prefs deliberately
  preserved. **DO NOT propose deleting these.** Flipping one boolean restores them.
- **Genuinely dead is small:** `DISPUTE_LABELS` (unused export whose strings
  disagree with the inline ones `ExpenseManager` renders) · the unreachable
  `surcharge` branch in `isBankFee` (**actually a small live bug** — the function
  early-returns on `!includes('fee')`) · a duplicated `CASH_OUT_CATEGORY` literal
  · the `_expenses` param I left behind.
- **`SYSTEM_PROMPT` is stale content in LIVE code**, not dead code — it still
  carries the old market-intelligence persona and belongs to the voice-rail
  project, not a cleanup pass.

🔒 **Lesson (third correction this session): verify a claim against the code
before repeating it from an older note.** The other two were both hand-rolled SQL
vs `computeScorecard`.

## 🅿️ Amazon item-level detail — PARKED by Scott
"Leave Amazon on the burner till I figure out what I want to do here."
Investigation is COMPLETE in the plan doc — don't redo it. Key facts: Gmail
parsing is **ruled out by test** (connected mailbox is the work account, zero
Amazon mail) · 432/443 charges carry a `*ref` payment code · Amazon bills per
SHIPMENT so item↔charge is many-to-many · fastest export = Request-My-Data
scoped to **orders only** (hours, not days) after checking whether the legacy
instant-CSV `amazon.com/gp/b2b/reports` still works · **there is no consumer API**
for your own purchase history. Real payoff is step 4: re-attributing Amazon items
to honest categories so it stops being a $550 black box.

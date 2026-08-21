---
name: project-iris-handoff-2026-08-20
description: "Iris handoff 2026-08-20 — READ FIRST. The whole §1 MUST-DO list from the plan doc is CLEARED in 17 commits (503 tests): amend policy, settle copy, GoalTracker derived, as-of commit cap, unified autofill, monthlyFill deleted, isCashOut guard, typeOverride latch, NaN path, past_due, dispute exit + nudges, Temu, dead items, reserve allocations. PUSHED (6c11190..d6e2043) — HOST NOT UPDATED YET, and updates.ts is at 2026.08.20.v1."
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
2. **Temu re-filed:** 8 rows / **$111.43** moved from `amazon` to the new
   `shopping_other` ("Online Shopping (other)"). `scripts/fix-temu-category.mjs`
   (dry-run first; prior values in `scripts/backups/temu-category-backup.json`).
   It has no bucket in Scott's saved budget, so it shows as **NO BUDGET** — his
   call whether it earns a cap.

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

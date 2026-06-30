# Money Map + the gamified surplus engine — design (2026-06-30)

The agreed direction from the long 2026-06-30 design conversation. v1 of the Money
Map is shipped (`src/components/Budget/MoneyMap.tsx`); the rest is speced here for
Scott to redline, then build. Logic now, gamification *shell* waits for Fable.

## North star
"Blame the budget, beat the budget, have fun doing it." Live on the guaranteed
**base**, beat it, and put the **winnings** to work — and make that feel like a win.

## The model: RECONCILE, not strict allocate
NOT YNAB envelope budgeting (assign every dollar up front). Scott: "spend every
dollar is too finite." Instead:
- **Base net take-home ($15,800) is the frame.** The Money Map carves it into:
  **Everyday + Investing + Reserves + Free (leftover)**, summing to income.
- **Free = the win.** Money to deploy: invest more, fund a trip, or enjoy it.
- **Goal: trim Everyday over time → the Free slice grows.**
- **Variable/commission pay is System 2** (the Variable/overage card) — the
  *secondary* "winnings" bucket, NOT counted in the $15,800. Reimbursements are a
  separate work float, never income (see below).

## Win / lose framing (confirmed with Scott)
- Land near **$0 Free** = every dollar got a job = the win.
- Came in **under (surplus)** = you beat it → prompt to deploy (invest / trip /
  "half forward, half enjoy").
- **Categories flex** against each other; the **TOTAL** is the score, not per-
  category envelopes.
- **Overspent total (negative)** = the "you got beat this month" signal.

## Surplus deployment + validation (the honesty layer)
A deployment is an INTENTION until the money actually moves. Lifecycle:
**Planned → Confirmed.** Validated by the **transaction feed** (the money moving is
better proof than any email; Iris can't read email anyway).
- **Manual confirm first** (Scott's call — simplest; "mark deployed"). Then add
  **feed-detect-and-confirm** (a): feed surfaces the matching transfer, you one-tap
  confirm. NO silent auto (amounts/timing don't match cleanly).
- **Savings deployments are feed-validatable** (savings transfers show in the feed).
- **Investment deployments are NOW feed-validatable too** — see the FID fix below
  (brokerage transfers now import as `investment`).
- Multi-device matters here (do it from phone / personal laptop) → ties to PORTABILITY.

## Work expenses
A separate **float lane**, OUT of the $15,800. You front it, recover it later (via
CSV expense-report import; no Workday API). Forcing it into the monthly $0 would
make you look over the month you spend and under the month you're repaid. The
WorkReimbursementsCard already treats it this way. Keep it.

## AI suggestions (the "holy ****, look at your impact" layer)
When you consistently beat base by ~$X: suggest the deploy split with impact math
("$800 → investing compounds to $Y; enjoy the rest"). **v1 = rule-based + impact
math.** Richer ML/trend analysis layers on later via Iris's existing LLM/Gemini
plumbing. Gamification *shell* (confetti, streaks, the dopamine) waits for Fable.

## Month in Review
= the Money Map **frozen at month-end**. Fixes the "going back in time loses how the
month ended" problem (Pulse / Safe-to-Spend / On-Pace only render for the in-
progress month). `computeMonthComparison` already exists and is consumed by NOTHING
— wire it. "Previous month realized (~3rd–4th)" → an **in-app banner** ("May is
final — review it"); true push/email isn't wired (parked capability).

## v1 status + open redlines (Money Map)
v2 shipped 2026-06-30 (Scott's "how the month's going" braindump): the map is now
the **zero-based ACTUAL "how's the month going" frame** off the $15,800 base —
everyday SPENT + investing + reserves set aside, leftover = the win ("you beat the
base by $X" / "still in play" in-progress / "over base — trim to fit"). Header:
"How the month's going · vs your $15,800 base" → "Where your $15,800 went". This
kills the bottom-up "$14,584" as the headline number Scott distrusted. Redlines:
1. **Allocation vs actual** — ✅ RESOLVED: ACTUAL deployment. (Everyday segment now
   = spent, with the budget noted as the target. Leftover is the live over/under.)
2. **Investing is CONFIRMABLE, not inferred** — ✅ SHIPPED: planned $1,000 renders
   dashed/faded ("planned — confirm it") with a **Confirm deposit** button; tapping
   it (Fidelity alerted Scott the transfer landed) locks the slice solid + "✓
   confirmed". Persisted per-month in the `deployConfirmations` collection
   (`${month}:${lane}`); toggle to undo. This is build-step #2's manual-confirm
   half — feed-detect / live ticker still PARKED (Scott: "no idea on that piece").
3. **"Reserves" slice = the $2k stash set-aside.** Still open — savings (transfers
   to savings accts) as its own slice vs lumped with taxes/trips? (Not addressed in
   the braindump; left as-is.)
4. **Placement** — top of overview, above the tiles. Confirmed fine.

## Build sequence (deadline-smart: logic now, shell later)
1. **Money Map** (reconcile; v1 shipped — refine per redline).
2. **Deploy mechanism + simple rule-based suggestion** (planned→confirmed, manual
   confirm, impact math).
3. **Month in Review** (freeze the map; wire computeMonthComparison; realized banner).
4. **AI-rich suggestions + gamification shell** (Fable / possibly post-Claude).

## Related logic fix shipped this session
**Brokerage transfers now import as `investment`** (`server/teller-map.ts`). They
were being DROPPED (FID BKG SVG LLC matched NON_SPEND_PAYEE → discarded), so
investing was invisible / the $1,000/mo was an unbacked Settings guess. Now they
import as `transactionType='investment'`: real investing, excluded from spend,
feed-validatable. Confirmed: Scott's real Fidelity transfer is **$1,000/mo** (matches
budget). Only June's came in (incremental sync); history needs a deeper re-pull
(rate-limited). Follow-up: derive the budget's investing figure from real transfers
vs the Settings number (they match today).

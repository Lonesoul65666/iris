// Disputes + the "needs your call" queue (2026-08-13).
//
// Scott's problem, in his words: a recurring subscription bills when it
// shouldn't, he fights it with the card company, and when the money comes back
// it lands in a nondescript bucket with nothing tying it to the fight. Before
// this there was no way to say "I'm contesting this" at all — so a charge he
// didn't believe he owed sat in the budget eating a category (Claire's fun
// money, in the Links Car Wash case).
//
// Two surfaces, one shape: a transaction that needs a HUMAN decision, surfaced
// until the human makes it. Open disputes and unattributed cash-out are the same
// queue with different filters — which is why they're built together.
//
// Design decisions Scott made:
//  • A charge is EXCLUDED from spend while the dispute is open ("I don't believe
//    I owe this"), not counted-until-proven.
//  • Iris OFFERS the matching credit and he confirms. Never silent — he
//    explicitly did not want pattern matching doing this behind his back.
//  • The recall is event-driven: the credit landing is the real signal.
//
// ⚠️ SCOPE, stated honestly (corrected 2026-08-13 after review): the staleness
// backstop is a FLAG IN THIS QUEUE, not a push notification. `stale` turns the
// row amber and changes its copy — nothing here produces a Nudge, so a dispute
// you never revisit will not chase you on the Dashboard. Wiring a real
// disputeNudges() builder into the nudge engine is outstanding work; until then
// do not describe this as a nudge.
//
// Pure functions — no React, no IO. The plot is computed here; prose lives in
// the components.

import type { Expense, DisputeStatus } from '../types/budget';
import { parseLocalDate } from './transactionAnalysis';

const MS_PER_DAY = 86_400_000;

/** How long a credit can plausibly take to come back. Beyond this we stop
 *  offering a match — an unrelated same-amount refund three months later is a
 *  coincidence, not a resolution. */
export const MATCH_WINDOW_DAYS = 120;

/** Nudge if a dispute has been open this long with nothing back. Card issuers
 *  usually post a conditional credit within a couple of weeks. */
export const STALE_DISPUTE_DAYS = 14;

/** The bucket cash-out lands in before anyone says where it went. */
export const CASH_OUT_CATEGORY = 'atm_cash';

/** How far back the cash queue asks. Beyond this you cannot honestly remember
 *  what a $204 withdrawal was for, so asking is just guilt with a dropdown.
 *  (Found in review 2026-08-13: the first build reached back 11 months and
 *  produced a 23-row wall of history.) */
export const CASH_OUT_LOOKBACK_DAYS = 90;

/** An ATM/bank FEE, not cash you spent on something. These ride along with a
 *  withdrawal ("...WITHDRWL ... FEE", "INTERNATIONAL TRANSACTION FEE") and are
 *  real money out — they stay counted as spend — but there's nothing to
 *  attribute, so the queue must not ask. Nobody can answer "what was this $5
 *  international transaction fee for?" */
export function isBankFee(description: string): boolean {
  const d = (description || '').toLowerCase();
  if (!d.includes('fee')) return false;
  return /\bfee\b|fee waiver|transaction fee|atm fee|surcharge/.test(d);
}

const daysBetween = (from: string, to: Date): number =>
  Math.floor((to.getTime() - parseLocalDate(from).getTime()) / MS_PER_DAY);

const isRefund = (e: Expense): boolean => (e.transactionType || 'expense') === 'refund';

/** Every credit already claimed by some dispute, so one credit can't be offered
 *  to two charges (and a resolved dispute's credit is never re-offered). */
function linkedCreditIds(expenses: Expense[]): Set<string> {
  const ids = new Set<string>();
  for (const e of expenses) if (e.disputeCreditId) ids.add(e.disputeCreditId);
  return ids;
}

/** The credit Iris will OFFER for a charge: an unclaimed refund of the same
 *  amount, on or after the charge date, inside the match window. Amount+date is
 *  a strong signal in this data — every one of Scott's Citi dispute credits
 *  posted the SAME DAY as the charge, for the exact amount. Nearest first.
 *
 *  Returns null when there's nothing to offer, which is the normal state of an
 *  open dispute — the credit hasn't arrived yet. */
export function findCandidateCredit(
  charge: Expense,
  expenses: Expense[],
  claimed: Set<string> = linkedCreditIds(expenses),
): Expense | null {
  const chargeDay = parseLocalDate(charge.date).getTime();
  const cents = (n: number) => Math.round(n * 100);
  const want = cents(charge.amount);

  const rejected = new Set(charge.disputeRejectedCreditIds ?? []);
  const matches = expenses.filter((e) => {
    if (!isRefund(e) || e.id === charge.id) return false;
    if (claimed.has(e.id)) return false;
    if (rejected.has(e.id)) return false;   // "not related" — never offer it again
    if (e.disputeCreditFor) return false;
    if (cents(e.amount) !== want) return false;
    const gap = (parseLocalDate(e.date).getTime() - chargeDay) / MS_PER_DAY;
    return gap >= 0 && gap <= MATCH_WINDOW_DAYS;
  });

  matches.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
  return matches[0] ?? null;
}

export interface OpenDispute {
  charge: Expense;
  daysOpen: number;
  /** Gone quiet too long. Turns the row amber — NOT a push notification. */
  stale: boolean;
  /** A credit Iris found that looks like the resolution. Confirm to close it. */
  candidateCredit: Expense | null;
  /** Already marked won, but no credit was ever linked — so the refund is still
   *  outstanding and MUST keep being matched. See the note below. */
  awaitingCredit: boolean;
}

/** Everything still needing a verdict, worst (oldest) first. The answer to
 *  "what's my reminder recourse outside of digging through my transactions."
 *
 *  ⚠️ Includes `won` charges with no linked credit, not just `open` ones. Found in
 *  review 2026-08-13: marking a dispute won BEFORE the credit posts (a legitimate
 *  path — resolveDisputeWon explicitly allows a null credit, and the queue offers
 *  a "Refunded" button for it) used to drop the charge off this list forever. The
 *  credit then arrived and netted against its category while the charge was
 *  ALREADY excluded — the exact phantom-savings double count the whole feature
 *  exists to prevent, reachable in one click. Keeping them listed means the match
 *  offer runs until the link is actually made. */
export function listOpenDisputes(expenses: Expense[], now: Date = new Date()): OpenDispute[] {
  const claimed = linkedCreditIds(expenses);
  const pending = expenses.filter((e) =>
    e.disputeStatus === 'open' ||
    (e.disputeStatus === 'won' && !e.disputeCreditId));
  return pending
    .map((charge) => {
      const since = charge.disputedAt ?? charge.disputeResolvedAt;
      const daysOpen = since
        ? Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / MS_PER_DAY))
        : daysBetween(charge.date, now);
      // Reserve as we go: `claimed` starts as a snapshot, so without mutating it
      // two same-amount disputes inside the window were offered the SAME credit
      // simultaneously. Marking both won suppressed one credit against two
      // excluded charges and understated spend by a full charge.
      const candidateCredit = findCandidateCredit(charge, expenses, claimed);
      if (candidateCredit) claimed.add(candidateCredit.id);
      return {
        charge,
        daysOpen,
        stale: daysOpen >= STALE_DISPUTE_DAYS,
        candidateCredit,
        awaitingCredit: charge.disputeStatus === 'won',
      };
    })
    .sort((a, b) => b.daysOpen - a.daysOpen);
}

/** "That credit isn't the one." Keeps the dispute OPEN and remembers the
 *  rejection so the same coincidence is never offered again. Before this, the
 *  decline button called resolveDisputeLost — labelled "not related" but it
 *  conceded the dispute, returned the charge to spend, and dropped it off the
 *  queue permanently. */
export function rejectCandidateCredit(charge: Expense, creditId: string): Partial<Expense> {
  const seen = charge.disputeRejectedCreditIds ?? [];
  return {
    disputeRejectedCreditIds: seen.includes(creditId) ? seen : [...seen, creditId],
  };
}

/** Cash-out still sitting in the ATM/Cash bucket with nobody having said what it
 *  was for. Low volume by nature — Scott: "I may go to an ATM six, seven times a
 *  year... Cash App three or four times a year" — which is exactly why it wants
 *  a queue rather than pattern matching. Newest first: recent cash is the cash
 *  you can still remember. */
export function listCashOutNeedingCall(expenses: Expense[], now: Date = new Date()): Expense[] {
  const cutoff = now.getTime() - CASH_OUT_LOOKBACK_DAYS * MS_PER_DAY;
  return expenses
    .filter((e) =>
      (e.transactionType || 'expense') === 'expense' &&
      (e.flow || 'outflow') === 'outflow' &&
      e.category === CASH_OUT_CATEGORY &&
      !e.cashOutReviewed &&
      !e.disputeStatus &&
      // Recent enough to actually remember, and not a bank fee.
      parseLocalDate(e.date).getTime() >= cutoff &&
      !isBankFee(e.description))
    .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
}

// ─── State transitions ──────────────────────────────────────────────────────
// Each returns the PATCH to apply, so callers persist with their own save path
// and nothing here needs to know about storage.

export function markDisputed(now: Date = new Date()): Partial<Expense> {
  return { disputeStatus: 'open', disputedAt: now.toISOString(), disputeResolvedAt: undefined };
}

/** Won: the charge stays out of spend and the credit that came back is
 *  suppressed. BOTH patches must be applied — applying only the charge's leaves
 *  the credit netting against its category on top of an already-excluded charge,
 *  which invents money. Passing no credit is allowed (they refunded by some other
 *  route, or it hasn't posted); then there's nothing to suppress. */
export function resolveDisputeWon(
  charge: Expense,
  credit: Expense | null,
  now: Date = new Date(),
): { charge: Partial<Expense>; credit: Partial<Expense> | null } {
  return {
    charge: {
      disputeStatus: 'won',
      disputeResolvedAt: now.toISOString(),
      disputeCreditId: credit?.id,
    },
    credit: credit ? { disputeCreditFor: charge.id } : null,
  };
}

/** Lost: it was a real charge after all. Back to normal spend, and any credit
 *  we'd linked is released (if a conditional credit was posted then reversed,
 *  the two rows net each other naturally). */
export function resolveDisputeLost(
  charge: Expense,
  now: Date = new Date(),
): { charge: Partial<Expense>; releaseCreditId: string | undefined } {
  return {
    charge: {
      disputeStatus: 'lost',
      disputeResolvedAt: now.toISOString(),
      disputeCreditId: undefined,
    },
    releaseCreditId: charge.disputeCreditId,
  };
}

/** Undo — back to an ordinary charge as if never disputed. */
export function clearDispute(charge: Expense): { charge: Partial<Expense>; releaseCreditId: string | undefined } {
  return {
    charge: {
      disputeStatus: undefined,
      disputedAt: undefined,
      disputeResolvedAt: undefined,
      disputeCreditId: undefined,
    },
    releaseCreditId: charge.disputeCreditId,
  };
}

export const DISPUTE_LABELS: Record<DisputeStatus, string> = {
  open: 'Disputed',
  won: 'Refunded',
  lost: 'Dispute lost',
};

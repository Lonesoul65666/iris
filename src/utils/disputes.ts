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
// SCOPE (2026-08-20): the queue is no longer the only surface. disputeNudges()
// below builds real Dashboard nudges — a credit that has landed and needs
// confirming, and disputes that have gone quiet — so "what's my reminder
// recourse outside of digging through my transactions" has an answer you get
// without going looking. `stale` still turns the row amber inside the queue.
//
// Pure functions — no React, no IO. The plot is computed here; prose lives in
// the components.

import type { Expense, DisputeStatus } from '../types/budget';
import type { Nudge } from './nudgeEngine';
import { parseLocalDate, isDisputeExcluded } from './transactionAnalysis';

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

/** A refund that is being HELD OUT of the budget for a dispute that no longer
 *  justifies it.
 *
 *  `disputeCreditFor` suppresses a credit so it can't net against its category
 *  while the charge it offsets is already excluded from spend — count both and
 *  you invent money. But the link is a bare id with nothing enforcing the other
 *  end, so two ordinary actions strand it:
 *
 *   • DELETE the disputed charge. `disputeCreditFor` now points at nothing, the
 *     credit is suppressed forever, and there is no way back through the UI — the
 *     dispute badge only renders when `disputeStatus` is set, which a credit never
 *     has. SQL was the only exit (2026-08-19 audit).
 *   • Resolve or undo a dispute and have the SECOND save fail. Every one of those
 *     flows is two un-transacted patches (see NeedsYourCall), so the release can
 *     be lost to a closed tab or a sleeping host.
 *
 *  Both land in the same state: a suppressed credit whose charge is not excluded.
 *  That's the test — not "was the charge deleted" — so it covers the race too.
 *  Money stops disappearing quietly; it appears in the queue with a way out. */
export function listOrphanedDisputeCredits(expenses: Expense[]): Expense[] {
  const byId = new Map(expenses.map((e) => [e.id, e]));
  return expenses
    .filter((e) => {
      if (!e.disputeCreditFor) return false;
      const charge = byId.get(e.disputeCreditFor);
      // No charge at all, or a charge that counts as spend again → nothing for
      // this credit to offset.
      return !charge || !isDisputeExcluded(charge);
    })
    .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
}

/** Let the credit count again. The only fix — the suppression exists purely to
 *  pair with an excluded charge, and there is no longer one. */
export function releaseDisputeCredit(): Partial<Expense> {
  return { disputeCreditFor: undefined };
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

// ─── Dashboard nudges ───────────────────────────────────────────────────────

const money = (n: number) => '$' + Math.round(n).toLocaleString();

/**
 * The dispute reminders, on the Dashboard rather than only inside the queue.
 *
 * Scott's actual question was "what's my reminder recourse outside of digging
 * through my transactions" — and until now the answer was a coloured row on a
 * page you had to visit. Two beats, deliberately aggregated into at most two
 * cards: a dispute you forget about is a nag problem, and N cards for N disputes
 * is how a dashboard becomes wallpaper.
 *
 *  1. A CREDIT HAS LANDED. The event-driven half of the design — the credit
 *     arriving IS the reminder — and it needs one confirming tap to stop the
 *     money counting twice. This one is genuinely good news, so it says so.
 *  2. DISPUTES HAVE GONE QUIET. Past STALE_DISPUTE_DAYS with nothing back: the
 *     card company has almost certainly not posted a conditional credit, and
 *     issuers have filing deadlines. Also covers the "marked refunded, credit
 *     never linked" state, where the charge sits excluded indefinitely.
 *
 * Pure — the caller handles dismissal/snooze persistence like every other nudge.
 */
export function disputeNudges(expenses: Expense[], now: Date = new Date()): Nudge[] {
  const open = listOpenDisputes(expenses, now);
  if (open.length === 0) return [];
  const nudges: Nudge[] = [];

  const withCredit = open.filter((d) => d.candidateCredit);
  if (withCredit.length > 0) {
    const first = withCredit[0];
    const credit = first.candidateCredit!;
    const more = withCredit.length - 1;
    nudges.push({
      // Keyed on the charges involved, so resolving one and leaving another
      // produces a DIFFERENT nudge rather than a dismissed one staying silent.
      id: `dispute-credit:${withCredit.map((d) => d.charge.id).join(',')}`,
      severity: 'info',
      category: 'budget',
      icon: '💸',
      title: withCredit.length === 1 ? 'Your money came back' : `${withCredit.length} refunds came back`,
      body: `A ${money(credit.amount)} credit landed that matches your ${first.charge.description} dispute`
        + `${more > 0 ? `, plus ${more} more like it` : ''}. Confirm it in Needs your call and Iris will close the loop`
        + ` — until you do, the charge stays out of your budget and the credit is on hold, so neither number is finished.`,
      // The button navigates; it doesn't resolve anything. "Confirm the refund"
      // on a card that only changes page is a promise it can't keep.
      primary: { label: 'Take me to it', view: 'budget' },
      snoozeDays: 2,
    });
  }

  // Quiet ones: stale, and nothing to confirm (a landed credit is the other card).
  const quiet = open.filter((d) => d.stale && !d.candidateCredit);
  if (quiet.length > 0) {
    const oldest = quiet[0]; // listOpenDisputes sorts worst-first
    const held = quiet.reduce((t, d) => t + d.charge.amount, 0);
    const awaiting = quiet.filter((d) => d.awaitingCredit).length;
    nudges.push({
      id: `dispute-stale:${quiet.map((d) => d.charge.id).join(',')}`,
      severity: 'warning',
      category: 'budget',
      icon: '⏳',
      title: quiet.length === 1 ? 'A dispute has gone quiet' : `${quiet.length} disputes have gone quiet`,
      body: `${oldest.charge.description} (${money(oldest.charge.amount)}) has been ${oldest.awaitingCredit ? 'marked refunded' : 'open'}`
        + ` ${oldest.daysOpen} days with nothing back. Card issuers usually post a conditional credit inside a couple of weeks, and they have`
        + ` filing deadlines — worth chasing.`
        + (quiet.length > 1 ? ` ${money(held)} is held out of your budget across ${quiet.length} of these.` : '')
        + (awaiting > 0 ? ` ${awaiting === quiet.length ? 'It is' : `${awaiting} are`} marked refunded with no credit linked, so the charge stays excluded until one arrives.` : ''),
      primary: { label: 'Open the queue', view: 'budget' },
      snoozeDays: 7,
    });
  }

  return nudges;
}

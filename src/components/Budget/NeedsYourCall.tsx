// "Needs your call" — the queue for transactions Iris can't decide alone.
//
// Two kinds, one surface, because they're the same shape (Scott, 2026-08-13):
//   • OPEN DISPUTES — a charge you're fighting. This is the answer to "what's my
//     reminder recourse outside of digging through my transactions?" Nothing open
//     ever drops off this list, and when the matching credit lands Iris offers it
//     for one-click resolution — the credit arriving IS the reminder.
//   • UNATTRIBUTED CASH-OUT — ATM pulls and Cash App sends, ~10 a year. Iris
//     can't know what the cash bought, so it asks instead of guessing. Explicitly
//     NOT pattern matching: Scott said these are too rare and too varied for that.
//
// Silent when the queue is empty — the section renders nothing rather than
// sitting there as an empty box.
import { useMemo } from 'react';
import type { Expense, ExpenseCategory } from '../../types/budget';
import { formatCurrency } from '../../utils/format';
import {
  listOpenDisputes, listCashOutNeedingCall,
  resolveDisputeWon, resolveDisputeLost, clearDispute, rejectCandidateCredit,
} from '../../utils/disputes';
import { defaultBudgetBuckets } from '../../stores/budgetDefaults';

interface Props {
  expenses: Expense[];
  /** Persist a patch to one transaction (saveExpense + refresh upstream). */
  onPatch: (id: string, patch: Partial<Expense>) => Promise<void> | void;
}

const CATEGORY_OPTIONS = defaultBudgetBuckets
  .filter(b => b.category !== 'travel_work')
  .map(b => ({ id: b.category, label: b.label, icon: b.icon }));

const shortDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function NeedsYourCall({ expenses, onPatch }: Props) {
  const disputes = useMemo(() => listOpenDisputes(expenses), [expenses]);
  const cashOut = useMemo(() => listCashOutNeedingCall(expenses), [expenses]);

  if (disputes.length === 0 && cashOut.length === 0) return null;

  // Won: BOTH patches or neither. Excluding the charge while the credit still
  // nets would credit the money twice — the whole reason the link exists.
  //
  // ⚠️ CREDIT FIRST, DELIBERATELY. These are two separate saves with no
  // transaction, so one can land without the other (host asleep, LAN drop, tab
  // closed mid-click — all real on a home-hosted app). Charge-first fails into
  // "charge excluded + credit still netting" = phantom savings, invisible and
  // unrecoverable. Credit-first fails into "credit suppressed + dispute still
  // open" = spend OVERSTATED, which is the safe direction and stays on the queue
  // to be retried. Do not reorder these.
  const markWon = async (chargeId: string) => {
    const charge = expenses.find(e => e.id === chargeId);
    if (!charge) return;
    const found = disputes.find(d => d.charge.id === chargeId)?.candidateCredit ?? null;
    const { charge: cp, credit: crp } = resolveDisputeWon(charge, found);
    if (found && crp) await onPatch(found.id, crp);
    await onPatch(charge.id, cp);
  };

  // "That credit isn't the one" — keeps the dispute open, never offers it again.
  const rejectCandidate = async (chargeId: string, creditId: string) => {
    const charge = expenses.find(e => e.id === chargeId);
    if (!charge) return;
    await onPatch(charge.id, rejectCandidateCredit(charge, creditId));
  };

  const markLost = async (chargeId: string) => {
    const charge = expenses.find(e => e.id === chargeId);
    if (!charge) return;
    const { charge: cp, releaseCreditId } = resolveDisputeLost(charge);
    await onPatch(charge.id, cp);
    if (releaseCreditId) await onPatch(releaseCreditId, { disputeCreditFor: undefined });
  };

  const undo = async (chargeId: string) => {
    const charge = expenses.find(e => e.id === chargeId);
    if (!charge) return;
    const { charge: cp, releaseCreditId } = clearDispute(charge);
    await onPatch(charge.id, cp);
    if (releaseCreditId) await onPatch(releaseCreditId, { disputeCreditFor: undefined });
  };

  return (
    <div className="soft-well p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Needs your call</h2>
        <p className="text-xs text-text-muted">
          Iris can't decide these on its own — a couple of taps and they're off the list.
        </p>
      </div>

      {/* ── Open disputes ── */}
      {disputes.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-warning" />
            <span className="text-xs font-bold uppercase tracking-wider text-warning">
              Disputes you're fighting
            </span>
            <span className="text-[10px] text-text-muted">· held out of your budget while open</span>
          </div>
          <div className="space-y-2">
            {disputes.map(({ charge, daysOpen, stale, candidateCredit, awaitingCredit }) => (
              <div key={charge.id} className={`p-3 rounded-xl bg-white/[0.04] border-l-2 ${awaitingCredit ? 'border-positive/50' : 'border-warning/50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* Plain text, not a button: there is no deep-link plumbing to
                        a single transaction, and a hover-styled no-op is worse
                        than no affordance. */}
                    <div className="text-sm font-medium text-text-primary truncate">
                      {charge.description}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {formatCurrency(charge.amount)} · {shortDate(charge.date)} ·{' '}
                      <span className={stale && !awaitingCredit ? 'text-warning font-semibold' : ''}>
                        {awaitingCredit ? 'marked refunded' : 'disputed'}{' '}
                        {daysOpen === 0 ? 'today' : `${daysOpen} day${daysOpen === 1 ? '' : 's'} ago`}
                      </span>
                      {awaitingCredit && <span className="text-positive"> · credit not linked yet</span>}
                    </div>
                  </div>
                  <button onClick={() => undo(charge.id)}
                    className="text-[10px] text-text-muted hover:text-text-secondary flex-shrink-0"
                    title="Not actually disputing this — put it back as normal spend">
                    undo
                  </button>
                </div>

                {/* The credit landing IS the reminder — offer it, let Scott confirm. */}
                {candidateCredit ? (
                  <div className="mt-2 rounded-lg border border-positive/40 bg-positive/10 px-2.5 py-2">
                    <div className="text-[11px] text-text-secondary">
                      A <strong className="text-positive">{formatCurrency(candidateCredit.amount)}</strong> credit
                      landed {shortDate(candidateCredit.date)} that matches this.
                      <span className="text-text-muted"> ({candidateCredit.description})</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => markWon(charge.id)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-positive/20 border border-positive/50 text-positive hover:bg-positive/30 transition-colors">
                        {awaitingCredit ? "That's it — link the refund" : "That's the refund — mark won"}
                      </button>
                      {/* Keeps the dispute OPEN. This used to call markLost — a button
                          labelled "not related" that quietly conceded the dispute,
                          returned the charge to spend, and destroyed the reminder. */}
                      <button onClick={() => rejectCandidate(charge.id, candidateCredit.id)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-glass-border text-text-muted hover:text-text-secondary transition-colors"
                        title="Keep the dispute open and stop offering this credit">
                        Not this credit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-text-muted flex-1">
                      {awaitingCredit
                        ? 'Marked refunded, but no credit is linked yet — this stays here until one arrives, so the refund can only count once.'
                        : stale
                          ? "No credit yet — worth chasing the card company."
                          : 'Waiting on the credit. Iris will flag it the moment it lands.'}
                    </span>
                    {!awaitingCredit && (
                      <button onClick={() => markWon(charge.id)}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold border border-positive/40 text-positive hover:bg-positive/15 transition-colors"
                        title="They refunded it. Stays on this list until the credit posts so it can be linked.">
                        Refunded
                      </button>
                    )}
                    <button onClick={() => markLost(charge.id)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold border border-negative/40 text-negative hover:bg-negative/15 transition-colors"
                      title="Dispute failed — count it as normal spend again">
                      Lost it
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Unattributed cash ── */}
      {cashOut.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <span className="text-xs font-bold uppercase tracking-wider text-accent-light">
              Cash — where did it go?
            </span>
            <span className="text-[10px] text-text-muted">· counted as spend, just not attributed</span>
          </div>
          <div className="space-y-1.5">
            {cashOut.map(e => (
              <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04]">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-text-primary truncate">{e.description}</div>
                  <div className="text-[10px] text-text-muted">{shortDate(e.date)}</div>
                </div>
                <span className="mono-num text-sm font-semibold text-text-primary flex-shrink-0">
                  {formatCurrency(e.amount)}
                </span>
                <select
                  value=""
                  onChange={ev => {
                    const v = ev.target.value;
                    if (!v) return;
                    if (v === '__keep__') { void onPatch(e.id, { cashOutReviewed: true }); return; }
                    void onPatch(e.id, { category: v as ExpenseCategory, cashOutReviewed: true });
                  }}
                  className="bg-surface-2 border border-glass-border rounded px-1.5 py-1 text-[11px] text-text-secondary outline-none focus:border-accent/50 max-w-[170px] flex-shrink-0">
                  <option value="">What was it for?</option>
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                  <option value="__keep__">— Keep as ATM / Cash</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Stashes — saving pots for lumpy life (taxes, trips, remodels, December).
// Lives on the Budget OVERVIEW (daily-visible, not buried in edit mode).
// Balances are DERIVED from contributions minus linked-category spend — see
// docs/stashes-design.md. Editing saves directly (same pattern as the old grid).
import { useMemo, useState } from 'react';
import type { Expense, Stash } from '../../types/budget';
import type { DeployConfirmation } from '../../stores/budgetStore';
import { formatCurrency, formatDuration } from '../../utils/format';
import { computeCommitRun, requiredMonthlyForGoal, computeShortfall, monthsElapsedInclusive, type StashForecast, type StashCommitRow } from '../../utils/stashMath';
import { currentMonthKey } from '../../utils/transactionAnalysis';
import { defaultBudgetBuckets } from '../../stores/budgetDefaults';

interface Props {
  stashes: Stash[];
  expenses: Expense[];
  /** Commit ledger — a pot's balance is opening + its committed moves − draws. */
  confirms: DeployConfirmation[];
  /** Commit/undo this month's move for a pot. Same handler the Pulse uses, so
   *  committing from either surface updates both. */
  /** `topUp` raises an existing partial commit instead of undoing it. */
  onCommitStash?: (stashId: string, amount: number, topUp?: boolean) => void;
  onChange: (next: Stash[]) => void;
}

const HAVE_COLOR = '#f59e0b'; // have-to = obligation (amber)
const WANT_COLOR = '#a855f7'; // want-to = goal (violet)
const kindOf = (s: Stash): 'have_to' | 'want_to' => s.kind ?? 'want_to';

// Category picker options (id/label/icon) — sourced from the bucket catalog so
// labels match everywhere. travel_work excluded (always reserve, never linkable).
const CATEGORY_OPTIONS = defaultBudgetBuckets
  .filter(b => b.category !== 'travel_work')
  .map(b => ({ id: b.category, label: b.label, icon: b.icon }));

function catMeta(id: string) {
  return CATEGORY_OPTIONS.find(c => c.id === id) ?? { id, label: id, icon: '📦' };
}

function monthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const mon = new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  return `${mon} '${String(y).slice(2)}`; // "Jun '26" — never mistakable for a day-of-month
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The forward-looking line under a stash's goal bar — REWRITTEN 2026-08-12 to
// Scott's model. It used to score every pot as "behind" and tell you to "bump to
// $X/mo", where $X climbed a little every day (the fractional-calendar bug in
// stashMath). It's not a grade; it's a payment schedule:
//
//   want-to  → "$202/mo × 5 moves left → Dec 15, 2026"
//   have-to  → "$434/mo over 3 moves to cover Nov 1, 2026"
//
// Nobody is behind for having started in July. A pot that needs more per month
// than its planned drip just says so, and the ask self-corrects each month.
function forecastLine(f: StashForecast): { text: string; cls: string } {
  const eta = f.daysToFill != null ? formatDuration(f.daysToFill) : null;
  const haveTo = f.kind === 'have_to';
  const moves = f.commitMonthsLeft;
  const movesLabel = moves === 1 ? '1 move left' : `${moves} moves left`;

  switch (f.status) {
    case 'met':
      return { text: haveTo ? 'Fully funded for the next one' : 'Goal met — this money is free to redeploy', cls: 'text-positive' };
    case 'past_due':
      return { text: `${f.dueLabel} has passed — ${formatCurrency(f.hitRemaining ?? f.remaining)} was never set aside`, cls: 'text-negative' };
    case 'on_track': {
      // Two very different states land here. requiredPerMonth === 0 means the
      // money is ALREADY sitting there for the next hit. Anything else means the
      // planned drip is big enough — but the cash isn't in yet, so saying
      // "Covered ✓" next to a live "Commit $73" ask contradicts itself.
      if (!f.requiredPerMonth) {
        return { text: haveTo ? `Covered for ${f.dueLabel} ✓` : `Funded for ${f.dueLabel} ✓`, cls: 'text-positive' };
      }
      const rate = formatCurrency(f.requiredPerMonth);
      return haveTo
        ? { text: `${rate}/mo over ${movesLabel} covers ${f.dueLabel} ✓`, cls: 'text-positive' }
        : { text: `${rate}/mo × ${movesLabel} → ${f.dueLabel} ✓`, cls: 'text-positive' };
    }
    case 'behind': {
      // Not a verdict — the schedule. `requiredPerMonth` is now stable inside a
      // month (it divides by moves, not days), so this number is quotable.
      const rate = formatCurrency(f.requiredPerMonth || 0);
      return haveTo
        ? { text: `${rate}/mo over ${movesLabel} to cover ${f.dueLabel}`, cls: 'text-text-secondary' }
        : { text: `${rate}/mo × ${movesLabel} → ${f.dueLabel}`, cls: 'text-text-secondary' };
    }
    case 'projecting':
      return eta
        ? { text: `${eta} to go at ${formatCurrency(f.contribution)}/mo — set a date to split it evenly`, cls: 'text-text-secondary' }
        : { text: 'Set a $/mo amount to project a fill date', cls: 'text-text-muted' };
    case 'idle':
      return { text: 'Set a date and a goal and I\'ll split it into monthly moves', cls: 'text-text-muted' };
  }
}

/** Second line, recurring have-tos only: the mid-cycle-start disclosure. You
 *  can't fund a Nov 1 insurance hit at the steady rate in four months, and that
 *  is the calendar's fault, not yours — so show BOTH numbers instead of grading
 *  the pot against a rate it never had time to hit. (Scott's call, 2026-08-12.) */
function steadyStateLine(f: StashForecast): string | null {
  if (!f.steadyStatePerMonth || f.status === 'met') return null;
  // Only disclose the compression when it's actually costing you something. Once
  // an opening balance covers the first hit the pot is on plan, and "first cycle
  // is short" becomes noise about a problem that no longer exists.
  if (!f.firstCycleCompressed || f.status === 'on_track') {
    return `${formatCurrency(f.steadyStatePerMonth)}/mo is the steady rate`;
  }
  return `First cycle is short — settles to ${formatCurrency(f.steadyStatePerMonth)}/mo after ${f.dueLabel}`;
}

export default function StashesCard({ stashes, expenses, confirms, onCommitStash, onChange }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  // Inline two-click delete confirm — window.confirm() is a native dialog that
  // blocks the whole tab (and froze browser automation mid-session).
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [confirmingRetire, setConfirmingRetire] = useState<string | null>(null);
  // Same computation the Pulse footer renders from, so the two surfaces can't
  // disagree about what a pot wants or what's been committed.
  const run = useMemo(() => computeCommitRun(stashes, expenses, confirms), [stashes, expenses, confirms]);
  const thisMonthLabel = new Date().toLocaleDateString('en-US', { month: 'long' });

  const update = (id: string, patch: Partial<Stash>) => {
    onChange(stashes.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  // Goal/date changes auto-fill the $/mo needed to hit the goal by the due date
  // (Scott: "don't make me do the math") — the user can still override it after.
  // No-op on the contribution when there's nothing to compute (no date/goal yet).
  const updateAuto = (id: string, patch: Partial<Stash>, balance: number) => {
    const sf = stashes.find(s => s.id === id);
    if (!sf) return update(id, patch);
    const req = requiredMonthlyForGoal({ ...sf, ...patch }, balance);
    update(id, req != null ? { ...patch, monthlyContribution: req } : patch);
  };

  const addStash = (kind: 'have_to' | 'want_to') => {
    const id = `stash-${Date.now()}`;
    onChange([...stashes, {
      id,
      name: kind === 'have_to' ? 'New have-to' : 'New want-to',
      kind,
      targetAmount: 0,
      currentBalance: 0,
      monthlyContribution: 0,
      color: kind === 'have_to' ? HAVE_COLOR : WANT_COLOR,
      categories: [],
      startMonth: currentMonthKey(),
      openingBalance: 0,
    }]);
    setExpanded(id);
  };

  const removeStash = (id: string) => {
    if (confirmingDelete !== id) {
      setConfirmingDelete(id);
      setTimeout(() => setConfirmingDelete(prev => (prev === id ? null : prev)), 4000);
      return;
    }
    setConfirmingDelete(null);
    setExpanded(null);
    onChange(stashes.filter(s => s.id !== id));
  };

  // Retire a crushed goal — "we bought it." Two-click confirm. Snapshots the
  // final balance for the trophy, then zeroes the moving parts so the stash goes
  // inert (no contribution, no linked categories, no reserve draw) and drops out
  // of active tracking + the $15,800 plan. Archived, not deleted.
  const retireStash = (id: string, balanceSnapshot: number) => {
    if (confirmingRetire !== id) {
      setConfirmingRetire(id);
      setTimeout(() => setConfirmingRetire(prev => (prev === id ? null : prev)), 4000);
      return;
    }
    setConfirmingRetire(null);
    setExpanded(null);
    const sf = stashes.find(s => s.id === id);
    const nowIso = new Date().toISOString();
    const saved = Math.round(balanceSnapshot);
    update(id, {
      achievedAt: nowIso,
      currentBalance: saved,
      // Durable trophy-room snapshot — captured before the live fields are zeroed.
      achievement: {
        savedAmount: saved,
        targetAmount: sf?.targetAmount ?? 0,
        startMonth: sf?.startMonth,
        achievedAt: nowIso,
        monthsSaving: sf?.startMonth ? monthsElapsedInclusive(sf.startMonth) : undefined,
      },
      monthlyContribution: 0,
      monthlyFill: 0,
      categories: [],
      startMonth: undefined,
    });
  };

  return (
    // De-boxed (design polish, 2026-07-06): a soft well instead of the full
    // metallic glass-card chrome — the section still reads as its own zone on
    // the page, but without one more heavy border in the stack.
    <div className="soft-well p-6">
      <div className="flex items-start justify-between mb-1 gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Have To's / Want To's</h2>
          <p className="text-xs text-text-muted">
            <span style={{ color: HAVE_COLOR }} className="font-semibold">Have-tos</span> are bills you pre-fund (taxes, insurance, yearly stuff). <span style={{ color: WANT_COLOR }} className="font-semibold">Want-tos</span> are goals (trips, the office, a remodel). Fund each, watch it grow.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => addStash('have_to')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:brightness-125"
            style={{ background: HAVE_COLOR + '22', borderColor: HAVE_COLOR + '66', color: HAVE_COLOR }}>
            + Have-to
          </button>
          <button onClick={() => addStash('want_to')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:brightness-125"
            style={{ background: WANT_COLOR + '22', borderColor: WANT_COLOR + '66', color: WANT_COLOR }}>
            + Want-to
          </button>
        </div>
      </div>

      {(() => {
        const renderCard = (row: StashCommitRow) => {
          const { status, forecast, ask, committed, isCommitted, isFullyFunded } = row;
          // Committed but still owing = part-funded. Three states, not two.
          const isPartial = isCommitted && !isFullyFunded;
          const { stash: sf, balance, derived, drawn, monthsAccrued, biggestDraw } = status;
          const isOpen = expanded === sf.id;
          const negative = balance < 0;
          const shortfall = computeShortfall(status);
          const fline = forecast ? forecastLine(forecast) : null;
          const sline = forecast ? steadyStateLine(forecast) : null;
          return (
            <div key={sf.id} className={`p-4 rounded-xl bg-white/[0.05] ${negative ? 'border-l-2 border-negative/50' : ''}`}>
              {/* Name gets the whole row. The $/mo box used to share it, which
                  squeezed longer names to nothing in the 3-up grid ("Credit Card
                  Membership" rendered as "Credit Car"). */}
              <div className="flex items-center mb-1 gap-2">
                <button onClick={() => update(sf.id, { kind: kindOf(sf) === 'have_to' ? 'want_to' : 'have_to' })}
                  className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: (kindOf(sf) === 'have_to' ? HAVE_COLOR : WANT_COLOR) + '22', color: kindOf(sf) === 'have_to' ? HAVE_COLOR : WANT_COLOR }}
                  title="Toggle have-to / want-to">
                  {kindOf(sf) === 'have_to' ? 'Have' : 'Want'}
                </button>
                <input value={sf.name} onChange={e => update(sf.id, { name: e.target.value })}
                  title={sf.name}
                  className="text-sm font-medium text-text-primary bg-transparent border border-transparent hover:border-glass-border focus:border-accent/50 rounded px-1 py-0.5 outline-none min-w-0 flex-1" />
              </div>

              {/* Balance, with the PLANNED drip beside it. Labelled "plan" because
                  the number that actually matters now is the ask on the commit
                  button below — this one is just your intended monthly. */}
              <div className="flex items-baseline justify-between gap-2">
                <div className={`text-2xl font-black mono-num ${negative ? 'text-negative' : 'text-positive'}`}>
                  {negative ? '−' : ''}{formatCurrency(Math.abs(balance))}
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0 text-xs text-text-muted">
                  <span>$</span>
                  <input type="number" value={sf.monthlyContribution}
                    onChange={e => update(sf.id, { monthlyContribution: Number(e.target.value) || 0 })}
                    title="Your planned monthly move"
                    className="w-14 bg-transparent border border-transparent hover:border-glass-border focus:border-accent/50 rounded px-1 py-0.5 text-right outline-none" />
                  <span>/mo plan</span>
                </div>
              </div>
              {!shortfall && (
                <div className="text-[10px] text-text-muted mb-2">
                  {derived
                    ? `Started ${monthShort(sf.startMonth!)} · funded ${monthsAccrued} month${monthsAccrued === 1 ? '' : 's'}${drawn > 0 ? ` · ${formatCurrency(drawn)} drawn` : ''}`
                    : 'manual balance — open to start auto-tracking'}
                </div>
              )}
              {/* Chunk D — shortfall nudge: the bill outran the pot. Flag the gap
                  so it gets made up, with the current-drip recovery time. */}
              {shortfall && (
                <div className="mb-2 rounded-lg border border-negative/40 bg-negative/10 px-2 py-1.5">
                  <div className="text-[11px] font-bold text-negative">{formatCurrency(shortfall.gap)} short</div>
                  <div className="text-[10px] text-text-secondary mt-0.5">
                    {shortfall.culprit
                      ? `The ${formatCurrency(shortfall.culprit.amount)} hit outran the pot. `
                      : 'Spending ran past what was set aside. '}
                    Add {formatCurrency(shortfall.gap)} to catch up{shortfall.recoverMonths ? `, or back to even in ${shortfall.recoverMonths} mo at ${formatCurrency(sf.monthlyContribution)}/mo` : ''}.
                  </div>
                </div>
              )}

              {/* Goal + forecast — surfaced so each pot shows how full AND when it
                  fills (the GoalTracker math, now on the stash itself). No goal =
                  a nudge to set one (you can't deploy toward a goal you can't see). */}
              {forecast && fline ? (
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-text-muted">{forecast.percent}% of {formatCurrency(forecast.target)} goal</span>
                    {forecast.status !== 'met' && forecast.remaining > 0 && (
                      <span className="text-text-secondary font-medium">{formatCurrency(forecast.remaining)} to go</span>
                    )}
                  </div>
                  <div className="track-well rounded-full h-1.5 mb-1">
                    <div className={`h-1.5 rounded-full transition-all ${forecast.status === 'met' ? 'track-fill-positive' : ''}`}
                      style={{ width: `${forecast.percent}%`, background: forecast.status === 'met' ? undefined : sf.color }} />
                  </div>
                  <div className={`text-[10px] ${fline.cls}`}>{fline.text}</div>
                  {sline && <div className="text-[10px] text-text-muted mt-0.5">{sline}</div>}
                </div>
              ) : (
                <button onClick={() => setExpanded(sf.id)}
                  className="text-[10px] text-accent/80 hover:underline mb-2 block">
                  + Set a goal to track progress
                </button>
              )}

              {/* ⭐ This month's move, ON the card that shows the numbers. It used
                  to live only in the Pulse footer, so the surface with the balance
                  and the goal had no idea whether you'd committed — "commit shows
                  a change but no indicator, or vice versa" (Scott, 2026-08-12). */}
              {onCommitStash && (isCommitted || ask > 0) && (
                <>
                  <button onClick={() => onCommitStash(sf.id, isPartial ? ask : isFullyFunded ? committed : ask, isPartial)}
                    className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                      isPartial
                        ? 'bg-warning/15 border-warning/40 text-warning hover:bg-warning/25'
                        : isFullyFunded
                          ? 'bg-positive/15 border-positive/40 text-positive hover:bg-negative/10 hover:text-negative hover:border-negative/30'
                          : 'bg-accent/15 border-accent/40 text-accent-light hover:bg-accent/25'}`}
                    title={isPartial
                      ? `${formatCurrency(committed)} moved, ${formatCurrency(ask)} still to go — click to top up the rest`
                      : isFullyFunded
                        ? `Committed ${formatCurrency(committed)} for ${thisMonthLabel} — click to undo`
                        : `Mark ${formatCurrency(ask)} moved into savings for ${thisMonthLabel}`}>
                    {isPartial
                      ? `Top up ${formatCurrency(ask)} — ${formatCurrency(committed)} in so far`
                      : isFullyFunded
                        ? `✓ ${formatCurrency(committed)} committed for ${thisMonthLabel} · undo`
                        : `Commit ${formatCurrency(ask)} for ${thisMonthLabel}`}
                  </button>
                  {/* Part-funded pots need an escape hatch too — the top-up button
                      took over the tap that used to undo. */}
                  {isPartial && (
                    <button onClick={() => onCommitStash(sf.id, committed, false)}
                      className="w-full mt-1 text-[10px] text-text-muted hover:text-negative transition-colors"
                      title={`Clear the ${formatCurrency(committed)} committed for ${thisMonthLabel}`}>
                      undo the {formatCurrency(committed)}
                    </button>
                  )}
                  <div className="mb-2" />
                </>
              )}

              {/* Crushed a want-to → confirm the purchase and retire it. */}
              {kindOf(sf) === 'want_to' && forecast?.status === 'met' && (
                <button onClick={() => retireStash(sf.id, balance)}
                  className={`w-full mb-2 px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                    confirmingRetire === sf.id
                      ? 'bg-positive/25 border-positive/60 text-positive'
                      : 'bg-positive/15 border-positive/40 text-positive hover:bg-positive/25'}`}>
                  {confirmingRetire === sf.id ? 'Tap again — mark it bought & retire this goal' : 'We bought it — mark done'}
                </button>
              )}

              {/* Linked categories */}
              <div className="flex flex-wrap gap-1 mb-1">
                {(sf.categories ?? []).map(c => {
                  const meta = catMeta(c);
                  return (
                    <span key={c} className="cyber-chip border bg-white/5 border-white/15 text-text-secondary text-[10px]">
                      {meta.label}
                      <button onClick={() => update(sf.id, { categories: (sf.categories ?? []).filter(x => x !== c) })}
                        className="ml-0.5 text-text-muted hover:text-negative" title="Unlink category">×</button>
                    </span>
                  );
                })}
                {biggestDraw && (
                  <span className="text-[10px] text-text-muted self-center">biggest hit {formatCurrency(biggestDraw.amount)} in {monthShort(biggestDraw.month)}</span>
                )}
              </div>

              {/* Expand / collapse */}
              <button onClick={() => setExpanded(isOpen ? null : sf.id)} className="text-[10px] text-accent hover:underline">
                {isOpen ? 'Done' : 'Settings'}
              </button>

              {isOpen && (
                <div className="mt-2 pt-2 border-t border-glass-border/40 space-y-2 text-xs text-text-muted">
                  {!derived && (
                    <button
                      onClick={() => update(sf.id, { startMonth: currentMonthKey(), openingBalance: sf.currentBalance || 0 })}
                      className="px-2 py-1 rounded bg-positive/15 border border-positive/40 text-positive text-[11px] font-semibold hover:bg-positive/25 transition-colors">
                      Start auto-tracking from this month
                    </button>
                  )}
                  {derived && (
                    <div className="flex items-center justify-between gap-2">
                      <span>Opening balance (what was already set aside in {monthShort(sf.startMonth!)})</span>
                      <span className="flex items-center gap-0.5">$
                        <input type="number" value={sf.openingBalance ?? 0}
                          onChange={e => update(sf.id, { openingBalance: Number(e.target.value) || 0 })}
                          className="w-20 bg-transparent border border-glass-border focus:border-accent/50 rounded px-1 py-0.5 text-right outline-none" />
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span>Goal (optional)</span>
                    <span className="flex items-center gap-0.5">$
                      <input type="number" value={sf.targetAmount}
                        onChange={e => updateAuto(sf.id, { targetAmount: Number(e.target.value) || 0 }, balance)}
                        className="w-20 bg-transparent border border-glass-border focus:border-accent/50 rounded px-1 py-0.5 text-right outline-none" />
                    </span>
                  </div>
                  {/* Cadence — when's it due? Drives the countdown + pace nudge.
                      Category linking (below) only surfaces on an unlinked stash. */}
                  <div className="space-y-1.5">
                    <span>When's it due?</span>
                    <div className="flex gap-1">
                      {([
                        { c: 'semiannual', label: 'Twice a year' },
                        { c: 'annual', label: 'Once a year' },
                        { c: 'custom', label: 'By a date' },
                      ] as const).map(({ c, label }) => {
                        const current = sf.cadence ?? (sf.targetDate ? 'custom' : undefined);
                        const active = current === c;
                        return (
                          <button key={c}
                            onClick={() => updateAuto(sf.id, c === 'custom'
                              ? { cadence: 'custom' }
                              : { cadence: c, dueMonth: sf.dueMonth ?? (new Date().getMonth() + 1) }, balance)}
                            className={`flex-1 px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${active ? 'bg-accent/20 border-accent/50 text-accent' : 'border-glass-border text-text-muted hover:text-text-secondary'}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {(sf.cadence === 'annual' || sf.cadence === 'semiannual') && (
                      <div className="flex items-center justify-between gap-2">
                        <span>Which month{sf.cadence === 'semiannual' ? ' (repeats +6 mo)' : ''}?</span>
                        <select value={sf.dueMonth ?? ''}
                          onChange={e => updateAuto(sf.id, { dueMonth: Number(e.target.value) || undefined }, balance)}
                          className="bg-surface-2 border border-glass-border rounded px-1.5 py-1 text-[11px] text-text-secondary outline-none">
                          <option value="">choose…</option>
                          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                      </div>
                    )}
                    {(sf.cadence === 'custom' || (!sf.cadence && sf.targetDate)) && (
                      <div className="flex items-center justify-between gap-2">
                        <span>Target date</span>
                        <input type="date" value={sf.targetDate ?? ''}
                          onChange={e => updateAuto(sf.id, { targetDate: e.target.value || undefined }, balance)}
                          className="bg-surface-2 border border-glass-border rounded px-1.5 py-1 text-[11px] text-text-secondary outline-none" />
                      </div>
                    )}
                  </div>
                  {/* Link a category — shown ONLY when nothing's linked yet. A
                      linked category drops this pot's spend into the reserve lane,
                      so its bills draw the pot down instead of double-counting
                      against Safe-to-Spend when you've already committed for them.
                      Auto-created cards arrive pre-linked, so this stays hidden. */}
                  {(sf.categories ?? []).length === 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <span title="So its bills draw from this pot instead of hitting Safe-to-Spend twice">Cover a category</span>
                      <select
                        value=""
                        onChange={e => {
                          const c = e.target.value;
                          if (c) update(sf.id, { categories: [c] });
                        }}
                        className="bg-surface-2 border border-glass-border rounded px-1.5 py-1 text-[11px] text-text-secondary outline-none max-w-[160px]">
                        <option value="">choose…</option>
                        {CATEGORY_OPTIONS.map(c => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    {kindOf(sf) === 'want_to' && (
                      <button onClick={() => retireStash(sf.id, balance)}
                        className={`text-[10px] ${confirmingRetire === sf.id ? 'px-2 py-0.5 rounded bg-positive/20 border border-positive/50 text-positive font-bold' : 'text-positive/80 hover:text-positive'}`}>
                        {confirmingRetire === sf.id ? 'Tap again — mark bought & retire' : 'Mark as bought'}
                      </button>
                    )}
                    <button onClick={() => removeStash(sf.id)}
                      className={`text-[10px] ${confirmingDelete === sf.id ? 'px-2 py-0.5 rounded bg-negative/20 border border-negative/50 text-negative font-bold' : 'text-negative/80 hover:text-negative'}`}>
                      {confirmingDelete === sf.id ? 'Click again to delete — transactions are untouched' : 'Delete stash'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        };
        // computeCommitRun already drops retired pots; the trophy shelf reads
        // straight off the stash list.
        const active = run.rows;
        const achieved = stashes.filter(s => s.achievedAt);
        const groups = [
          { key: 'have', label: "Have to's", color: HAVE_COLOR, hint: 'bills you pre-fund', list: active.filter(s => kindOf(s.stash) === 'have_to') },
          { key: 'want', label: "Want to's", color: WANT_COLOR, hint: "goals you're saving toward", list: active.filter(s => kindOf(s.stash) === 'want_to') },
        ];
        return (
          <div className="mt-4 space-y-5">
            {groups.map(g => g.list.length === 0 ? null : (
              <div key={g.key}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: g.color }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: g.color }}>{g.label}</span>
                  <span className="text-[10px] text-text-muted">· {g.hint}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {g.list.map(renderCard)}
                </div>
              </div>
            ))}

            {/* Crushed — the trophy shelf. Retired want-to's, bought and done. */}
            {achieved.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-positive" />
                  <span className="text-xs font-bold uppercase tracking-wider text-positive">Crushed</span>
                  <span className="text-[10px] text-text-muted">· bought &amp; done</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {achieved.map((sf) => (
                    <div key={sf.id} className="p-3 rounded-xl bg-positive/5 border border-positive/25 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{sf.name}</div>
                        <div className="text-[10px] text-text-muted">
                          saved {formatCurrency(sf.achievement?.savedAmount ?? sf.currentBalance ?? 0)}
                          {sf.achievement?.monthsSaving ? ` over ${sf.achievement.monthsSaving} mo` : ''}
                          {sf.achievedAt ? ` · done ${new Date(sf.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                        </div>
                      </div>
                      <button onClick={() => update(sf.id, { achievedAt: undefined })}
                        className="text-[10px] text-text-muted hover:text-accent-light flex-shrink-0" title="Bring this goal back to active">
                        undo
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ⭐ The commit run's bottom line. Scott commits each pot, then moves ONE
          number from checking into the special savings — so that number gets to
          be the headline instead of something he adds up by hand. Mirrored in the
          Pulse footer from the same computeCommitRun call. */}
      <div className="mt-4 pt-3 border-t border-glass-border/40 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
            Committed in {thisMonthLabel} — move this from checking
          </div>
          {run.pendingCount > 0 ? (
            <div className="text-[11px] text-text-secondary mt-0.5">
              {run.pendingCount} {run.pendingCount === 1 ? 'pot is' : 'pots are'} still asking for{' '}
              <strong className="text-accent-light mono-num">{formatCurrency(run.remainingAsk)}</strong>
              {' '}— <span className="text-text-muted">{formatCurrency(run.committedTotal + run.remainingAsk)} total if you commit them all</span>
            </div>
          ) : (
            <div className="text-[11px] text-positive mt-0.5">Every pot is funded for {thisMonthLabel} ✓</div>
          )}
        </div>
        <div className="mono-num text-2xl font-black text-positive leading-none">{formatCurrency(run.committedTotal)}</div>
      </div>
    </div>
  );
}

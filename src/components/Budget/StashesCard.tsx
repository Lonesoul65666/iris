// Stashes — saving pots for lumpy life (taxes, trips, remodels, December).
// Lives on the Budget OVERVIEW (daily-visible, not buried in edit mode).
// Balances are DERIVED from contributions minus linked-category spend — see
// docs/stashes-design.md. Editing saves directly (same pattern as the old grid).
import { useMemo, useState } from 'react';
import type { Expense, Stash } from '../../types/budget';
import { formatCurrency, formatDuration } from '../../utils/format';
import { computeAllStashes, computeStashForecast, totalStashContributions, requiredMonthlyForGoal, computeShortfall, type StashForecast } from '../../utils/stashMath';
import { currentMonthKey } from '../../utils/transactionAnalysis';
import { defaultBudgetBuckets } from '../../stores/budgetDefaults';

interface Props {
  stashes: Stash[];
  expenses: Expense[];
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

// The forward-looking line under a stash's goal bar: how it's pacing + when it
// fills. Day-granular + gamified — have-tos frame around "covering the next hit",
// want-tos around "reaching the goal at your current rate".
function forecastLine(f: StashForecast): { text: string; cls: string } {
  const rate = formatCurrency(f.contribution);
  const eta = f.daysToFill != null ? formatDuration(f.daysToFill) : null;
  const haveTo = f.kind === 'have_to';

  switch (f.status) {
    case 'met':
      return { text: haveTo ? 'Fully funded for the next one' : 'Goal met — this money is free to redeploy', cls: 'text-positive' };
    case 'on_track':
      return haveTo
        ? { text: `Next one ~${f.dueLabel} — on pace to cover it ✓`, cls: 'text-positive' }
        : { text: `On pace to beat ${f.dueLabel} — there in ${eta}`, cls: 'text-positive' };
    case 'behind':
      return haveTo
        ? { text: `Next one ~${f.dueLabel} — short ${formatCurrency(f.hitRemaining ?? f.remaining)}; bump to ${formatCurrency(f.requiredPerMonth || 0)}/mo`, cls: 'text-warning' }
        : { text: `Behind for ${f.dueLabel} — bump to ${formatCurrency(f.requiredPerMonth || 0)}/mo (${formatCurrency(f.additionalNeeded || 0)} more)`, cls: 'text-warning' };
    case 'past_due':
      return { text: `Past ${f.dueLabel} — ${formatCurrency(f.remaining)} short`, cls: 'text-negative' };
    case 'projecting':
      return eta
        ? { text: haveTo ? `Covered in ${eta} at ${rate}/mo` : `${eta} to go at ${rate}/mo${f.daysToFill! > 730 ? ' — bump it up?' : ''}`, cls: 'text-text-secondary' }
        : { text: 'Set a $/mo amount to project a fill date', cls: 'text-text-muted' };
    case 'idle':
      return { text: 'Set a $/mo amount to project a fill date', cls: 'text-text-muted' };
  }
}

export default function StashesCard({ stashes, expenses, onChange }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  // Inline two-click delete confirm — window.confirm() is a native dialog that
  // blocks the whole tab (and froze browser automation mid-session).
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [confirmingRetire, setConfirmingRetire] = useState<string | null>(null);
  const statuses = useMemo(() => computeAllStashes(stashes, expenses), [stashes, expenses]);
  const totalMonthly = totalStashContributions(stashes);

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
    update(id, {
      achievedAt: new Date().toISOString(),
      currentBalance: Math.round(balanceSnapshot),
      monthlyContribution: 0,
      monthlyFill: 0,
      categories: [],
      startMonth: undefined,
    });
  };

  return (
    <div className="glass-card p-6">
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
        const renderCard = (status: (typeof statuses)[number]) => {
          const { stash: sf, balance, derived, drawn, monthsAccrued, biggestDraw } = status;
          const isOpen = expanded === sf.id;
          const negative = balance < 0;
          const shortfall = computeShortfall(status);
          const forecast = computeStashForecast(status);
          const fline = forecast ? forecastLine(forecast) : null;
          return (
            <div key={sf.id} className={`p-4 rounded-xl bg-white/[0.03] border ${negative ? 'border-negative/40' : 'border-glass-border'}`}>
              {/* Name + contribution */}
              <div className="flex items-center justify-between mb-1 gap-2">
                <button onClick={() => update(sf.id, { kind: kindOf(sf) === 'have_to' ? 'want_to' : 'have_to' })}
                  className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: (kindOf(sf) === 'have_to' ? HAVE_COLOR : WANT_COLOR) + '22', color: kindOf(sf) === 'have_to' ? HAVE_COLOR : WANT_COLOR }}
                  title="Toggle have-to / want-to">
                  {kindOf(sf) === 'have_to' ? 'Have' : 'Want'}
                </button>
                <input value={sf.name} onChange={e => update(sf.id, { name: e.target.value })}
                  className="text-sm font-medium text-text-primary bg-transparent border border-transparent hover:border-glass-border focus:border-accent/50 rounded px-1 py-0.5 outline-none min-w-0 flex-1" />
                <div className="flex items-center gap-0.5 flex-shrink-0 text-xs text-text-muted">
                  <span>$</span>
                  <input type="number" value={sf.monthlyContribution}
                    onChange={e => update(sf.id, { monthlyContribution: Number(e.target.value) || 0 })}
                    className="w-16 bg-transparent border border-transparent hover:border-glass-border focus:border-accent/50 rounded px-1 py-0.5 text-right outline-none" />
                  <span>/mo</span>
                </div>
              </div>

              {/* Balance */}
              <div className={`text-2xl font-black mono-num ${negative ? 'text-negative' : 'text-positive'}`}>
                {negative ? '−' : ''}{formatCurrency(Math.abs(balance))}
              </div>
              {!shortfall && (
                <div className="text-[10px] text-text-muted mb-2">
                  {derived
                    ? `funded ${monthsAccrued} month${monthsAccrued === 1 ? '' : 's'}${drawn > 0 ? ` · ${formatCurrency(drawn)} drawn` : ''}`
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
                  <div className="w-full bg-white/10 rounded-full h-1.5 mb-1">
                    <div className="h-1.5 rounded-full transition-all"
                      style={{ width: `${forecast.percent}%`, background: forecast.status === 'met' ? '#22c55e' : sf.color }} />
                  </div>
                  <div className={`text-[10px] ${fline.cls}`}>{fline.text}</div>
                </div>
              ) : (
                <button onClick={() => setExpanded(sf.id)}
                  className="text-[10px] text-accent/80 hover:underline mb-2 block">
                  + Set a goal to track progress
                </button>
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
        const active = statuses.filter(s => !s.stash.achievedAt);
        const achieved = statuses.filter(s => s.stash.achievedAt);
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
                  {achieved.map(({ stash: sf }) => (
                    <div key={sf.id} className="p-3 rounded-xl bg-positive/5 border border-positive/25 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{sf.name}</div>
                        <div className="text-[10px] text-text-muted">
                          saved {formatCurrency(sf.currentBalance || 0)}
                          {sf.achievedAt ? ` · done ${new Date(sf.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
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

      <div className="mt-3 text-xs text-text-muted">
        Total monthly stash contributions: <strong className="text-text-primary">{formatCurrency(totalMonthly)}</strong>
        <span className="text-text-muted/70"> — set aside off the top of Safe to Spend</span>
      </div>
    </div>
  );
}

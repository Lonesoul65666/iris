import { useMemo } from 'react';
import { computeStashForecast, type StashStatus } from '../../utils/stashMath';
import { formatCurrency } from '../../utils/format';

interface GoalTrackerProps {
  /** Derived pot status from stashMath — the SAME input the Budget page reads. */
  statuses: StashStatus[];
  monthlyInvestmentAmount: number;
  /** When true, drop the outer card + own title — a DashSection provides them. */
  bare?: boolean;
}

// ⚠️ NO PACING MATH LIVES IN THIS FILE. It used to (2026-08-19 audit: "a THIRD
// pacing surface"): its own monthsUntil() with a `new Date('YYYY-MM-DD')` UTC
// parse that lost a whole month in a -06:00 timezone, its own remaining/months
// division against fractional calendar time, and its own on-track test — all
// under the same section title as the Budget page, which paces on discrete
// commit MOVES. Two surfaces could state different things about the same pot.
// Everything now comes from computeStashForecast, so there is one answer per pot.

const HAVE_COLOR = '#f59e0b'; // obligations — amber
const WANT_COLOR = '#a855f7'; // goals — violet

// Escalating encouragement by progress. Two arcs: Want-To's get hype (push to
// save), Have-To's get relief (glad to be rid of it). Full-send voice — this is
// Scott & Claire's private app.
function encouragement(kind: 'have_to' | 'want_to', percent: number): { msg: string; cls: string } {
  if (kind === 'have_to') {
    if (percent >= 100) return { msg: 'Handled. One less thing to sweat — thank god.', cls: 'text-positive' };
    if (percent >= 75) return { msg: 'Almost off your plate — nearly fuckin’ done.', cls: 'text-warning' };
    if (percent >= 50) return { msg: 'Over halfway to covered. The grind’s working.', cls: 'text-text-secondary' };
    if (percent >= 25) return { msg: 'Making a dent in this one.', cls: 'text-text-secondary' };
    return { msg: 'Chipping away at it — every bit counts.', cls: 'text-text-muted' };
  }
  if (percent >= 100) return { msg: 'HELL YES — you crushed it. Go get it.', cls: 'text-positive' };
  if (percent >= 75) return { msg: 'So damn close you can taste it. Don’t let up.', cls: 'text-accent-light' };
  if (percent >= 50) return { msg: 'Halfway there — you’re really doing this.', cls: 'text-accent-light' };
  if (percent >= 25) return { msg: 'Building steam. Keep stacking.', cls: 'text-accent-light' };
  return { msg: 'Just getting rolling — let’s fuckin’ go.', cls: 'text-text-secondary' };
}

interface GoalCardData {
  id: string;
  name: string;
  kind: 'have_to' | 'want_to';
  targetAmount: number;
  currentBalance: number;
  monthlyContribution: number;
  /** Cadence-resolved due date, already formatted by stashMath ("Oct 1, 2026"). */
  dueLabel: string | null;
  color: string;
  percent: number;
  statusLabel: string;
  statusColor: string; // Tailwind text class
  /** What to move into this pot THIS month to stay on plan (0 = already done). */
  thisMonthAsk: number;
}

/** Read a pot's card straight off the shared forecast. The only decisions made
 *  here are wording and colour. */
export function computeGoalData(status: StashStatus, now: Date = new Date()): GoalCardData {
  const { stash, balance } = status;
  const f = computeStashForecast(status, now);

  let statusLabel: string;
  let statusColor: string;
  switch (f?.status) {
    case 'met':        statusLabel = 'Complete'; statusColor = 'text-positive'; break;
    case 'past_due':   statusLabel = 'Past due'; statusColor = 'text-negative'; break;
    case 'on_track':   statusLabel = 'On track'; statusColor = 'text-positive'; break;
    case 'behind':
      statusLabel = `Behind \u2014 need ${formatCurrency(f.additionalNeeded ?? 0)}/mo more`;
      statusColor = 'text-warning';
      break;
    case 'projecting': statusLabel = `Est. ${f.projectedMonth}`; statusColor = 'text-text-secondary'; break;
    case 'idle':       statusLabel = 'No contributions set'; statusColor = 'text-text-muted'; break;
    // No target amount at all → nothing to pace against. Say so rather than
    // inventing a percentage (this is the date-only pot the Budget page shows
    // as "no goal set").
    default:           statusLabel = 'No target set'; statusColor = 'text-text-muted';
  }

  return {
    id: stash.id,
    name: stash.name,
    kind: stash.kind ?? 'want_to',
    targetAmount: stash.targetAmount,
    currentBalance: balance,
    monthlyContribution: stash.monthlyContribution || 0,
    dueLabel: f?.dueLabel ?? null,
    color: stash.color,
    percent: f?.percent ?? 0,
    statusLabel,
    statusColor,
    thisMonthAsk: f?.thisMonthAsk ?? 0,
  };
}

function GoalCard({ goal }: { goal: GoalCardData }) {
  const done = goal.percent >= 100;
  const close = goal.percent >= 75 && !done;
  const cheer = encouragement(goal.kind, goal.percent);
  return (
    <div className={`rounded-xl p-4 space-y-3 transition-shadow ${
      done ? 'bg-positive/10 border border-positive/40'
      : close ? 'bg-surface-3 border border-accent/30 shadow-[0_0_16px_-4px] shadow-accent/30'
      : 'bg-surface-3 border border-transparent'}`}>
      {/* Header row: name + target */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: goal.color }}
          />
          <span className="text-text-primary font-medium text-sm truncate">
            {goal.name}
          </span>
        </div>
        <span className="text-text-secondary text-sm whitespace-nowrap">
          {formatCurrency(goal.targetAmount)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="track-well h-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${goal.percent >= 100 ? 'track-fill-positive' : ''}`}
          style={{
            width: `${goal.percent}%`,
            background: goal.percent >= 100 ? undefined : `linear-gradient(90deg, ${goal.color}cc, ${goal.color})`,
          }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">
          {formatCurrency(goal.currentBalance)}{' '}
          <span className="text-text-muted">
            ({goal.percent}%)
          </span>
        </span>
        <span className={goal.statusColor}>{goal.statusLabel}</span>
      </div>

      {/* Plan + due date + the ask. The ask is the Budget page's own
          `thisMonthAsk`, so the two surfaces can't disagree about what this pot
          needs — the whole reason this card stopped doing its own math. */}
      {(goal.monthlyContribution > 0 || goal.dueLabel || goal.thisMonthAsk > 0) && (
        <div className="flex items-center flex-wrap gap-1.5 text-xs text-text-muted">
          {goal.monthlyContribution > 0 && (
            <span className="bg-accent/15 text-accent px-2 py-0.5 rounded-full">
              {formatCurrency(goal.monthlyContribution)}/mo
            </span>
          )}
          {goal.thisMonthAsk > 0 && (
            <span className="text-text-secondary">{formatCurrency(goal.thisMonthAsk)} to commit this month</span>
          )}
          {goal.dueLabel && <span>Due: {goal.dueLabel}</span>}
        </div>
      )}

      {/* Encouragement — the whole point: make it feel like something. */}
      {done ? (
        <div className="flex items-center gap-2 rounded-lg bg-positive/15 px-3 py-2 animate-fadeIn">
          <span className="text-sm font-bold text-positive">{cheer.msg}</span>
        </div>
      ) : (
        <p className={`text-xs font-medium ${cheer.cls}`}>{cheer.msg}</p>
      )}
    </div>
  );
}

export default function GoalTracker({
  statuses,
  monthlyInvestmentAmount,
  bare = false,
}: GoalTrackerProps) {
  // Only the user's real stashes (Have-To's / Want-To's) — no synthesized goals.
  // An emergency fund, if wanted, is a real stash the user owns and can edit.
  const goals = useMemo(() => statuses.map((s) => computeGoalData(s)), [statuses]);

  // Summary stats
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.currentBalance, 0);
  const overallPercent =
    totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;
  const totalMonthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);
  const goalsComplete = goals.filter((g) => g.percent >= 100).length;

  return (
    <div className={bare ? 'space-y-5' : 'glass-card p-6 space-y-5'}>
      {/* Card header */}
      <div className="flex items-center justify-between">
        {!bare && <h2 className="text-text-primary text-lg font-semibold">Have To's / Want To's</h2>}
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>
            {goalsComplete}/{goals.length} complete
          </span>
          <span className="bg-accent/15 text-accent px-2.5 py-1 rounded-full font-medium">
            {overallPercent}% overall
          </span>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>
            {formatCurrency(totalSaved)} saved
          </span>
          <span>
            {formatCurrency(totalTarget)} total target
          </span>
        </div>
        <div className="track-well h-2.5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${overallPercent}%`,
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)',
            }}
          />
        </div>
        {totalMonthly > 0 && (
          <p className="text-xs text-text-muted">
            Contributing {formatCurrency(totalMonthly)}/mo across all goals
            {monthlyInvestmentAmount > 0 && (
              <> + {formatCurrency(monthlyInvestmentAmount)}/mo investing</>
            )}
          </p>
        )}
      </div>

      {/* Grouped by kind — Have-To's (amber) then Want-To's (violet), matching
          the Budget page so the two surfaces read as one system. */}
      {([
        { kind: 'have_to' as const, label: "Have to's", color: HAVE_COLOR, hint: 'bills you pre-fund' },
        { kind: 'want_to' as const, label: "Want to's", color: WANT_COLOR, hint: "goals you're saving toward" },
      ]).map(group => {
        const list = goals.filter(g => g.kind === group.kind);
        if (list.length === 0) return null;
        return (
          <div key={group.kind} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: group.color }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: group.color }}>{group.label}</span>
              <span className="text-[10px] text-text-muted">· {group.hint}</span>
            </div>
            <div className="grid gap-3">
              {list.map((goal) => <GoalCard key={goal.id} goal={goal} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

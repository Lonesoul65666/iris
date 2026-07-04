import { useMemo } from 'react';
import type { SinkingFund } from '../../types/budget';

interface GoalTrackerProps {
  sinkingFunds: SinkingFund[];
  monthlyInvestmentAmount: number;
}

function formatCurrency(v: number): string {
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

/** Calculate months between now and a future date. Returns 0 if date is in the past. */
function monthsUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth());
  return Math.max(0, months);
}

/** Format a Date as "Mon YYYY" */
function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface GoalCardData {
  id: string;
  name: string;
  targetAmount: number;
  currentBalance: number;
  monthlyContribution: number;
  targetDate?: string;
  color: string;
  percent: number;
  statusLabel: string;
  statusColor: string; // Tailwind text class
  projectedDate: string | null;
  additionalNeeded: number | null; // extra $/mo needed if behind
}

function computeGoalData(fund: {
  id: string;
  name: string;
  targetAmount: number;
  currentBalance: number;
  monthlyContribution: number;
  targetDate?: string;
  color: string;
}): GoalCardData {
  const remaining = Math.max(0, fund.targetAmount - fund.currentBalance);
  const percent =
    fund.targetAmount > 0
      ? Math.min(100, Math.round((fund.currentBalance / fund.targetAmount) * 100))
      : 0;

  let statusLabel = '';
  let statusColor = 'text-text-muted';
  let projectedDate: string | null = null;
  let additionalNeeded: number | null = null;

  if (percent >= 100) {
    statusLabel = 'Complete';
    statusColor = 'text-positive';
  } else if (fund.targetDate) {
    const monthsLeft = monthsUntil(fund.targetDate);
    if (monthsLeft <= 0) {
      statusLabel = 'Past due';
      statusColor = 'text-negative';
    } else {
      const requiredPerMonth = remaining / monthsLeft;
      if (fund.monthlyContribution >= requiredPerMonth) {
        statusLabel = 'On track';
        statusColor = 'text-positive';
      } else {
        const gap = Math.ceil(requiredPerMonth - fund.monthlyContribution);
        additionalNeeded = gap;
        statusLabel = `Behind \u2014 need ${formatCurrency(gap)}/mo more`;
        statusColor = 'text-warning';
      }
    }
    projectedDate = formatMonthYear(new Date(fund.targetDate));
  } else {
    // No target date -- project completion from monthly contribution
    if (fund.monthlyContribution > 0) {
      const monthsToGo = Math.ceil(remaining / fund.monthlyContribution);
      const projected = new Date();
      projected.setMonth(projected.getMonth() + monthsToGo);
      projectedDate = formatMonthYear(projected);
      statusLabel = `Est. ${projectedDate}`;
      statusColor = 'text-text-secondary';
    } else {
      statusLabel = 'No contributions set';
      statusColor = 'text-text-muted';
    }
  }

  return {
    id: fund.id,
    name: fund.name,
    targetAmount: fund.targetAmount,
    currentBalance: fund.currentBalance,
    monthlyContribution: fund.monthlyContribution,
    targetDate: fund.targetDate,
    color: fund.color,
    percent,
    statusLabel,
    statusColor,
    projectedDate,
    additionalNeeded,
  };
}

function GoalCard({ goal }: { goal: GoalCardData }) {
  return (
    <div className="bg-surface-3 rounded-xl p-4 space-y-3">
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
      <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${goal.percent}%`,
            background:
              goal.percent >= 100
                ? '#22c55e'
                : `linear-gradient(90deg, ${goal.color}cc, ${goal.color})`,
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

      {/* Monthly contribution chip */}
      {goal.monthlyContribution > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className="bg-accent/15 text-accent px-2 py-0.5 rounded-full">
            {formatCurrency(goal.monthlyContribution)}/mo
          </span>
          {goal.targetDate && (
            <span>
              Target: {formatMonthYear(new Date(goal.targetDate))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function GoalTracker({
  sinkingFunds,
  monthlyInvestmentAmount,
}: GoalTrackerProps) {
  // Only the user's real stashes (Have-To's / Want-To's) — no synthesized goals.
  // An emergency fund, if wanted, is a real stash the user owns and can edit.
  const goals = useMemo(() => sinkingFunds.map(computeGoalData), [sinkingFunds]);

  // Summary stats
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.currentBalance, 0);
  const overallPercent =
    totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;
  const totalMonthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);
  const goalsComplete = goals.filter((g) => g.percent >= 100).length;

  return (
    <div className="glass-card p-6 space-y-5">
      {/* Card header */}
      <div className="flex items-center justify-between">
        <h2 className="text-text-primary text-lg font-semibold">Goal Tracker</h2>
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
        <div className="w-full h-2.5 rounded-full bg-white/5 overflow-hidden">
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

      {/* Goal cards grid */}
      <div className="grid gap-3">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
      </div>
    </div>
  );
}

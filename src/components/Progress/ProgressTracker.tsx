import { useState, useEffect } from 'react';
import { getSetting, saveSetting } from '../../stores/portfolioStore';
import { useHasRealData } from '../../hooks/useHasRealData';
import EmptyState from '../ui/EmptyState';

interface ProgressProps {
  userName: string;
  completedActions: number;
  totalActions: number;
  investmentScore: number;
  budgetSurplus: number;
  savingsRate: number;
  monthsImported: number;
  totalTransactions: number;
  categoriesSet: number;
  totalCategories: number;
  completedItems: { text: string; date?: string; note?: string }[];
}

interface Milestone {
  id: string;
  icon: string;
  title: string;
  description: string;
  achieved: boolean;
  category: 'setup' | 'budget' | 'investing' | 'streak';
}

export default function ProgressTracker({
  userName, completedActions, totalActions, investmentScore, budgetSurplus,
  savingsRate, monthsImported, totalTransactions, categoriesSet, totalCategories,
  completedItems,
}: ProgressProps) {
  const [streak, setStreak] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const { hasAnyRealData } = useHasRealData();

  // Track daily check-in streak
  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().split('T')[0];
      const lastVisit = await getSetting(`streak_last_${userName}`);
      const currentStreak = parseInt(await getSetting(`streak_count_${userName}`) || '0');

      if (lastVisit === today) {
        setStreak(currentStreak);
        return;
      }

      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const newStreak = lastVisit === yesterday ? currentStreak + 1 : 1;
      await saveSetting(`streak_last_${userName}`, today);
      await saveSetting(`streak_count_${userName}`, String(newStreak));
      setStreak(newStreak);
    })();
  }, [userName]);

  const milestones: Milestone[] = [
    { id: 'first-import', icon: '📄', title: 'First Import', description: 'Import your first bank statement', achieved: totalTransactions > 0, category: 'setup' },
    { id: '3-months', icon: '📊', title: 'Data Rich', description: 'Import 3+ months of transactions', achieved: monthsImported >= 3, category: 'setup' },
    { id: '6-months', icon: '📈', title: 'Trend Spotter', description: 'Import 6+ months of data', achieved: monthsImported >= 6, category: 'setup' },
    { id: 'all-categories', icon: '🏷️', title: 'Fully Categorized', description: 'Set budgets for all categories', achieved: categoriesSet >= totalCategories * 0.8, category: 'setup' },
    { id: 'first-action', icon: '✅', title: 'First Win', description: 'Complete your first action item', achieved: completedActions >= 1, category: 'budget' },
    { id: '5-actions', icon: '🏆', title: 'On a Roll', description: 'Complete 5 action items', achieved: completedActions >= 5, category: 'budget' },
    { id: 'all-actions', icon: '👑', title: 'Clean Slate', description: 'Complete every action item', achieved: completedActions >= totalActions && totalActions > 0, category: 'budget' },
    { id: 'under-budget', icon: '💚', title: 'In the Green', description: 'Get monthly spending under budget', achieved: budgetSurplus >= 0, category: 'budget' },
    { id: 'savings-15', icon: '🐷', title: 'Saver', description: 'Hit 15% savings rate', achieved: savingsRate >= 15, category: 'budget' },
    { id: 'savings-20', icon: '💎', title: 'Super Saver', description: 'Hit 20% savings rate', achieved: savingsRate >= 20, category: 'budget' },
    { id: 'score-50', icon: '📊', title: 'Healthy Portfolio', description: 'Get investment score above 50', achieved: investmentScore >= 50, category: 'investing' },
    { id: 'score-70', icon: '🚀', title: 'Optimized', description: 'Get investment score above 70', achieved: investmentScore >= 70, category: 'investing' },
    { id: 'streak-3', icon: '🔥', title: '3-Day Streak', description: 'Check Iris 3 days in a row', achieved: streak >= 3, category: 'streak' },
    { id: 'streak-7', icon: '⚡', title: 'Week Warrior', description: 'Check Iris 7 days in a row', achieved: streak >= 7, category: 'streak' },
    { id: 'streak-30', icon: '🌟', title: 'Habit Formed', description: 'Check Iris 30 days in a row', achieved: streak >= 30, category: 'streak' },
  ];

  // Suppress milestone unlocks until the user has real data — otherwise
  // empty-state thresholds trip ("In the Green" because surplus is 0 ≥ 0,
  // "Healthy Portfolio" if score defaults > 50, etc.) and a brand-new user
  // sees badges they didn't earn.
  const milestonesGated = hasAnyRealData ? milestones : milestones.map(m => ({ ...m, achieved: false }));
  const achieved = milestonesGated.filter(m => m.achieved);
  const pct = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;
  const milestonePct = Math.round((achieved.length / milestonesGated.length) * 100);

  if (!hasAnyRealData) {
    return (
      <EmptyState
        icon="🏆"
        title="Milestones unlock once you have data"
        description="Connect a portfolio or import transactions and we'll start tracking your wins as you hit them."
        ctaLabel="Connect data"
        ctaTarget="portfolio"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Progress Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-text-primary">Financial Progress</span>
            <span className="text-xs text-text-muted">{achieved.length}/{milestones.length} milestones</span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
            <div className="h-3 rounded-full bg-gradient-to-r from-accent to-emerald-500 transition-all duration-1000"
              style={{ width: `${milestonePct}%` }} />
          </div>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <span className="text-lg">🔥</span>
            <div>
              <div className="text-sm font-bold text-orange-400">{streak}</div>
              <div className="text-[9px] text-orange-400/70 uppercase">day streak</div>
            </div>
          </div>
        )}
      </div>

      {/* Action Items Progress */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-glass-border">
        <div className="relative w-12 h-12">
          <svg className="w-12 h-12" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle cx="24" cy="24" r="20" fill="none" stroke={pct === 100 ? '#22c55e' : '#8b5cf6'} strokeWidth="4"
              strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 20}`}
              strokeDashoffset={`${2 * Math.PI * 20 * (1 - pct / 100)}`}
              style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-text-primary">{pct}%</span>
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-text-primary">{completedActions} of {totalActions} action items done</div>
          <div className="text-xs text-text-muted">
            {completedActions === 0 ? 'Pick one and knock it out — momentum builds fast'
              : completedActions < totalActions ? `${totalActions - completedActions} to go — you've got this`
              : 'Every item complete — time for new goals!'}
          </div>
        </div>
      </div>

      {/* Milestones Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {milestones.map(m => (
          <div key={m.id} className={`p-3 rounded-xl border text-center transition-all ${
            m.achieved
              ? 'bg-positive/5 border-positive/20'
              : 'bg-white/[0.01] border-glass-border opacity-40'
          }`}>
            <div className="text-xl mb-1">{m.achieved ? m.icon : '🔒'}</div>
            <div className="text-[11px] font-semibold text-text-primary leading-tight">{m.title}</div>
            <div className="text-[9px] text-text-muted mt-0.5">{m.description}</div>
          </div>
        ))}
      </div>

      {/* Completed Actions History */}
      {completedItems.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <span className="text-positive">✓</span>
            <span>{showHistory ? 'Hide' : 'Show'} {completedItems.length} completed action{completedItems.length !== 1 ? 's' : ''}</span>
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto">
              {completedItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-positive/5 border border-positive/10">
                  <div className="w-6 h-6 rounded-full bg-positive/20 flex items-center justify-center text-positive text-xs flex-shrink-0 mt-0.5">✓</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-secondary">{item.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.date && <span className="text-[10px] text-text-muted">{item.date}</span>}
                      {item.note && <span className="text-[10px] text-positive">— {item.note}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

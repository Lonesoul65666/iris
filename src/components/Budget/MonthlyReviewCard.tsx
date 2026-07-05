// "Iris's Take" — the advisor voice on the budget screen. Builds a grounded facts
// brief, has the LLM narrate it in full-send coach voice, and caches the result
// (keyed setting) so it shows on load without re-billing every render. Button-
// triggered refresh — proactive-feeling without hammering the API. (Scott, 2026-07-05)
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Expense, BudgetBucket, PaycheckBreakdown } from '../../types/budget';
import { buildAdvisorFacts } from '../../utils/advisorFacts';
import { generateBudgetReview, advisorAvailable, type BudgetReview } from '../../services/budgetAdvisor';
import { getSetting, saveSetting } from '../../stores/portfolioStore';

const CACHE_KEY = 'budget_advisor_review';

interface Props {
  expenses: Expense[];
  buckets: BudgetBucket[];
  paycheck: PaycheckBreakdown | undefined;
}

function relTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function MonthlyReviewCard({ expenses, buckets, paycheck }: Props) {
  const [review, setReview] = useState<BudgetReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const facts = useMemo(() => buildAdvisorFacts(expenses, buckets, paycheck), [expenses, buckets, paycheck]);
  const available = advisorAvailable();

  useEffect(() => {
    let live = true;
    void getSetting<BudgetReview>(CACHE_KEY).then((c) => { if (live && c) setReview(c); });
    return () => { live = false; };
  }, []);

  const run = useCallback(async () => {
    if (!facts.hasData) return;
    setLoading(true);
    setError(null);
    try {
      const r = await generateBudgetReview(facts.brief, facts.monthLabel);
      setReview(r);
      await saveSetting(CACHE_KEY, r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong reaching the AI.');
    } finally {
      setLoading(false);
    }
  }, [facts]);

  return (
    <div className="glass-card p-5 mb-4 border border-accent/30 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text-primary">Iris's Take</h2>
          <p className="text-xs text-text-muted mt-0.5">
            {review ? `On ${review.month} · ${relTime(review.generatedAt)} · via ${review.provider}` : 'Straight talk on how the month actually went.'}
          </p>
        </div>
        {available && facts.hasData && (
          <button onClick={run} disabled={loading}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
              loading ? 'bg-surface-2 text-text-muted cursor-wait' : 'bg-accent hover:bg-accent-light text-white'}`}>
            {loading ? 'Thinking…' : review ? 'Refresh' : "Get Iris's take"}
          </button>
        )}
      </div>

      {!available && (
        <div className="text-xs text-text-muted">
          Add an AI key in <span className="text-accent">Settings</span> and Iris will start calling it like she sees it.
        </div>
      )}
      {available && !facts.hasData && (
        <div className="text-xs text-text-muted">Iris needs one full month of data before she weighs in.</div>
      )}
      {error && <div className="text-xs text-negative mt-1">{error}</div>}

      {review && (
        <div className="mt-2 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{review.text}</div>
      )}
      {available && facts.hasData && !review && !error && !loading && (
        <div className="text-xs text-text-muted">Hit the button — she'll tell you where you crushed it and where you didn't.</div>
      )}
    </div>
  );
}

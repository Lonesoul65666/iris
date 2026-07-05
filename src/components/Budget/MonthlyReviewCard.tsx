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

  // The LLM opens with a punchy verdict line; render it as a headline and the
  // rest as body so the card reads like Iris actually talking, not a text blob.
  const paras = review ? review.text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean) : [];
  const [verdict, ...body] = paras;

  return (
    <div className="glass-card p-5 mb-4 relative overflow-hidden border border-accent/30">
      {/* Ambient glow + lit top edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
      <div className="absolute -top-16 -left-10 w-52 h-52 rounded-full bg-accent/10 blur-3xl pointer-events-none" />

      <div className="relative flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Iris avatar — gradient presence mark with a spark */}
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-accent to-indigo-400 shadow-lg shadow-accent/30 ${loading ? 'animate-pulse' : ''}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5 9.8 12.2 3.5 10l6.3-1.7L12 2z" fill="white" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text-primary leading-tight">Iris's Take</h2>
            <p className="text-[11px] text-text-muted">
              {review ? `${review.month} · ${relTime(review.generatedAt)} · ${review.provider}` : 'Straight talk on how the month went.'}
            </p>
          </div>
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
        <div className="relative text-xs text-text-muted">
          Add an AI key in <span className="text-accent">Settings</span> and Iris will start calling it like she sees it.
        </div>
      )}
      {available && !facts.hasData && (
        <div className="relative text-xs text-text-muted">Iris needs one full month of data before she weighs in.</div>
      )}
      {error && <div className="relative text-xs text-negative">{error}</div>}
      {loading && !review && (
        <div className="relative text-sm text-text-muted italic">Iris is reading your month…</div>
      )}

      {review && (
        <div className={`relative pl-3 border-l-2 border-accent/40 ${loading ? 'opacity-50' : ''}`}>
          {verdict && <p className="text-[15px] font-semibold text-text-primary leading-snug mb-2">{verdict}</p>}
          {body.map((p, i) => (
            <p key={i} className="text-sm text-text-secondary leading-relaxed mb-2 last:mb-0">{p}</p>
          ))}
        </div>
      )}
      {available && facts.hasData && !review && !error && !loading && (
        <div className="relative text-xs text-text-muted">Hit the button — she'll tell you where you crushed it and where you didn't.</div>
      )}
    </div>
  );
}

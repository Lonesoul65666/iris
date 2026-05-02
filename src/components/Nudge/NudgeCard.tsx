import { useCallback, useEffect, useState } from 'react';
import type { Nudge } from '../../utils/nudgeEngine';
import { explainNudgeWhy, getCachedNudgeExplanation } from '../../services/nudgeExplain';

/**
 * Canonical Nudge surface. Every ambient/alert card in the app renders through
 * this component so that visual language stays consistent. When a new nudge
 * source ships (e.g. Holy-shit Scanner, Synthesis Digest), it should produce
 * a `Nudge` object and render via this component — NOT roll its own card.
 */

export type NudgeSeverity = Nudge['severity'];

export function severityStyles(severity: NudgeSeverity): { border: string; bg: string; badge: string } {
  switch (severity) {
    case 'celebration':
      return {
        border: 'border-accent/40',
        bg: 'from-accent/15 via-accent/5 to-transparent',
        badge: 'bg-accent/20 text-accent-light',
      };
    case 'critical':
      return {
        border: 'border-negative/40',
        bg: 'from-negative/10 to-transparent',
        badge: 'bg-negative/20 text-negative',
      };
    case 'warning':
      return {
        border: 'border-warning/30',
        bg: 'from-warning/10 to-transparent',
        badge: 'bg-warning/20 text-warning',
      };
    case 'info':
    default:
      return {
        border: 'border-accent/25',
        bg: 'from-accent/5 to-transparent',
        badge: 'bg-accent/15 text-accent-light',
      };
  }
}

export interface NudgeCardProps {
  nudge: Nudge;
  /** Stagger-in index for entrance animation (0–3). Pass the position in the list. */
  index?: number;
  onPrimary?: () => void;
  onSnooze?: () => void;
  onDismissForever?: () => void;
  /** If true, hides the snooze/dismiss row (used for preview/static surfaces like FirstReport). */
  readOnly?: boolean;
}

export default function NudgeCard({
  nudge,
  index = 0,
  onPrimary,
  onSnooze,
  onDismissForever,
  readOnly = false,
}: NudgeCardProps) {
  const s = severityStyles(nudge.severity);
  const snoozeLabel = nudge.oneShot ? 'Got it' : 'Remind me later';
  const { state: why, fetchWhy } = useNudgeWhy(nudge);
  return (
    <div
      className={`glass-card p-5 border ${s.border} bg-gradient-to-br ${s.bg} stagger-${Math.min(index + 1, 4)}`}
    >
      <div className="flex items-start gap-4">
        <div className="text-3xl flex-shrink-0">{nudge.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-base font-bold text-text-primary">{nudge.title}</h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${s.badge}`}>
              {nudge.category}
            </span>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed mb-2">{nudge.body}</p>
          {nudge.whyPrompt && (
            <div className="mb-3 pl-3 border-l-2 border-accent/40 text-xs text-text-muted leading-relaxed">
              <span className="font-semibold text-accent-light uppercase tracking-wider mr-1.5">Why:</span>
              {why === 'idle' ? (
                <button
                  type="button"
                  onClick={fetchWhy}
                  className="italic text-accent-light hover:text-accent underline underline-offset-2 transition-colors"
                >
                  Tap to explain →
                </button>
              ) : why === 'loading' ? (
                <span className="italic opacity-70">checking recent news…</span>
              ) : why === 'failed' ? (
                <span className="italic opacity-60">no clear catalyst in recent news.</span>
              ) : (
                <span>{why}</span>
              )}
            </div>
          )}
          {!readOnly && (
            <div className="flex items-center gap-3 flex-wrap">
              {nudge.primary && onPrimary && (
                <button
                  onClick={onPrimary}
                  className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-xs font-semibold transition-colors"
                >
                  {nudge.primary.label} →
                </button>
              )}
              {!nudge.oneShot && onSnooze && (
                <button
                  onClick={onSnooze}
                  className="text-xs text-text-muted hover:text-accent transition-colors"
                >
                  {snoozeLabel}
                </button>
              )}
              {onDismissForever && (
                <button
                  onClick={onDismissForever}
                  className="text-xs text-text-muted hover:text-negative transition-colors ml-auto"
                >
                  {nudge.oneShot ? snoozeLabel : "Don't show again"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type WhyState = 'idle' | 'loading' | 'failed' | string;

/**
 * Lazy-load nudge explanations. On mount, only consult the cache (free).
 * Uncached nudges stay in 'idle' state until the user clicks "Tap to explain"
 * — that's the only path that calls Gemini. This is the fix for the daily
 * quota burn where every visible nudge previously fired a Gemini call on
 * render.
 */
function useNudgeWhy(nudge: Nudge): { state: WhyState; fetchWhy: () => void } {
  const [state, setState] = useState<WhyState>('idle');

  useEffect(() => {
    if (!nudge.whyPrompt || !nudge.whyKey) return;
    let cancelled = false;
    getCachedNudgeExplanation(nudge.whyKey).then((text) => {
      if (cancelled) return;
      if (text) setState(text);
    });
    return () => { cancelled = true; };
  }, [nudge.whyKey, nudge.whyPrompt]);

  const fetchWhy = useCallback(() => {
    if (!nudge.whyPrompt || !nudge.whyKey) return;
    setState('loading');
    explainNudgeWhy(nudge.whyKey, nudge.whyPrompt).then((text) => {
      setState(text ?? 'failed');
    });
  }, [nudge.whyKey, nudge.whyPrompt]);

  return { state, fetchWhy };
}

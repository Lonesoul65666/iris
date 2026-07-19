import { useEffect, useRef } from 'react';
import Medallion from './Medallion';
import Confetti from './Confetti';
import { formatNetWorthShort, nextNetWorthMilestone, type Achievement } from '../../utils/achievements';
import { playCelebrationChime } from '../../utils/celebrationSound';

/**
 * Full-screen celebration takeover. Two modes, one component:
 *  - 'live'   — a fresh unlock (net-worth milestone etc.). Dismiss marks it
 *               acknowledged so it never re-fires on its own. Gets the confetti
 *               burst; the chime plays if sound is on.
 *  - 'replay' — re-opening an already-earned trophy from the wall to relive the
 *               moment (Scott's couples ask: one partner saw it, the other
 *               didn't). Shows the date it was earned; dismiss just closes. No
 *               confetti (it's a look-back, not a first-time hit).
 *
 * Mounted once at the app-shell level so it fires over any view. Deliberately
 * separate from NudgeCard — those stack quietly; this one stops you.
 *
 * Modal hygiene: Esc closes, focus lands on the dismiss button on open. Motion
 * (pop + confetti) is suppressed under prefers-reduced-motion via CSS.
 */
export interface CelebrationView {
  achievement: Achievement;
  /** ISO unlock date — shown in replay mode. null when unknown. */
  unlockedAt: string | null;
  mode: 'live' | 'replay';
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function CelebrationOverlay({
  view,
  soundEnabled,
  onDismiss,
}: {
  view: CelebrationView | undefined;
  soundEnabled: boolean;
  onDismiss: (view: CelebrationView) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const viewKey = view ? `${view.mode}:${view.achievement.id}` : null;

  // Esc-to-close + autofocus the dismiss button whenever a celebration opens.
  useEffect(() => {
    if (!view) return;
    btnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(view); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, onDismiss]);

  // Chime once per opened celebration (both modes — reliving it should sound too),
  // gated on the user's sound preference. Keyed on viewKey so it fires once.
  useEffect(() => {
    if (!viewKey || !soundEnabled) return;
    playCelebrationChime();
  }, [viewKey, soundEnabled]);

  if (!view) return null;
  const { achievement, unlockedAt, mode } = view;
  const eyebrow = mode === 'replay' ? 'Trophy Replay' : 'Milestone Unlocked';
  const cta = mode === 'replay' ? 'Close' : 'Hell yeah →';
  const earnedOn = fmtDate(unlockedAt);
  const showConfetti = mode === 'live' && !prefersReducedMotion();
  const nextUp = achievement.milestoneTarget != null
    ? nextNetWorthMilestone(achievement.milestoneTarget)
    : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${mode === 'replay' ? 'Trophy' : 'Achievement unlocked'}: ${achievement.name}`}
      onClick={() => onDismiss(view)}
    >
      {/* Confetti sits before the card in DOM order → falls behind it. */}
      {showConfetti && <Confetti />}
      <div
        className="milestone-pop relative max-w-md w-full rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/15 via-surface-1 to-surface-1 p-8 text-center shadow-2xl shadow-accent/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-light mb-4">
          {eyebrow}
        </div>
        <div className="flex justify-center mb-4">
          <Medallion achievement={achievement} size={88} />
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">{achievement.name}</h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-4">{achievement.hypeCopy}</p>
        {mode === 'replay' && earnedOn && (
          <p className="text-xs text-text-muted mb-2">Unlocked {earnedOn}</p>
        )}
        {nextUp?.milestoneTarget != null && (
          <p className="text-xs text-text-muted mb-4">
            Next up: <span className="text-accent-light font-semibold">{formatNetWorthShort(nextUp.milestoneTarget)}</span> →
          </p>
        )}
        <button
          ref={btnRef}
          onClick={() => onDismiss(view)}
          className="mt-2 px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent/60"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

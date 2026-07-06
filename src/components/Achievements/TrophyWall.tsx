import { useMemo, useState } from 'react';
import type { AchievementState, AchievementTier } from '../../utils/achievements';
import { achievementSummary } from '../../utils/achievements';
import Medallion from './Medallion';

// The permanent trophy layer — earned achievements lit, locked ones dimmed with a
// progress bar, secret+locked shown as mysteries. Reads evaluated states from the
// achievements engine. Tone: full-send, emojis in the icon only. (Scott, 2026-07-06)

const TIER_STYLE: Record<AchievementTier, { ring: string; text: string; label: string }> = {
  bronze:   { ring: 'border-amber-700/50',  text: 'text-amber-500',   label: 'Bronze' },
  silver:   { ring: 'border-slate-400/50',  text: 'text-slate-300',   label: 'Silver' },
  gold:     { ring: 'border-yellow-500/50', text: 'text-yellow-400',  label: 'Gold' },
  platinum: { ring: 'border-accent/60',     text: 'text-accent-light', label: 'Platinum' },
};

const TIER_ORDER: AchievementTier[] = ['platinum', 'gold', 'silver', 'bronze'];

interface Props {
  states: AchievementState[];
  /** Collapsed by default on the dashboard; expandable. */
  defaultOpen?: boolean;
}

export default function TrophyWall({ states, defaultOpen = false }: Props) {
  const [showAll, setShowAll] = useState(defaultOpen);
  const summary = useMemo(() => achievementSummary(states), [states]);

  // Earned first (highest tier first), then locked-in-progress, then grandfathered
  // (already cleared pre-baseline — dead-last, they can't be earned).
  const sorted = useMemo(() => {
    const rank = (s: AchievementState) => TIER_ORDER.length - TIER_ORDER.indexOf(s.achievement.tier);
    const bucket = (s: AchievementState) => (s.earned ? 0 : s.grandfathered ? 2 : 1);
    return [...states].sort((a, b) => {
      if (bucket(a) !== bucket(b)) return bucket(a) - bucket(b);
      if (a.earned && b.earned) return rank(b) - rank(a);
      return b.progress - a.progress;
    });
  }, [states]);

  const visible = showAll ? sorted : sorted.slice(0, 12);
  const pct = summary.total ? Math.round((summary.earned / summary.total) * 100) : 0;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-1 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl">🏆</span>
          <div>
            <h2 className="text-base font-bold text-text-primary leading-tight">Trophy Room</h2>
            <p className="text-[11px] text-text-muted">{summary.earned} of {summary.total} unlocked · {pct}%</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold flex-shrink-0">
          {TIER_ORDER.map((t) => (
            <span key={t} className={`px-1.5 py-0.5 rounded-full border ${TIER_STYLE[t].ring} ${TIER_STYLE[t].text}`}>
              {summary.byTier[t].earned}/{summary.byTier[t].total}
            </span>
          ))}
        </div>
      </div>

      {/* Overall progress rail */}
      <div className="w-full bg-white/10 rounded-full h-1.5 my-3">
        <div className="h-1.5 rounded-full bg-gradient-to-r from-accent to-indigo-400 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visible.map((s) => {
          const t = TIER_STYLE[s.achievement.tier];
          const hidden = s.achievement.secret && !s.earned;
          return (
            <div
              key={s.achievement.id}
              title={hidden ? 'Secret — keep grinding' : `${s.achievement.name}: ${s.achievement.description}`}
              className={`rounded-xl border p-2.5 flex items-start gap-2 transition-colors ${
                s.earned ? `${t.ring} bg-white/[0.04]` : 'border-glass-border bg-white/[0.01] opacity-60'
              }`}
            >
              <span className="flex-shrink-0">
                <Medallion achievement={s.achievement} locked={!s.earned} size={38} />
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-xs font-semibold truncate ${s.earned ? 'text-text-primary' : 'text-text-secondary'}`}>
                  {hidden ? 'Secret trophy' : s.achievement.name}
                </div>
                <div className="text-[10px] text-text-muted truncate">
                  {s.earned ? (
                    <span className={t.text}>{t.label} · unlocked</span>
                  ) : s.grandfathered ? (
                    <span className="italic">before Iris · your start line</span>
                  ) : hidden ? (
                    'Hidden until you earn it'
                  ) : (
                    s.detail ?? `${Math.round(s.progress * 100)}% there`
                  )}
                </div>
                {!s.earned && !hidden && !s.grandfathered && s.progress > 0 && (
                  <div className="w-full bg-white/10 rounded-full h-1 mt-1">
                    <div className="h-1 rounded-full bg-text-muted/60" style={{ width: `${Math.round(s.progress * 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length > 12 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs text-accent hover:text-accent-light transition-colors font-medium"
        >
          {showAll ? 'Show less' : `Show all ${sorted.length} trophies →`}
        </button>
      )}
    </div>
  );
}

import type { ReactElement } from 'react';
import type { Achievement, AchievementTier } from '../../utils/achievements';

// Tier-colored medallion badges with a clean SVG glyph — the "gamer trophy" look
// that replaces the emoji icons. Consistent everywhere (wall + celebration).
// (Scott, 2026-07-06: emojis were "absolutely terrible".)

const TIER_GRAD: Record<AchievementTier, [string, string, string]> = {
  // [dark, light, rim]
  bronze:   ['#7c4a12', '#f0a94b', '#b4772e'],
  silver:   ['#5b6675', '#dbe4ee', '#93a1b3'],
  gold:     ['#a8760a', '#ffe07a', '#d9a520'],
  platinum: ['#5b3fb0', '#d7c8ff', '#9b7cf0'],
};

// Simple stroke glyphs (24x24), centered in the 48 medallion. Keyed names mapped
// from each achievement below. Kept minimal so they read at small sizes.
const GLYPHS: Record<string, ReactElement> = {
  star: <path d="M12 2.5l2.9 6.3 6.6.6-5 4.4 1.5 6.5L12 17l-6 3.8 1.5-6.5-5-4.4 6.6-.6z" />,
  flame: <path d="M12 2.5c1.2 3.2 4 4.3 4 8a4 4 0 0 1-8 0c0-1.3.5-2.3 1.3-3.1.2 1.4 1.1 2 1.9 2 .6-2.1-.8-4.6.8-6.9z" />,
  crown: <><path d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 10h-13z" /><path d="M5 20h14" /></>,
  coin: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.8 9.6a2.4 1.8 0 0 1 4.4 0M14.2 14.4a2.4 1.8 0 0 1-4.4 0" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4.5a2 2 0 0 0 0 4H7M17 6h2.5a2 2 0 0 1 0 4H17" /><path d="M9.5 15.5V18M14.5 15.5V18M8 20.5h8" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.8" /><circle cx="12" cy="12" r="1.4" /></>,
  trendingUp: <><path d="M3.5 16.5L10 10l3.5 3.5L20.5 6.5" /><path d="M15.5 6.5h5v5" /></>,
  heart: <path d="M12 20.5S3.5 15.6 3.5 9.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8.5 1.7c0 6.3-8.5 11.2-8.5 11.2z" />,
  shield: <><path d="M12 3l7 2.5v5.5c0 5-3.4 8.2-7 9.5-3.6-1.3-7-4.5-7-9.5V5.5z" /><path d="M9 12l2 2 4-4.5" /></>,
  medal: <><circle cx="12" cy="14.5" r="6" /><path d="M12 14.5l0 0M9.2 9L6.5 3.5M14.8 9l2.7-5.5" /><path d="M12 12.5l1 3-1-.7-1 .7z" /></>,
};

function glyphFor(a: Achievement): keyof typeof GLYPHS {
  const byId: Record<string, keyof typeof GLYPHS> = {
    'streak-12': 'crown', 'three-mil-club': 'crown',
    'banked-1k': 'coin', 'banked-10k': 'coin', 'banked-50k': 'coin', 'fun-banked-500': 'coin',
    'banked-100k': 'trophy', 'crush-10': 'trophy', 'full-send': 'trophy',
    'first-crush': 'target', 'crush-big': 'target',
    'crush-3': 'medal', 'crush-patient': 'medal',
    'fun-first-month': 'shield', 'fun-streak-3': 'shield', 'fun-streak-6': 'shield',
  };
  if (byId[a.id]) return byId[a.id];
  switch (a.category) {
    case 'discipline': return 'flame';
    case 'savings': return 'trendingUp';
    case 'netWorth': return 'trendingUp';
    case 'couples': return 'heart';
    case 'goals': return 'target';
    case 'funMoney': return 'shield';
    case 'prestige': return 'trophy';
    default: return 'star'; // exploration / setup
  }
}

interface Props {
  achievement: Achievement;
  size?: number;
  locked?: boolean;
}

export default function Medallion({ achievement, size = 44, locked = false }: Props) {
  const [dark, light, rim] = TIER_GRAD[achievement.tier];
  const gid = `med-${achievement.tier}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true"
      style={locked ? { filter: 'grayscale(1)', opacity: 0.45 } : undefined}>
      <defs>
        <radialGradient id={gid} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
      </defs>
      {/* coin body + rim */}
      <circle cx="24" cy="24" r="21" fill={`url(#${gid})`} stroke={rim} strokeWidth="2" />
      <circle cx="24" cy="24" r="17.5" fill="none" stroke={light} strokeOpacity="0.55" strokeWidth="1" />
      {/* glyph */}
      <g transform="translate(12 12)" fill="none" stroke="#fff" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
        {GLYPHS[glyphFor(achievement)]}
      </g>
    </svg>
  );
}

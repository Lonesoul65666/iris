import { useMemo } from 'react';

// A brief, restrained particle burst — the "not tacky" version of a confetti
// cannon. ~18 pieces fall and fade over ~1.5s, then it's gone. Rendered ONLY on
// a live unlock (never on replay) and never under prefers-reduced-motion (the
// CSS hides .confetti-layer in that case; the caller also skips mounting it).
// Sits behind the celebration card (earlier in DOM order) so pieces fall in the
// margins, not across the copy.

const COLORS = ['#8b5cf6', '#6366f1', '#2fe6a0', '#f0a94b', '#ffe07a'];

export default function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: 10 + Math.random() * 80,        // vw across the screen
        delay: Math.random() * 0.25,          // slight stagger
        duration: 1.2 + Math.random() * 0.5,  // 1.2–1.7s
        color: COLORS[i % COLORS.length],
        drift: Math.random() * 40 - 20,       // horizontal drift px
        rotate: 360 + Math.random() * 360,    // spin
      })),
    [],
  );

  return (
    <div className="confetti-layer" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}vw`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            // custom props consumed by the keyframes
            ['--drift' as string]: `${p.drift}px`,
            ['--rot' as string]: `${p.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}

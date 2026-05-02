import { useState, useEffect, useRef } from 'react';

/** Animates a number from 0 (or previous value) to `value` on mount/change. */
export default function AnimatedNumber({
  value,
  duration = 800,
  prefix = '',
  suffix = '',
  formatter,
  className,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  formatter?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const diff = to - from;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + diff * eased;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        prevRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  const formatted = formatter ? formatter(display) : display.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <span className={className}>
      {prefix}{formatted}{suffix}
    </span>
  );
}

import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Small "(i)" affordance that shows an explanatory popover on hover/focus.
 * Portaled to document.body and positioned via getBoundingClientRect so it
 * never gets clipped by an ancestor's overflow-hidden (several dashboard
 * cards + DashSection use that for their own layout/animation reasons).
 */
export default function InfoTooltip({ text }: { text: ReactNode }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 240;
    // Center under the icon by default, clamped so it stays on-screen.
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    setPos({ top: r.bottom + 6, left });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="More info"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-text-muted/70 hover:text-accent-light transition-colors flex-shrink-0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v5.5M12 7.8v.01" strokeLinecap="round" />
        </svg>
      </button>
      {open && pos && createPortal(
        <div
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 240 }}
          className="z-[200] glass-card-sm p-3 text-xs text-text-secondary leading-relaxed pointer-events-none animate-fadeIn"
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}

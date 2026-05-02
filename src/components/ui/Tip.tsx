import { useState, type ReactNode } from 'react';

/** Styled tooltip that appears on hover/click — replaces native title attributes */
export default function Tip({ text, children }: { text: string; children?: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}>
      {children || <span className="text-text-muted text-xs cursor-help hover:text-text-secondary">what's this?</span>}
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-xl bg-surface-2 border border-glass-border shadow-xl shadow-black/40 text-xs text-text-secondary leading-relaxed pointer-events-none animate-fadeIn">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-surface-2" />
        </span>
      )}
    </span>
  );
}

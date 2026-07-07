import { useState, useRef, useEffect, type ReactNode } from 'react';

/** Collapsible dashboard section with icon, title, summary when collapsed, and smooth height animation */
export default function DashSection({ title, icon, summary, defaultOpen = false, accent, children }: {
  title: ReactNode; icon: string; summary: ReactNode; defaultOpen?: boolean; accent?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);
  const contentRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!contentRef.current) return;

    if (open) {
      const h = contentRef.current.scrollHeight;
      setHeight(h);
      // After transition, set to auto so content can resize
      const timer = setTimeout(() => setHeight(undefined), 350);
      return () => clearTimeout(timer);
    } else {
      // Set explicit height first so transition can animate from it
      const h = contentRef.current.scrollHeight;
      setHeight(h);
      // Force reflow, then set to 0
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setHeight(0));
      });
    }
  }, [open]);

  return (
    <div className={`glass-card overflow-hidden ${accent || ''}`}>
      {/* A real <button> here would make any interactive title content (e.g. an
          InfoTooltip's own button) an invalid nested button — div+role mirrors
          the pattern already used for BudgetView's clickable tiles. */}
      <div role="button" tabIndex={0} onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
        className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors cursor-pointer">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg flex-shrink-0">{icon}</span>
          <div className="text-left min-w-0">
            <span className="text-sm font-semibold text-text-primary">{title}</span>
            {!open && <div className="text-xs text-text-muted mt-0.5 truncate">{summary}</div>}
          </div>
        </div>
        <svg className={`w-4 h-4 text-text-muted transition-transform duration-300 flex-shrink-0 ml-3 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <div
        ref={contentRef}
        style={{
          height: height === undefined ? 'auto' : height,
          overflow: 'hidden',
          transition: 'height 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

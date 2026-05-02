import type { ReactNode } from 'react';
import { useAppData } from '../../context/AppDataContext';

interface EmptyStateProps {
  /** Short headline — what's missing. */
  title: string;
  /** One sentence explaining what this widget does once data exists. */
  description?: string;
  /** Emoji or icon to anchor the card. */
  icon?: string;
  /** CTA label — defaults to "Add data". */
  ctaLabel?: string;
  /** Where to send the user when they click CTA. Defaults to 'portfolio'. */
  ctaTarget?: 'portfolio' | 'budget' | 'settings' | 'onboarding';
  /** Optional extra content slotted below the description. */
  children?: ReactNode;
  /** Compact mode — denser styling for inline use inside cards. */
  compact?: boolean;
}

/**
 * Generic empty-state for widgets that have no real data to render yet.
 * Replaces the previous "calculate on zeros and show confident-looking
 * placeholder numbers" pattern. Use behind a `useHasRealData` gate.
 */
export default function EmptyState({
  title,
  description,
  icon = '✨',
  ctaLabel = 'Add data',
  ctaTarget = 'portfolio',
  children,
  compact = false,
}: EmptyStateProps) {
  const { setView } = useAppData();
  const onClick = () => setView(ctaTarget);

  if (compact) {
    return (
      <div className="text-center py-6 px-4">
        <div className="text-2xl mb-2 opacity-60">{icon}</div>
        <div className="text-sm font-semibold text-text-primary mb-1">{title}</div>
        {description && <div className="text-xs text-text-muted mb-3">{description}</div>}
        {children}
        <button
          onClick={onClick}
          className="text-xs text-accent hover:text-accent-light transition-colors underline underline-offset-4"
        >
          {ctaLabel} →
        </button>
      </div>
    );
  }

  return (
    <div className="text-center py-10 px-6 rounded-xl border border-dashed border-glass-border bg-surface-1/50">
      <div className="text-4xl mb-3 opacity-60">{icon}</div>
      <h3 className="text-base font-semibold text-text-primary mb-2">{title}</h3>
      {description && <p className="text-sm text-text-muted mb-4 max-w-sm mx-auto">{description}</p>}
      {children}
      <button
        onClick={onClick}
        className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-semibold transition-colors"
      >
        {ctaLabel} →
      </button>
    </div>
  );
}

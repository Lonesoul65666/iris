import type { ReactNode } from 'react';

interface Props {
  /** True when in edit mode — controls visibility of the chrome bar. */
  active: boolean;
  /** True when the user has made changes since opening edit mode. */
  isDirty: boolean;
  /** Save (commit + audit log + close). */
  onSave: () => void | Promise<void>;
  /** Cancel (restore snapshot + close). */
  onCancel: () => void | Promise<void>;
  /**
   * Optional. The overlay renders a sticky chrome bar at the top; if children
   * are passed they render below. Most callers don't pass children — the edit
   * sections are placed elsewhere in the parent tree alongside the overlay.
   */
  children?: ReactNode;
}

/**
 * Sticky header bar that wraps the budget-edit surfaces. Renders only when
 * `active` is true. Children render below normally — overlay just provides
 * chrome (title + Save/Cancel/Done) and a strong visual cue that the user is
 * in edit mode.
 *
 * Save: persists snapshot diff to audit log via parent, closes edit mode.
 * Cancel: restores snapshot, closes edit mode.
 */
export default function BudgetEditOverlay({ active, isDirty, onSave, onCancel, children }: Props) {
  if (!active) return null;
  return (
    <>
      {/* Sticky chrome bar */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-3 mb-4 backdrop-blur-md bg-surface-1/90 border-b-2 border-accent shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="cyber-chip border bg-accent/20 border-accent text-accent-light flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              EDIT MODE
            </div>
            <div className="min-w-0">
              <div className="term-label">Editing budget plan</div>
              <div className="text-xs text-text-muted truncate">
                Changes apply when you click Save. Cancel restores everything.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface-3 border border-glass-border text-text-secondary hover:text-text-primary text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                isDirty
                  ? 'bg-accent hover:bg-accent-light text-white'
                  : 'bg-surface-2 border border-glass-border text-text-muted cursor-not-allowed'
              }`}
            >
              {isDirty ? 'Save' : 'No changes'}
            </button>
          </div>
        </div>
      </div>
      {children}
    </>
  );
}

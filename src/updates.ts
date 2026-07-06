import type { Nudge } from './utils/nudgeEngine';

/**
 * Release notes — the "What's New" area.
 *
 * This is the single place we record what shipped. When we cut an update, add a
 * new entry to the TOP of UPDATES and bump its `version`. On the next launch
 * after a `git pull`, the dashboard shows a one-time "What's New" card (see
 * whatsNewNudge in AppDataContext) so you — or Claire on her laptop — get told
 * what changed. Between updates it stays silent: straight to the dashboard,
 * bank-style.
 *
 * Versioning is owned here (package.json stays 0.0.0 — unused). Bump the newest
 * entry's version whenever you want the card to re-appear for everyone.
 */
export interface UpdateEntry {
  /** Monotonic version string. The newest entry's version gates the card. */
  version: string;
  /** ISO date the update shipped. */
  date: string;
  /** Short headline for the card title. */
  title: string;
  /** Bullet notes — what to look for. */
  notes: string[];
}

export const UPDATES: UpdateEntry[] = [
  {
    version: '2026.07.06',
    date: '2026-07-06',
    title: 'This Week’s Focus + What’s New',
    notes: [
      'Your dashboard now opens with “This Week’s Focus” — the 1–3 money moves that actually matter this week, pulled straight from your real numbers.',
      'It stays put all week instead of shuffling every time you open the app, and refreshes on Monday.',
      'This “What’s New” card is new too — you’ll see it once after each update, then it gets out of your way.',
    ],
  },
];

/** The update that gates the card — always the newest entry. */
export const LATEST_UPDATE: UpdateEntry = UPDATES[0];

/** Current app version (the newest shipped update). */
export const APP_VERSION: string = LATEST_UPDATE.version;

/**
 * Build the one-time "What's New" nudge for `latest`, unless the user has
 * already seen this exact version (`lastSeenVersion`). Returns null when
 * there's nothing new — the dashboard renders nothing and goes straight in.
 *
 * Pure + version-gated so it's trivially testable and never fires twice.
 */
export function whatsNewNudge(
  lastSeenVersion: string | null | undefined,
  latest: UpdateEntry = LATEST_UPDATE,
): Nudge | null {
  if (!latest) return null;
  if (lastSeenVersion === latest.version) return null;
  return {
    id: `whatsnew:${latest.version}`,
    severity: 'celebration',
    category: 'news',
    icon: '✨',
    title: `What’s new — ${latest.title}`,
    body: latest.notes.join('  •  '),
    oneShot: true,
  };
}

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
 *
 * FORMAT: `YYYY.MM.DD.vN` — the ship date plus a counter (Scott, 2026-08-17:
 * "every time we do an update and it lands, I'd like to see a different
 * version"). N starts at 1 each day and increments for a SECOND update that
 * lands the same day, so two same-day deploys can never share a version — which
 * matters because `whatsNewNudge` gates on exact string equality, so a reused
 * version silently swallows the card. Entries before 2026.08 predate the
 * suffix and are left as-is; nothing compares versions for ordering.
 *
 * ONE ENTRY PER SHIP DAY, written even if the host deploy lags behind — the
 * array is the record of what was cut, not of what's running.
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
    version: '2026.08.17.v2',
    date: '2026-08-17',
    title: 'Move part of a pot and Iris keeps count',
    notes: [
      'You can now move less than a pot asks for. Iris shows what’s still left for the month instead of calling the pot done, and a "Top up" button adds the rest whenever you get to it.',
      'Before this, committing any amount at all marked the month complete — so a small move would have quietly hidden the rest of what that pot needed.',
      'A part-funded pot now shows both numbers: what you’ve already moved, and what’s still to go.',
    ],
  },
  {
    version: '2026.08.17.v1',
    date: '2026-08-17',
    title: 'Every dollar accounted for',
    notes: [
      'Your Monthly Pulse now shows every dollar you spent. Travel, taxes, cash withdrawals and a few others had no budget line, so they were being left off the card entirely — and left out of its total.',
      'Because of that, "still free this month" was too generous. It now counts everything, so it tells you the truth even when the news is worse.',
      'Your mortgage payment went missing from August. The bank started labeling it a transfer instead of a payment, so Iris stopped counting it — Housing read "untouched" while $3,204 had already gone out. Fixed, backfilled, and guarded so no future relabeling can delete a bill.',
      'Every paycheck was displaying as "Expense" in the Type column. Nothing was actually miscounted, but one click would have made it real — that control is now read-only for income.',
      'You can now correct a transaction Iris got wrong: change its type, change its category, and your correction survives the next bank sync instead of being overwritten.',
      'Fighting a charge? Mark it disputed and it steps out of your spending while you wait — no more a disputed charge quietly eating someone’s fun money. When the credit lands, Iris spots it and asks you to confirm the win.',
      'New "Needs your call" list gathers the handful of transactions only you can settle, so they stop hiding in the transaction log.',
      'Refunds can now be filed under the right category. A refund cancels out spending in whatever category it lands in, so putting it in the right one is what makes your buckets add up.',
      'Your Have-To and Want-To pots were all reporting "behind" with a number that crept up every single day. They now count the months you actually have left, so a pot you’re on top of says so.',
    ],
  },
  {
    version: '2026.08.13.v1',
    date: '2026-08-13',
    title: 'Pots that pace honestly',
    notes: [
      'Have-To and Want-To pots stopped drifting: each one now shows what to set aside this month based on the months remaining, not on a fraction of a calendar day.',
      'Both the budget page and the pots card now show one running total of what to move out of checking.',
      'Cash is money out again. ATM withdrawals and Cash App sends now land in one "ATM / Cash" category and count as spending — two $160 sends had never been counted at all.',
    ],
  },
  {
    version: '2026.07.20.v1',
    date: '2026-07-20',
    title: 'Milestones, Moments, and an Ask Iris that knows your numbers',
    notes: [
      'Net-worth milestones now get a proper celebration — a full-screen moment when you cross a level, and every trophy on your wall is clickable to relive it (with the date you earned it), so whoever missed it live still gets to see it.',
      'Iris has a voice now, literally: a short chime on a milestone. Turn it off any time under Settings → Preferences.',
      'New Moments layer tracks the wins you can repeat every month — coming in under base, both of you staying inside your fun money, retiring a Want-To — and shows this month’s as a live goal with days left.',
      'Your investment and retirement accounts are now part of net worth, counted as investments rather than cash.',
      'Ask Iris was answering from your plan instead of your actual spending, which is how it invented numbers you didn’t recognize. It now sees every month’s real totals against your $15,800 base, plus where the current month stands.',
    ],
  },
  {
    version: '2026.07.13',
    date: '2026-07-13',
    title: 'Auto-refresh + subscription watchdog',
    notes: [
      'Iris now refreshes your accounts automatically — no more clicking. It pulls when you open it, and the always-on host re-checks every 12 hours, so you stay current even after time away.',
      'Subscriptions & Recurring is now manageable — hover a charge to mark it Canceled or "Not a sub".',
      'Cancel something and it charges you again? Iris flags it up top — the cancellation may not have stuck.',
      'New recurring charge shows up unexpectedly? You get a heads-up, so accidental signups don’t sneak by.',
      'Canceled and ignored charges drop out of your monthly total and the Coming Up calendar.',
      'Cleaned up the dashboard: clearer section titles, fewer icons.',
    ],
  },
  {
    version: '2026.07.11',
    date: '2026-07-11',
    title: 'Bank sync moved to Plaid',
    notes: [
      'Our bank connector, Teller, shut down its API — so bank & card sync now runs on Plaid instead.',
      'One-time step: reconnect your banks under Settings → Connectors → “Connect a bank (Plaid)”.',
      'Your history is untouched — new transactions map back to the same accounts automatically.',
      'The dashboard “Update” button now pulls through Plaid; everything else works exactly as before.',
      'Investments (Fidelity) and crypto (Coinbase) were never on Teller, so they’re unaffected.',
    ],
  },
  {
    version: '2026.07.07',
    date: '2026-07-07',
    title: 'Account security hardening',
    notes: [
      'Iris can now safely live behind a URL you reach from anywhere — logins are protected against guessing.',
      'Too many wrong password tries now temporarily locks that account for 15 minutes.',
      'New passwords need at least 10 characters and a confirmation field, so a typo can’t lock you out.',
      'You can now change your password anytime under Settings → Security.',
      'Sessions no longer stay logged in forever — an untouched browser signs itself out (idle 24h, 14 days max).',
      'Locked out or forgot a password? Run reset-password.bat on the host to set a new one.',
    ],
  },
  {
    version: '2026.07.06',
    date: '2026-07-06',
    title: 'This Week’s Focus, Coming Up + What’s New',
    notes: [
      'Your dashboard now opens with “This Week’s Focus” — the 1–3 money moves that actually matter this week, pulled straight from your real numbers.',
      'It stays put all week instead of shuffling every time you open the app, and refreshes on Monday.',
      'New “Coming up · next 30 days” section — a forward calendar of your recurring bills so you can see what’s hitting when.',
      'New “Subscriptions & recurring” radar — every recurring charge ranked by what it costs you per month, so creep is easy to spot.',
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

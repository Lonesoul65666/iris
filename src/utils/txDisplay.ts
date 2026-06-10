// Transaction + account display helpers — shared by the dashboard cards.
//
// The account metadata below is the FRONTEND source of truth for turning a
// stored Expense.source into a human account name. It deliberately mirrors the
// server-side mapping in server/teller-map.ts (mapAccountSource), which is what
// actually stamps `source` onto imported transactions. Keep the two in sync:
// if a Teller account starts mapping to a new source, add it here too.
//
// NOTE: two older label maps exist (ExpenseManager.tsx, SettingsView.tsx) with
// conflicting card assignments left over from the pre-Teller CSV era. The
// current data was rebuilt entirely from Teller (clean-slate, 2026-06-08), so
// THIS map — matching teller-map.ts — is the correct one.

export interface AccountMeta {
  source: string;
  name: string; // human account name, e.g. "Citi AAdvantage"
  last4: string; // last four of the account/card number
  kind: 'credit' | 'checking' | 'savings';
  icon: string; // emoji shown next to the account
  color: string; // accent used for the share bar / dot
}

export const ACCOUNT_META: Record<string, AccountMeta> = {
  credit_card_1: { source: 'credit_card_1', name: 'Citi AAdvantage',    last4: '3306', kind: 'credit',   icon: '💳', color: '#8b5cf6' },
  credit_card_2: { source: 'credit_card_2', name: 'CapOne Quicksilver', last4: '0114', kind: 'credit',   icon: '💳', color: '#ec4899' },
  bofa_checking: { source: 'bofa_checking', name: 'BoA Main Checking',  last4: '8256', kind: 'checking', icon: '🏦', color: '#06b6d4' },
  bofa_joint:    { source: 'bofa_joint',    name: 'BoA Our Stuffs',     last4: '1006', kind: 'checking', icon: '🏦', color: '#10b981' },
  bofa_savings:  { source: 'bofa_savings',  name: 'BoA Super Savings',  last4: '3784', kind: 'savings',  icon: '🏦', color: '#f59e0b' },
};

// Display order: cards first (where most spend lands), then checking, then savings.
export const ACCOUNT_ORDER = ['credit_card_1', 'credit_card_2', 'bofa_checking', 'bofa_joint', 'bofa_savings'];

/** Resolve a stored source to display metadata, with a graceful fallback for
 *  stray legacy sources (credit_card_3, venmo, other, unknown). */
export function accountMeta(source: string | undefined): AccountMeta {
  const key = source || 'unknown';
  if (ACCOUNT_META[key]) return ACCOUNT_META[key];
  const fallbackNames: Record<string, string> = {
    credit_card_3: 'Credit Card 3',
    venmo: 'Venmo',
    other: 'Other account',
    unknown: 'Unknown source',
  };
  return {
    source: key,
    name: fallbackNames[key] || key,
    last4: '',
    kind: key.startsWith('credit') ? 'credit' : 'checking',
    icon: key.startsWith('credit') ? '💳' : '🏦',
    color: '#64748b',
  };
}

/** Extract a YYYY-MM key from an expense date. Handles both ISO (YYYY-MM-DD,
 *  from Teller) and US (M/D/YYYY, from legacy CSV) formats. Returns '' if it
 *  can't parse — callers filter those out. Mirrors the inline logic in
 *  AppDataContext's availableMonths. */
export function monthKey(date: string | undefined): string {
  if (!date) return '';
  if (date.includes('/')) {
    const [m, , y] = date.split('/');
    if (!m || !y) return '';
    return `${y}-${m.padStart(2, '0')}`;
  }
  return date.slice(0, 7);
}

/** Human label for a YYYY-MM key, e.g. "2026-06" → "June 2026". */
export function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Emoji for a budget/expense category. */
export function categoryEmoji(cat?: string): string {
  if (!cat) return '🧾';
  const map: Record<string, string> = {
    food_groceries: '🛒', food_dining: '🍽️', housing: '🏠', utilities: '💡',
    transportation: '🚗', entertainment: '🎬', subscriptions: '📺', shopping: '🛍️',
    travel_work: '✈️', travel_personal: '🏖️', amazon: '📦', kids: '👶',
    health: '⚕️', insurance: '🛡️', investing: '📈', other: '🧾',
  };
  return map[cat] || '🧾';
}

/** "Today" / "Yesterday" / "3d ago" / "Mar 4" relative date for an ISO string. */
export function formatRelDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

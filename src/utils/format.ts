/** Shared currency formatter — use this everywhere instead of local copies */
export function formatCurrency(v: number): string {
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

export function formatPercent(v: number, decimals = 1): string {
  return `${v.toFixed(decimals)}%`;
}

/** Humanize a span of days into the gamified "how long till you get there" line:
 *  "12 days", "11 months, 12 days", "~3 years". Coarsens as it grows — nobody
 *  cares about the odd day two years out. Uses 30.44 d/mo, 365.25 d/yr. */
export function formatDuration(days: number): string {
  const d = Math.round(days);
  if (d <= 0) return 'now';
  if (d < 31) return `${d} day${d === 1 ? '' : 's'}`;
  const years = d / 365.25;
  if (years >= 2) {
    const rounded = Math.round(years * 2) / 2; // nearest half-year
    return `~${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} years`;
  }
  const months = Math.floor(d / 30.44);
  const remDays = Math.round(d - months * 30.44);
  const mo = `${months} month${months === 1 ? '' : 's'}`;
  if (remDays <= 0) return mo;
  return `${mo}, ${remDays} day${remDays === 1 ? '' : 's'}`;
}

/**
 * Sanitize a money input value as the user types — allows digits + at most
 * one decimal point with up to 2 trailing digits. Use in onChange:
 *
 *   onChange={e => setX(sanitizeMoneyInput(e.target.value))}
 *
 * Pair with `parseFloat(value) || 0` on save. Never use parseInt on money —
 * it silently drops cents.
 */
export function sanitizeMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return parts[0] || '';
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
}

/** Shared currency formatter — use this everywhere instead of local copies */
export function formatCurrency(v: number): string {
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

export function formatPercent(v: number, decimals = 1): string {
  return `${v.toFixed(decimals)}%`;
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

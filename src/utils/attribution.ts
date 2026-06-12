// Per-person spend attribution — pure, testable. The couples scoreboard's
// data layer.
//
// Resolution order (one rule, no special cases):
//   transaction override (Expense.spender) → account owner (sourceOwners) → 'ours'
//
// 'ours' is deliberately the bottom: unattributed money is JOINT money. The
// scoreboard should never guess a spender the household didn't assert.

import type { Expense, Earner, SourceOwner } from '../types/budget';

/** The joint/shared spender id. Not an Earner.id by construction. */
export const JOINT = 'ours';

export function buildOwnerMap(rows: SourceOwner[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.source && r.owner) map[r.source] = r.owner;
  }
  return map;
}

/** Who spent this transaction, resolved. Returns an Earner.id or JOINT. */
export function effectiveSpender(e: Expense, ownerMap: Record<string, string>): string {
  return e.spender ?? (e.source ? ownerMap[e.source] : undefined) ?? JOINT;
}

/** Display name for a spender id. */
export function spenderName(id: string, earners: Earner[]): string {
  if (id === JOINT) return 'Ours';
  return earners.find(x => x.id === id)?.name ?? id;
}

/** One-click cycle for the row toggle, mirroring the Personal↔Work pattern:
 *  inherit (undefined) → each earner → ours → back to inherit. */
export function nextSpender(current: string | undefined, earners: Earner[]): string | undefined {
  const order: (string | undefined)[] = [undefined, ...earners.map(e => e.id), JOINT];
  const idx = order.indexOf(current);
  // Unknown value (e.g. a deleted earner's id) resets to inherit.
  if (idx === -1) return undefined;
  return order[(idx + 1) % order.length];
}

// Net-worth series — the multi-line breakdown behind the headline number.
//
// The hero chart answers "is net worth going up". This answers "which POOL is
// moving": cash, each brokerage / crypto exchange, and everything that isn't a
// linked account (equity, home minus mortgage, the car).
//
// It needs no new storage. `PortfolioSnapshot.accountTotals` has recorded a
// per-account value on every snapshot since the chart existed, so the history is
// already there — this just groups it. Non-account value comes out of the two
// totals the snapshot already carries: totalNetWorth − totalLiquidNetWorth.
//
// Pure. No React, no IO.

import type { Account, PortfolioSnapshot } from '../types/portfolio';

/** Categorical series colors, dark-mode steps, in FIXED assignment order.
 *
 *  Validated (not eyeballed) with the dataviz palette checker against this app's
 *  card surface (#12121a):
 *    node validate_palette.js "#9085e9,#199e70,#d95926,#3987e5,#d55181,#c98500" \
 *      --mode dark --surface "#12121a"
 *    → lightness band PASS · chroma floor PASS · CVD separation PASS (worst
 *      adjacent ΔE 9.4 deutan) · normal-vision floor PASS (19.3) · contrast PASS
 *
 *  Violet leads because it's the app's own accent, stepped for the dark band. Six
 *  is the cap: a seventh hue drops the worst adjacent pair into the 6–8 CVD warn
 *  band, so anything past six folds into "Other" rather than inventing a colour.
 *  Colour follows the ENTITY, never its rank — see assignment below. */
export const NW_SERIES_COLORS = ['#9085e9', '#199e70', '#d95926', '#3987e5', '#d55181', '#c98500'] as const;

/** The fold bucket. Deliberately a neutral, not a categorical hue — it isn't an
 *  identity, it's "several small things". */
export const NW_OTHER_COLOR = '#8a8a99';

/** Slot reserved for the non-account pool, so linking a brokerage can never
 *  repaint it (colour follows the entity). */
const ASSETS_SLOT = 5;
/** Slots left for institutions: 1..4. Cash owns slot 0. */
const MAX_INSTITUTIONS = 4;

export const CASH_KEY = 'cash';
export const ASSETS_KEY = 'assets';
export const OTHER_KEY = 'other';

export interface NetWorthGroup {
  key: string;
  label: string;
  color: string;
  /** Most recent value — lets the legend double as a value readout. */
  latest: number;
}

export interface NetWorthSeries {
  groups: NetWorthGroup[];
  /** One row per snapshot: `{ date, total, [groupKey]: number | null }`.
   *  A group is `null` — not 0 — on a snapshot that predates per-account
   *  recording, so the line breaks instead of diving to the floor. */
  points: Array<Record<string, string | number | null>>;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Which pool does this account belong to? Cash is one pool regardless of bank
 *  (four chequing accounts are not four stories); everything else is grouped by
 *  institution, which is how the money is actually thought about — "Fidelity",
 *  "Coinbase", "Robinhood". */
function groupForAccount(a: Account): { key: string; label: string } {
  if (a.type === 'bank') return { key: CASH_KEY, label: 'Cash' };
  const inst = (a.institution || '').trim();
  if (!inst) return { key: 'inst:unnamed', label: 'Other investments' };
  return { key: `inst:${slug(inst)}`, label: inst };
}

export function buildNetWorthSeries(snaps: PortfolioSnapshot[], accounts: Account[]): NetWorthSeries {
  const ordered = [...snaps].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length === 0) return { groups: [], points: [] };

  const groupOfAccount = new Map<string, { key: string; label: string }>();
  for (const a of accounts) groupOfAccount.set(a.id, groupForAccount(a));

  // First appearance order, oldest snapshot first — a newly linked institution
  // takes the next free slot and never displaces one already on screen.
  const seen: string[] = [];
  const labels = new Map<string, string>();
  const noteGroup = (key: string, label: string) => {
    if (!labels.has(key)) labels.set(key, label);
    if (!seen.includes(key)) seen.push(key);
  };

  let anyAssets = false;
  const rows: Array<{ date: string; total: number; values: Map<string, number> | null }> = [];
  for (const s of ordered) {
    const totals = s.accountTotals ?? [];
    const values = totals.length > 0 ? new Map<string, number>() : null;
    if (values) {
      for (const t of totals) {
        // An id with no account behind it is a closed/deleted account: still real
        // money on that date, so it goes to Other rather than silently vanishing.
        const g = groupOfAccount.get(t.accountId) ?? { key: OTHER_KEY, label: 'Closed accounts' };
        noteGroup(g.key, g.label);
        values.set(g.key, (values.get(g.key) ?? 0) + t.value);
      }
      const nonAccount = Math.round(s.totalNetWorth - s.totalLiquidNetWorth);
      if (Math.abs(nonAccount) >= 1) {
        anyAssets = true;
        noteGroup(ASSETS_KEY, 'Equity & real assets');
        values.set(ASSETS_KEY, nonAccount);
      }
    }
    rows.push({ date: s.date, total: s.totalNetWorth, values });
  }

  // ── slot assignment: cash first, institutions by first appearance, the
  //    non-account pool in its reserved slot, the rest folded into Other ──
  const institutions = seen.filter((k) => k !== CASH_KEY && k !== ASSETS_KEY && k !== OTHER_KEY);
  const kept = institutions.slice(0, MAX_INSTITUTIONS);
  const folded = new Set(institutions.slice(MAX_INSTITUTIONS));
  const colorOf = new Map<string, string>();
  if (seen.includes(CASH_KEY)) colorOf.set(CASH_KEY, NW_SERIES_COLORS[0]);
  kept.forEach((k, i) => colorOf.set(k, NW_SERIES_COLORS[i + 1]));
  if (anyAssets) colorOf.set(ASSETS_KEY, NW_SERIES_COLORS[ASSETS_SLOT]);
  const needsOther = folded.size > 0 || seen.includes(OTHER_KEY);
  if (needsOther) colorOf.set(OTHER_KEY, NW_OTHER_COLOR);

  const points: NetWorthSeries['points'] = rows.map((r) => {
    const row: Record<string, string | number | null> = { date: r.date, total: Math.round(r.total) };
    for (const key of colorOf.keys()) row[key] = r.values ? 0 : null;
    if (r.values) {
      for (const [key, v] of r.values) {
        const target = folded.has(key) ? OTHER_KEY : key;
        row[target] = ((row[target] as number) ?? 0) + Math.round(v);
      }
    }
    return row;
  });

  const latestOf = (key: string): number => {
    for (let i = points.length - 1; i >= 0; i--) {
      const v = points[i][key];
      if (typeof v === 'number') return v;
    }
    return 0;
  };

  const order = [
    ...(seen.includes(CASH_KEY) ? [CASH_KEY] : []),
    ...kept,
    ...(anyAssets ? [ASSETS_KEY] : []),
    ...(needsOther ? [OTHER_KEY] : []),
  ];
  const groups: NetWorthGroup[] = order.map((key) => ({
    key,
    label: key === OTHER_KEY ? 'Other' : labels.get(key) ?? key,
    color: colorOf.get(key)!,
    latest: latestOf(key),
  }));

  return { groups, points };
}

/**
 * Federal income tax bracket lookup. Brackets shift annually for inflation —
 * keep this file year-stamped and update once a year (mid-November IRS releases).
 *
 * State tax is intentionally NOT computed here. Most non-no-tax states have
 * multi-tier brackets with different rules; encoding them well is a project,
 * and bad encoding gives users wrong-looking numbers. We only flag the nine
 * no-income-tax states so a Texan doesn't see "set state tax" prompts forever.
 */

export const TAX_YEAR = 2025;

export type FilingStatus = 'single' | 'mfj';

interface BracketRow {
  /** Top of this bracket. Income at-or-below this rate pays at this %.
   *  Use Infinity for the top bracket. */
  upTo: number;
  rate: number;
}

// 2025 IRS published brackets (rev. proc. 2024-40).
const FEDERAL_2025_SINGLE: BracketRow[] = [
  { upTo: 11_925, rate: 10 },
  { upTo: 48_475, rate: 12 },
  { upTo: 103_350, rate: 22 },
  { upTo: 197_300, rate: 24 },
  { upTo: 250_525, rate: 32 },
  { upTo: 626_350, rate: 35 },
  { upTo: Infinity, rate: 37 },
];

const FEDERAL_2025_MFJ: BracketRow[] = [
  { upTo: 23_850, rate: 10 },
  { upTo: 96_950, rate: 12 },
  { upTo: 206_700, rate: 22 },
  { upTo: 394_600, rate: 24 },
  { upTo: 501_050, rate: 32 },
  { upTo: 751_600, rate: 35 },
  { upTo: Infinity, rate: 37 },
];

/**
 * Marginal federal bracket for a given annual gross income + filing status.
 * Returns an integer percentage (12, 22, 24, etc.). Returns 0 for non-positive
 * income so empty-state UIs don't show a misleading "10%" suggestion.
 */
export function getFederalBracket(annualIncome: number, filing: FilingStatus): number {
  if (!annualIncome || annualIncome <= 0) return 0;
  const table = filing === 'mfj' ? FEDERAL_2025_MFJ : FEDERAL_2025_SINGLE;
  for (const row of table) {
    if (annualIncome <= row.upTo) return row.rate;
  }
  return 37;
}

/** Two-letter codes for U.S. states with no individual income tax. */
export const NO_INCOME_TAX_STATES = new Set(['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY']);

export function isNoIncomeTaxState(stateCode: string): boolean {
  return NO_INCOME_TAX_STATES.has(stateCode.toUpperCase().trim());
}

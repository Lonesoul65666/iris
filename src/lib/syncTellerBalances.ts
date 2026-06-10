// Pull real account balances from Teller and turn the depository (cash) accounts
// into portfolio `accounts` so net worth reflects real cash in the bank. Credit
// cards are reported as liabilities (so all "pools" are visible) but NOT written
// as portfolio accounts yet — the AccountType has no liability type, so modeling
// cards correctly is a separate step (would otherwise need a negative-balance
// hack that breaks allocation charts).
//
// Idempotent: each account writes to a deterministic id `teller-<source>`, so
// re-syncing updates balances in place rather than duplicating.

import type { Account } from '../types/portfolio';
import { saveAccount } from '../stores/portfolioStore';

interface BalanceRow {
  accountId: string;
  source: string;
  name: string;
  institution: string;
  type: string;
  subtype: string;
  lastFour: string;
  currency: string;
  ledger: number | null;
  available: number | null;
  kind: 'asset' | 'liability';
}

export interface SyncBalancesResult {
  assetsSynced: { name: string; source: string; balance: number }[];
  liabilities: { name: string; source: string; balanceOwed: number }[];
  errors: unknown[];
}

export async function syncTellerBalances(): Promise<SyncBalancesResult> {
  const res = await fetch('/api/teller/balances');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(`teller balances → ${res.status} ${body.error ?? body.message ?? ''}`);
  }
  const body = (await res.json()) as { ok: boolean; balances: BalanceRow[]; errors: unknown[] };
  const today = new Date().toISOString().slice(0, 10);
  const result: SyncBalancesResult = { assetsSynced: [], liabilities: [], errors: body.errors ?? [] };

  for (const b of body.balances) {
    if (b.kind === 'liability') {
      result.liabilities.push({ name: b.name, source: b.source, balanceOwed: b.ledger ?? b.available ?? 0 });
      continue;
    }
    // Depository → a single-cash-holding bank account.
    const bal = b.ledger ?? b.available ?? 0;
    const id = `teller-${b.source}`;
    const acct: Account = {
      id,
      name: b.lastFour ? `${b.name} (${b.lastFour})` : b.name,
      institution: b.institution,
      type: 'bank',
      status: 'active',
      lastUpdated: today,
      totalValue: bal,
      holdings: [{
        id: `${id}-cash`,
        accountId: id,
        ticker: 'CASH',
        name: b.name,
        assetClass: 'cash',
        shares: bal,
        avgCostBasis: 1,
        currentPrice: 1,
        currentValue: bal,
        totalGainLoss: 0,
        totalGainLossPercent: 0,
        status: 'active',
        lastUpdated: today,
      }],
    };
    await saveAccount(acct); // recomputes totalValue + lastUpdated, writes to Postgres collections
    result.assetsSynced.push({ name: acct.name, source: b.source, balance: bal });
  }

  return result;
}

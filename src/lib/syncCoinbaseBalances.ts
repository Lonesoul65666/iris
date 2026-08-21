// Pull Coinbase balances into the portfolio as ONE `crypto` account holding real
// per-coin positions.
//
// Unlike the Plaid investment accounts (which get a single synthetic "HOLDINGS"
// row because Plaid's positions need a re-link), Coinbase's own API returns the
// actual wallets — so BTC, ETH and the rest land as genuine holdings with unit
// counts and spot prices. That means the allocation chart and the X-Ray see real
// crypto instead of one opaque lump.
//
// Idempotent: fixed account id `coinbase`, so re-syncing updates in place.

import type { Account, Holding } from '../types/portfolio';
import { saveAccount } from '../stores/portfolioStore';

interface PricedBalance {
  currency: string;
  amount: number;
  name: string;
  priceUsd: number | null;
  valueUsd: number | null;
}

export interface CoinbaseSyncResult {
  /** Holdings written, biggest first. */
  holdings: { ticker: string; amount: number; valueUsd: number }[];
  total: number;
  /** Assets Coinbase has no USD pair for — counted as $0 by nobody, named here. */
  unpriced: string[];
  connected: boolean;
}

const EMPTY: CoinbaseSyncResult = { holdings: [], total: 0, unpriced: [], connected: false };

/** Build the portfolio account from priced balances. Pure — the fetch is below. */
export function buildCoinbaseAccount(priced: PricedBalance[], today: string): Account {
  const holdings: Holding[] = priced
    .filter((b) => b.valueUsd !== null)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    .map((b) => ({
      id: `coinbase-${b.currency.toLowerCase()}`,
      accountId: 'coinbase',
      ticker: b.currency,
      name: b.name || b.currency,
      // USD sitting in Coinbase is cash, not a crypto position — calling it
      // crypto would skew every allocation chart that asks "how much crypto".
      assetClass: b.currency === 'USD' ? 'cash' : 'crypto',
      shares: b.amount,
      // No cost basis available from this endpoint, and inventing one would
      // manufacture a fake gain/loss. Basis = current price ⇒ gain/loss $0,
      // which is honestly "unknown" rather than dishonestly "up".
      avgCostBasis: b.priceUsd ?? 0,
      currentPrice: b.priceUsd ?? 0,
      currentValue: b.valueUsd ?? 0,
      totalGainLoss: 0,
      totalGainLossPercent: 0,
      status: 'active',
      lastUpdated: today,
    }));
  return {
    id: 'coinbase',
    name: 'Coinbase',
    institution: 'Coinbase',
    type: 'crypto',
    status: 'active',
    lastUpdated: today,
    totalValue: Math.round(holdings.reduce((s, h) => s + h.currentValue, 0) * 100) / 100,
    holdings,
  };
}

/** Fetch + write. Returns `connected: false` (not an error) when no key is set —
 *  the auto-refresh path calls this on every open and must stay quiet. */
export async function syncCoinbaseBalances(): Promise<CoinbaseSyncResult> {
  const res = await fetch('/api/coinbase/balances');
  if (res.status === 503) return EMPTY;   // no key stored — nothing to say
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(`coinbase balances → ${res.status} ${body.error ?? body.message ?? ''}`);
  }
  const body = (await res.json()) as { ok: boolean; balances: PricedBalance[]; total: number; unpriced: string[] };
  const today = new Date().toISOString().slice(0, 10);
  const acct = buildCoinbaseAccount(body.balances ?? [], today);
  await saveAccount(acct);
  return {
    holdings: acct.holdings.map((h) => ({ ticker: h.ticker, amount: h.shares, valueUsd: h.currentValue })),
    total: acct.totalValue,
    unpriced: body.unpriced ?? [],
    connected: true,
  };
}

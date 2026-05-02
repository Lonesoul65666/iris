import type { Account, AccountType, AssetClass, Holding } from '../types/portfolio';
import type { Expense } from '../types/budget';
import { getSetting, saveSetting, getAllAccounts, saveAccount } from '../stores/portfolioStore';
import { getExpenses, saveExpense } from '../stores/budgetStore';
import { classifyBankTransaction } from '../utils/transactionCategorize';

/**
 * SimpleFIN Bridge integration — Scott's chosen aggregator.
 *
 * Flow:
 * 1. User signs up at beta-bridge.simplefin.org, pays $15/yr direct to SimpleFIN.
 * 2. User connects their institutions there (BoA / Fidelity / Coinbase / etc.).
 * 3. User copies a one-time "setup token" (base64 claim URL) from the SimpleFIN dashboard.
 * 4. Iris exchanges the setup token for a permanent "access URL" (POST, one-shot).
 * 5. Iris stores the access URL locally (IndexedDB) and uses it to GET /accounts on demand.
 *
 * Architectural invariants:
 * - User pays SimpleFIN directly — Iris never sees card data, never proxies auth.
 * - Access URL is sensitive but local-only; lives in the user's IndexedDB, not transmitted anywhere.
 * - Dev: Vite proxy handles CORS. Prod: Tauri's native HTTP bypasses browser CORS.
 */

const SETTING_ACCESS_URL = 'simplefin_access_url';
const SETTING_LAST_SYNC = 'simplefin_last_sync';
const SETTING_ACCOUNT_MAP = 'simplefin_account_map'; // JSON: sf_id -> iris_account_id
const SIMPLEFIN_HOST = 'beta-bridge.simplefin.org';

interface SimpleFinOrg {
  name?: string;
  domain?: string;
  url?: string;
  'sfin-url'?: string;
}

interface SimpleFinHoldingRaw {
  id?: string;
  'market-value'?: string | number;
  shares?: string | number;
  'purchase-price'?: string | number;
  'cost-basis'?: string | number;
  symbol?: string;
  description?: string;
  currency?: string;
}

interface SimpleFinTransactionRaw {
  id: string;
  posted?: number;           // unix seconds — when bank posted it
  transacted_at?: number;    // unix seconds — when user actually transacted
  amount: string | number;   // signed: positive = credit/inflow, negative = debit/outflow
  description?: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
}

interface SimpleFinAccountRaw {
  id: string;
  name: string;
  org?: SimpleFinOrg;
  currency?: string;
  balance: string | number;
  'balance-date'?: number;
  'available-balance'?: string | number;
  holdings?: SimpleFinHoldingRaw[];
  transactions?: SimpleFinTransactionRaw[];
}

export interface SimpleFinResponse {
  errors: string[];
  accounts: SimpleFinAccountRaw[];
}

export interface SimpleFinStatus {
  connected: boolean;
  lastSync?: string;
  host?: string;
}

export interface SyncResult {
  addedAccounts: number;
  updatedAccounts: number;
  totalValue: number;
  errors: string[];
  warnings: string[];
}

export interface TransactionSyncResult {
  imported: number;
  skipped: number;         // already-present, dedupe hit
  pending: number;         // skipped because bank hasn't posted yet
  byAccount: Record<string, number>; // iris account id -> imported count
  errors: string[];
}

function isDev(): boolean {
  return typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;
}

/** In dev, route calls through Vite's /api/simplefin proxy; in prod, direct fetch (requires native HTTP via Tauri). */
function toFetchUrl(fullUrl: string): string {
  if (!isDev()) return fullUrl;
  try {
    const u = new URL(fullUrl);
    if (u.host !== SIMPLEFIN_HOST) return fullUrl;
    return `/api/simplefin${u.pathname}${u.search}`;
  } catch {
    return fullUrl;
  }
}

/**
 * Exchange a base64 setup token for a permanent access URL.
 * The setup token is issued from the SimpleFIN dashboard — one-time use.
 */
export async function exchangeSetupToken(token: string): Promise<string> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Setup token is empty.');
  let claimUrl: string;
  try {
    claimUrl = atob(trimmed);
  } catch {
    throw new Error('Could not decode setup token — make sure you copied it fully.');
  }
  if (!/^https?:\/\//.test(claimUrl)) {
    throw new Error('Decoded token is not a valid URL.');
  }
  const res = await fetch(toFetchUrl(claimUrl), {
    method: 'POST',
    headers: { 'Content-Length': '0' },
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}). The token may already be used or expired.`);
  }
  const accessUrl = (await res.text()).trim();
  if (!/^https?:\/\/.+@/.test(accessUrl)) {
    throw new Error('Exchange response did not look like a SimpleFIN access URL.');
  }
  return accessUrl;
}

function parseAccessUrl(accessUrl: string): { base: string; authHeader: string } {
  const u = new URL(accessUrl);
  const user = decodeURIComponent(u.username);
  const pass = decodeURIComponent(u.password);
  const authHeader = 'Basic ' + btoa(`${user}:${pass}`);
  const base = `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}`;
  return { base, authHeader };
}

/** Low-level fetch — does NOT persist anything. */
export async function fetchSimpleFinAccounts(
  accessUrl: string,
  opts: { startDate?: Date; endDate?: Date; balancesOnly?: boolean } = {},
): Promise<SimpleFinResponse> {
  const { base, authHeader } = parseAccessUrl(accessUrl);
  const params = new URLSearchParams();
  if (opts.startDate) params.set('start-date', String(Math.floor(opts.startDate.getTime() / 1000)));
  if (opts.endDate) params.set('end-date', String(Math.floor(opts.endDate.getTime() / 1000)));
  if (opts.balancesOnly) params.set('balances-only', '1');
  const targetUrl = `${base}/accounts${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(toFetchUrl(targetUrl), {
    method: 'GET',
    headers: { Authorization: authHeader },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SimpleFIN fetch failed: ${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`);
  }
  return res.json();
}

export async function getSimpleFinStatus(): Promise<SimpleFinStatus> {
  const [url, sync] = await Promise.all([
    getSetting(SETTING_ACCESS_URL),
    getSetting(SETTING_LAST_SYNC),
  ]);
  if (!url) return { connected: false };
  let host: string | undefined;
  try { host = new URL(url).host; } catch { /* ignore */ }
  return { connected: true, lastSync: sync || undefined, host };
}

export async function disconnectSimpleFin(): Promise<void> {
  await saveSetting(SETTING_ACCESS_URL, '');
  await saveSetting(SETTING_LAST_SYNC, '');
  await saveSetting(SETTING_ACCOUNT_MAP, '');
}

export async function saveSimpleFinAccessUrl(accessUrl: string): Promise<void> {
  parseAccessUrl(accessUrl); // throw early if malformed
  await saveSetting(SETTING_ACCESS_URL, accessUrl);
}

// ---------- Mapping heuristics ----------

function num(v: string | number | undefined, fallback = 0): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function classifyAccountType(name: string, orgName: string): AccountType {
  const txt = `${name} ${orgName}`.toLowerCase();
  if (/\b401\s*[- ]?k\b/.test(txt)) return '401k';
  if (/\broth\b/.test(txt)) return 'roth_ira';
  if (/\bira\b/.test(txt)) return 'ira';
  if (/\bhsa\b/.test(txt)) return 'hsa';
  if (/coinbase|crypto|bitcoin|kraken|gemini\s+exchange/.test(txt)) return 'crypto';
  if (/checking|savings|credit\s*card|debit/.test(txt)) return 'bank';
  return 'brokerage';
}

const CRYPTO_TICKERS = /^(BTC|ETH|SOL|DOGE|ADA|XRP|LTC|BCH|DOT|AVAX|LINK|MATIC|UNI|ATOM|ALGO)$/i;
const KNOWN_ETFS = /^(SPY|VOO|VTI|QQQ|QQQM|IVV|VUG|VTV|VEA|VWO|BND|AGG|VIG|VYM|SCHD|ITOT|IWM|IJH|IWF|IWD|XLK|XLF|XLE|XLV|XLI|XLP|XLY|XLU|XLB|XLRE|ARKK|SMH|VXUS|VT|VNQ|VGT|EFA|EEM|TLT|HYG|LQD|GLD|SLV)$/i;

function classifyAsset(symbol: string, accountType: AccountType): AssetClass {
  const s = symbol.toUpperCase();
  if (s === 'CASH' || s === 'USD') return 'cash';
  if (accountType === 'crypto' || CRYPTO_TICKERS.test(s)) return 'crypto';
  if (KNOWN_ETFS.test(s)) return 'etf';
  return 'stock';
}

async function loadAccountMap(): Promise<Record<string, string>> {
  const raw = await getSetting(SETTING_ACCOUNT_MAP);
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
}

async function saveAccountMap(map: Record<string, string>): Promise<void> {
  await saveSetting(SETTING_ACCOUNT_MAP, JSON.stringify(map));
}

export interface MapResult {
  accounts: Account[];
  updatedMap: Record<string, string>;
  warnings: string[];
}

export function mapSimpleFinToIris(
  sf: SimpleFinResponse,
  existingMap: Record<string, string> = {},
  existingById: Record<string, Account> = {},
): MapResult {
  const now = new Date().toISOString();
  const updatedMap: Record<string, string> = { ...existingMap };
  const warnings: string[] = [];
  const accounts: Account[] = [];

  for (const sfa of sf.accounts) {
    const orgName = sfa.org?.name || 'Unknown';
    const accountType = classifyAccountType(sfa.name, orgName);
    const irisId = updatedMap[sfa.id] || `sf-${sfa.id}`;
    updatedMap[sfa.id] = irisId;
    const existing = existingById[irisId];

    const holdingsRaw = sfa.holdings || [];
    const holdings: Holding[] = holdingsRaw.map((h, idx) => {
      const shares = num(h.shares);
      const currentValue = num(h['market-value']);
      const currentPrice = shares > 0 ? currentValue / shares : num(h['purchase-price']);
      const costBasisTotal = num(h['cost-basis']);
      const avgCostBasis = costBasisTotal > 0 && shares > 0
        ? costBasisTotal / shares
        : num(h['purchase-price'], currentPrice);
      const totalCost = avgCostBasis * shares;
      const totalGainLoss = currentValue - totalCost;
      const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
      const symbol = (h.symbol || h.description || 'UNKNOWN').toUpperCase().trim();
      const holdingId = `${irisId}-${h.id || symbol || idx}`;
      const preserved = existing?.holdings.find((x) => x.id === holdingId || x.ticker === symbol);
      return {
        id: holdingId,
        accountId: irisId,
        ticker: symbol,
        name: h.description || symbol,
        assetClass: classifyAsset(symbol, accountType),
        shares,
        avgCostBasis,
        currentPrice,
        currentValue,
        totalGainLoss,
        totalGainLossPercent,
        status: 'active',
        lastUpdated: now,
        // Preserve user annotations across syncs.
        conviction: preserved?.conviction,
        convictionNote: preserved?.convictionNote,
        notes: preserved?.notes,
      };
    });

    const balance = num(sfa.balance);
    const holdingsValue = holdings.reduce((s, h) => s + h.currentValue, 0);
    let finalHoldings = holdings;
    let totalValue = holdingsValue;

    if (holdings.length === 0) {
      // Cash/bank account (or brokerage with only cash) — represent balance as cash holding.
      finalHoldings = balance > 0 ? [{
        id: `${irisId}-cash`,
        accountId: irisId,
        ticker: 'CASH',
        name: 'Cash',
        assetClass: 'cash',
        shares: balance,
        avgCostBasis: 1,
        currentPrice: 1,
        currentValue: balance,
        totalGainLoss: 0,
        totalGainLossPercent: 0,
        status: 'active',
        lastUpdated: now,
      }] : [];
      totalValue = balance;
    } else {
      // Brokerage with positions — if balance > holdings sum by a cash-sized margin, add a cash row.
      const cashDelta = balance - holdingsValue;
      if (cashDelta > 1) {
        finalHoldings = [...holdings, {
          id: `${irisId}-cash`,
          accountId: irisId,
          ticker: 'CASH',
          name: 'Cash',
          assetClass: 'cash',
          shares: cashDelta,
          avgCostBasis: 1,
          currentPrice: 1,
          currentValue: cashDelta,
          totalGainLoss: 0,
          totalGainLossPercent: 0,
          status: 'active',
          lastUpdated: now,
        }];
        totalValue = balance;
      }
    }

    accounts.push({
      id: irisId,
      name: sfa.name || 'Account',
      institution: orgName,
      type: accountType,
      holdings: finalHoldings,
      totalValue,
      lastUpdated: now,
      status: existing?.status ?? 'active',
    });
  }

  for (const err of sf.errors || []) warnings.push(err);
  return { accounts, updatedMap, warnings };
}

/**
 * Full sync: fetch + map + persist.
 * Preserves conviction flags and notes on holdings that survive across sync.
 * Adds new accounts / updates existing; does NOT delete accounts that disappeared
 * from SimpleFIN (user may have closed connections intentionally — surface as warning).
 */
export async function syncFromSimpleFin(): Promise<SyncResult> {
  const accessUrl = await getSetting(SETTING_ACCESS_URL);
  if (!accessUrl) {
    return { addedAccounts: 0, updatedAccounts: 0, totalValue: 0, errors: ['Not connected to SimpleFIN.'], warnings: [] };
  }
  const [sfData, existingAccounts, map] = await Promise.all([
    fetchSimpleFinAccounts(accessUrl).catch((e) => {
      throw new Error(e instanceof Error ? e.message : String(e));
    }),
    getAllAccounts(),
    loadAccountMap(),
  ]);

  const existingById = Object.fromEntries(existingAccounts.map((a) => [a.id, a]));
  const { accounts, updatedMap, warnings } = mapSimpleFinToIris(sfData, map, existingById);

  let added = 0;
  let updated = 0;
  for (const a of accounts) {
    if (existingById[a.id]) updated += 1;
    else added += 1;
    await saveAccount(a);
  }

  await saveAccountMap(updatedMap);
  await saveSetting(SETTING_LAST_SYNC, new Date().toISOString());

  const totalValue = accounts.reduce((s, a) => s + a.totalValue, 0);
  return { addedAccounts: added, updatedAccounts: updated, totalValue, errors: [], warnings };
}

// ───────────────── Transaction Sync ─────────────────

/**
 * Map a SimpleFIN transaction to an Iris Expense, using the shared categorizer.
 * Deterministic id ensures re-syncs are idempotent (IndexedDB put will overwrite on match).
 */
function mapSimpleFinTransaction(
  sfTx: SimpleFinTransactionRaw,
  irisAccountId: string,
  importBatch: string,
): Expense {
  const amountNum = num(sfTx.amount);
  const absAmount = Math.abs(amountNum);
  const desc = (sfTx.description || sfTx.payee || sfTx.memo || 'Unknown').trim();
  const { flow, type, category } = classifyBankTransaction(desc, amountNum);

  const tsSec = sfTx.posted ?? sfTx.transacted_at ?? Math.floor(Date.now() / 1000);
  const date = new Date(tsSec * 1000).toISOString().slice(0, 10);

  // Deterministic id — same sf tx always produces same Iris id.
  const id = `sf-${irisAccountId}-${sfTx.id}`;

  return {
    id,
    date,
    description: desc,
    amount: absAmount,
    category,
    reimbursementStatus: 'not_reimbursable',
    isWorkExpense: false,
    recurring: false,
    flow,
    transactionType: type,
    source: irisAccountId as any, // generic source id; no Scott-hardcoded bofa_checking etc.
    importBatch,
  };
}

/**
 * Fetch transactions from SimpleFIN and persist as Expenses.
 * Idempotent — deterministic ids based on SimpleFIN tx ids mean re-running
 * just overwrites matching rows with fresh data (useful for pending → posted).
 *
 * Preserves user-edited fields (category, isWorkExpense, reimbursementStatus, notes)
 * when they differ from what the classifier would produce — respects manual corrections.
 */
export async function syncTransactionsFromSimpleFin(
  opts: { daysBack?: number; includePending?: boolean } = {},
): Promise<TransactionSyncResult> {
  const daysBack = opts.daysBack ?? 90;
  const includePending = opts.includePending ?? false;

  const accessUrl = await getSetting(SETTING_ACCESS_URL);
  if (!accessUrl) {
    return {
      imported: 0, skipped: 0, pending: 0, byAccount: {},
      errors: ['Not connected to SimpleFIN.'],
    };
  }

  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const [sfData, map, existingExpenses] = await Promise.all([
    fetchSimpleFinAccounts(accessUrl, { startDate }).catch((e) => {
      throw new Error(e instanceof Error ? e.message : String(e));
    }),
    loadAccountMap(),
    getExpenses(),
  ]);

  const existingById = new Map<string, Expense>(existingExpenses.map((e: Expense) => [e.id, e]));
  const importBatch = `simplefin-${new Date().toISOString()}`;

  let imported = 0;
  let skipped = 0;
  let pending = 0;
  const byAccount: Record<string, number> = {};
  const errors: string[] = [];

  for (const sfa of sfData.accounts) {
    const irisAccountId = map[sfa.id] || `sf-${sfa.id}`;
    const txs = sfa.transactions || [];

    for (const sfTx of txs) {
      if (sfTx.pending && !includePending) {
        pending += 1;
        continue;
      }
      try {
        const mapped = mapSimpleFinTransaction(sfTx, irisAccountId, importBatch);
        const prior = existingById.get(mapped.id);

        if (prior) {
          // Preserve manual edits: if user edited category / work flag / reimbursement / notes,
          // keep those instead of re-running the classifier.
          const preserved: Expense = {
            ...mapped,
            category: prior.category !== mapped.category ? prior.category : mapped.category,
            isWorkExpense: prior.isWorkExpense || mapped.isWorkExpense,
            reimbursementStatus: prior.reimbursementStatus !== 'not_reimbursable'
              ? prior.reimbursementStatus
              : mapped.reimbursementStatus,
            notes: prior.notes ?? mapped.notes,
            recurring: prior.recurring || mapped.recurring,
          };
          await saveExpense(preserved);
          skipped += 1;
        } else {
          await saveExpense(mapped);
          imported += 1;
          byAccount[irisAccountId] = (byAccount[irisAccountId] || 0) + 1;
        }
      } catch (e) {
        errors.push(`${sfa.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  await saveSetting(SETTING_LAST_SYNC, new Date().toISOString());
  return { imported, skipped, pending, byAccount, errors };
}

/**
 * Combined account + transaction sync — the default "Sync now" action.
 * Fetches accounts/holdings AND transactions in one round-trip.
 */
export async function syncAllFromSimpleFin(
  opts: { daysBack?: number } = {},
): Promise<{ accounts: SyncResult; transactions: TransactionSyncResult }> {
  const accountsResult = await syncFromSimpleFin();
  const txResult = await syncTransactionsFromSimpleFin({ daysBack: opts.daysBack });
  return { accounts: accountsResult, transactions: txResult };
}

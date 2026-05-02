import {
  sampleBudgetBuckets,
  sampleSinkingFunds,
  sampleFunMoney,
  samplePaycheck,
} from '../stores/budgetDefaults';
import {
  sampleUserProfile,
  sampleAccounts,
  sampleEquityProfile,
  sampleMonthlyInvestment,
} from '../stores/defaultData';
import {
  saveBudgetBuckets,
  saveSinkingFunds,
  saveFunMoney,
  savePaycheck,
  saveExpense,
  closeBudgetDB,
} from '../stores/budgetStore';
import {
  saveAccount,
  saveEquityProfile,
  saveUserProfile,
  saveMonthlyInvestment,
  closePortfolioDB,
} from '../stores/portfolioStore';
import { closeActionDB } from '../stores/actionStore';
import { closeAuditDB } from '../stores/auditLogStore';

/**
 * Load the bundled sample data set into IndexedDB. Idempotent — safe to call
 * multiple times. Existing user data with the same keys WILL be overwritten,
 * so the UI should confirm before invoking.
 *
 * Returns counts so the UI can show a toast like "Loaded 27 buckets, 6 sinking funds…"
 */
export async function loadSampleData(): Promise<{
  buckets: number;
  sinkingFunds: number;
  funMoney: number;
  accounts: number;
  expenses: number;
}> {
  // Budget side
  await saveBudgetBuckets(sampleBudgetBuckets);
  await saveSinkingFunds(sampleSinkingFunds);
  await saveFunMoney(sampleFunMoney);
  await savePaycheck(samplePaycheck);

  // Portfolio side
  await saveUserProfile(sampleUserProfile);
  for (const a of sampleAccounts) await saveAccount(a);
  if (sampleEquityProfile) await saveEquityProfile(sampleEquityProfile);
  await saveMonthlyInvestment(sampleMonthlyInvestment);

  // Sample transactions — generated synthetically to exercise the income detector,
  // recurring detector, and reimbursement matcher. Mirrors the patterns we tested.
  const sampleExpenses = generateSampleTransactions();
  for (const e of sampleExpenses) await saveExpense(e);

  return {
    buckets: sampleBudgetBuckets.length,
    sinkingFunds: sampleSinkingFunds.length,
    funMoney: sampleFunMoney.length,
    accounts: sampleAccounts.length,
    expenses: sampleExpenses.length,
  };
}

/**
 * Scorched-earth wipe. Closes every cached DB connection, then deletes every
 * IndexedDB database prefixed with `iris-` — so any new store added later
 * (audit logs, future stores, anything) is wiped automatically without having
 * to remember to update this function. Also clears any iris-* localStorage
 * and sessionStorage keys as defense-in-depth.
 *
 * After this returns, the caller should reload the page (window.location.reload)
 * so React state and module-level caches are reset too. The UI does this.
 */
export async function clearAllUserData(): Promise<void> {
  // 1. Close cached DB handles so deleteDatabase isn't blocked.
  closePortfolioDB();
  closeBudgetDB();
  closeActionDB();
  closeAuditDB();

  // 2. Enumerate and delete every iris-* IndexedDB database.
  // indexedDB.databases() is supported in Chrome/Edge/Safari (not Firefox <126).
  // Falls back to a known-list delete if enumeration isn't available.
  const KNOWN_DBS = ['iris-portfolio', 'iris-budget', 'iris-actions', 'iris-audit'];
  let dbsToDelete: string[] = KNOWN_DBS;
  try {
    if (typeof indexedDB.databases === 'function') {
      const all = await indexedDB.databases();
      const discovered = all.map(d => d.name).filter((n): n is string => !!n && n.startsWith('iris-'));
      if (discovered.length > 0) {
        dbsToDelete = Array.from(new Set([...KNOWN_DBS, ...discovered]));
      }
    }
  } catch {
    // Fall back to KNOWN_DBS — at least the four current databases will be wiped.
  }

  await Promise.all(
    dbsToDelete.map(name =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      })
    )
  );

  // 3. Defense in depth — clear any iris-* keys from local/sessionStorage.
  // No production code uses these today, but kill them if anyone ever does.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('iris')) localStorage.removeItem(k);
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('iris')) sessionStorage.removeItem(k);
    }
  } catch {
    // Storage access can throw in private/incognito modes — non-fatal.
  }
}

// ── Sample transaction generator ────────────────────────────────────────────

function generateSampleTransactions(): any[] {
  const out: any[] = [];
  const mk = (id: string, date: string, desc: string, amount: number, opts: Partial<any> = {}) => ({
    id,
    date,
    description: desc,
    amount,
    category: opts.category || 'other',
    reimbursementStatus: opts.reimbursementStatus || 'not_reimbursable',
    isWorkExpense: opts.isWorkExpense ?? false,
    recurring: opts.recurring ?? false,
    flow: opts.flow || 'outflow',
    transactionType: opts.transactionType || 'expense',
    source: opts.source || 'bofa_checking',
    importBatch: 'sample-data',
  });

  // ── Income: biweekly base + variable end-of-month
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    out.push(mk(`sample-pay-mid-${m}`, `2025-${mm}-15`, 'ABNORMAL SECURITY PAYROLL', 4200, { flow: 'inflow', transactionType: 'income' }));
    const variance = [0, 0, 1300, 0, 2500, 0, 800, 4200, 0, 1900, 0, 6500][m - 1];
    out.push(mk(`sample-pay-end-${m}`, `2025-${mm}-30`, 'ABNORMAL SECURITY PAYROLL', 4200 + variance, { flow: 'inflow', transactionType: 'income' }));
  }

  // ── Reimbursement deposits
  out.push(mk('sample-reimb-1', '2025-08-12', 'ABNORMAL SECURITY EXPENSE REIMB', 1247.50, { flow: 'inflow', transactionType: 'reimbursement' }));
  out.push(mk('sample-reimb-2', '2025-11-08', 'ABNORMAL SECURITY EXPENSE REIMB', 856.30, { flow: 'inflow', transactionType: 'reimbursement' }));

  // ── Submitted work expenses that match the reimbursements
  out.push(mk('sample-work-uber-1', '2025-07-28', 'UBER TRIP', 47.50, { isWorkExpense: true, reimbursementStatus: 'submitted', category: 'travel_work' }));
  out.push(mk('sample-work-hotel', '2025-07-29', 'MARRIOTT', 700.00, { isWorkExpense: true, reimbursementStatus: 'submitted', category: 'travel_work' }));
  out.push(mk('sample-work-flight', '2025-07-25', 'UNITED AIRLINES', 500.00, { isWorkExpense: true, reimbursementStatus: 'submitted', category: 'travel_work' }));
  out.push(mk('sample-work-flight2', '2025-10-22', 'DELTA AIRLINES', 600.30, { isWorkExpense: true, reimbursementStatus: 'submitted', category: 'travel_work' }));
  out.push(mk('sample-work-hotel2', '2025-10-23', 'HYATT', 256.00, { isWorkExpense: true, reimbursementStatus: 'submitted', category: 'travel_work' }));

  // ── Dividends (quarterly)
  for (let q = 0; q < 4; q++) {
    const month = ['03', '06', '09', '12'][q];
    out.push(mk(`sample-div-${q}`, `2025-${month}-30`, 'VANGUARD VTSAX DIV', 45 + q * 5, { flow: 'inflow', transactionType: 'income', category: 'investing' }));
  }

  // ── Recurring monthly bills (mortgage, utilities, subscriptions)
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    out.push(mk(`sample-mortgage-${m}`, `2025-${mm}-01`, 'WF HOME MTG', 2890, { recurring: true, category: 'housing' }));
    out.push(mk(`sample-electric-${m}`, `2025-${mm}-08`, 'JUST ENERGY', 320 + (m % 3) * 40, { recurring: true, category: 'utilities' }));
    out.push(mk(`sample-netflix-${m}`, `2025-${mm}-19`, 'NETFLIX.COM', 15.99, { recurring: true, category: 'subscriptions' }));
    out.push(mk(`sample-spotify-${m}`, `2025-${mm}-22`, 'SPOTIFY USA', 17.99, { recurring: true, category: 'subscriptions' }));
  }

  // ── A handful of grocery + dining + amazon hits across months
  const groceryDates = ['2025-09-04','2025-09-11','2025-09-18','2025-09-25','2025-10-02','2025-10-09','2025-10-16','2025-10-23'];
  for (let i = 0; i < groceryDates.length; i++) {
    out.push(mk(`sample-heb-${i}`, groceryDates[i], 'H-E-B PLUS', 145 + Math.round(Math.random() * 80), { category: 'food_groceries' }));
  }
  out.push(mk('sample-target', '2025-10-15', 'TARGET T-1234', 87.42, { category: 'food_groceries' }));
  out.push(mk('sample-amazon-1', '2025-10-08', 'AMAZON MKTPL', 42.99, { category: 'amazon' }));
  out.push(mk('sample-amazon-2', '2025-10-17', 'AMAZON.COM', 28.50, { category: 'amazon' }));
  out.push(mk('sample-dining-1', '2025-10-04', 'CHIPOTLE', 32.40, { category: 'food_dining' }));
  out.push(mk('sample-dining-2', '2025-10-18', 'STARBUCKS', 8.95, { category: 'food_dining' }));

  // ── A mystery inflow to exercise the disambiguation prompt
  out.push(mk('sample-mystery', '2025-11-19', 'VENMO TRANSFER', 150, { flow: 'inflow', transactionType: 'income', source: 'venmo' }));

  return out;
}

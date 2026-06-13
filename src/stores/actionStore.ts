import { listCollection, saveCollection, saveCollectionItem, clearCollection } from '../lib/collectionsClient';
import type { ActionItem } from '../components/ActionItems/ActionItems';
import { defaultActionItems } from '../components/ActionItems/ActionItems';
import { getAllAccounts, saveAccount, getEquityProfile, saveEquityProfile } from './portfolioStore';
import type { Account } from '../types/portfolio';
import {
  saveFunMoney,
  savePaycheck,
  getPaycheck,
  getFunMoney,
  getSinkingFunds,
  saveSinkingFunds,
} from './budgetStore';
import { defaultPaycheck } from './budgetDefaults';
import { findTemplate, hasTemplate } from '../utils/actionTemplates';
import {
  executeActionTemplate,
  type ExecutionContext,
  type Mutation,
} from '../utils/actionExecutor';
import type { InputField } from '../types/actions';

// ─── Action Items CRUD (Postgres `collections`, de-browser migration 2026-06-10) ───
//
// items -> collection 'actionItems' (key=id); merchant mappings -> collection
// 'merchantMappings' (key=original). Browser-independent now. Signatures
// unchanged so the consumers (ActionItems UI, AppDataContext) are untouched.

export async function getActionItems(): Promise<ActionItem[]> {
  const items = await listCollection<ActionItem>('actionItems');
  if (items.length === 0) {
    // First run / new account: seed the shared defaults into Postgres once.
    await saveCollection('actionItems', defaultActionItems, (i) => i.id);
    return [...defaultActionItems];
  }
  return items;
}

export async function saveActionItem(item: ActionItem): Promise<void> {
  await saveCollectionItem('actionItems', item, (i) => i.id);
}

export async function saveAllActionItems(items: ActionItem[]): Promise<void> {
  await saveCollection('actionItems', items, (i) => i.id);
}

export async function clearAllActionData(): Promise<void> {
  await clearCollection('actionItems');
  await clearCollection('merchantMappings');
}

// Retained as a no-op (Postgres-backed; no IndexedDB handle to close). Kept for
// sampleData.clearAllUserData(), which still scrubs residual iris-* IDB.
export function closeActionDB(): void {
  /* no-op */
}

// ─── Merchant Name Mappings ───

export interface MerchantMapping {
  original: string; // raw BofA merchant string
  displayName: string; // user's preferred name
  category: string; // auto-categorize future imports
  isWorkExpense: boolean;
}

export async function getMerchantMappings(): Promise<MerchantMapping[]> {
  return listCollection<MerchantMapping>('merchantMappings');
}

export async function saveMerchantMapping(mapping: MerchantMapping): Promise<void> {
  await saveCollectionItem('merchantMappings', mapping, (m) => m.original);
}

// ─── Action Execution Engine ───
// When an action item is completed with data, this applies the changes to the portfolio/budget

export interface ActionResult {
  success: boolean;
  message: string;
  newActionItems?: Partial<ActionItem>[];
}

export async function executeAction(
  itemId: string,
  completionData: Record<string, string>
): Promise<ActionResult> {
  // Prefer the JSON template path. If it fails (e.g., UI form shape doesn't match
  // template inputs yet), fall through to the legacy switch so behavior is preserved.
  if (hasTemplate(itemId)) {
    const templateResult = await executeViaTemplate(itemId, completionData);
    if (templateResult.success) return templateResult;
    console.warn(
      `[actionStore] Template '${itemId}' failed, falling back to legacy switch:`,
      templateResult.message
    );
  }

  const accounts = await getAllAccounts();

  switch (itemId) {
    case 'hysa-move':
      return executeHYSAMove(accounts, completionData);
    case 'exercise-isos':
      return executeISOExercise(completionData);
    case 'rotate-smh':
      return executeRotation(accounts, completionData);
    case 'sell-memecoins':
      return executeMemeConSell(accounts);
    case 'increase-401k':
      return execute401kIncrease(completionData);
    case 'fun-money':
      return executeFunMoney(completionData);
    default:
      // Info-only items — just mark complete, no data changes
      return { success: true, message: 'Marked complete.' };
  }
}

// ─── Template-driven execution (Phase 1) ───

function coerceInputs(
  fields: InputField[],
  data: Record<string, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = data[f.key];
    if (raw === undefined || raw === '') continue;
    if (f.type === 'number' || f.type === 'currency') {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) out[f.key] = n;
    } else if (f.type === 'household-budget') {
      try {
        out[f.key] = JSON.parse(raw);
      } catch {
        // malformed — drop silently; executor will see missing input
      }
    } else {
      out[f.key] = raw;
    }
  }
  return out;
}

async function buildExecutionContext(
  accounts: Account[],
  coercedInputs: Record<string, unknown>
): Promise<ExecutionContext> {
  const [equity, paycheck, funMoney, sinkingFunds] = await Promise.all([
    getEquityProfile(),
    getPaycheck(),
    getFunMoney(),
    getSinkingFunds(),
  ]);
  return {
    accounts,
    equity: equity ?? undefined,
    paycheck: paycheck ?? defaultPaycheck,
    funMoney,
    sinkingFunds,
    inputs: coercedInputs,
    now: new Date(),
  };
}

async function dispatchMutations(mutations: Mutation[]): Promise<void> {
  for (const m of mutations) {
    switch (m.target) {
      case 'account':
        await saveAccount(m.data);
        break;
      case 'equity':
        await saveEquityProfile(m.data);
        break;
      case 'paycheck': {
        const current = (await getPaycheck()) ?? defaultPaycheck;
        await savePaycheck({ ...current, ...m.patch });
        break;
      }
      case 'fun-money':
        await saveFunMoney(m.data);
        break;
      case 'sinking-funds':
        await saveSinkingFunds(m.data);
        break;
      // 'profile' and 'transactions' targets not yet wired — silently skip.
    }
  }
}

async function executeViaTemplate(
  itemId: string,
  completionData: Record<string, string>
): Promise<ActionResult> {
  const template = findTemplate(itemId);
  if (!template) return { success: false, message: `No template for ${itemId}` };

  const inputs = coerceInputs(template.inputs, completionData);
  const accounts = await getAllAccounts();
  const ctx = await buildExecutionContext(accounts, inputs);
  const output = executeActionTemplate(template, ctx);

  if (!output.result.success) {
    return { success: false, message: output.result.message };
  }

  await dispatchMutations(output.mutations);

  // ActionCategory (template) and ActionItem.category (legacy UI) overlap partially.
  // Map template categories into the UI's narrower set so the follow-up items render.
  const mapCategory = (
    c: 'cash' | 'tax' | 'investment' | 'budget' | 'general' | undefined
  ): ActionItem['category'] => {
    switch (c) {
      case 'investment': return 'portfolio';
      case 'cash': return 'budget';
      case 'tax': return 'tax';
      case 'budget': return 'budget';
      default: return 'general';
    }
  };

  const newActions: Partial<ActionItem>[] = (output.result.newActionItems ?? []).map(
    (p, i) => ({
      id: `${template.id}-followup-${Date.now()}-${i}`,
      text: typeof p.text === 'string' ? p.text : '',
      priority: p.priority,
      category: mapCategory(p.category),
      completed: false,
    })
  );

  return {
    success: true,
    message: output.result.message,
    newActionItems: newActions.length > 0 ? newActions : undefined,
  };
}

async function executeHYSAMove(
  accounts: Account[],
  data: Record<string, string>
): Promise<ActionResult> {
  const amount = parseFloat(data.amount || '0');
  const destination = data.destination || 'High-Yield Savings';
  const apy = parseFloat(data.apy || '4.25');

  if (amount <= 0) return { success: false, message: 'Enter the amount you moved.' };

  // Find BofA bank account
  const bofa = accounts.find(a => a.id === 'bofa-bank');
  if (!bofa) return { success: false, message: 'Could not find BofA account.' };

  // Reduce the savings/joint accounts proportionally
  const savingsHoldings = bofa.holdings.filter(h =>
    h.name.includes('Savings') || h.name.includes('Stuffs') || h.name.includes('Joint')
  );
  const totalSavings = savingsHoldings.reduce((s, h) => s + h.currentValue, 0);

  if (amount > totalSavings) return { success: false, message: `You only have ${totalSavings} in savings accounts.` };

  let remaining = amount;
  for (const h of savingsHoldings) {
    const reduction = Math.min(remaining, h.currentValue);
    h.currentValue -= reduction;
    h.shares -= reduction;
    remaining -= reduction;
    if (remaining <= 0) break;
  }

  // Remove zero-balance holdings
  bofa.holdings = bofa.holdings.filter(h => h.currentValue > 0);
  bofa.totalValue = bofa.holdings.reduce((s, h) => s + h.currentValue, 0);
  await saveAccount(bofa);

  // Create new HYSA account
  const hysaAccount: Account = {
    id: 'hysa-' + Date.now(),
    name: destination,
    institution: destination.split(' ')[0] || 'HYSA',
    type: 'bank',
    totalValue: amount,
    lastUpdated: new Date().toISOString().split('T')[0],
    holdings: [{
      id: 'hysa-cash-' + Date.now(),
      accountId: 'hysa-' + Date.now(),
      ticker: 'HYSA',
      name: `${destination} (${apy}% APY)`,
      assetClass: 'cash',
      shares: amount,
      avgCostBasis: 1,
      currentPrice: 1,
      currentValue: amount,
      totalGainLoss: 0,
      totalGainLossPercent: 0,
      status: 'active',
      notes: `Earning ${apy}% APY — ~${Math.round(amount * apy / 100)}/year`,
      lastUpdated: new Date().toISOString().split('T')[0],
    }],
  };
  // Fix self-referencing ID
  hysaAccount.holdings[0].accountId = hysaAccount.id;
  await saveAccount(hysaAccount);

  const annualInterest = Math.round(amount * apy / 100);

  return {
    success: true,
    message: `Moved ${amount.toLocaleString()} to ${destination}. Now earning ~$${annualInterest}/year at ${apy}% APY.`,
    newActionItems: [{
      id: 'hysa-verify-' + Date.now(),
      text: `Verify ${destination} is set up and earning ${apy}% APY. Consider setting up auto-transfer for future savings.`,
      priority: 'low',
      category: 'general',
      completed: false,
    }],
  };
}

async function executeISOExercise(data: Record<string, string>): Promise<ActionResult> {
  const shares = parseInt(data.shares || '0');
  if (shares <= 0) return { success: false, message: 'Enter the number of shares exercised.' };

  // Update equity profile
  const equity = await getEquityProfile();
  if (equity) {
    // Find the first ISO grant with exercisable shares
    const isoGrant = equity.grants.find(g => g.type === 'iso' && g.exercisableShares > 0);
    if (isoGrant) {
      const toExercise = Math.min(shares, isoGrant.exercisableShares);
      isoGrant.exercisedShares += toExercise;
      isoGrant.exercisableShares -= toExercise;
      isoGrant.outstandingShares -= toExercise;
      // Recalculate total exercise cost
      equity.totalExerciseCost = equity.grants.reduce((s, g) => s + (g.exercisableShares * g.strikePrice), 0);
      await saveEquityProfile(equity);
    }
  }

  return {
    success: true,
    message: `Recorded exercise of ${shares.toLocaleString()} ISO shares. The 1-year LTCG holding period starts now.`,
    newActionItems: [{
      id: 'iso-holding-period-' + Date.now(),
      text: `ISO holding period tracker: ${shares.toLocaleString()} shares exercised on ${data.date || 'today'}. Hold until ${new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]} for LTCG treatment.`,
      priority: 'medium',
      category: 'tax',
      completed: false,
    }],
  };
}

async function executeRotation(
  accounts: Account[],
  data: Record<string, string>
): Promise<ActionResult> {
  const soldTicker = (data.sold || '').toUpperCase();
  const soldAmount = parseFloat(data.sold_amount || '0');
  const boughtTicker = (data.bought || '').toUpperCase();
  const boughtAmount = parseFloat(data.bought_amount || '0');

  if (!soldTicker || !boughtTicker) return { success: false, message: 'Enter both the ticker you sold and what you bought.' };

  // Find the primary active brokerage account
  const brokerage = accounts.find(a => a.type === 'brokerage' && a.status !== 'closed');
  if (!brokerage) return { success: false, message: 'Could not find an active brokerage account.' };

  // Remove or reduce sold holding
  const soldHolding = brokerage.holdings.find(h => h.ticker === soldTicker);
  if (soldHolding) {
    if (soldAmount >= soldHolding.currentValue) {
      brokerage.holdings = brokerage.holdings.filter(h => h.ticker !== soldTicker);
    } else {
      const pctSold = soldAmount / soldHolding.currentValue;
      soldHolding.shares *= (1 - pctSold);
      soldHolding.currentValue -= soldAmount;
    }
  }

  // Add bought holding
  const existingBought = brokerage.holdings.find(h => h.ticker === boughtTicker);
  if (existingBought) {
    existingBought.currentValue += boughtAmount;
    existingBought.shares += boughtAmount / existingBought.currentPrice;
  } else {
    brokerage.holdings.push({
      id: boughtTicker.toLowerCase() + '-' + Date.now(),
      accountId: brokerage.id,
      ticker: boughtTicker,
      name: boughtTicker, // Will need to be updated with real name
      assetClass: 'etf',
      shares: 0,
      avgCostBasis: 0,
      currentPrice: 0,
      currentValue: boughtAmount,
      totalGainLoss: 0,
      totalGainLossPercent: 0,
      status: 'active',
      notes: `Bought via rotation from ${soldTicker}`,
      lastUpdated: new Date().toISOString().split('T')[0],
    });
  }

  brokerage.totalValue = brokerage.holdings.reduce((s, h) => s + h.currentValue, 0);
  await saveAccount(brokerage);

  return {
    success: true,
    message: `Rotated $${soldAmount.toLocaleString()} from ${soldTicker} into ${boughtTicker}. Portfolio updated.`,
  };
}

async function executeMemeConSell(accounts: Account[]): Promise<ActionResult> {
  const crypto = accounts.find(a => a.type === 'crypto' && a.status !== 'closed');
  if (!crypto) return { success: false, message: 'Could not find an active crypto account.' };

  crypto.holdings = crypto.holdings.filter(h => !['SHIB', 'DOGE', 'ADA'].includes(h.ticker));
  crypto.totalValue = crypto.holdings.reduce((s, h) => s + h.currentValue, 0);
  await saveAccount(crypto);

  return { success: true, message: 'Removed SHIB, DOGE, and ADA from portfolio. ~$341 simplified.' };
}

async function execute401kIncrease(data: Record<string, string>): Promise<ActionResult> {
  const newMonthly = parseFloat(data.amount || '0');
  if (newMonthly <= 0) return { success: false, message: 'Enter your new monthly contribution.' };

  // Persist to paycheck record
  const paycheck = (await getPaycheck()) || defaultPaycheck;
  paycheck.retirement401k = newMonthly;
  await savePaycheck(paycheck);

  const annualTaxSavings = Math.round(newMonthly * 12 * 0.32);

  return {
    success: true,
    message: `401k contribution updated to $${newMonthly.toLocaleString()}/month ($${(newMonthly * 12).toLocaleString()}/year). Estimated tax savings: $${annualTaxSavings.toLocaleString()}/year.`,
  };
}

async function executeFunMoney(data: Record<string, string>): Promise<ActionResult> {
  // Couples model owns the fun-money pots now (one per earner, seeded from
  // Earner profiles, surfaced on the Budget overview). This legacy action used
  // to OVERWRITE the collection with two generic "Person A"/"Person B" $400
  // rows — which clobbered the real earner pots (2026-06-13). It now only
  // adjusts the BUDGET on the existing pots, in order, and never invents people.
  const existing = await getFunMoney();
  if (existing.length === 0) {
    return {
      success: false,
      message: 'No fun-money pots yet. Each earner gets one automatically — set the amounts on the Budget overview.',
    };
  }
  // Backward-compatible field names — older actions used scott_amount / wife_amount.
  const amounts = [
    parseFloat(data.person_a_amount || data.scott_amount || ''),
    parseFloat(data.person_b_amount || data.wife_amount || ''),
  ];
  const updated = existing.map((f, i) =>
    Number.isFinite(amounts[i]) ? { ...f, monthlyBudget: amounts[i] } : f,
  );
  await saveFunMoney(updated);

  const parts = updated.map((f) => `${f.person} $${f.monthlyBudget}/mo`).join(', ');
  return {
    success: true,
    message: `Fun money updated: ${parts}. Guilt-free — no questions asked.`,
  };
}

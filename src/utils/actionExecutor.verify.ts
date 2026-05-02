// Dev-only verification: runs every ported template against a mock portfolio
// and prints the result. Not imported by the app — call verifyAllTemplates()
// from the browser console or a dev entry point to sanity-check. Delete or
// convert to a test suite later.

import { executeActionTemplate, type ExecutionContext } from './actionExecutor';
import { findTemplate } from './actionTemplates';
import type { Account, EquityProfile } from '../types/portfolio';

function mockBank(): Account {
  return {
    id: 'mock-bank-1',
    name: 'Test Bank',
    institution: 'Test Bank',
    type: 'bank',
    totalValue: 100000,
    lastUpdated: '2026-04-19',
    status: 'active',
    holdings: [
      {
        id: 'mock-checking',
        accountId: 'mock-bank-1',
        ticker: 'CASH',
        name: 'Checking',
        assetClass: 'cash',
        shares: 30000,
        avgCostBasis: 1,
        currentPrice: 1,
        currentValue: 30000,
        totalGainLoss: 0,
        totalGainLossPercent: 0,
        status: 'active',
        lastUpdated: '2026-04-19',
      },
      {
        id: 'mock-savings',
        accountId: 'mock-bank-1',
        ticker: 'CASH',
        name: 'Savings',
        assetClass: 'cash',
        shares: 70000,
        avgCostBasis: 1,
        currentPrice: 1,
        currentValue: 70000,
        totalGainLoss: 0,
        totalGainLossPercent: 0,
        status: 'active',
        lastUpdated: '2026-04-19',
      },
    ],
  };
}

function mockBrokerage(): Account {
  return {
    id: 'mock-brok-1',
    name: 'Test Brokerage',
    institution: 'Fidelity',
    type: 'brokerage',
    totalValue: 50000,
    lastUpdated: '2026-04-19',
    status: 'active',
    holdings: [
      {
        id: 'mock-smh',
        accountId: 'mock-brok-1',
        ticker: 'SMH',
        name: 'VanEck Semiconductor ETF',
        assetClass: 'etf',
        shares: 200,
        avgCostBasis: 200,
        currentPrice: 250,
        currentValue: 50000,
        totalGainLoss: 10000,
        totalGainLossPercent: 25,
        status: 'active',
        lastUpdated: '2026-04-19',
      },
    ],
  };
}

function mockCrypto(): Account {
  return {
    id: 'mock-crypto-1',
    name: 'Test Crypto',
    institution: 'Coinbase',
    type: 'crypto',
    totalValue: 10000,
    lastUpdated: '2026-04-19',
    status: 'active',
    holdings: [
      {
        id: 'mock-btc',
        accountId: 'mock-crypto-1',
        ticker: 'BTC',
        name: 'Bitcoin',
        assetClass: 'crypto',
        shares: 0.1,
        avgCostBasis: 80000,
        currentPrice: 90000,
        currentValue: 9000,
        totalGainLoss: 1000,
        totalGainLossPercent: 12.5,
        status: 'active',
        lastUpdated: '2026-04-19',
      },
      {
        id: 'mock-shib',
        accountId: 'mock-crypto-1',
        ticker: 'SHIB',
        name: 'Shiba Inu',
        assetClass: 'crypto',
        shares: 50_000_000,
        avgCostBasis: 0.00002,
        currentPrice: 0.00002,
        currentValue: 1000,
        totalGainLoss: 0,
        totalGainLossPercent: 0,
        status: 'active',
        lastUpdated: '2026-04-19',
      },
    ],
  };
}

function mockEquity(): EquityProfile {
  return {
    company: 'TestCo',
    currentFMV: 20,
    lastValuation: '2026-01-01',
    estimatedARR: 100_000_000,
    totalShares: 10000,
    totalCurrentValue: 200000,
    totalExerciseCost: 5000,
    grants: [
      {
        id: 'grant-1',
        type: 'iso',
        grantName: 'Test ISO Grant',
        grantNumber: 'ES-001',
        grantDate: '2024-01-01',
        totalShares: 10000,
        vestedShares: 5000,
        exercisedShares: 1000,
        exercisableShares: 4000,
        outstandingShares: 9000,
        strikePrice: 5,
        currentFMV: 20,
      },
    ],
  };
}

function now(): Date {
  return new Date('2026-04-19T12:00:00Z');
}

function run(
  label: string,
  templateId: string,
  ctx: ExecutionContext
): void {
  const template = findTemplate(templateId);
  if (!template) {
    console.error(`[${label}] template not found: ${templateId}`);
    return;
  }
  const output = executeActionTemplate(template, ctx);
  console.group(`[${label}] ${templateId}`);
  console.log('success:', output.result.success);
  console.log('message:', output.result.message);
  console.log('mutations:', output.mutations.length);
  for (const m of output.mutations) {
    if (m.target === 'account') {
      console.log(
        `  account ${m.data.id}: $${m.data.totalValue.toLocaleString()}, ${m.data.holdings.length} holdings`
      );
    } else {
      console.log(`  ${m.target}:`, m);
    }
  }
  console.groupEnd();
}

export function verifyAllTemplates(): void {
  run('HYSA', 'move-cash-to-hysa', {
    accounts: [mockBank()],
    inputs: {
      source: 'mock-bank-1',
      amount: 50000,
      destination: 'Varo HYSA',
      apy: 5.0,
    },
    now: now(),
  });

  run('401k', 'increase-401k', {
    accounts: [mockBank()],
    inputs: { amount: 2000 },
    now: now(),
  });

  run('Fun money', 'update-fun-money', {
    accounts: [mockBank()],
    inputs: {
      values: [
        { person: 'Primary', monthlyBudget: 500 },
        { person: 'Spouse', monthlyBudget: 500 },
      ],
    },
    now: now(),
  });

  run('Rotate', 'rotate-holdings', {
    accounts: [mockBrokerage()],
    inputs: {
      account: 'mock-brok-1',
      sold_ticker: 'SMH',
      sold_amount: 50000,
      bought_ticker: 'SOXQ',
      bought_amount: 50000,
      bought_name: 'Invesco PHLX Semiconductor ETF',
    },
    now: now(),
  });

  run('Sell crypto', 'sell-specific-crypto', {
    accounts: [mockCrypto()],
    inputs: {
      account: 'mock-crypto-1',
      tickers: 'SHIB,DOGE,ADA',
    },
    now: now(),
  });

  run('Exercise ISO', 'exercise-isos', {
    accounts: [],
    equity: mockEquity(),
    inputs: { shares: 1000 },
    now: now(),
  });
}

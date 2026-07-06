import type { Account, EquityProfile, UserProfile } from '../types/portfolio';
import type { ActionItem } from '../components/ActionItems/ActionItems';

/**
 * Generate or update action items based on current portfolio state.
 * Preserves completed status and user notes from existing items.
 * Updates text with real numbers. Removes items that no longer apply.
 */
export function reconcileActionItems(
  existingItems: ActionItem[],
  accounts: Account[],
  equity: EquityProfile | undefined,
  profile?: UserProfile,
): ActionItem[] {
  const generated = generateFromState(accounts, equity, profile);
  const result: ActionItem[] = [];

  // For each generated item, check if there's an existing one
  for (const gen of generated) {
    const existing = existingItems.find(e => e.id === gen.id);
    if (existing) {
      if (existing.completed) {
        // Keep completed items as-is
        result.push(existing);
      } else {
        // Update text with fresh numbers, keep the rest
        result.push({ ...existing, text: gen.text, priority: gen.priority });
      }
    } else {
      result.push(gen);
    }
  }

  // Keep completed template items even if the generator no longer produces them
  // (e.g., user completed "stake SOL" — SOL is now staked, generator skips it, but we keep the completed record)
  // Also keep any manually-added or generated-from-completion items
  const generatedIds = new Set(generated.map(g => g.id));
  const resultIds = new Set(result.map(r => r.id));
  for (const existing of existingItems) {
    if (resultIds.has(existing.id)) continue; // already in result
    if (existing.completed) {
      // Always keep completed items — they're history
      result.push(existing);
    } else if (!generatedIds.has(existing.id) && !isTemplateId(existing.id)) {
      // Keep manually-added items that aren't from the template
      result.push(existing);
    }
    // Drop uncompleted template items that the generator no longer produces
    // (the condition that created them no longer applies)
  }

  return result;
}

const TEMPLATE_IDS = new Set([
  'hysa-move', 'cpa', 'amt-2022', 'exercise-isos', 'fun-money',
  'stake-sol', 'umbrella-insurance', 'rotate-smh', 'increase-401k',
  'life-insurance-review', 'rollover-401k', 'sell-memecoins',
  'wife-401k-details', 'backdoor-roth', 'credit-card-import',
]);

function isTemplateId(id: string): boolean {
  return TEMPLATE_IDS.has(id);
}

function generateFromState(
  accounts: Account[],
  equity: EquityProfile | undefined,
  profile?: UserProfile,
): ActionItem[] {
  const items: ActionItem[] = [];

  // ─── Cash Drag ───
  const bofaBank = accounts.find(a => a.id === 'bofa-bank');
  if (bofaBank) {
    const savingsHoldings = bofaBank.holdings.filter(h =>
      h.ticker === 'CASH' && (h.name.includes('Savings') || h.name.includes('Stuffs') || h.name.includes('Joint'))
    );
    const totalSavings = savingsHoldings.reduce((s, h) => s + h.currentValue, 0);
    if (totalSavings > 5000) {
      const annualLoss = Math.round(totalSavings * 0.042);
      items.push({
        id: 'hysa-move',
        text: `Move ~$${Math.round(totalSavings / 1000)}k from BofA savings to high-yield savings — losing ~$${annualLoss.toLocaleString()}/yr in interest`,
        priority: totalSavings > 50000 ? 'high' : 'medium',
        category: 'portfolio',
        completed: false,
        onComplete: {
          type: 'move_cash',
          description: 'Enter the amount you moved and where. This updates your portfolio automatically.',
          fields: [
            { label: 'Amount moved', key: 'amount', type: 'number' },
            { label: 'New bank/account', key: 'destination', type: 'text' },
            { label: 'APY of new account', key: 'apy', type: 'number' },
          ],
        },
      });
    }
  }

  // ─── ISO Exercise ───
  if (equity) {
    const exercisable = (equity.grants ?? []).filter(g => g.type === 'iso' && g.exercisableShares > 0);
    const totalExercisable = exercisable.reduce((s, g) => s + g.exercisableShares, 0);
    if (totalExercisable > 0) {
      const avgStrike = exercisable.reduce((s, g) => s + g.strikePrice * g.exercisableShares, 0) / totalExercisable;
      const exerciseCost = Math.round(totalExercisable * avgStrike);
      const spread = Math.round(totalExercisable * (equity.currentFMV - avgStrike));
      const taxSavings = Math.round(spread * 0.17); // LTCG (15%) vs ordinary (32%) = 17% savings
      items.push({
        id: 'exercise-isos',
        text: `Exercise ${totalExercisable.toLocaleString()} ISOs at $${avgStrike.toFixed(2)}/share before IPO — ~$${taxSavings.toLocaleString()} tax savings (LTCG vs ordinary income). Costs $${exerciseCost.toLocaleString()}.`,
        priority: 'high',
        category: 'portfolio',
        completed: false,
        onComplete: {
          type: 'update_holding',
          description: 'How many shares did you exercise?',
          fields: [
            { label: 'Shares exercised', key: 'shares', type: 'number' },
            { label: 'Total cost', key: 'cost', type: 'number' },
            { label: 'Exercise date', key: 'date', type: 'text' },
          ],
        },
      });
    }
  }

  // ─── Old 401k Rollover ───
  // Surfaces when an account has notes mentioning rollover — generic, not employer-specific.
  const oldEmployer401k = accounts.find(a =>
    a.type === '401k'
    && a.holdings.some(h => /roll\s*to\s*ira|old\s*employer/i.test(h.notes || ''))
    && a.totalValue > 1000
  );
  if (oldEmployer401k) {
    items.push({
      id: 'rollover-401k',
      text: `Roll old ${oldEmployer401k.name} ($${Math.round(oldEmployer401k.totalValue).toLocaleString()}) into a Traditional IRA — more fund options, lower fees`,
      priority: 'low',
      category: 'portfolio',
      completed: false,
      onComplete: {
        type: 'update_holding',
        description: 'Confirm the rollover details.',
        fields: [
          { label: 'Amount rolled', key: 'amount', type: 'number' },
          { label: 'New IRA account #', key: 'account', type: 'text' },
        ],
      },
    });
  }

  // ─── Memecoins ───
  const crypto = accounts.find(a => a.type === 'crypto' && a.status !== 'closed');
  if (crypto) {
    const memecoins = crypto.holdings.filter(h => ['SHIB', 'DOGE', 'ADA'].includes(h.ticker));
    const memecoinValue = memecoins.reduce((s, h) => s + h.currentValue, 0);
    if (memecoinValue > 10) {
      const tickers = memecoins.map(h => `${h.ticker} ($${Math.round(h.currentValue)})`).join(', ');
      items.push({
        id: 'sell-memecoins',
        text: `Sell ${tickers} — $${Math.round(memecoinValue)} in dead weight not worth tracking`,
        priority: 'low',
        category: 'portfolio',
        completed: false,
        onComplete: { type: 'update_holding', description: 'Confirmed sold?', fields: [] },
      });
    }
  }

  // ─── Stake SOL ───
  if (crypto) {
    const sol = crypto.holdings.find(h => h.ticker === 'SOL');
    const isStaked = sol?.notes?.toLowerCase().includes('staked');
    if (sol && sol.currentValue > 100 && !isStaked) {
      items.push({
        id: 'stake-sol',
        text: `Stake Solana on Coinbase — currently earning 0% vs 6-8% yield on $${Math.round(sol.currentValue).toLocaleString()}`,
        priority: 'medium',
        category: 'portfolio',
        completed: false,
        onComplete: { type: 'info_only', description: 'Done! APY will be reflected in future updates.', fields: [] },
      });
    }
  }

  // ─── Duplicate Semiconductor (SMH vs SOXQ) ───
  const brokerage = accounts.find(a => a.type === 'brokerage' && a.status !== 'closed');
  if (brokerage) {
    const smh = brokerage.holdings.find(h => h.ticker === 'SMH');
    const soxx = brokerage.holdings.find(h => h.ticker === 'SOXQ');
    if (smh && soxx && smh.currentValue > 1000) {
      items.push({
        id: 'rotate-smh',
        text: `Consider rotating SMH ($${Math.round(smh.currentValue).toLocaleString()}) — duplicate semiconductor bet alongside ${soxx.ticker} ($${Math.round(soxx.currentValue).toLocaleString()})`,
        priority: 'medium',
        category: 'portfolio',
        completed: false,
        onComplete: {
          type: 'update_holding',
          description: 'What did you sell and what did you buy?',
          fields: [
            { label: 'Sold ticker', key: 'sold', type: 'text' },
            { label: 'Amount sold', key: 'sold_amount', type: 'number' },
            { label: 'Bought ticker', key: 'bought', type: 'text' },
            { label: 'Amount bought', key: 'bought_amount', type: 'number' },
          ],
        },
      });
    }
  }

  // ─── Conditional items keyed off the user's actual data ───
  // Each block only fires if the user has the relevant kind of data — no
  // generic Scott/Claire-flavored items are pushed into a new user's queue.

  const has401k = accounts.some(a => a.type === '401k');
  const hasEquity = !!equity && equity.totalShares > 0;
  const hasISOs = hasEquity && equity.grants?.some(g => g.type === 'iso');
  const hasMultipleCars = (profile?.carValue ?? 0) > 50000;

  if (hasEquity) {
    items.push({
      id: 'cpa',
      text: 'Get a CPA who specializes in equity compensation — ISOs, AMT, and IPO planning are too complex for off-the-shelf tax software',
      priority: 'high',
      category: 'tax',
      completed: false,
      onComplete: {
        type: 'info_only',
        description: 'Who did you go with? How much do they charge?',
        fields: [
          { label: 'CPA name/firm', key: 'cpa_name', type: 'text' },
          { label: 'Annual cost', key: 'cost', type: 'number' },
        ],
      },
    });
  }

  if (hasISOs) {
    items.push({
      id: 'amt-check',
      text: 'Check if you owe AMT on past ISO exercises — penalties accrue, file amended return if needed',
      priority: 'high',
      category: 'tax',
      completed: false,
      onComplete: {
        type: 'info_only',
        description: 'What did your CPA find?',
        fields: [
          { label: 'AMT amount', key: 'amt_amount', type: 'number' },
          { label: 'Penalties + interest', key: 'penalties', type: 'number' },
        ],
      },
    });
  }

  // Fun money is only meaningful for households with 2+ people.
  if (profile?.spouseName?.trim()) {
    items.push({
      id: 'fun-money',
      text: 'Set up fun money accounts — guilt-free discretionary for each adult. Stops the money fights before they start.',
      priority: 'high',
      category: 'budget',
      completed: false,
      onComplete: {
        type: 'update_budget',
        description: 'How much per person per month?',
        fields: [
          { label: 'Person A monthly', key: 'person_a_amount', type: 'number' },
          { label: 'Person B monthly', key: 'person_b_amount', type: 'number' },
        ],
      },
    });
  }

  // Umbrella insurance: assets-driven, surfaces when net worth is meaningful.
  const homeValue = profile?.homeValue ?? 0;
  const totalAssets = accounts.reduce((s, a) => s + a.totalValue, 0) + homeValue;
  if (totalAssets > 500000 || hasMultipleCars) {
    items.push({
      id: 'umbrella-insurance',
      text: 'Consider umbrella insurance — $1–2M policy is ~$300/yr and protects your growing net worth from liability claims',
      priority: 'medium',
      category: 'insurance',
      completed: false,
      onComplete: {
        type: 'info_only',
        description: 'What coverage did you get?',
        fields: [
          { label: 'Coverage amount', key: 'coverage', type: 'text' },
          { label: 'Annual premium', key: 'premium', type: 'number' },
        ],
      },
    });
  }

  if (has401k) {
    items.push({
      id: 'increase-401k',
      text: 'Review your 401k contribution rate — every 1% increase materially compounds over time and reduces current-year taxes',
      priority: 'medium',
      category: 'budget',
      completed: false,
      onComplete: {
        type: 'update_budget',
        description: 'What did you change your contribution to?',
        fields: [
          { label: 'New monthly contribution', key: 'amount', type: 'number' },
          { label: 'Percentage of salary', key: 'percentage', type: 'number' },
        ],
      },
    });
  }

  if (totalAssets > 250000) {
    items.push({
      id: 'life-insurance-review',
      text: 'Review life insurance coverage — employer-provided is rarely enough. Aim for ~10× income via term policy.',
      priority: 'medium',
      category: 'insurance',
      completed: false,
      onComplete: {
        type: 'info_only',
        description: 'What did you end up doing?',
        fields: [
          { label: 'Additional coverage', key: 'coverage', type: 'text' },
          { label: 'Monthly premium', key: 'premium', type: 'number' },
        ],
      },
    });
  }

  // Backdoor Roth — high-income heuristic.
  if ((profile?.annualIncome ?? 0) > 200000) {
    items.push({
      id: 'backdoor-roth',
      text: 'Look into backdoor Roth IRAs — $14k/yr per couple, tax-free growth forever (above the standard income limits)',
      priority: 'low',
      category: 'tax',
      completed: false,
      onComplete: {
        type: 'info_only',
        description: 'How much did you contribute?',
        fields: [
          { label: 'Person A amount', key: 'person_a_amount', type: 'number' },
          { label: 'Person B amount', key: 'person_b_amount', type: 'number' },
        ],
      },
    });
  }

  // Always-relevant first-step item once the user has accounts.
  if (accounts.length > 0) {
    items.push({
      id: 'credit-card-import',
      text: 'Import 2–3 months of credit card statements — this reveals where your discretionary money actually goes',
      priority: 'high',
      category: 'budget',
      completed: false,
      onComplete: { type: 'info_only', description: 'Upload statements in the Budget → Transactions tab.', fields: [] },
    });
  }

  return items;
}

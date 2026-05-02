import type { BudgetBucket, SinkingFund, FunMoney, PaycheckBreakdown, BudgetScenario } from '../types/budget';

// ─── SAMPLE DATA (Scott's actual numbers) ─────────────────────────────────
// These are loaded by Settings → "Load sample data" so a new user can poke
// around with realistic numbers. They are NOT shipped as defaults.
// Scott's REAL paycheck breakdown ($360k/yr = $30k/mo gross)
export const samplePaycheck: PaycheckBreakdown = {
  grossMonthly: 30000,
  federalTax: 5800, // ~$69,600/yr effective federal
  socialSecurity: 1860, // 6.2% (hitting wage base cap ~Oct)
  medicare: 435, // 1.45% + 0.9% additional above $200k
  stateTax: 0, // Texas — no state income tax
  retirement401k: 750, // ESTIMATE — Scott not maxing. Needs to confirm actual %
  hsaContribution: 350, // ESTIMATE — may not be maxing $8,300 limit
  healthInsurance: 500, // ESTIMATE — employer covers portion
  otherDeductions: 4470, // Remainder to match actual take-home (life ins, disability, etc.)
  netTakeHome: 15835, // CONFIRMED: $7,917.63 × 2 per month
};

// Budget buckets with estimated spending
// These are ESTIMATES — Scott needs to fill in real numbers
// Split into REQUIRED (survival) and DISCRETIONARY (lifestyle) buckets
export const sampleBudgetBuckets: BudgetBucket[] = [
  // ═══ REQUIRED / SURVIVAL ═══
  {
    category: 'housing',
    label: 'Mortgage (Escrow: Tax + Insurance)',
    icon: '🏠',
    monthlyBudget: 3200,
    monthlyActual: 3200, // CONFIRMED: $3,199.55
    color: '#6366f1',
    guideline: 'Includes property tax and homeowners insurance via escrow. 10.7% of gross — well under 28% guideline.',
    guidelinePercent: 28,
  },
  {
    category: 'food_groceries',
    label: 'Groceries',
    icon: '🛒',
    monthlyBudget: 1400,
    monthlyActual: 1733, // CONFIRMED: $400/week
    color: '#22c55e',
    guideline: 'Family of 4 average is $1,000-1,200/mo. You\'re at $1,733. Potential $400-500/mo savings.',
    guidelinePercent: 4,
  },
  {
    category: 'childcare',
    label: 'Childcare (Primrose + Alphabest)',
    icon: '👶',
    monthlyBudget: 1772,
    monthlyActual: 1772, // CONFIRMED: Primrose $324.45/wk + Alphabest $84.84/wk
    color: '#ec4899',
    guideline: 'Vivian (Primrose $1,405) + Logan aftercare (Alphabest $367). Drops ~$1,038/mo when Vivian starts school.',
    guidelinePercent: 10,
  },
  {
    category: 'utilities',
    label: 'Utilities (Electric + Gas + Water + Internet + Cell + Google)',
    icon: '💡',
    monthlyBudget: 875,
    monthlyActual: 875, // CONFIRMED: Electric $400avg + Gas $105avg + Water $120 + ATT $116 + Cell $209 + Google $22 - rounding
    color: '#06b6d4',
    guideline: 'Electric: $280-600 (summer spikes). Gas: $80-130. Water/trash: $120. ATT: $116. Verizon: $209. Google: $22.',
    guidelinePercent: 3,
  },
  {
    category: 'insurance',
    label: 'Insurance (Auto + Home)',
    icon: '🛡️',
    monthlyBudget: 338,
    monthlyActual: 338, // CONFIRMED: Car $270/mo (paid 6mo chunks) + State Farm $68/mo
    color: '#8b5cf6',
    guideline: 'Car: $1,620 every 6 months ($270/mo). Home: $68/mo State Farm.',
    guidelinePercent: 1,
  },
  {
    category: 'transportation',
    label: 'Gas (Cars)',
    icon: '🚗',
    monthlyBudget: 200,
    monthlyActual: 200, // CONFIRMED
    color: '#3b82f6',
    guideline: '4 cars, 2 daily drivers.',
    guidelinePercent: 1,
  },
  {
    category: 'healthcare',
    label: 'Prescriptions / Medical',
    icon: '🏥',
    monthlyBudget: 158,
    monthlyActual: 158, // CONFIRMED: Wife $150/mo + Scott ~$8/mo. Wife hit deductible this year.
    color: '#ef4444',
    guideline: 'Claire: $150/mo (hit deductible). Scott: ~$100/yr. Use HSA for these.',
    guidelinePercent: 0.5,
  },
  {
    category: 'kids',
    label: 'Logan School Lunch',
    icon: '🍎',
    monthlyBudget: 130,
    monthlyActual: 130, // CONFIRMED: $30/week
    color: '#f472b6',
    guideline: '$30/week. Consider packing lunch to save ~$100/mo.',
    guidelinePercent: 0.5,
  },
  {
    category: 'investing',
    label: 'Monthly Investing',
    icon: '📈',
    monthlyBudget: 0, // Dynamically set from Settings → Monthly Investment Amount
    monthlyActual: 0,
    color: '#818cf8',
    guideline: 'Pay yourself first. This is auto-synced from your investment settings.',
    guidelinePercent: 15,
  },
  {
    category: 'other',
    label: 'Pool Chemicals + Pest Control',
    icon: '🏊',
    monthlyBudget: 139,
    monthlyActual: 139, // CONFIRMED: Pool $100 + Pest $116/quarter ($39/mo)
    color: '#14b8a6',
    guideline: 'Pool chemicals: $100/mo (DIY maintenance). Pest control: $116/quarterly.',
    guidelinePercent: 0.5,
  },

  // ═══ DISCRETIONARY / LIFESTYLE (need real numbers from credit card) ═══
  {
    category: 'food_dining',
    label: 'Dining Out / Takeout / DoorDash',
    icon: '🍽️',
    monthlyBudget: 600,
    monthlyActual: 0, // UNKNOWN — need credit card data
    color: '#f97316',
    guideline: 'UNKNOWN — pull credit card statements. This is usually the #1 budget leak.',
    guidelinePercent: 2,
  },
  {
    category: 'subscriptions',
    label: 'Subscriptions (Streaming, Apps, Memberships)',
    icon: '📱',
    monthlyBudget: 200,
    monthlyActual: 0, // UNKNOWN — need credit card data
    color: '#a855f7',
    guideline: 'UNKNOWN — Netflix, Hulu, Disney+, Spotify, gym, etc. Audit needed.',
    guidelinePercent: 0.7,
  },
  {
    category: 'fun_scott',
    label: 'Scott\'s Fun Money',
    icon: '🎮',
    monthlyBudget: 400,
    monthlyActual: 0, // NOT YET SET UP
    color: '#818cf8',
    guideline: 'No-judgment spending. Your money, your call.',
    guidelinePercent: 1.5,
  },
  {
    category: 'fun_wife',
    label: 'Claire\'s Fun Money',
    icon: '💅',
    monthlyBudget: 400,
    monthlyActual: 0, // NOT YET SET UP
    color: '#fb7185',
    guideline: 'No-judgment spending. Her money, her call.',
    guidelinePercent: 1.5,
  },
  {
    category: 'clothing',
    label: 'Clothing (Family)',
    icon: '👕',
    monthlyBudget: 200,
    monthlyActual: 0, // UNKNOWN
    color: '#94a3b8',
    guideline: 'UNKNOWN — need credit card data.',
    guidelinePercent: 0.7,
  },
  {
    category: 'travel_personal',
    label: 'Travel / Vacations (Stash)',
    icon: '✈️',
    monthlyBudget: 500,
    monthlyActual: 0, // NOT YET SET UP
    color: '#0ea5e9',
    guideline: 'Stash — set aside monthly for family trips.',
    guidelinePercent: 2,
  },
  {
    category: 'gifts_holidays',
    label: 'Gifts / Holidays / Birthdays (Stash)',
    icon: '🎁',
    monthlyBudget: 250,
    monthlyActual: 0, // NOT YET SET UP
    color: '#f59e0b',
    guideline: 'Stash — set aside monthly so December doesn\'t wreck you.',
    guidelinePercent: 1,
  },
  {
    category: 'home_maintenance',
    label: 'Home Renovation (Stash)',
    icon: '🔧',
    monthlyBudget: 500,
    monthlyActual: 0, // NOT YET SET UP
    color: '#78716c',
    guideline: 'Goal: home reno + repairs. Rule of thumb: 1% of home value/yr = $490/mo.',
    guidelinePercent: 2,
  },
  {
    category: 'car_maintenance',
    label: 'Car Maintenance (Stash)',
    icon: '🔩',
    monthlyBudget: 250,
    monthlyActual: 0, // NOT YET SET UP
    color: '#64748b',
    guideline: '4 vehicles including a Blackwing = budget for premium maintenance.',
    guidelinePercent: 1,
  },
  { category: 'amazon', label: 'Amazon', icon: '📦', monthlyBudget: 400, monthlyActual: 0, color: '#f97316', guideline: 'All Amazon purchases. Track closely — Amazon is invisible spending.', guidelinePercent: 2 },
  { category: 'taxes', label: 'Taxes (Quarterly / Annual)', icon: '🏛️', monthlyBudget: 0, monthlyActual: 0, color: '#dc2626', guideline: 'Tax payments, CPA fees. Set aside monthly.', guidelinePercent: 0 },
  { category: 'entertainment', label: 'Entertainment', icon: '🎟️', monthlyBudget: 0, monthlyActual: 0, color: '#f472b6', guideline: 'Movies, events, activities.', guidelinePercent: 1 },
  { category: 'charity', label: 'Charity / Donations', icon: '💛', monthlyBudget: 0, monthlyActual: 0, color: '#fbbf24', guideline: 'Charitable giving.', guidelinePercent: 0.5 },
  { category: 'alcohol', label: 'Alcohol', icon: '🍷', monthlyBudget: 0, monthlyActual: 0, color: '#a855f7', guideline: 'Beer, wine, spirits.', guidelinePercent: 0.5 },
  { category: 'electronics', label: 'Electronics / Tech', icon: '🖥️', monthlyBudget: 0, monthlyActual: 0, color: '#3b82f6', guideline: 'Gadgets, tech gear.', guidelinePercent: 1 },
  { category: 'personal', label: 'Personal Care', icon: '💇', monthlyBudget: 0, monthlyActual: 0, color: '#ec4899', guideline: 'Haircuts, grooming, beauty.', guidelinePercent: 1 },
  {
    category: 'travel_work',
    label: 'Work Expenses (Reimbursable)',
    icon: '💼',
    monthlyBudget: 0,
    monthlyActual: 0, // TRACKED SEPARATELY
    color: '#475569',
    guideline: 'These get reimbursed — excluded from real spending by default.',
    guidelinePercent: 0,
  },
];

export const sampleSinkingFunds: SinkingFund[] = [
  { id: 'sf-vacation', name: 'Family Vacations', targetAmount: 8000, currentBalance: 0, monthlyContribution: 500, color: '#0ea5e9' },
  { id: 'sf-holidays', name: 'Holidays & Gifts', targetAmount: 3000, currentBalance: 0, monthlyContribution: 250, color: '#f59e0b' },
  { id: 'sf-car', name: 'Car Maintenance', targetAmount: 3000, currentBalance: 0, monthlyContribution: 250, color: '#64748b' },
  { id: 'sf-home', name: 'Home Renovation & Repairs', targetAmount: 25000, currentBalance: 0, monthlyContribution: 500, color: '#78716c' },
  { id: 'sf-theater', name: 'Theater Room', targetAmount: 15000, currentBalance: 0, monthlyContribution: 300, color: '#8b5cf6' },
  { id: 'sf-emergency', name: 'Emergency Top-Up', targetAmount: 10000, currentBalance: 0, monthlyContribution: 0, targetDate: '2027-01-01', color: '#ef4444' },
];

export const sampleFunMoney: FunMoney[] = [
  { person: 'Scott', monthlyBudget: 400, monthlySpent: 0 },
  { person: 'Claire', monthlyBudget: 400, monthlySpent: 0 },
];

export const sampleScenarios: BudgetScenario[] = [
  {
    id: 'daycare-ends',
    name: 'Vivian Starts School (Fall 2027)',
    description: 'Daycare ($17k/yr) → Public school ($2k/yr). $15k/year freed up.',
    monthlyImpact: 1250,
    changes: [
      { label: 'Daycare savings', amount: 1250 },
      { label: '→ Max 401k (increase contribution)', amount: -600 },
      { label: '→ Start Backdoor Roth IRAs', amount: -583 },
      { label: '→ Remaining to investing', amount: -67 },
    ],
  },
  {
    id: 'wife-works',
    name: 'Claire Returns to Work (~$130k)',
    description: 'Household income jumps to ~$490k. After taxes and childcare adjustments.',
    monthlyImpact: 5500,
    changes: [
      { label: 'Claire net income (after tax)', amount: 7500 },
      { label: 'Childcare increase (after school care)', amount: -500 },
      { label: 'Transportation/commute costs', amount: -300 },
      { label: 'Claire 401k contribution', amount: -1000 },
      { label: 'Available for investing/savings', amount: -200 },
    ],
  },
  {
    id: 'max-retirement',
    name: 'Max All Retirement Accounts',
    description: 'Max 401k + HSA + Backdoor Roths. Maximize tax-advantaged space.',
    monthlyImpact: -1800,
    changes: [
      { label: '401k: current → $23,500/yr max', amount: -600 },
      { label: 'HSA: current → $8,300/yr max', amount: -340 },
      { label: 'Backdoor Roth IRAs ($14k/yr)', amount: -1167 },
      { label: 'Tax savings (reduced take-home impact)', amount: 307 },
    ],
  },
  {
    id: 'ipo-liquidity',
    name: 'Post-IPO Equity Liquidity',
    description: 'After lockup, equity becomes liquid. One-time windfall + ongoing RSU vesting.',
    monthlyImpact: 0,
    changes: [
      { label: 'Estimated net proceeds (at $8B)', amount: 1060000 },
      { label: 'Tax set-aside (estimated)', amount: -390000 },
      { label: 'Diversification (move 50% out)', amount: -335000 },
      { label: 'Remaining Abnormal position', amount: -335000 },
    ],
  },
];

// ─── NEUTRAL DEFAULTS (shipped to all new users) ──────────────────────────
// Generic categories with reasonable guideline percents but $0 actuals/budgets.
// Cold-start wizard + bank import populate the real numbers.

export const defaultPaycheck: PaycheckBreakdown = {
  grossMonthly: 0,
  federalTax: 0,
  socialSecurity: 0,
  medicare: 0,
  stateTax: 0,
  retirement401k: 0,
  hsaContribution: 0,
  healthInsurance: 0,
  otherDeductions: 0,
  netTakeHome: 0,
};

export const defaultBudgetBuckets: BudgetBucket[] = [
  // Required / survival
  { category: 'housing',         label: 'Housing',                 icon: '🏠', monthlyBudget: 0, monthlyActual: 0, color: '#6366f1', guideline: 'Mortgage / rent + property tax + homeowners insurance. Aim for under 28% of gross.', guidelinePercent: 28 },
  { category: 'food_groceries',  label: 'Groceries',               icon: '🛒', monthlyBudget: 0, monthlyActual: 0, color: '#22c55e', guideline: 'Family of 4 averages $1,000–1,200/mo.', guidelinePercent: 4 },
  { category: 'childcare',       label: 'Childcare',               icon: '👶', monthlyBudget: 0, monthlyActual: 0, color: '#ec4899', guideline: 'Daycare / aftercare / nanny.', guidelinePercent: 10 },
  { category: 'utilities',       label: 'Utilities',               icon: '💡', monthlyBudget: 0, monthlyActual: 0, color: '#06b6d4', guideline: 'Electric, gas, water, internet, cell, trash.', guidelinePercent: 3 },
  { category: 'insurance',       label: 'Insurance',               icon: '🛡️', monthlyBudget: 0, monthlyActual: 0, color: '#8b5cf6', guideline: 'Auto + home + life + umbrella.', guidelinePercent: 1 },
  { category: 'transportation',  label: 'Transportation / Gas',    icon: '🚗', monthlyBudget: 0, monthlyActual: 0, color: '#3b82f6', guideline: 'Gas, parking, transit. Car payment goes in housing-adjacent.', guidelinePercent: 1 },
  { category: 'healthcare',      label: 'Healthcare',              icon: '🏥', monthlyBudget: 0, monthlyActual: 0, color: '#ef4444', guideline: 'Prescriptions, copays, dental.', guidelinePercent: 0.5 },
  { category: 'kids',            label: 'Kids',                    icon: '🍎', monthlyBudget: 0, monthlyActual: 0, color: '#f472b6', guideline: 'School lunch, activities, supplies.', guidelinePercent: 0.5 },
  { category: 'investing',       label: 'Monthly Investing',       icon: '📈', monthlyBudget: 0, monthlyActual: 0, color: '#818cf8', guideline: 'Pay yourself first. Synced from your investment settings.', guidelinePercent: 15 },

  // Discretionary / lifestyle
  { category: 'food_dining',     label: 'Dining Out',              icon: '🍽️', monthlyBudget: 0, monthlyActual: 0, color: '#f97316', guideline: 'Restaurants, takeout, delivery. Often the #1 budget leak.', guidelinePercent: 2 },
  { category: 'subscriptions',   label: 'Subscriptions',           icon: '📱', monthlyBudget: 0, monthlyActual: 0, color: '#a855f7', guideline: 'Streaming, apps, gym, memberships.', guidelinePercent: 0.7 },
  { category: 'fun_scott',       label: 'Personal Fun (1)',        icon: '🎮', monthlyBudget: 0, monthlyActual: 0, color: '#818cf8', guideline: 'No-judgment spending for the primary earner.', guidelinePercent: 1.5 },
  { category: 'fun_wife',        label: 'Personal Fun (2)',        icon: '💅', monthlyBudget: 0, monthlyActual: 0, color: '#fb7185', guideline: 'No-judgment spending for the secondary earner.', guidelinePercent: 1.5 },
  { category: 'clothing',        label: 'Clothing',                icon: '👕', monthlyBudget: 0, monthlyActual: 0, color: '#94a3b8', guideline: 'Family clothing.', guidelinePercent: 0.7 },
  { category: 'travel_personal', label: 'Travel / Vacations',      icon: '✈️', monthlyBudget: 0, monthlyActual: 0, color: '#0ea5e9', guideline: 'Stash — set aside monthly for trips.', guidelinePercent: 2 },
  { category: 'gifts_holidays',  label: 'Gifts / Holidays',        icon: '🎁', monthlyBudget: 0, monthlyActual: 0, color: '#f59e0b', guideline: 'Sinking fund so December does not wreck you.', guidelinePercent: 1 },
  { category: 'home_maintenance',label: 'Home Maintenance',        icon: '🔧', monthlyBudget: 0, monthlyActual: 0, color: '#78716c', guideline: 'Rule of thumb: 1% of home value per year.', guidelinePercent: 2 },
  { category: 'car_maintenance', label: 'Car Maintenance',         icon: '🔩', monthlyBudget: 0, monthlyActual: 0, color: '#64748b', guideline: 'Repairs, tires, registrations.', guidelinePercent: 1 },
  { category: 'amazon',          label: 'Amazon',                  icon: '📦', monthlyBudget: 0, monthlyActual: 0, color: '#f97316', guideline: 'Track separately — Amazon is invisible spending.', guidelinePercent: 2 },
  { category: 'taxes',           label: 'Taxes',                   icon: '🏛️', monthlyBudget: 0, monthlyActual: 0, color: '#dc2626', guideline: 'Quarterly estimated, CPA fees.', guidelinePercent: 0 },
  { category: 'entertainment',   label: 'Entertainment',           icon: '🎟️', monthlyBudget: 0, monthlyActual: 0, color: '#f472b6', guideline: 'Movies, events, activities.', guidelinePercent: 1 },
  { category: 'charity',         label: 'Charity',                 icon: '💛', monthlyBudget: 0, monthlyActual: 0, color: '#fbbf24', guideline: 'Charitable giving.', guidelinePercent: 0.5 },
  { category: 'alcohol',         label: 'Alcohol',                 icon: '🍷', monthlyBudget: 0, monthlyActual: 0, color: '#a855f7', guideline: 'Beer, wine, spirits.', guidelinePercent: 0.5 },
  { category: 'electronics',     label: 'Electronics',             icon: '🖥️', monthlyBudget: 0, monthlyActual: 0, color: '#3b82f6', guideline: 'Gadgets, tech gear.', guidelinePercent: 1 },
  { category: 'personal',        label: 'Personal Care',           icon: '💇', monthlyBudget: 0, monthlyActual: 0, color: '#ec4899', guideline: 'Haircuts, grooming, beauty.', guidelinePercent: 1 },
  { category: 'travel_work',     label: 'Work Expenses',           icon: '💼', monthlyBudget: 0, monthlyActual: 0, color: '#475569', guideline: 'Reimbursable — excluded from spending totals. Includes work travel, client meals, supplies, etc.', guidelinePercent: 0 },
];

export const defaultSinkingFunds: SinkingFund[] = [
  { id: 'sf-vacation', name: 'Family Vacations', targetAmount: 0, currentBalance: 0, monthlyContribution: 0, color: '#0ea5e9' },
  { id: 'sf-holidays', name: 'Holidays & Gifts', targetAmount: 0, currentBalance: 0, monthlyContribution: 0, color: '#f59e0b' },
  { id: 'sf-emergency', name: 'Emergency Fund',  targetAmount: 0, currentBalance: 0, monthlyContribution: 0, color: '#ef4444' },
];

export const defaultFunMoney: FunMoney[] = [];   // populated by cold-start wizard via Earner profiles

export const defaultScenarios: BudgetScenario[] = [];   // user creates their own

// Calculate estimated monthly totals
export function calculateBudgetSummary(buckets: BudgetBucket[], paycheck: PaycheckBreakdown, monthlyInvestmentAmount?: number) {
  const totalBudgeted = buckets.reduce((s, b) => s + b.monthlyBudget, 0);
  const totalActual = buckets.reduce((s, b) => s + b.monthlyActual, 0);
  // Exclude work travel (reimbursed) from real spending
  const realActual = buckets
    .filter(b => b.category !== 'travel_work')
    .reduce((s, b) => s + b.monthlyActual, 0);
  // Investing is now a bucket in the array — pull the actual from it, fall back to
  // the Settings amount, then 0. Never inject a hardcoded number for fresh users.
  const investingBucket = buckets.find(b => b.category === 'investing');
  const investing = investingBucket?.monthlyActual || investingBucket?.monthlyBudget || monthlyInvestmentAmount || 0;
  // Surplus = income minus all real spending (investing is already included in realActual via bucket)
  const surplus = paycheck.netTakeHome - realActual;
  const savingsRate = ((investing + paycheck.retirement401k + paycheck.hsaContribution) / paycheck.grossMonthly) * 100;

  return {
    grossIncome: paycheck.grossMonthly,
    netIncome: paycheck.netTakeHome,
    totalBudgeted,
    totalActual,
    realActual,
    investing,
    surplus,
    savingsRate,
    targetSavingsRate: 20,
  };
}

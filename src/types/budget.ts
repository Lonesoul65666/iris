export type ExpenseCategory =
  | 'housing' | 'transportation' | 'food_groceries' | 'food_dining'
  | 'childcare' | 'kids' | 'utilities' | 'insurance'
  | 'subscriptions' | 'healthcare' | 'personal' | 'fun_scott'
  | 'fun_wife' | 'clothing' | 'gifts_holidays' | 'travel_personal'
  | 'travel_work' | 'home_maintenance' | 'car_maintenance'
  | 'education' | 'pets' | 'savings' | 'investing' | 'debt'
  | 'charity' | 'entertainment' | 'alcohol' | 'electronics'
  | 'amazon' | 'taxes'
  | 'other'
  | (string & {}); // allows custom categories while keeping autocomplete for built-ins

export interface CustomCategory {
  id: string;       // slug, e.g. "dog_walker"
  label: string;    // display name, e.g. "Dog Walker"
  icon: string;     // emoji, e.g. "🐕"
  color: string;    // hex color for charts
}

export type ReimbursementStatus = 'not_reimbursable' | 'pending' | 'submitted' | 'reimbursed';

// Flow direction: money in or money out
export type TransactionFlow = 'inflow' | 'outflow';

// What kind of transaction is this?
export type TransactionType =
  | 'expense'        // Real spending (groceries, dining, gas, etc.)
  | 'income'         // Paycheck, side income
  | 'reimbursement'  // Work expense reimbursement coming back
  | 'transfer'       // Moving money between own accounts (CC payment, savings transfer)
  | 'investment'     // Money moved to investment accounts
  | 'refund';        // Returned purchase

// Sub-classification for inflows. Populated alongside transactionType='income' or 'reimbursement'.
// Drives the income detection engine, sweep config, and budget-inclusion logic.
// See project_iris_budget_architecture.md for the locked rationale.
export type IncomeSubtype =
  | 'base'           // steady paycheck base (default include in budget)
  | 'variable'       // commission / variable pay (default surplus, sweep)
  | 'bonus'          // lump-sum bonus, irregular cadence
  | 'side'           // side gig / secondary income source
  | 'dividend'       // brokerage interest / dividends — NOT a paycheck
  | 'reimbursement'  // employer paying back submitted work expenses
  | 'gift'           // gift / windfall — don't budget against
  | 'sale'           // sale of personal stuff — don't budget against
  | 'unknown';       // detected but not yet classified — surfaces disambiguation prompt

// Source-type taxonomy. Detection is source-type aware (a "deposit" in Fidelity != paycheck).
export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'brokerage'      // Fidelity, Schwab, Merrill — inflows are dividends/interest/sales, NOT income
  | 'cash_app'       // Venmo, CashApp — usually transfers
  | 'crypto'
  | 'loan'
  | 'other';

// Which account did this come from?
export type TransactionSource =
  | 'bofa_checking'
  | 'bofa_savings'
  | 'bofa_joint'
  | 'credit_card_1'
  | 'credit_card_2'
  | 'credit_card_3'
  | 'venmo'
  | 'other';

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;           // Always positive — flow determines direction
  category: ExpenseCategory;
  reimbursementStatus: ReimbursementStatus;
  isWorkExpense: boolean;
  recurring: boolean;
  notes?: string;
  // New fields for full cash flow tracking
  flow?: TransactionFlow;       // 'inflow' or 'outflow' — defaults to 'outflow' for backward compat
  transactionType?: TransactionType; // What kind of transaction
  source?: TransactionSource;   // Which account it came from
  importBatch?: string;         // Groups transactions from a single CSV upload
  // Inflow-specific (only populated when flow='inflow')
  incomeSubtype?: IncomeSubtype;     // base/variable/bonus/etc — drives detection + sweep logic
  incomeSourceId?: string;           // links to IncomeSource.id when matched/grouped
  /** Who spent it (couples model): an Earner.id or 'ours'. Absent = inherit
   *  the account's owner (sourceOwners collection), falling back to 'ours'. */
  spender?: string;
}

/** Account-owner mapping for attribution: which person a transaction source
 *  belongs to by default. A card in one person's name is theirs; the joint
 *  checking is 'ours'. Per-transaction `spender` overrides this. */
export interface SourceOwner {
  source: string;   // TransactionSource value, e.g. 'credit_card_1'
  owner: string;    // Earner.id | 'ours'
}

// ─── Income source model (locked 2026-04-24) ──────────────────────────────────
// A persistent, detected (or manually seeded) stream of inflows. The Budget
// engine runs against the *aggregate* of confirmed sources marked
// includeInBudget. Variable sources default to surplus (sweep), not budgeted.

export type IncomeCadence = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular';

export type SweepDestination = 'hysa' | 'sinking_fund' | 'investing' | 'extra_payment' | 'manual' | 'none';

export type IncomeSourceStatus = 'detected' | 'confirmed' | 'dismissed' | 'manual';

export interface IncomeSource {
  id: string;                     // stable: `inc-${normalizedPayer}-${subtype}`
  payer: string;                  // normalized merchant key (grouping)
  payerDisplay: string;           // human-readable, first-seen casing
  subtype: IncomeSubtype;
  earnerId?: string;              // optional link to a household earner

  // Detected pattern (filled by the income detector)
  cadence: IncomeCadence;
  avgAmount: number;              // positive
  amountMin: number;
  amountMax: number;
  occurrences: number;
  firstSeen: string;              // ISO date
  lastSeen: string;               // ISO date
  nextExpectedDate?: string;      // ISO date — for predictable cadences only
  confidence: number;             // 0..1

  // User decisions
  status: IncomeSourceStatus;
  includeInBudget: boolean;       // default true for base/side/dividend, false for variable/bonus/gift/sale
  sweepDestination: SweepDestination;
  sweepDestinationId?: string;    // sinking-fund id, etc — interpretation depends on destination

  // Linked transactions
  expenseIds: string[];           // ids of inflow transactions matched to this source

  // Audit
  createdAt: string;
  updatedAt: string;
}

// One-off classifications captured via the inflow disambiguation prompt.
// "What is this $150 from Venmo?" — user picks; we remember.
export interface InflowDecision {
  expenseId: string;              // the inflow transaction id (key)
  classification: IncomeSubtype | 'snoozed';
  decidedAt: string;              // ISO timestamp
  // If snoozed, when can we re-prompt?
  snoozeUntil?: string;
}

// ─── Notification preferences (locked 2026-04-24, decision #8) ─────────────
// Three-tier model: Critical (always on, can't fully disable), Helpful (on
// by default), Nice-to-know (opt-in).

export type NotificationTier = 'critical' | 'helpful' | 'nice_to_know';

export type NotificationKey =
  // Critical
  | 'bill_wont_clear'
  | 'paycheck_missing'
  | 'fraud_suspicious'
  // Helpful
  | 'pace_80'
  | 'pace_90'
  | 'pace_100'
  | 'reimbursement_matched'
  | 'surplus_available'
  | 'subscription_confirmed'
  | 'income_classification_needed'
  // Nice-to-know
  | 'weekly_summary'
  | 'monthly_trends'
  | 'goal_pace_check';

export interface NotificationPreferences {
  // Helpful tier — true means active
  pace_80: boolean;
  pace_90: boolean;
  pace_100: boolean;
  reimbursement_matched: boolean;
  surplus_available: boolean;
  subscription_confirmed: boolean;
  income_classification_needed: boolean;
  // Nice-to-know tier — false by default
  weekly_summary: boolean;
  monthly_trends: boolean;
  goal_pace_check: boolean;
}

export const defaultNotificationPreferences: NotificationPreferences = {
  pace_80: true,
  pace_90: true,
  pace_100: true,
  reimbursement_matched: true,
  surplus_available: true,
  subscription_confirmed: true,
  income_classification_needed: true,
  weekly_summary: false,
  monthly_trends: false,
  goal_pace_check: false,
};

// Lightweight earner profile (multi-earner = multi-source in detection terms,
// but the UI still wants names + isWorking toggles).
export interface Earner {
  id: string;                     // 'scott', 'claire', or generated
  name: string;
  isWorking: boolean;
  company?: string;
  // Pay-shape hint, used for cold-start seeding before detection has data
  payShape?: 'salary' | 'salary_bonus' | 'salary_commission' | 'hourly' | 'self_employed' | 'mix';
  submitWorkExpenses?: boolean;
  // Manual seed values (replaced by detection when data flows)
  seedTakeHomePerCheck?: number;
  seedCheckCadence?: IncomeCadence;
}

export interface BudgetBucket {
  category: ExpenseCategory;
  label: string;
  icon: string;
  monthlyBudget: number;
  monthlyActual: number;
  color: string;
  guideline: string; // e.g., "Housing should be under 28% of gross"
  guidelinePercent: number; // recommended % of gross income
  // Optional grouping — buckets sharing a group can opt into "flex" budgeting
  // where the group has one combined budget and per-bucket budgets are advisory only.
  // See project_iris_budget_architecture.md decision #7.
  group?: string;             // free-form group name, e.g. "Food", "Transportation"
  groupFlex?: boolean;        // when true on every bucket in a group, that group is flex
}

/** Aggregated view of buckets that share a group label. Computed on-demand. */
export interface BucketGroup {
  group: string;
  buckets: BudgetBucket[];
  totalBudget: number;        // sum of per-bucket budgets (advisory) OR the flex group budget
  totalActual: number;
  isFlex: boolean;            // every bucket has groupFlex=true
}

// User-visible name: STASH (never "sinking fund"). Type name migrates
// opportunistically; the `sinkingFunds` collection name stays for data compat.
export interface SinkingFund {
  id: string;
  name: string;
  targetAmount: number;
  /** Legacy manual balance. Superseded by the DERIVED balance (stashMath) when
   *  startMonth is set; kept so old rows render until they're configured. */
  currentBalance: number;
  monthlyContribution: number;
  targetDate?: string;
  color: string;
  /** Expense categories this stash covers — spend there draws the stash down
   *  and the categories live in the reserve lane (no monthly over/under alarm). */
  categories?: string[];
  /** Month ('YYYY-MM') contributions start accruing. Set => balance is derived. */
  startMonth?: string;
  /** What was already set aside when accrual started. User-edited; can be 0. */
  openingBalance?: number;
  /** Have-to = obligation you pre-fund (taxes, insurance, card fees);
   *  Want-to = goal you're saving toward (trips, remodel). Grouping only —
   *  the fill + confirm mechanic is identical for both. */
  kind?: 'have_to' | 'want_to';
  /** Planned monthly move into this stash — the one-tap default when confirming
   *  ("Make Every Dolla Holla"). Distinct from the legacy monthlyContribution so
   *  we can migrate without disturbing existing reserve math. */
  monthlyFill?: number;
  /** How the goal is timed. Drives the ETA/countdown:
   *  - 'custom'     → one-time deadline held in `targetDate` (trips, a remodel).
   *  - 'annual'     → recurs once a year, in month `dueMonth` (card fees, taxes).
   *  - 'semiannual' → recurs twice a year, anchored on `dueMonth` (+6 mo). */
  cadence?: 'semiannual' | 'annual' | 'custom';
  /** Anchor month (1–12) for a recurring cadence — "which month it lands".
   *  Middle-ground precision: no exact day, so the countdown targets the 1st of
   *  this month's next occurrence. Ignored when cadence is 'custom'. */
  dueMonth?: number;
}

/** Preferred alias going forward. */
export type Stash = SinkingFund;

export interface FunMoney {
  person: string;            // display name
  /** Link to Earner.id — the referential identity (couples model). Legacy rows
   *  matched on the person string; new rows always carry the id. */
  earnerId?: string;
  /** The fun category this pot tracks. Legacy installs encode names in the
   *  category union (fun_scott / fun_wife); resolved from person when absent. */
  category?: ExpenseCategory;
  emoji?: string;            // display emoji — was hardcoded by name in the UI
  monthlyBudget: number;
  /** DERIVED: current-calendar-month spend in `category`. Never hand-edited. */
  monthlySpent: number;
}

export interface PaycheckBreakdown {
  grossMonthly: number;
  federalTax: number;
  socialSecurity: number;
  medicare: number;
  stateTax: number;
  retirement401k: number;
  hsaContribution: number;
  healthInsurance: number;
  otherDeductions: number;
  netTakeHome: number;
}

export interface BudgetScenario {
  id: string;
  name: string;
  description: string;
  monthlyImpact: number; // positive = more money available
  changes: { label: string; amount: number }[];
}

export interface MonthlyBudgetSummary {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  totalSavingsInvesting: number;
  savingsRate: number;
  surplus: number;
}

export interface BudgetHealthMetric {
  name: string;
  score: number;
  status: 'good' | 'warning' | 'danger';
  message: string;
  detail: string;
}

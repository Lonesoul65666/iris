// Action template schema — data-driven replacement for the executeAction switch.
// Adding a new action becomes "write one JSON object," not "write code + redeploy."
// Templates live in src/data/actions/*.json (Phase 2) and are loaded at startup.

import type { Account, AccountType, Holding, HoldingStatus } from './portfolio';

export type ActionCategory = 'cash' | 'tax' | 'investment' | 'budget' | 'general';
export type ActionPriority = 'high' | 'medium' | 'low';

// Reference an account by data shape, not by hardcoded ID.
// 'type-and-tag' is the preferred form. 'input' is used when the template defers
// to a user selection (account-picker input). 'id' is for direct references only,
// which should be rare — templates should not hardcode account IDs.
export type AccountRef =
  | { by: 'id'; id: string }
  | { by: 'input'; inputKey: string }
  | { by: 'type-and-tag'; type: AccountType; tag?: string }
  | { by: 'type'; type: AccountType; pick: 'first' | 'largest' | 'prompt-user' }
  | { by: 'institution'; name: string };

export interface HoldingFilter {
  tickers?: string[];
  assetClasses?: string[];
  statusNot?: HoldingStatus;
}

export interface EquityFilter {
  grantType?: 'iso' | 'rsu';
  hasExercisable?: boolean;
}

export interface TransactionFilter {
  merchantContains?: string;
  category?: string;
  dateRange?: { from?: string; to?: string };
  amountRange?: { min?: number; max?: number };
}

// Reference a value from the user's input form. Resolved at execution time.
export type InputRef = `input:${string}`;

// The 9 effect operations. Cross-checked against current switch statement (6 actions)
// and the next ~8 planned actions — nothing forces a new op.
// Deferred until needed: computed-amount expressions, scheduling, external price refresh.
export type Effect =
  | {
      op: 'transfer-cash';
      from: AccountRef;
      to: AccountRef | 'new-account';
      amount: InputRef | number;
      newAccountTemplate?: Partial<Account>;
    }
  | {
      op: 'add-holding';
      account: AccountRef;
      holding: Partial<Holding>;
    }
  | {
      op: 'remove-holdings';
      account: AccountRef;
      filter: HoldingFilter;
    }
  | {
      op: 'update-profile';
      path: string;
      value: unknown;
    }
  | {
      op: 'update-account';
      account: AccountRef;
      patch: Partial<Account>;
    }
  | {
      op: 'update-budget';
      target: 'paycheck' | 'fun-money' | 'sinking-funds';
      patch: Record<string, unknown>;
    }
  | {
      op: 'exercise-equity';
      grantFilter: EquityFilter;
      shares: InputRef | number;
    }
  | {
      op: 'update-transactions';
      filter: TransactionFilter;
      patch: Record<string, unknown>;
    }
  | {
      op: 'spawn-action';
      template: Partial<ActionTemplate>;
    };

export type InputFieldType =
  | 'number'
  | 'currency'
  | 'string'
  | 'account-picker'
  | 'ticker'
  | 'date'
  | 'household-budget';

export interface InputField {
  key: string;
  label: string;
  type: InputFieldType;
  default?: string | number;
  required?: boolean;
  accountFilter?: { type?: AccountType; tag?: string };
}

export interface RuleClause {
  metric: string;
  op: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number | string;
}

export interface RuleExpression {
  all?: RuleClause[];
  any?: RuleClause[];
}

export interface ActionTrigger {
  type: 'portfolio-condition' | 'manual' | 'recurring';
  condition?: RuleExpression;
  recurring?: 'annual' | 'quarterly' | 'monthly';
  createdAt?: string;
  staleAfter?: number;
  urgencyByAge?: 'increasing' | 'decreasing' | 'static';
}

export interface ActionTemplate {
  id: string;
  version: 1;
  // Legacy action-item IDs this template also responds to. Lets us rename an action
  // generically (sell-memecoins → sell-specific-crypto) without breaking items that
  // already live in IndexedDB under the old ID.
  aliases?: string[];
  category: ActionCategory;
  trigger: ActionTrigger;
  text: string;
  detail?: string;
  priority: ActionPriority;
  inputs: InputField[];
  effects: Effect[];
  successTemplate: string;
  newActionsOnSuccess?: Partial<ActionTemplate>[];
}

export interface ActionExecutionContext {
  accounts: Account[];
  profileId: string;
  timestamp: string;
}

export interface ActionExecutionResult {
  success: boolean;
  message: string;
  effectResults?: unknown[];
  newActionItems?: Partial<ActionTemplate>[];
}

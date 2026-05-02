// Profile v2 — generic household shape, not single-person-with-optional-spouse.
// Lives alongside legacy UserProfile in portfolio.ts during Phase 0.
// Phase 2 migration will retire UserProfile and rename this.

export interface Person {
  id: string;
  displayName: string;
  age: number;
  role: 'primary' | 'spouse' | 'dependent';
  annualIncome?: number;
  retirementAge?: number;
}

export type LLMRoutingPreference = 'auto' | 'cloud-preferred' | 'local-only';

export type FinancialDataSource = 'simplefin' | 'csv' | 'none';

export interface UserPreferences {
  llmProvider: LLMRoutingPreference;
  cloudProvider?: 'gemini' | 'claude' | 'none';
  localModel?: string;
  financialDataSource: FinancialDataSource;
  currency: string;
  locale: string;
  darkMode: boolean;
}

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive' | 'very_aggressive';

export interface Profile {
  id: string;
  version: 2;
  createdAt: string;

  household: Person[];

  state: string;
  taxBracket: number;
  riskTolerance: RiskTolerance;
  monthlyInvestment: number;

  homeValue?: number;
  mortgageBalance?: number;
  carValue?: number;

  preferences: UserPreferences;

  onboardingCompleted: boolean;
  onboardingCompletedAt?: string;
}

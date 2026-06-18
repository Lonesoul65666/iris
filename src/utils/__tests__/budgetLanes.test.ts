import { describe, it, expect } from 'vitest';
import {
  laneOf,
  isOverBudget,
  FIXED_CATEGORIES,
  RESERVE_CATEGORIES,
  RESERVE_ALLOCATIONS,
} from '../budgetLanes';

describe('laneOf', () => {
  it('routes every FIXED_CATEGORIES entry to the fixed lane', () => {
    for (const cat of FIXED_CATEGORIES) {
      expect(laneOf(cat), `laneOf('${cat}')`).toBe('fixed');
    }
  });

  it('routes every RESERVE_CATEGORIES entry to the reserve lane', () => {
    for (const cat of RESERVE_CATEGORIES) {
      expect(laneOf(cat), `laneOf('${cat}')`).toBe('reserve');
    }
  });

  it('routes everything else (discretionary + unknown/custom) to flexible', () => {
    expect(laneOf('food_dining')).toBe('flexible');
    expect(laneOf('amazon')).toBe('flexible');
    expect(laneOf('subscriptions')).toBe('flexible');
    expect(laneOf('fun_scott')).toBe('flexible');
    expect(laneOf('dog_walker')).toBe('flexible'); // custom category fallthrough
    expect(laneOf('other')).toBe('flexible');
  });
});

describe('isOverBudget', () => {
  it('reserve lane is NEVER over budget, even at 10x (lumpy by design)', () => {
    expect(isOverBudget('taxes', 13000, 1500)).toBe(false);
    expect(isOverBudget('travel_personal', 10000, 1000)).toBe(false);
  });

  it('fixed lane at EXACTLY budget * 1.15 is NOT over (boundary is exclusive)', () => {
    expect(isOverBudget('housing', 1000 * 1.15, 1000)).toBe(false);
  });

  it('fixed lane just above the 1.15 tolerance IS over', () => {
    expect(isOverBudget('housing', 1000 * 1.15 + 0.01, 1000)).toBe(true);
  });

  it('fixed lane mildly over budget but within tolerance is NOT over', () => {
    expect(isOverBudget('utilities', 1100, 1000)).toBe(false);
  });

  it('flexible lane is over the moment actual exceeds budget', () => {
    expect(isOverBudget('food_dining', 500.01, 500)).toBe(true);
  });

  it('flexible lane at exactly budget is NOT over', () => {
    expect(isOverBudget('food_dining', 500, 500)).toBe(false);
  });

  it('budget <= 0 is never over, in any lane', () => {
    expect(isOverBudget('food_dining', 999, 0)).toBe(false);
    expect(isOverBudget('housing', 999, 0)).toBe(false);
    expect(isOverBudget('food_dining', 999, -100)).toBe(false);
  });
});

describe('RESERVE_ALLOCATIONS', () => {
  it('monthly reserve set-aside totals $2,000 (taxes 1000 + travel 1000 + work 0)', () => {
    const total = Object.values(RESERVE_ALLOCATIONS).reduce((s, v) => s + v, 0);
    expect(total).toBe(2000);
    expect(RESERVE_ALLOCATIONS.travel_work).toBe(0); // reimbursed — no personal reserve
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import {
  monthsElapsedInclusive, computeStashStatus, totalStashContributions,
  stashAllocationsByCategory, stashesConfigured, seedDefaultStashes, applyStashLaneConfig,
  committedReserves, nextDueDate, computeStashForecast, requiredMonthlyForGoal, computeShortfall,
  stashExistedBy,
} from '../stashMath';
import { formatDuration } from '../format';
import type { DeployConfirmation } from '../../stores/budgetStore';
import { laneOf, totalReserveSetAside, configureStashLanes, RESERVE_CATEGORIES, RESERVE_ALLOCATIONS } from '../budgetLanes';
import type { Expense, Stash } from '../../types/budget';

const NOW = new Date(2026, 5, 11); // June 11, 2026 (local)

function exp(partial: Partial<Expense>): Expense {
  return {
    id: partial.id ?? `e-${Math.abs(JSON.stringify(partial).length)}-${partial.date}-${partial.amount}`,
    date: partial.date ?? '2026-06-01',
    description: partial.description ?? 'test',
    amount: partial.amount ?? 100,
    category: partial.category ?? 'other',
    flow: partial.flow ?? 'outflow',
    transactionType: partial.transactionType ?? 'expense',
    isWorkExpense: partial.isWorkExpense ?? false,
  } as Expense;
}

function stash(partial: Partial<Stash>): Stash {
  return {
    id: partial.id ?? 's1', name: partial.name ?? 'Test', targetAmount: partial.targetAmount ?? 0,
    currentBalance: partial.currentBalance ?? 0, monthlyContribution: partial.monthlyContribution ?? 0,
    color: '#fff', ...partial,
  };
}

// A committed move (DeployConfirmation) on a stash's lane — the commit-model
// input that now drives the derived balance.
function commit(month: string, lane: string, amount: number): DeployConfirmation {
  return { month, lane, amount, confirmedAt: `${month}-01T00:00:00Z` };
}

describe('stashExistedBy (creation-forward visibility)', () => {
  const july = stash({ id: 's-july', startMonth: '2026-07' });

  it('hides a stash in a month before it started accruing', () => {
    expect(stashExistedBy(july, '2026-06')).toBe(false);
  });
  it('shows a stash in its start month and after', () => {
    expect(stashExistedBy(july, '2026-07')).toBe(true);
    expect(stashExistedBy(july, '2026-08')).toBe(true);
  });
  it('treats a legacy stash with no startMonth as always-existing', () => {
    expect(stashExistedBy(stash({ startMonth: undefined }), '2026-01')).toBe(true);
  });
  it('shows everything for the empty (avg) month', () => {
    expect(stashExistedBy(july, '')).toBe(true);
  });
});

// configureStashLanes mutates the module registry — restore defaults so other
// tests in this file see legacy behavior.
afterEach(() => {
  configureStashLanes(RESERVE_CATEGORIES.filter(c => c !== 'travel_work'), { ...RESERVE_ALLOCATIONS });
});

describe('committedReserves', () => {
  const dc = (month: string, lane: string, amount: number): DeployConfirmation =>
    ({ month, lane, amount, confirmedAt: '2026-06-01T00:00:00Z' });

  it('sums only stash-lane confirms for the given month', () => {
    const confirms = [
      dc('2026-06', 'stash-taxes', 1000),
      dc('2026-06', 'stash-travel', 1000),
      dc('2026-06', 'investing', 1500),   // not a stash lane — excluded
      dc('2026-05', 'stash-taxes', 1000), // wrong month — excluded
    ];
    expect(committedReserves(confirms, '2026-06')).toBe(2000);
  });

  it('is $0 when nothing is committed (the commit-model starting point)', () => {
    expect(committedReserves([], '2026-06')).toBe(0);
    expect(committedReserves([dc('2026-06', 'investing', 1000)], '2026-06')).toBe(0);
  });

  it('empty month string matches nothing (the avg view)', () => {
    expect(committedReserves([dc('2026-06', 'stash-taxes', 1000)], '')).toBe(0);
  });
});

describe('monthsElapsedInclusive', () => {
  it('counts both endpoints inclusive', () => {
    expect(monthsElapsedInclusive('2026-06', NOW)).toBe(1);  // started this month
    expect(monthsElapsedInclusive('2026-01', NOW)).toBe(6);
    expect(monthsElapsedInclusive('2025-09', NOW)).toBe(10);
  });
  it('future start month accrues nothing; garbage parses to 0', () => {
    expect(monthsElapsedInclusive('2026-07', NOW)).toBe(0);
    expect(monthsElapsedInclusive('not-a-month', NOW)).toBe(0);
  });
});

describe('computeStashStatus — commit-driven balances (2026-07-05)', () => {
  it('balance = opening + COMMITTED moves − linked-category draws', () => {
    const s = stash({ id: 's1', monthlyContribution: 1500, categories: ['taxes'], startMonth: '2026-01', openingBalance: 2000 });
    const expenses = [
      exp({ date: '2026-04-15', amount: 5000, category: 'taxes' }),
      exp({ date: '2026-03-02', amount: 100, category: 'food_dining' }), // unlinked — ignored
      exp({ date: '2025-12-30', amount: 9999, category: 'taxes' }),      // before startMonth — ignored
    ];
    // Six months of committed $1,500 moves — the money actually moved into the pot.
    const confirms = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map(m => commit(m, 's1', 1500));
    const st = computeStashStatus(s, expenses, confirms, NOW);
    expect(st.derived).toBe(true);
    expect(st.contributed).toBe(2000 + 1500 * 6); // opening + committed
    expect(st.drawn).toBe(5000);
    expect(st.balance).toBe(2000 + 9000 - 5000);
    expect(st.monthsAccrued).toBe(6);             // months funded = commits made
    expect(st.biggestDraw).toEqual({ month: '2026-04', amount: 5000 });
  });

  it('shows only the opening balance until a month is committed (no phantom accrual)', () => {
    // $500/mo planned, started 5 months ago, but NOTHING committed → balance = opening only.
    const s = stash({ id: 's1', monthlyContribution: 500, startMonth: '2026-01', openingBalance: 300 });
    const st = computeStashStatus(s, [], [], NOW);
    expect(st.balance).toBe(300);      // NOT 300 + 500*6
    expect(st.monthsAccrued).toBe(0);
  });

  it('only this stash lane counts — other lanes and investing are ignored', () => {
    const s = stash({ id: 's-taxes', monthlyContribution: 1000, startMonth: '2026-05', openingBalance: 0 });
    const confirms = [
      commit('2026-05', 's-taxes', 1000),
      commit('2026-06', 's-taxes', 1000),
      commit('2026-06', 's-other', 999),   // different stash — excluded
      commit('2026-06', 'investing', 500), // not a stash lane — excluded
    ];
    expect(computeStashStatus(s, [], confirms, NOW).balance).toBe(2000);
  });

  it('refunds in a linked category reduce the draw (netting flows through)', () => {
    const s = stash({ id: 's1', monthlyContribution: 0, categories: ['travel_personal'], startMonth: '2026-01', openingBalance: 1000 });
    const expenses = [
      exp({ date: '2026-02-10', amount: 800, category: 'travel_personal' }),
      exp({ date: '2026-02-20', amount: 300, category: 'travel_personal', flow: 'inflow', transactionType: 'refund' }),
    ];
    const st = computeStashStatus(s, expenses, [], NOW);
    expect(st.drawn).toBe(500);
    expect(st.balance).toBe(500); // opening 1000 − 500 drawn (no commits)
  });

  it('can go honestly negative when a draw outruns what was committed (design D4)', () => {
    const s = stash({ id: 's1', monthlyContribution: 100, categories: ['taxes'], startMonth: '2026-05', openingBalance: 0 });
    const confirms = [commit('2026-05', 's1', 100), commit('2026-06', 's1', 100)];
    const st = computeStashStatus(s, [exp({ date: '2026-06-01', amount: 5000, category: 'taxes' })], confirms, NOW);
    expect(st.balance).toBe(200 - 5000);
  });

  it('legacy stash without startMonth falls back to the manual balance', () => {
    const st = computeStashStatus(stash({ currentBalance: 750, targetAmount: 1000 }), [], [], NOW);
    expect(st.derived).toBe(false);
    expect(st.balance).toBe(750);
    expect(st.targetProgress).toBeCloseTo(0.75);
  });
});

describe('aggregations', () => {
  it('totalStashContributions sums every pot, categories or not', () => {
    expect(totalStashContributions([
      stash({ monthlyContribution: 1500 }), stash({ id: 's2', monthlyContribution: 1000 }), stash({ id: 's3', monthlyContribution: 250 }),
    ])).toBe(2750);
  });

  it('stashAllocationsByCategory splits a multi-category stash evenly', () => {
    const { categories, allocations } = stashAllocationsByCategory([
      stash({ monthlyContribution: 200, categories: ['home_maintenance', 'car_maintenance'] }),
      stash({ id: 's2', monthlyContribution: 1500, categories: ['taxes'] }),
    ]);
    expect(categories.sort()).toEqual(['car_maintenance', 'home_maintenance', 'taxes']);
    expect(allocations.home_maintenance).toBe(100);
    expect(allocations.taxes).toBe(1500);
  });
});

describe('lane registry wiring (design D2/D3)', () => {
  it('applyStashLaneConfig moves linked categories into the reserve lane and sets the set-aside total', () => {
    applyStashLaneConfig([
      stash({ monthlyContribution: 300, categories: ['gifts_holidays'] }),
      stash({ id: 's2', monthlyContribution: 400 }), // pure savings pot — no categories, still counts in total
    ]);
    expect(laneOf('gifts_holidays')).toBe('reserve');
    expect(laneOf('travel_work')).toBe('reserve');   // always reserve
    expect(laneOf('taxes')).toBe('flexible');        // no longer covered → leaves the reserve lane
    expect(totalReserveSetAside()).toBe(700);
  });

  it('is a no-op when no stash has categories (legacy defaults rule)', () => {
    applyStashLaneConfig([stash({ monthlyContribution: 999 })]);
    expect(laneOf('taxes')).toBe('reserve');
    expect(totalReserveSetAside()).toBe(2000);
  });
});

describe('nextDueDate — cadence anchoring', () => {
  it('custom cadence resolves the one-time targetDate', () => {
    const d = nextDueDate(stash({ cadence: 'custom', targetDate: '2026-09-18' }), NOW)!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September (0-indexed)
    expect(d.getDate()).toBe(18);
  });

  it('legacy targetDate (no cadence) still resolves', () => {
    expect(nextDueDate(stash({ targetDate: '2026-12-25' }), NOW)!.getMonth()).toBe(11);
  });

  it('annual picks this year when the month is still ahead', () => {
    const d = nextDueDate(stash({ cadence: 'annual', dueMonth: 12 }), NOW)!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
  });

  it('annual rolls to next year once the month has passed', () => {
    const d = nextDueDate(stash({ cadence: 'annual', dueMonth: 3 }), NOW)!; // Mar already gone in June
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(2);
  });

  it('semiannual takes the sooner of the month and its +6 sibling', () => {
    // dueMonth Apr → Apr 2027 is far, but Apr+6 = Oct 2026 is the next hit.
    const d = nextDueDate(stash({ cadence: 'semiannual', dueMonth: 4 }), NOW)!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9); // October
  });

  it('returns null when a recurring cadence has no month set', () => {
    expect(nextDueDate(stash({ cadence: 'annual' }), NOW)).toBeNull();
  });
});

describe('computeStashForecast — gamified ETA + pace', () => {
  const fc = (partial: Partial<Stash>) =>
    computeStashForecast(computeStashStatus(stash(partial), [], [], NOW), NOW)!;

  it('returns null with no goal set', () => {
    expect(computeStashForecast(computeStashStatus(stash({ targetAmount: 0 }), [], [], NOW), NOW)).toBeNull();
  });

  it('met when the balance covers the goal', () => {
    const f = fc({ targetAmount: 1000, currentBalance: 1200 });
    expect(f.status).toBe('met');
    expect(f.percent).toBe(100);
    expect(f.daysToFill).toBe(0);
  });

  it('projecting (no deadline) reports day-granular time to fill', () => {
    const f = fc({ targetAmount: 6000, currentBalance: 0, monthlyContribution: 500 });
    expect(f.status).toBe('projecting');
    expect(f.monthsToGo).toBe(12);
    expect(f.daysToFill).toBe(Math.round(12 * 30.44)); // 365
  });

  it('behind a custom deadline surfaces the required $/mo to make it', () => {
    const f = fc({ kind: 'want_to', targetAmount: 4000, currentBalance: 0, monthlyContribution: 200, cadence: 'custom', targetDate: '2026-09-18' });
    expect(f.status).toBe('behind');
    expect(f.dueLabel).toContain('Sep');
    expect(f.requiredPerMonth).toBeGreaterThan(200);
    expect(f.additionalNeeded).toBe(f.requiredPerMonth! - 200);
  });

  it('on_track when the balance already covers the next hit', () => {
    // Annual $3,300 goal, semiannual → next payment is ~$1,650; $3,100 saved covers it.
    const f = fc({ kind: 'have_to', targetAmount: 3300, currentBalance: 3100, monthlyContribution: 275, cadence: 'semiannual', dueMonth: 10 });
    expect(f.status).toBe('on_track');
    expect(f.kind).toBe('have_to');
    expect(f.requiredPerMonth).toBeLessThanOrEqual(275);
  });

  it('semiannual paces against the per-cycle payment, not the full-year goal', () => {
    // $3,300/yr paid twice → next hit ~$1,650, not $3,300. hitRemaining reflects the half.
    const f = fc({ kind: 'have_to', targetAmount: 3300, currentBalance: 0, monthlyContribution: 275, cadence: 'semiannual', dueMonth: 10 });
    expect(f.expectedHit).toBe(1650);
    expect(f.hitRemaining).toBe(1650);      // half the annual goal, not the full $3,300
    expect(f.remaining).toBe(3300);          // the goal bar still tracks the full year
  });
});

describe('computeShortfall — the bill outran the pot (chunk D)', () => {
  it('flags the gap + recovery time when a lumpy bill goes negative', () => {
    // Committed $100 in May + June (opening $0); a $5,000 bill in June → underwater.
    const s = stash({ id: 's1', monthlyContribution: 100, categories: ['taxes'], startMonth: '2026-05', openingBalance: 0 });
    const confirms = [commit('2026-05', 's1', 100), commit('2026-06', 's1', 100)];
    const status = computeStashStatus(s, [exp({ date: '2026-06-01', amount: 5000, category: 'taxes' })], confirms, NOW);
    const sf = computeShortfall(status)!;
    expect(sf.gap).toBe(4800);                 // 200 committed − 5000 = −4800
    expect(sf.culprit).toEqual({ month: '2026-06', amount: 5000 });
    expect(sf.recoverMonths).toBe(48);         // ceil(4800 / 100)
  });

  it('is null when the pot is healthy', () => {
    const status = computeStashStatus(stash({ monthlyContribution: 1000, categories: ['taxes'], startMonth: '2026-01', openingBalance: 0 }), [], [], NOW);
    expect(computeShortfall(status)).toBeNull();
  });

  it('recoverMonths is null with no drip to recover on', () => {
    const status = computeStashStatus(stash({ monthlyContribution: 0, categories: ['taxes'], startMonth: '2026-05', openingBalance: 0 }), [exp({ date: '2026-06-01', amount: 500, category: 'taxes' })], [], NOW);
    expect(computeShortfall(status)!.recoverMonths).toBeNull();
  });
});

describe('requiredMonthlyForGoal — auto-fill the $/mo', () => {
  it('spreads the goal over the months to a custom date (Kitchen Table $1,200 by Oct 19)', () => {
    // Jun 11 → Oct 19, 2026 = 130 days ≈ 4.27 mo → ceil(1200 / 4.27) = 281.
    expect(requiredMonthlyForGoal(stash({ targetAmount: 1200, cadence: 'custom', targetDate: '2026-10-19' }), 0, NOW)).toBe(281);
  });

  it('accounts for what is already saved', () => {
    // Only $600 of the $1,200 still to raise over the same window.
    expect(requiredMonthlyForGoal(stash({ targetAmount: 1200, cadence: 'custom', targetDate: '2026-10-19' }), 600, NOW)).toBe(141);
  });

  it('semiannual targets the per-cycle payment, not the full-year goal', () => {
    // $3,300/yr, next hit Oct 1 → raise ~$1,650 over ~3.68 mo = 449, not ~897.
    expect(requiredMonthlyForGoal(stash({ targetAmount: 3300, cadence: 'semiannual', dueMonth: 10 }), 0, NOW)).toBe(449);
  });

  it('returns null when there is nothing to compute', () => {
    expect(requiredMonthlyForGoal(stash({ targetAmount: 0, cadence: 'custom', targetDate: '2026-10-19' }), 0, NOW)).toBeNull(); // no goal
    expect(requiredMonthlyForGoal(stash({ targetAmount: 1200 }), 0, NOW)).toBeNull();                                          // no due date
    expect(requiredMonthlyForGoal(stash({ targetAmount: 1200, cadence: 'custom', targetDate: '2026-01-01' }), 0, NOW)).toBeNull(); // past due
    expect(requiredMonthlyForGoal(stash({ targetAmount: 1200, cadence: 'custom', targetDate: '2026-10-19' }), 1200, NOW)).toBeNull(); // already funded
  });
});

describe('formatDuration — the fun countdown', () => {
  it('days under a month', () => expect(formatDuration(12)).toBe('12 days'));
  it('months + days in the mid range', () => expect(formatDuration(347)).toBe('11 months, 12 days'));
  it('clean month boundary drops the days', () => expect(formatDuration(61)).toBe('2 months'));
  it('coarsens to half-years past two years', () => {
    expect(formatDuration(365 * 3)).toBe('~3 years');
    expect(formatDuration(Math.round(365.25 * 2.5))).toBe('~2.5 years');
  });
  it('zero or negative reads "now"', () => expect(formatDuration(0)).toBe('now'));
});

describe('seedDefaultStashes (design D5)', () => {
  it('adds Taxes + Trips & Travel from the legacy constants when uncovered', () => {
    const seeded = seedDefaultStashes([stash({ name: 'Emergency' })], NOW)!;
    const names = seeded.map(s => s.name);
    expect(names).toContain('Taxes');
    expect(names).toContain('Trips & Travel');
    const taxes = seeded.find(s => s.name === 'Taxes')!;
    expect(taxes.monthlyContribution).toBe(1000);
    expect(taxes.startMonth).toBe('2026-06');
    expect(taxes.openingBalance).toBe(0);
  });
  it('returns null when both are already covered', () => {
    expect(seedDefaultStashes([
      stash({ categories: ['taxes'] }), stash({ id: 's2', categories: ['travel_personal'] }),
    ], NOW)).toBeNull();
  });
  it('stashesConfigured flips on the first linked category', () => {
    expect(stashesConfigured([stash({})])).toBe(false);
    expect(stashesConfigured([stash({ categories: ['taxes'] })])).toBe(true);
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import {
  monthsElapsedInclusive, computeStashStatus, totalStashContributions,
  stashAllocationsByCategory, stashesConfigured, seedDefaultStashes, applyStashLaneConfig,
  committedReserves, nextDueDate, computeStashForecast, requiredMonthlyForGoal, computeShortfall,
  stashExistedBy, commitMonthsRemaining, computeCommitRun,
} from '../stashMath';
import { formatDuration } from '../format';
import type { DeployConfirmation, PotDraw } from '../../stores/budgetStore';
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

// An EXPLICIT withdrawal from a pot — "I paid that bill out of this". Signed:
// negative means money came back (refund / overstated draw).
function draw(month: string, potId: string, amount: number): PotDraw {
  return {
    id: `d-${potId}-${month}-${amount}`, potId, month, amount,
    date: `${month}-15`, recordedAt: `${month}-15T00:00:00Z`,
  };
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
  it('balance = opening + COMMITTED moves − EXPLICIT draws', () => {
    const s = stash({ id: 's1', monthlyContribution: 1500, categories: ['taxes'], startMonth: '2026-01', openingBalance: 2000 });
    // Six months of committed $1,500 moves — the money actually moved into the pot.
    const confirms = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map(m => commit(m, 's1', 1500));
    const potDraws = [
      draw('2026-04', 's1', 5000),
      draw('2026-04', 'other-pot', 900),  // another pot — ignored
      draw('2025-12', 's1', 9999),        // before startMonth — ignored
    ];
    const st = computeStashStatus(s, [], confirms, NOW, potDraws);
    expect(st.derived).toBe(true);
    expect(st.contributed).toBe(2000 + 1500 * 6); // opening + committed
    expect(st.drawn).toBe(5000);
    expect(st.balance).toBe(2000 + 9000 - 5000);
    expect(st.monthsAccrued).toBe(6);             // months funded = commits made
    expect(st.biggestDraw).toEqual({ month: '2026-04', amount: 5000 });
  });

  it('IGNORES spend in a linked category — draw-down is never inferred', () => {
    // The whole point of the explicit model (Scott: "we definitely don't want to
    // draw down"). A linked category classifies the reserve lane; it must not
    // move the balance. This is the regression guard for the old behaviour.
    const s = stash({ id: 's1', monthlyContribution: 0, categories: ['taxes'], startMonth: '2026-01', openingBalance: 4000 });
    const bigTaxBill = [exp({ date: '2026-04-15', amount: 5000, category: 'taxes' })];
    const st = computeStashStatus(s, bigTaxBill, [], NOW, []);
    expect(st.drawn).toBe(0);
    expect(st.balance).toBe(4000);     // untouched — no draw was recorded
    expect(st.biggestDraw).toBeNull();
  });

  it('a draw in a FUTURE month is ignored (no time travel when paging back)', () => {
    const s = stash({ id: 's1', monthlyContribution: 0, startMonth: '2026-01', openingBalance: 1000 });
    const st = computeStashStatus(s, [], [], NOW, [draw('2026-09', 's1', 400)]);
    expect(st.drawn).toBe(0);
    expect(st.balance).toBe(1000);
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

  it('a NEGATIVE draw puts money back (the refunded-bill case)', () => {
    // The old inferred model netted refunds inside the category automatically.
    // Explicit draws keep that expressible: record the payment, then record the
    // refund as a negative draw. `drawn` is the net.
    const s = stash({ id: 's1', monthlyContribution: 0, categories: ['travel_personal'], startMonth: '2026-01', openingBalance: 1000 });
    const st = computeStashStatus(s, [], [], NOW, [
      draw('2026-02', 's1', 800),
      draw('2026-02', 's1', -300),   // partially refunded
    ]);
    expect(st.drawn).toBe(500);
    expect(st.balance).toBe(500); // opening 1000 − 500 net drawn (no commits)
  });

  it('can go honestly negative when a draw outruns what was committed (design D4)', () => {
    const s = stash({ id: 's1', monthlyContribution: 100, startMonth: '2026-05', openingBalance: 0 });
    const confirms = [commit('2026-05', 's1', 100), commit('2026-06', 's1', 100)];
    const st = computeStashStatus(s, [], confirms, NOW, [draw('2026-06', 's1', 5000)]);
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

// A partial commit used to report the pot fully funded for the month: the ask was
// `committedThisMonth > 0 ? 0 : …`, a boolean where money belonged. Scott's August
// 2026 taxes pot committed $436 against a $1,082 month and read done. These cover
// the residual behaviour end to end, including the totals the UI moves money from.
describe('partial commits — the ask is a residual, not a flag', () => {
  // $12,000 by Dec 2026, nothing saved. From Jun 11 that's 7 moves (Jun–Dec).
  // `startMonth` is required: computeStashStatus only reads confirms for a
  // commit-derived pot, so without it committedThisMonth is always 0 and none of
  // this exercises the real path. (All six of Scott's live pots are derived.)
  const goal = (extra: Partial<Stash> = {}) => stash({
    id: 'pot', kind: 'want_to', targetAmount: 12000, currentBalance: 0, startMonth: '2026-01',
    monthlyContribution: 500, cadence: 'custom', targetDate: '2026-12-20', ...extra,
  });
  const forecastWith = (confirms: DeployConfirmation[]) =>
    computeStashForecast(computeStashStatus(goal(), [], confirms, NOW), NOW)!;

  it('asks for the full month target when nothing is committed', () => {
    const f = forecastWith([]);
    expect(f.commitMonthsLeft).toBe(7);
    expect(f.requiredPerMonth).toBe(Math.ceil(12000 / 7)); // 1715
    expect(f.thisMonthAsk).toBe(f.requiredPerMonth);
    expect(f.committedThisMonth).toBe(0);
  });

  it('a PARTIAL commit leaves the remainder asked for — not zero', () => {
    const f = forecastWith([commit('2026-06', 'pot', 700)]);
    expect(f.committedThisMonth).toBe(700);
    // The month's target must not shrink just because it was part-funded.
    expect(f.requiredPerMonth).toBe(Math.ceil(12000 / 7));
    expect(f.thisMonthAsk).toBe(Math.ceil(12000 / 7) - 700); // 1015, NOT 0
  });

  it('reaches zero only once the month target is actually met', () => {
    const target = Math.ceil(12000 / 7);
    expect(forecastWith([commit('2026-06', 'pot', target)]).thisMonthAsk).toBe(0);
  });

  it('clamps to zero when overcommitted, and never goes negative', () => {
    const f = forecastWith([commit('2026-06', 'pot', 5000)]);
    expect(f.thisMonthAsk).toBe(0);
    expect(f.thisMonthAsk).toBeGreaterThanOrEqual(0);
  });

  it('overpaying shrinks LATER months (the pot self-corrects)', () => {
    const plain = forecastWith([]);
    const over = forecastWith([commit('2026-06', 'pot', 5000)]);
    // Same 7 moves, but $5k of the $12k is banked → the go-forward need is lower.
    expect(over.remaining).toBe(7000);
    expect(over.remaining).toBeLessThan(plain.remaining);
  });

  it('a no-goal pot (the Savings pot) also asks for the residual drip', () => {
    const savings = stash({ id: 'sv', name: 'Savings', targetAmount: 0, monthlyContribution: 336, startMonth: '2026-01' });
    const run = computeCommitRun([savings], [], [commit('2026-06', 'sv', 100)], NOW);
    expect(run.rows[0].committed).toBe(100);
    expect(run.rows[0].ask).toBe(236);          // was 0 — reported done at $100 of $336
    expect(run.rows[0].isFullyFunded).toBe(false);
  });

  it('commit run: partial pots stay pending and are counted as part-funded', () => {
    const run = computeCommitRun([goal()], [], [commit('2026-06', 'pot', 700)], NOW);
    const [row] = run.rows;
    expect(row.isCommitted).toBe(true);          // a confirm DOES exist…
    expect(row.isFullyFunded).toBe(false);       // …but the month isn't done
    expect(run.pendingCount).toBe(1);
    expect(run.partialCount).toBe(1);
    expect(run.committedTotal).toBe(700);
    expect(run.remainingAsk).toBe(row.ask);
    // The load-bearing number: what's left to move out of checking this month.
    expect(run.committedTotal + run.remainingAsk).toBe(Math.ceil(12000 / 7));
  });

  it('commit run: a fully funded pot is not pending and not partial', () => {
    const run = computeCommitRun([goal()], [], [commit('2026-06', 'pot', Math.ceil(12000 / 7))], NOW);
    expect(run.rows[0].isFullyFunded).toBe(true);
    expect(run.pendingCount).toBe(0);
    expect(run.partialCount).toBe(0);
    expect(run.remainingAsk).toBe(0);
  });
});

describe('commitMonthsRemaining — the pacing denominator', () => {
  const jun11 = new Date(2026, 5, 11);

  it('counts this month plus every month up to the due month', () => {
    // Scott's model: "four months out and it costs $2,000 — I split it into five."
    expect(commitMonthsRemaining(new Date(2026, 9, 19), jun11)).toBe(5); // Jun–Oct
  });

  it('excludes the due month when the bill lands on the 1st', () => {
    // A move made in October can't cover a bill that hits October 1st.
    expect(commitMonthsRemaining(new Date(2026, 9, 1), jun11)).toBe(4); // Jun–Sep
  });

  it('is flat across every day of the same month', () => {
    const due = new Date(2026, 9, 19);
    const perDay = [1, 5, 11, 20, 30].map(d => commitMonthsRemaining(due, new Date(2026, 5, d)));
    expect(new Set(perDay).size).toBe(1);
  });

  it('is 1 in the due month itself, and 0 once past', () => {
    expect(commitMonthsRemaining(new Date(2026, 5, 25), jun11)).toBe(1);
    expect(commitMonthsRemaining(new Date(2026, 4, 25), jun11)).toBe(0);
  });

  it('spans a year boundary', () => {
    expect(commitMonthsRemaining(new Date(2027, 3, 9), jun11)).toBe(11); // Jun 2026 – Apr 2027
  });
});

describe('thisMonthAsk — "here is what you need to commit"', () => {
  const dc = (month: string, lane: string, amount: number): DeployConfirmation =>
    ({ month, lane, amount, confirmedAt: `${month}-05T00:00:00.000Z` });

  // Kitchen Table: $1,200 by Oct 19, tracked from June. Five moves, so $240 each.
  const table = (partial: Partial<Stash> = {}) => stash({
    id: 'stash-table', kind: 'want_to', targetAmount: 1200, cadence: 'custom',
    targetDate: '2026-10-19', monthlyContribution: 240, startMonth: '2026-06',
    openingBalance: 0, ...partial,
  });
  const ask = (confirms: DeployConfirmation[], now = NOW) =>
    computeStashForecast(computeStashStatus(table(), [], confirms, now), now)!;

  it('asks for the even split before anything is committed', () => {
    const f = ask([]);
    expect(f.commitMonthsLeft).toBe(5);
    expect(f.thisMonthAsk).toBe(240);
    expect(f.committedThisMonth).toBe(0);
  });

  it('drops to 0 once this month is committed', () => {
    const f = ask([dc('2026-06', 'stash-table', 240)]);
    expect(f.committedThisMonth).toBe(240);
    expect(f.thisMonthAsk).toBe(0);
  });

  // ⭐ Scott's rule: "if you only do 300 you're gonna have to do 400 next month,
  // but if you do 450 it should commit less for that final month."
  it('UNDERPAYING raises the remaining asks', () => {
    // June: paid $140 of the $240 ask. July has four moves left for $1,060.
    const july = new Date(2026, 6, 11);
    const f = computeStashForecast(
      computeStashStatus(table(), [], [dc('2026-06', 'stash-table', 140)], july), july)!;
    expect(f.commitMonthsLeft).toBe(4);
    expect(f.thisMonthAsk).toBe(265);   // ceil(1060 / 4) — up from 240
  });

  it('OVERPAYING lowers the remaining asks', () => {
    // June: dropped $640 (the big-check case). July has four moves for $560.
    const july = new Date(2026, 6, 11);
    const f = computeStashForecast(
      computeStashStatus(table(), [], [dc('2026-06', 'stash-table', 640)], july), july)!;
    expect(f.thisMonthAsk).toBe(140);   // ceil(560 / 4) — down from 240
  });

  it('a big enough single move retires the ask entirely', () => {
    const f = ask([dc('2026-06', 'stash-table', 1200)]);
    expect(f.status).toBe('met');
    expect(f.thisMonthAsk).toBe(0);
  });
});

// Scott: "if I want to change Scott's Office from November to February it should
// lower the cost, or if I move it forward it should increase the cost." The date
// IS the dial — moving it is how you choose the payment size.
describe('moving the target date re-prices the monthly ask', () => {
  const office = (targetDate: string) => stash({
    id: 'stash-office', kind: 'want_to', targetAmount: 2000, cadence: 'custom',
    targetDate, monthlyContribution: 371, startMonth: '2026-07', openingBalance: 0,
  });
  const confirms: DeployConfirmation[] = [
    { month: '2026-07', lane: 'stash-office', amount: 371, confirmedAt: '2026-07-05T00:00:00.000Z' },
  ];
  const aug12 = new Date(2026, 7, 12);
  const askFor = (targetDate: string) =>
    computeStashForecast(computeStashStatus(office(targetDate), [], confirms, aug12), aug12)!;

  it('pushing the date OUT lowers the ask', () => {
    const nov = askFor('2026-11-19');
    const feb = askFor('2027-02-19');
    expect(nov.commitMonthsLeft).toBe(4);   // Aug–Nov
    expect(nov.thisMonthAsk).toBe(408);     // ceil(1629 / 4)
    expect(feb.commitMonthsLeft).toBe(7);   // Aug–Feb
    expect(feb.thisMonthAsk).toBe(233);     // ceil(1629 / 7)
    expect(feb.thisMonthAsk).toBeLessThan(nov.thisMonthAsk);
  });

  it('pulling the date IN raises the ask', () => {
    const sep = askFor('2026-09-19');
    expect(sep.commitMonthsLeft).toBe(2);   // Aug, Sep
    expect(sep.thisMonthAsk).toBe(815);     // ceil(1629 / 2)
    expect(sep.thisMonthAsk).toBeGreaterThan(askFor('2026-11-19').thisMonthAsk);
  });

  it('the auto-fill agrees with the displayed ask', () => {
    // updateAuto() writes requiredMonthlyForGoal into the drip when the date
    // changes; it must not disagree with the number on the card.
    const feb = askFor('2027-02-19');
    expect(requiredMonthlyForGoal(office('2027-02-19'), 371, aug12)).toBe(feb.thisMonthAsk);
  });
});

describe('have-tos started mid-cycle (Insurance, Jul start / Nov 1 hit)', () => {
  // $3,300/yr paid twice = $1,650 per hit, next Nov 1. Tracking began July, so
  // the first cycle only gets Jul–Oct instead of a full six months.
  const insurance = stash({
    id: 'stash-ins', kind: 'have_to', targetAmount: 3300, cadence: 'semiannual',
    dueMonth: 5, monthlyContribution: 350, startMonth: '2026-07', openingBalance: 0,
  });
  const aug12 = new Date(2026, 7, 12);
  const confirms: DeployConfirmation[] = [
    { month: '2026-07', lane: 'stash-ins', amount: 350, confirmedAt: '2026-07-05T00:00:00.000Z' },
  ];
  const f = computeStashForecast(computeStashStatus(insurance, [], confirms, aug12), aug12)!;

  it('resolves the sooner semiannual anchor', () => {
    expect(f.dueLabel).toContain('Nov 1, 2026');
  });

  it('reports the steady state separately from the compressed first cycle', () => {
    expect(f.steadyStatePerMonth).toBe(275);   // $3,300 / 12
    expect(f.firstCycleCompressed).toBe(true); // only 4 moves available, not 6
  });

  it('asks for the catch-up rate over the three moves left', () => {
    expect(f.commitMonthsLeft).toBe(3);        // Aug, Sep, Oct
    expect(f.committedThisMonth).toBe(0);      // August not committed yet
    expect(f.thisMonthAsk).toBe(434);          // ceil((1650 − 350) / 3)
  });

  it('is not flagged compressed once a full cycle is available', () => {
    // Same pot, but tracking started a full six months before the hit.
    const early = computeStashForecast(
      computeStashStatus(stash({ ...insurance, startMonth: '2026-05' }), [], [], aug12), aug12)!;
    expect(early.firstCycleCompressed).toBe(false);
    expect(early.steadyStatePerMonth).toBe(275);
  });
});

describe('computeShortfall — the bill outran the pot (chunk D)', () => {
  it('flags the gap + recovery time when a lumpy bill goes negative', () => {
    // Committed $100 in May + June (opening $0); a $5,000 bill in June → underwater.
    const s = stash({ id: 's1', monthlyContribution: 100, startMonth: '2026-05', openingBalance: 0 });
    const confirms = [commit('2026-05', 's1', 100), commit('2026-06', 's1', 100)];
    const status = computeStashStatus(s, [], confirms, NOW, [draw('2026-06', 's1', 5000)]);
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
    const status = computeStashStatus(stash({ id: 's1', monthlyContribution: 0, startMonth: '2026-05', openingBalance: 0 }), [], [], NOW, [draw('2026-06', 's1', 500)]);
    expect(computeShortfall(status)!.recoverMonths).toBeNull();
  });
});

describe('requiredMonthlyForGoal — auto-fill the $/mo', () => {
  it('splits the goal across the MOVES left, not fractional calendar time', () => {
    // Jun 11 → Oct 19, 2026. You get five moves: Jun, Jul, Aug, Sep, Oct (the
    // 19th is after the 1st, so October's move still lands in time).
    // ceil(1200 / 5) = 240. The old fractional math said 281 — see
    // commitMonthsRemaining for why that was wrong.
    expect(requiredMonthlyForGoal(stash({ targetAmount: 1200, cadence: 'custom', targetDate: '2026-10-19' }), 0, NOW)).toBe(240);
  });

  it('accounts for what is already saved', () => {
    // Only $600 of the $1,200 still to raise over the same five moves.
    expect(requiredMonthlyForGoal(stash({ targetAmount: 1200, cadence: 'custom', targetDate: '2026-10-19' }), 600, NOW)).toBe(120);
  });

  it('semiannual targets the per-cycle payment, not the full-year goal', () => {
    // $3,300/yr, next hit Oct 1. A bill due on the 1st can't be helped by that
    // month's move → four moves (Jun–Sep) for the $1,650 cycle = 413, not ~825.
    expect(requiredMonthlyForGoal(stash({ targetAmount: 3300, cadence: 'semiannual', dueMonth: 10 }), 0, NOW)).toBe(413);
  });

  // ⭐ THE REGRESSION. The bug: the denominator was `daysToDue / 30.44`, which
  // shrinks every day while the balance only moves once a month — so a drip set
  // to exactly hit the goal read "behind" the next morning and the required
  // climbed daily. Counting MOVES makes it flat inside a month.
  it('does NOT drift day to day inside the same month', () => {
    const s = stash({ targetAmount: 1200, cadence: 'custom', targetDate: '2026-10-19' });
    const onThe1st = requiredMonthlyForGoal(s, 0, new Date(2026, 5, 1));
    const onThe11th = requiredMonthlyForGoal(s, 0, new Date(2026, 5, 11));
    const onThe30th = requiredMonthlyForGoal(s, 0, new Date(2026, 5, 30));
    expect(onThe1st).toBe(240);
    expect(onThe11th).toBe(240);
    expect(onThe30th).toBe(240);
  });

  it('steps up exactly once when the month turns', () => {
    const s = stash({ targetAmount: 1200, cadence: 'custom', targetDate: '2026-10-19' });
    // July: four moves left (Jul–Oct) instead of five → 300.
    expect(requiredMonthlyForGoal(s, 0, new Date(2026, 6, 1))).toBe(300);
    expect(requiredMonthlyForGoal(s, 0, new Date(2026, 6, 28))).toBe(300);
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

describe('paging back a month never shows future money', () => {
  // Found 2026-08-19: draws were capped at the viewed month but commits were not,
  // so viewing July could read as funded off an AUGUST commit.
  const s = stash({ id: 'taxes', name: 'Taxes', startMonth: '2026-06', targetAmount: 12000, monthlyContribution: 1000 });
  const confirms = [commit('2026-06', 'taxes', 1000), commit('2026-07', 'taxes', 1000), commit('2026-08', 'taxes', 5000)];
  const JULY = new Date(2026, 6, 15);
  const AUG = new Date(2026, 7, 15);

  it('a July view counts June + July only', () => {
    const st = computeStashStatus(s, [], confirms, JULY, []);
    expect(st.balance).toBe(2000);
    expect(st.monthsAccrued).toBe(2);
    expect(st.committedThisMonth).toBe(1000);
  });

  it('the August view counts all three', () => {
    const st = computeStashStatus(s, [], confirms, AUG, []);
    expect(st.balance).toBe(7000);
    expect(st.monthsAccrued).toBe(3);
    expect(st.committedThisMonth).toBe(5000);
  });

  it('a July draw is not judged against August money', () => {
    const draws = [draw('2026-07', 'taxes', 1800)];
    // July: $2,000 in, $1,800 out → $200. With the August commit leaking in it
    // read $7,000 − $1,800 = $5,200 while looking at July.
    expect(computeStashStatus(s, [], confirms, JULY, draws).balance).toBe(200);
  });

  it('the commit run for a past month totals that month only', () => {
    const run = computeCommitRun([s], [], confirms, JULY, []);
    expect(run.committedTotal).toBe(1000);
  });
});

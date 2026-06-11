import { describe, it, expect } from 'vitest';
import { computeGuaranteedBase, computeScorecard } from '../savingsScorecard';
import { currentMonthKey } from '../transactionAnalysis';
import { exp } from './fixtures';
import type { Expense } from '../../types/budget';

function paycheck(date: string, amount: number): Expense {
  return exp({ date, amount, flow: 'inflow', transactionType: 'income' });
}

// NOTE: computeScorecard's `partial` check uses the REAL current date, so full
// months use 2020 dates (complete forever) with an explicit `since: '2020-01'`
// (the default since is '2025-09', which would drop 2020 data entirely).

describe('computeGuaranteedBase', () => {
  it('modal paycheck x observed pay periods per month (twice-monthly $7,900 -> $15,800)', () => {
    const base = computeGuaranteedBase([
      paycheck('2020-01-01', 7900), paycheck('2020-01-15', 7900),
      paycheck('2020-02-01', 7900), paycheck('2020-02-15', 7900),
      paycheck('2020-03-01', 7900), paycheck('2020-03-15', 15000), // one variable spike — not the mode
    ]);
    expect(base).toBe(15800);
  });

  it('rounds paychecks to $50 buckets so penny variance does not fragment the mode', () => {
    const base = computeGuaranteedBase([
      paycheck('2020-01-01', 7917), paycheck('2020-01-15', 7901),
      paycheck('2020-02-01', 7899), paycheck('2020-02-15', 7920),
    ]);
    expect(base).toBe(15800); // all bucket to 7900 x 2 periods/month
  });

  it('returns 0 with no income transactions', () => {
    expect(computeGuaranteedBase([])).toBe(0);
    expect(computeGuaranteedBase([exp({ date: '2020-01-05', amount: 100 })])).toBe(0);
  });

  it("only transactionType==='income' inflows count — reimbursements are excluded", () => {
    const base = computeGuaranteedBase([
      paycheck('2020-01-01', 5000), paycheck('2020-01-15', 5000),
      exp({ date: '2020-01-08', amount: 9000, flow: 'inflow', transactionType: 'reimbursement' }),
      exp({ date: '2020-01-09', amount: 9000, flow: 'inflow', transactionType: 'reimbursement' }),
      exp({ date: '2020-01-10', amount: 9000, flow: 'inflow', transactionType: 'reimbursement' }),
    ]);
    expect(base).toBe(10000); // modal 5000 x 2 — the three 9000 reimbursements never enter
  });
});

describe('computeScorecard', () => {
  // Base = 15,800 (7,900 modal x 2/month). Three full months + one zero-income
  // month + the real in-progress month.
  const fixture: Expense[] = [
    // January 2020 — income 15,800, operating spend 10,000
    paycheck('2020-01-01', 7900), paycheck('2020-01-15', 7900),
    exp({ date: '2020-01-10', amount: 10000, category: 'food_dining' }),
    // February 2020 — income 15,800, operating 12,000 + a 13,000 tax payment (reserve)
    paycheck('2020-02-01', 7900), paycheck('2020-02-15', 7900),
    exp({ date: '2020-02-10', amount: 12000, category: 'food_dining' }),
    exp({ date: '2020-02-20', amount: 13000, category: 'taxes' }),
    // March 2020 — income 15,800, operating 11,000
    paycheck('2020-03-01', 7900), paycheck('2020-03-15', 7900),
    exp({ date: '2020-03-10', amount: 11000, category: 'food_dining' }),
    // April 2020 — spend but ZERO income → partial (data-edge guard)
    exp({ date: '2020-04-10', amount: 500, category: 'food_dining' }),
    // Real in-progress month → partial by calendar
    paycheck(`${currentMonthKey()}-05`, 7900),
    exp({ date: `${currentMonthKey()}-06`, amount: 1000, category: 'food_dining' }),
  ];
  const card = computeScorecard(fixture, { since: '2020-01' });

  it('derives the guaranteed base and sorts months ascending', () => {
    expect(card.guaranteedBase).toBe(15800);
    const keys = card.months.map(m => m.month);
    expect(keys).toEqual([...keys].sort());
    expect(keys.slice(0, 4)).toEqual(['2020-01', '2020-02', '2020-03', '2020-04']);
  });

  it('spend = OPERATING only: a big tax month stays green vs base while banked drops', () => {
    const feb = card.months.find(m => m.month === '2020-02')!;
    expect(feb.spend).toBe(12000);          // taxes NOT in the discipline number
    expect(feb.reserveSpend).toBe(13000);
    expect(feb.surplusVsBase).toBe(3800);   // 15800 - 12000 → still under the guarantee
    expect(feb.banked).toBe(-9200);         // 15800 - 25000 → cash-honest
  });

  it('flags the current calendar month AND zero-income months as partial', () => {
    const apr = card.months.find(m => m.month === '2020-04')!;
    expect(apr.partial).toBe(true); // zero income
    const cur = card.months.find(m => m.month === currentMonthKey())!;
    expect(cur.partial).toBe(true); // in-progress calendar month
    expect(card.fullMonthCount).toBe(3);
  });

  it('cumulativeBanked sums FULL months only', () => {
    // Jan +5800, Feb -9200, Mar +4800 — partial months never count
    expect(card.cumulativeBanked).toBe(1400);
  });

  it('counts months that lived under the base', () => {
    expect(card.monthsUnderBase).toBe(3); // 5800, 3800, 4800 all >= 0
  });

  it("trend 'better' when the last full month spent less than the prior", () => {
    expect(card.lastFull!.month).toBe('2020-03');
    expect(card.priorFull!.month).toBe('2020-02');
    expect(card.trend).toBe('better'); // 11000 < 12000
  });

  it("trend 'worse' when the last full month spent more", () => {
    const worse = computeScorecard(
      [
        paycheck('2020-01-01', 5000), exp({ date: '2020-01-10', amount: 2000, category: 'food_dining' }),
        paycheck('2020-02-01', 5000), exp({ date: '2020-02-10', amount: 4000, category: 'food_dining' }),
      ],
      { since: '2020-01' },
    );
    expect(worse.trend).toBe('worse');
  });

  it("trend 'unknown' with fewer than two full months", () => {
    const single = computeScorecard(
      [paycheck('2020-01-01', 5000), exp({ date: '2020-01-10', amount: 100, category: 'food_dining' })],
      { since: '2020-01' },
    );
    expect(single.trend).toBe('unknown');
  });

  it('drops months before `since`', () => {
    const card2 = computeScorecard(
      [
        paycheck('2019-12-01', 5000),
        paycheck('2020-01-01', 5000), exp({ date: '2020-01-10', amount: 100, category: 'food_dining' }),
      ],
      { since: '2020-01' },
    );
    expect(card2.months.map(m => m.month)).toEqual(['2020-01']);
  });
});

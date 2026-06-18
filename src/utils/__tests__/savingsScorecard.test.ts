import { describe, it, expect } from 'vitest';
import { computeGuaranteedBase, computeScorecard, computeRecurringPaycheckFloor } from '../savingsScorecard';
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

  it('counts EVERYTHING: a big tax/travel month shows OVER base (red)', () => {
    const feb = card.months.find(m => m.month === '2020-02')!;
    expect(feb.spend).toBe(12000);          // everyday portion
    expect(feb.reserveSpend).toBe(13000);   // lumpy taxes — now COUNTED
    expect(feb.totalSpend).toBe(25000);     // everyday + lumpy
    expect(feb.surplusVsBase).toBe(-9200);  // 15800 - 25000 → over base by 9,200
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

  it('counts months whose TOTAL spend came in under base', () => {
    // Jan total 10000 (+5800), Feb total 25000 (-9200 — the tax month), Mar 11000 (+4800)
    expect(card.monthsUnderBase).toBe(2);
  });

  it("trend 'better' when the last full month's total spend was less than the prior", () => {
    expect(card.lastFull!.month).toBe('2020-03');
    expect(card.priorFull!.month).toBe('2020-02');
    expect(card.trend).toBe('better'); // Mar total 11000 < Feb total 25000
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

  it('totalSpend = everyday + reserve; a lumpy month counts fully against base', () => {
    const jan = card.months.find(m => m.month === '2020-01')!;
    expect(jan.totalSpend).toBe(10000);     // no reserve
    expect(jan.surplusVsBase).toBe(5800);   // 15800 - 10000 → under base
    const feb = card.months.find(m => m.month === '2020-02')!;
    expect(feb.totalSpend).toBe(25000);     // 12000 everyday + 13000 taxes
    expect(feb.surplusVsBase).toBe(-9200);  // over base by 9,200
  });
});

describe('computeScorecard — solvency summary', () => {
  const fixture: Expense[] = [
    paycheck('2020-01-01', 7900), paycheck('2020-01-15', 7900),
    exp({ date: '2020-01-10', amount: 10000, category: 'food_dining' }),
    paycheck('2020-02-01', 7900), paycheck('2020-02-15', 7900),
    exp({ date: '2020-02-10', amount: 12000, category: 'food_dining' }),
    exp({ date: '2020-02-20', amount: 13000, category: 'taxes' }),
    paycheck('2020-03-01', 7900), paycheck('2020-03-15', 7900),
    exp({ date: '2020-03-10', amount: 11000, category: 'food_dining' }),
  ];

  it('averages everyday + reserve over full months for the full-life cost', () => {
    const c = computeScorecard(fixture, { since: '2020-01' });
    expect(c.solvency.base).toBe(15800);
    expect(c.solvency.avgEveryday).toBe(11000);    // (10000+12000+11000)/3
    expect(c.solvency.avgReserve).toBe(4333);       // (0+13000+0)/3 rounded
    expect(c.solvency.avgTotalSpend).toBe(15333);   // 11000 + 4333
    expect(c.solvency.variableLean).toBe(0);        // 15333 <= 15800
  });

  it('surfaces a variable lean when the full life costs more than base', () => {
    const lean = computeScorecard(
      [
        paycheck('2020-01-01', 5000), exp({ date: '2020-01-10', amount: 4000, category: 'food_dining' }),
        exp({ date: '2020-01-20', amount: 3000, category: 'taxes' }),
        paycheck('2020-02-01', 5000), exp({ date: '2020-02-10', amount: 4000, category: 'food_dining' }),
        exp({ date: '2020-02-20', amount: 3000, category: 'taxes' }),
      ],
      { since: '2020-01' },
    );
    expect(lean.solvency.base).toBe(5000);
    expect(lean.solvency.avgTotalSpend).toBe(7000);  // 4000 everyday + 3000 lumpy
    expect(lean.solvency.variableLean).toBe(2000);   // 7000 - 5000
  });
});

describe('computeRecurringPaycheckFloor', () => {
  it('returns the modal per-paycheck amount (NOT multiplied by pay periods)', () => {
    const floor = computeRecurringPaycheckFloor([
      paycheck('2020-01-01', 7900), paycheck('2020-01-15', 7900),
      paycheck('2020-02-01', 7900), paycheck('2020-02-15', 22000), // variable spike — not the mode
    ]);
    expect(floor).toBe(7900);
  });

  it('returns 0 with no income transactions', () => {
    expect(computeRecurringPaycheckFloor([])).toBe(0);
  });
});

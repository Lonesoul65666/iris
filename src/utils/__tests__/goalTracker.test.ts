import { describe, it, expect } from 'vitest';
import { computeGoalData } from '../../components/Dashboard/GoalTracker';
import { computeStashStatus, computeStashForecast } from '../stashMath';
import type { DeployConfirmation } from '../../stores/budgetStore';
import type { Stash } from '../../types/budget';

// GoalTracker was a THIRD pacing surface (2026-08-19 audit): its own months-until
// math, its own on-track test, and a `new Date('YYYY-MM-DD')` UTC parse — all
// under the same section title as the Budget page. These tests exist to keep the
// card DERIVED. If someone reintroduces local math here, they fail.

const NOW = new Date(2026, 7, 20); // Aug 20, 2026 (local)

function stash(partial: Partial<Stash>): Stash {
  return {
    id: partial.id ?? 'trip', name: partial.name ?? 'Italy', targetAmount: partial.targetAmount ?? 0,
    currentBalance: 0, monthlyContribution: partial.monthlyContribution ?? 0,
    color: '#a855f7', ...partial,
  };
}

function commit(month: string, lane: string, amount: number): DeployConfirmation {
  return { month, lane, amount, confirmedAt: `${month}-01T00:00:00Z` };
}

const statusOf = (s: Stash, confirms: DeployConfirmation[] = []) =>
  computeStashStatus(s, confirms, NOW, []);

describe('GoalTracker card data', () => {
  it('reads status, percent and the ask straight off computeStashForecast', () => {
    const s = stash({ targetAmount: 4000, monthlyContribution: 500, cadence: 'custom', targetDate: '2026-12-15', startMonth: '2026-06' });
    const st = statusOf(s, [commit('2026-06', 'trip', 500), commit('2026-07', 'trip', 500)]);
    const f = computeStashForecast(st, NOW)!;
    const card = computeGoalData(st, NOW);
    expect(card.percent).toBe(f.percent);
    expect(card.thisMonthAsk).toBe(f.thisMonthAsk);
    expect(card.currentBalance).toBe(st.balance);   // derived, not stash.currentBalance
    // $3,000 still needed over the 5 moves left (Aug–Dec) is $600/mo, so a $500
    // drip is behind — and the card quotes the forecast's own top-up figure.
    expect(f.status).toBe('behind');
    expect(card.statusLabel).toBe(`Behind — need $${f.additionalNeeded!.toLocaleString()}/mo more`);
  });

  it('does not lose a month on a 1st-of-month deadline (the old UTC parse did)', () => {
    // `new Date('2026-12-01')` is UTC midnight = Nov 30 at -06:00, so the old code
    // labelled this pot Nov 2026 and paced against one month fewer than it had.
    const s = stash({ targetAmount: 1200, monthlyContribution: 300, cadence: 'custom', targetDate: '2026-12-01', startMonth: '2026-08' });
    const card = computeGoalData(statusOf(s), NOW);
    expect(card.dueLabel).toBe('Dec 1, 2026');
  });

  it('says "on track" when the drip covers the paced ask, and agrees with the forecast', () => {
    // $1,200 by Dec 1 from Aug 20: Dec can't be funded by its own 1st, so the
    // moves left are Aug–Nov = 4 → $300/mo is exactly on plan.
    const s = stash({ targetAmount: 1200, monthlyContribution: 300, cadence: 'custom', targetDate: '2026-12-01', startMonth: '2026-08' });
    const st = statusOf(s);
    expect(computeStashForecast(st, NOW)!.status).toBe('on_track');
    expect(computeGoalData(st, NOW).statusLabel).toBe('On track');
  });

  it('flags behind with the forecast’s own top-up figure', () => {
    const s = stash({ targetAmount: 1200, monthlyContribution: 100, cadence: 'custom', targetDate: '2026-12-01', startMonth: '2026-08' });
    const st = statusOf(s);
    const f = computeStashForecast(st, NOW)!;
    expect(f.status).toBe('behind');
    expect(computeGoalData(st, NOW).statusLabel).toContain(`$${f.additionalNeeded!.toLocaleString()}`);
  });

  it('a pot with a date but no target amount says so instead of showing 0%', () => {
    const s = stash({ targetAmount: 0, cadence: 'custom', targetDate: '2026-12-01', startMonth: '2026-08' });
    const card = computeGoalData(statusOf(s), NOW);
    expect(computeStashForecast(statusOf(s), NOW)).toBeNull();
    expect(card.statusLabel).toBe('No target set');
  });

  it('reports Complete off the DERIVED balance, not the stored one', () => {
    const s = stash({ targetAmount: 1000, monthlyContribution: 250, startMonth: '2026-06', cadence: 'custom', targetDate: '2026-12-01' });
    const st = statusOf(s, [commit('2026-06', 'trip', 600), commit('2026-07', 'trip', 500)]);
    const card = computeGoalData(st, NOW);
    expect(card.currentBalance).toBe(1100);
    expect(card.statusLabel).toBe('Complete');
    expect(card.thisMonthAsk).toBe(0);
  });
});

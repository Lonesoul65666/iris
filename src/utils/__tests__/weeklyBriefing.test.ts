import { describe, it, expect } from 'vitest';
import type { Insight, InsightSeverity, InsightCategory } from '../insightsEngine';
import {
  weekKeyOf,
  selectBriefingInsights,
  resolveWeeklyBriefing,
  insightToBriefingNudge,
  sectionFromBriefingId,
  insightIdFromBriefingId,
} from '../weeklyBriefing';

function ins(
  id: string,
  severity: InsightSeverity,
  category: InsightCategory = 'spending',
): Insight {
  return { id, severity, category, title: `t-${id}`, description: `d-${id}` };
}

describe('weekKeyOf', () => {
  it('anchors to Monday; every day of one week shares a key', () => {
    // Mon 2026-07-06 … Sun 2026-07-12 all map to 2026-07-06.
    const days = [6, 7, 8, 9, 10, 11, 12].map((d) => weekKeyOf(new Date(2026, 6, d)));
    expect(new Set(days).size).toBe(1);
    expect(days[0]).toBe('2026-07-06');
  });

  it('rolls to the next Monday key', () => {
    expect(weekKeyOf(new Date(2026, 6, 13))).toBe('2026-07-13');
  });
});

describe('selectBriefingInsights', () => {
  it('drops pure praise and sorts by severity', () => {
    const chosen = selectBriefingInsights([
      ins('good', 'positive'),
      ins('warn', 'warning'),
      ins('crit', 'critical'),
    ]);
    expect(chosen.map((i) => i.id)).toEqual(['crit', 'warn']);
  });

  it('defaults to 2 when the 3rd is only low-severity info', () => {
    const chosen = selectBriefingInsights([
      ins('crit', 'critical'),
      ins('warn', 'warning'),
      ins('info', 'info'),
    ]);
    expect(chosen.map((i) => i.id)).toEqual(['crit', 'warn']);
  });

  it('surfaces a 3rd only when it is high-severity (a real need)', () => {
    const chosen = selectBriefingInsights([
      ins('c1', 'critical'),
      ins('c2', 'critical'),
      ins('w1', 'warning'),
      ins('w2', 'warning'),
    ]);
    expect(chosen.map((i) => i.id)).toEqual(['c1', 'c2', 'w1']); // hard cap 3
  });

  it('returns everything when fewer than the default', () => {
    expect(selectBriefingInsights([ins('only', 'warning')]).map((i) => i.id)).toEqual(['only']);
    expect(selectBriefingInsights([]).length).toBe(0);
  });
});

describe('resolveWeeklyBriefing', () => {
  const pool = [ins('a', 'critical'), ins('b', 'warning'), ins('c', 'info')];

  it('freezes a fresh selection on a new week and asks to persist', () => {
    const r = resolveWeeklyBriefing(pool, null, '2026-07-06');
    expect(r.insights.map((i) => i.id)).toEqual(['a', 'b']);
    expect(r.frozen).toEqual({ weekKey: '2026-07-06', ids: ['a', 'b'] });
    expect(r.changed).toBe(true);
  });

  it('keeps the frozen set stable within the same week (no churn)', () => {
    const stored = { weekKey: '2026-07-06', ids: ['a', 'b'] };
    // A new higher-severity insight appears mid-week — the frozen list ignores it.
    const withNew = [...pool, ins('z', 'critical')];
    const r = resolveWeeklyBriefing(withNew, stored, '2026-07-06');
    expect(r.insights.map((i) => i.id)).toEqual(['a', 'b']);
    expect(r.changed).toBe(false);
  });

  it('drops an item the user resolved and re-persists the trimmed set', () => {
    const stored = { weekKey: '2026-07-06', ids: ['a', 'b'] };
    const resolvedAway = [ins('b', 'warning')]; // 'a' no longer in the live pool
    const r = resolveWeeklyBriefing(resolvedAway, stored, '2026-07-06');
    expect(r.insights.map((i) => i.id)).toEqual(['b']);
    expect(r.frozen).toEqual({ weekKey: '2026-07-06', ids: ['b'] });
    expect(r.changed).toBe(true);
  });

  it('hides a dismissed item this week but keeps it in the freeze record', () => {
    const stored = { weekKey: '2026-07-06', ids: ['a', 'b'], dismissed: ['a'] };
    const r = resolveWeeklyBriefing(pool, stored, '2026-07-06');
    expect(r.insights.map((i) => i.id)).toEqual(['b']); // 'a' hidden
    expect(r.frozen).toEqual({ weekKey: '2026-07-06', ids: ['a', 'b'], dismissed: ['a'] });
    expect(r.changed).toBe(false);
  });

  it('clears a dismissal on a new week (item can return)', () => {
    const stored = { weekKey: '2026-07-06', ids: ['a', 'b'], dismissed: ['a'] };
    const r = resolveWeeklyBriefing(pool, stored, '2026-07-13');
    expect(r.frozen?.dismissed).toBeUndefined();
    expect(r.insights.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('drops a dismissed id from the record once the condition is resolved', () => {
    const stored = { weekKey: '2026-07-06', ids: ['a', 'b'], dismissed: ['a'] };
    const onlyB = [ins('b', 'warning')]; // 'a' resolved → out of the pool
    const r = resolveWeeklyBriefing(onlyB, stored, '2026-07-06');
    expect(r.frozen).toEqual({ weekKey: '2026-07-06', ids: ['b'] }); // no dismissed key
    expect(r.changed).toBe(true);
  });

  it('regenerates when the week rolls over', () => {
    const stored = { weekKey: '2026-07-06', ids: ['a', 'b'] };
    const r = resolveWeeklyBriefing(pool, stored, '2026-07-13');
    expect(r.frozen?.weekKey).toBe('2026-07-13');
    expect(r.changed).toBe(true);
  });

  it('clears to null when the pool is empty', () => {
    const r = resolveWeeklyBriefing([], { weekKey: '2026-07-06', ids: ['a'] }, '2026-07-06');
    expect(r.insights).toEqual([]);
    expect(r.frozen).toBeNull();
    expect(r.changed).toBe(true);
  });
});

describe('insightToBriefingNudge', () => {
  it('encodes the deep-link section in the id and maps severity', () => {
    const n = insightToBriefingNudge(ins('overbudget-dining', 'critical', 'spending'));
    expect(n.id).toBe('briefing:expenses:overbudget-dining');
    expect(n.severity).toBe('critical');
    expect(n.category).toBe('budget');
    expect(n.primary?.view).toBe('budget');
    expect(sectionFromBriefingId(n.id)).toBe('expenses');
  });

  it('routes surplus/saving to the overview tab', () => {
    const n = insightToBriefingNudge(ins('surplus', 'info', 'saving'));
    expect(sectionFromBriefingId(n.id)).toBe('overview');
  });

  it('sectionFromBriefingId returns null on a non-briefing id', () => {
    expect(sectionFromBriefingId('achievement:foo')).toBeNull();
  });

  it('insightIdFromBriefingId recovers the underlying insight id', () => {
    expect(insightIdFromBriefingId('briefing:expenses:overbudget-amazon')).toBe('overbudget-amazon');
    expect(insightIdFromBriefingId('achievement:foo')).toBeNull();
  });
});

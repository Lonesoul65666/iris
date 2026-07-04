import { useMemo } from 'react';
import { useAppData, formatCurrency } from '../../context/AppDataContext';
import {
  ACCOUNT_ORDER, accountMeta,
  categoryEmoji, formatRelDate, monthKey, monthLabel,
} from '../../utils/txDisplay';

// How many recent transactions to list per account.
const RECENT_PER_ACCOUNT = 4;

interface AccountStat {
  source: string;
  cycleTotal: number; // spend in the current cycle (latest month with data)
  cycleCount: number; // # charges in the cycle
  recent: RawTx[]; // most recent transactions overall (latest charges)
}

interface RawTx {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
  source?: string;
  flow?: string;
  transactionType?: string;
  isWorkExpense?: boolean;
}

/**
 * "Spend by account" — delineates spend across the connected accounts so Scott
 * can see which card is used where and where the latest charges landed. Per
 * account: total spend this cycle + the most recent N transactions.
 *
 * Scope notes:
 *   • Only outflow expenses count (transfers / income / investments excluded).
 *   • "This cycle" = the latest calendar month that has data (month-to-date for
 *     the current month). The recent list is latest-overall, so the freshest
 *     charges always show even at the very start of a cycle.
 *   • Work spend IS included — the goal is "what hit this card", not personal
 *     budget. Work charges get a 💼 marker.
 */
export default function AccountBreakdown() {
  const { rawExpenses, accounts, setView } = useAppData();

  // Current balances (as of last sync), keyed by the expense `source`. Synced
  // accounts use id `teller-<source>`, so strip the prefix to join. Only the
  // BoA bank accounts sync a balance today; credit cards import transactions
  // but no balance, so they simply won't have one here.
  const balanceBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of accounts || []) {
      if (a.status === 'closed') continue;
      m.set(a.id.replace(/^teller-/, ''), a.totalValue);
    }
    return m;
  }, [accounts]);

  const { stats, cycle, cycleTotalAll } = useMemo(() => {
    const outflows: RawTx[] = (rawExpenses || []).filter(
      (e: RawTx) => (e.flow || 'outflow') === 'outflow' && (e.transactionType || 'expense') === 'expense',
    );
    if (outflows.length === 0) return { stats: [] as AccountStat[], cycle: '', cycleTotalAll: 0 };

    // Current cycle = latest YYYY-MM present in the data.
    let cycle = '';
    for (const e of outflows) {
      const ym = monthKey(e.date);
      if (ym && ym > cycle) cycle = ym;
    }

    // Group by source.
    const bySource = new Map<string, RawTx[]>();
    for (const e of outflows) {
      const src = e.source || 'unknown';
      if (!bySource.has(src)) bySource.set(src, []);
      bySource.get(src)!.push(e);
    }

    // Order: the 5 known accounts first (even if empty, so all are accounted
    // for), then any stray legacy sources that actually carry data.
    const extras = [...bySource.keys()].filter(s => !ACCOUNT_ORDER.includes(s)).sort();
    const ordered = [...ACCOUNT_ORDER, ...extras];

    const stats: AccountStat[] = ordered.map(source => {
      const txns = bySource.get(source) || [];
      const inCycle = txns.filter(t => monthKey(t.date) === cycle);
      const recent = [...txns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_PER_ACCOUNT);
      return {
        source,
        cycleTotal: inCycle.reduce((s, t) => s + Math.abs(t.amount), 0),
        cycleCount: inCycle.length,
        recent,
      };
    });

    const cycleTotalAll = stats.reduce((s, a) => s + a.cycleTotal, 0);
    return { stats, cycle, cycleTotalAll };
  }, [rawExpenses]);

  if (stats.length === 0) return null;

  const activeAccounts = stats.filter(s => s.recent.length > 0).length;

  return (
    <div className="glass-card p-6 relative overflow-hidden group">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Header — matches the "Have To's / Want To's" section for continuity:
          bold text-lg title, muted subtitle, accent (violet) link. */}
      <div className="flex items-start justify-between mb-5">
        <div className="min-w-0">
          <h2 className="text-text-primary text-lg font-semibold">Spend by account</h2>
          <p className="text-xs text-text-muted mt-0.5">
            <span className="mono-num text-text-secondary font-semibold">{formatCurrency(cycleTotalAll)}</span>
            {' · '}{cycle ? monthLabel(cycle) : ''} · {activeAccounts} active
          </p>
        </div>
        <button
          onClick={() => setView('budget')}
          className="text-xs font-medium text-accent hover:text-accent-light transition-colors flex-shrink-0">
          Open Budget →
        </button>
      </div>

      {/* Per-account grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.map(stat => (
          <AccountPanel
            key={stat.source}
            stat={stat}
            shareOfTotal={cycleTotalAll > 0 ? stat.cycleTotal / cycleTotalAll : 0}
            balance={balanceBySource.get(stat.source)}
          />
        ))}
      </div>
    </div>
  );
}

function AccountPanel({ stat, shareOfTotal, balance }: { stat: AccountStat; shareOfTotal: number; balance?: number }) {
  const meta = accountMeta(stat.source);
  const kindBadge = { credit: 'Card', checking: 'Checking', savings: 'Savings' }[meta.kind];
  const hasBalance = balance != null;
  const empty = stat.recent.length === 0;
  // Dim only truly-blank cards: no charges AND no balance to show.
  const dim = empty && !hasBalance;
  // Credit-card "balance" is money owed; bank balance is money held.
  const balanceLabel = meta.kind === 'credit' ? 'Balance owed' : 'Balance';

  return (
    <div className={`rounded-xl border border-glass-border bg-white/[0.02] p-4 ${dim ? 'opacity-60' : ''}`}>
      {/* Account identity */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">{meta.icon}</span>
          <span className="text-sm font-semibold text-text-primary truncate">{meta.name}</span>
          {meta.last4 && <span className="text-[11px] text-text-muted tabular-nums">••{meta.last4}</span>}
        </div>
        <span className="px-2 py-0.5 rounded-full bg-surface-2 text-[9px] font-mono uppercase tracking-wider text-text-muted flex-shrink-0">
          {kindBadge}
        </span>
      </div>

      {/* Current balance (as of last sync) — the headline */}
      <div className="flex items-baseline justify-between">
        <div className="text-2xl font-black text-text-primary tracking-tight tabular-nums mono-num">
          {hasBalance ? formatCurrency(balance) : '—'}
        </div>
        <div className="text-[11px] text-text-muted uppercase tracking-wider">
          {hasBalance ? balanceLabel : 'balance not synced'}
        </div>
      </div>
      {/* Spend this cycle + share bar */}
      <div className="flex items-baseline justify-between mt-1.5">
        <div className="text-sm font-semibold text-text-secondary tabular-nums mono-num">
          {formatCurrency(stat.cycleTotal)} spent
        </div>
        <div className="text-[11px] text-text-muted">
          {stat.cycleCount} charge{stat.cycleCount === 1 ? '' : 's'} this cycle
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-2 mb-3">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${Math.round(shareOfTotal * 100)}%`, background: meta.color, boxShadow: `0 0 8px ${meta.color}80` }} />
      </div>

      {/* Latest charges */}
      {empty ? (
        <div className="text-[11px] text-text-muted italic py-2">
          {meta.kind === 'savings' || stat.source === 'bofa_joint'
            ? 'No charges — transfer-only account.'
            : 'No charges recorded.'}
        </div>
      ) : (
        <div className="space-y-0.5">
          <div className="term-label mb-1">Latest charges</div>
          {stat.recent.map(tx => (
            <div key={tx.id} className="flex items-center gap-2 py-1 border-b border-glass-border/40 last:border-0">
              <span className="text-xs flex-shrink-0">{categoryEmoji(tx.category)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-text-primary truncate">
                  {tx.description}
                  {tx.isWorkExpense && <span className="ml-1" title="Work expense">💼</span>}
                </div>
                <div className="text-[10px] text-text-muted">{formatRelDate(tx.date)}</div>
              </div>
              <div className="text-xs font-semibold text-text-primary tabular-nums flex-shrink-0">
                −{formatCurrency(Math.abs(tx.amount))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

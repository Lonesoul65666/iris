import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useAppData, formatCurrency, formatPercent, getAccountTypeLabel, saveAccount } from '../context/AppDataContext';
import { calculateSectorAllocation, calculateTotalValue, getSector, getSectorColor } from '../utils/calculations';
import type { Account, AccountType, Holding } from '../types/portfolio';
import PerformanceChart from '../components/Charts/PerformanceChart';
import EquitySection from '../components/Equity/EquitySection';
import { auditAccountAdded, auditAccountClosed, auditHoldingAdded, auditCsvImport } from '../stores/auditLogStore';

// ─── Types ───

type ViewMode = 'overview' | 'accounts';

interface FlatHolding extends Holding {
  accountName: string;
  accountType: string;
  portfolioPct: number;
}

// ─── Helpers ───

function get401kBadge(account: Account): { label: string; color: string } | null {
  for (const h of account.holdings) {
    if (h.notes?.includes('ACTIVE')) return { label: 'ACTIVE', color: 'text-positive bg-positive/10 border-positive/20' };
    if (h.notes?.includes('ROLL TO IRA')) return { label: 'ROLL TO IRA', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' };
  }
  return null;
}

function flattenHoldings(accounts: Account[], totalValue: number): FlatHolding[] {
  const holdingMap = new Map<string, FlatHolding>();
  for (const acct of accounts) {
    if (acct.type === 'bank') continue;
    for (const h of acct.holdings) {
      if (h.ticker === 'SPAXX' || h.ticker === 'CASH' || h.currentValue < 1) continue;
      const existing = holdingMap.get(h.ticker);
      if (existing) {
        existing.currentValue += h.currentValue;
        existing.totalGainLoss += h.totalGainLoss;
        existing.shares += h.shares;
        existing.portfolioPct = totalValue > 0 ? (existing.currentValue / totalValue) * 100 : 0;
        existing.accountName += `, ${acct.name}`;
      } else {
        holdingMap.set(h.ticker, {
          ...h,
          accountName: acct.name,
          accountType: acct.type,
          portfolioPct: totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0,
        });
      }
    }
  }
  return Array.from(holdingMap.values()).sort((a, b) => b.currentValue - a.currentValue);
}

// ─── Institution-agnostic investment CSV parser ───

type ParsedRow = { ticker: string; shares: number; price: number; costBasis: number; value: number; gainPct: number };

function splitCSVLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

function num(s: string): number { return parseFloat(s?.replace(/[$,%+]/g, '') || '0') || 0; }

/** Detect which institution exported this CSV and parse accordingly. Returns rows + detected institution name. */
function parseInvestmentCSV(text: string): { rows: ParsedRow[]; institution: string } {
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (rawLines.length < 2) return { rows: [], institution: 'Unknown' };

  const header = rawLines[0].toLowerCase();
  const firstFew = rawLines.slice(0, 5).join('\n').toLowerCase();

  // ── Fidelity ──
  // Header row typically: "Account Number","Account Name","Symbol","Description","Quantity",...
  if (firstFew.includes('fidelity') || (header.includes('account number') && header.includes('quantity'))) {
    const rows: ParsedRow[] = [];
    const dataLines = rawLines.filter(l => !l.startsWith('"') || splitCSVLine(l).length >= 15);
    for (let i = 1; i < dataLines.length; i++) {
      const cols = splitCSVLine(dataLines[i]);
      if (cols.length < 15) continue;
      // 0=AcctNum, 1=AcctName, 2=Symbol, 3=Desc, 4=Qty, 5=Price, 6=PriceChg, 7=Value, 10=TotalGain$, 11=TotalGain%, 13=CostBasisTotal, 14=AvgCostBasis
      const ticker = cols[2]?.replace(/[^A-Z0-9]/g, '');
      const shares = num(cols[4]); const price = num(cols[5]);
      const value = num(cols[7]); const costBasis = num(cols[14]); const gainPct = num(cols[11]);
      if (!ticker || shares === 0 || price === 0) continue;
      rows.push({ ticker, shares, price, costBasis, value, gainPct });
    }
    return { rows, institution: 'Fidelity' };
  }

  // ── Schwab ──
  // Header: "Symbol","Description","Quantity","Price","Price Change %","Price Change $","Market Value","Day Change %",...
  if (firstFew.includes('schwab') || (header.includes('symbol') && header.includes('market value') && header.includes('quantity'))) {
    const rows: ParsedRow[] = [];
    const headerCols = splitCSVLine(rawLines[0]).map(c => c.toLowerCase().replace(/[^a-z ]/g,'').trim());
    const symIdx = headerCols.findIndex(c => c === 'symbol');
    const qtyIdx = headerCols.findIndex(c => c.includes('quantity') || c === 'qty');
    const priceIdx = headerCols.findIndex(c => c === 'price');
    const valueIdx = headerCols.findIndex(c => c.includes('market value'));
    const costIdx = headerCols.findIndex(c => c.includes('cost basis') || c.includes('avg cost'));
    const gainPctIdx = headerCols.findIndex(c => c.includes('gain') && c.includes('%'));
    if (symIdx < 0 || qtyIdx < 0) return { rows, institution: 'Schwab' };
    for (let i = 1; i < rawLines.length; i++) {
      const cols = splitCSVLine(rawLines[i]);
      const ticker = cols[symIdx]?.replace(/[^A-Z0-9]/g, '');
      const shares = num(cols[qtyIdx]);
      const price = priceIdx >= 0 ? num(cols[priceIdx]) : 0;
      const value = valueIdx >= 0 ? num(cols[valueIdx]) : shares * price;
      const costBasis = costIdx >= 0 ? num(cols[costIdx]) : 0;
      const gainPct = gainPctIdx >= 0 ? num(cols[gainPctIdx]) : 0;
      if (!ticker || shares === 0) continue;
      rows.push({ ticker, shares, price: price || (shares > 0 ? value / shares : 0), costBasis, value, gainPct });
    }
    return { rows, institution: 'Schwab' };
  }

  // ── Vanguard ──
  if (firstFew.includes('vanguard')) {
    const rows: ParsedRow[] = [];
    const headerCols = splitCSVLine(rawLines[0]).map(c => c.toLowerCase().trim());
    const symIdx = headerCols.findIndex(c => c.includes('ticker') || c === 'symbol');
    const qtyIdx = headerCols.findIndex(c => c.includes('shares') || c === 'quantity');
    const priceIdx = headerCols.findIndex(c => c === 'share price' || c === 'price');
    const valueIdx = headerCols.findIndex(c => c.includes('total value') || c.includes('market value'));
    const costIdx = headerCols.findIndex(c => c.includes('average cost') || c.includes('avg cost'));
    if (symIdx < 0 || qtyIdx < 0) return { rows, institution: 'Vanguard' };
    for (let i = 1; i < rawLines.length; i++) {
      const cols = splitCSVLine(rawLines[i]);
      const ticker = cols[symIdx]?.replace(/[^A-Z0-9]/g, '');
      const shares = num(cols[qtyIdx]);
      const price = priceIdx >= 0 ? num(cols[priceIdx]) : 0;
      const value = valueIdx >= 0 ? num(cols[valueIdx]) : 0;
      const costBasis = costIdx >= 0 ? num(cols[costIdx]) : 0;
      if (!ticker || shares === 0) continue;
      rows.push({ ticker, shares, price: price || (shares > 0 && value > 0 ? value / shares : 0), costBasis, value, gainPct: 0 });
    }
    return { rows, institution: 'Vanguard' };
  }

  // ── Generic fallback — column header detection ──
  // Looks for: symbol/ticker, shares/quantity, price, cost
  const headerCols = splitCSVLine(rawLines[0]).map(c => c.toLowerCase().replace(/["']/g, '').trim());
  const symIdx = headerCols.findIndex(c => c === 'symbol' || c === 'ticker' || c === 'security');
  const qtyIdx = headerCols.findIndex(c => c.includes('share') || c.includes('qty') || c.includes('quantity'));
  const priceIdx = headerCols.findIndex(c => c === 'price' || c === 'last price' || c === 'market price');
  const valueIdx = headerCols.findIndex(c => c.includes('value') || c.includes('market'));
  const costIdx = headerCols.findIndex(c => c.includes('cost') || c.includes('basis'));

  if (symIdx >= 0 && qtyIdx >= 0) {
    const rows: ParsedRow[] = [];
    for (let i = 1; i < rawLines.length; i++) {
      const cols = splitCSVLine(rawLines[i]);
      const ticker = cols[symIdx]?.replace(/[^A-Z0-9]/g, '');
      const shares = num(cols[qtyIdx]);
      const price = priceIdx >= 0 ? num(cols[priceIdx]) : 0;
      const value = valueIdx >= 0 ? num(cols[valueIdx]) : 0;
      const costBasis = costIdx >= 0 ? num(cols[costIdx]) : 0;
      if (!ticker || shares === 0) continue;
      rows.push({ ticker, shares, price: price || (shares > 0 && value > 0 ? value / shares : 0), costBasis, value, gainPct: 0 });
    }
    return { rows, institution: 'Unknown' };
  }

  return { rows: [], institution: 'Unknown' };
}

// ─── Section ordering ───
const SECTION_ORDER: { type: string; label: string; icon: string }[] = [
  { type: 'bank', label: 'Bank Accounts', icon: '🏦' },
  { type: 'crypto', label: 'Crypto', icon: '₿' },
  { type: 'brokerage', label: 'Individual Brokerage', icon: '📈' },
  { type: '401k', label: '401(k) Accounts', icon: '🏛' },
];

// ─── Main Component ───

export default function PortfolioView() {
  const {
    accounts, setAccounts, totalLiquid, netWorthSnapshots,
    priceRefreshing, lastPriceRefresh, handleRefreshPrices,
    equity, setView,
  } = useAppData();
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Active accounts only for display/calculations; closed accounts are archived
  const activeAccounts = useMemo(() => accounts.filter(a => a.status !== 'closed'), [accounts]);
  const totalValue = calculateTotalValue(activeAccounts);
  const allocations = calculateSectorAllocation(activeAccounts);
  const flatHoldings = useMemo(() => flattenHoldings(activeAccounts, totalValue), [activeAccounts, totalValue]);

  // Stats — exclude 401k & bank from best/worst, split stock vs crypto
  const totalGain = flatHoldings.reduce((s, h) => s + h.totalGainLoss, 0);
  const investmentHoldings = flatHoldings.filter(h => h.accountType !== '401k' && h.accountType !== 'bank');
  const stockHoldings = investmentHoldings.filter(h => h.accountType !== 'crypto');
  const cryptoHoldings = investmentHoldings.filter(h => h.accountType === 'crypto');
  const bestStock = stockHoldings.filter(h => h.totalGainLossPercent !== 0).reduce((best, h) => h.totalGainLossPercent > (best?.totalGainLossPercent || -Infinity) ? h : best, null as FlatHolding | null);
  const bestCrypto = cryptoHoldings.filter(h => h.totalGainLossPercent !== 0).reduce((best, h) => h.totalGainLossPercent > (best?.totalGainLossPercent || -Infinity) ? h : best, null as FlatHolding | null);
  const worstPerformer = investmentHoldings.filter(h => h.totalGainLossPercent !== 0).reduce((worst, h) => h.totalGainLossPercent < (worst?.totalGainLossPercent || Infinity) ? h : worst, null as FlatHolding | null);

  // Group ALL accounts for account view (including closed, shown dimmed)
  const grouped = new Map<string, Account[]>();
  for (const acct of accounts) {
    const list = grouped.get(acct.type) || [];
    list.push(acct);
    grouped.set(acct.type, list);
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Investment Portfolio</h1>
          <p className="text-text-secondary text-sm mt-1">{activeAccounts.length} accounts · {flatHoldings.length} holdings{accounts.length > activeAccounts.length ? ` · ${accounts.length - activeAccounts.length} closed` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefreshPrices} disabled={priceRefreshing}
            className="px-3 py-1.5 bg-accent/10 hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed text-accent rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Fetch live prices (Yahoo Finance + CoinGecko)">
            {priceRefreshing ? (
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            )}
            {priceRefreshing ? 'Refreshing...' : 'Refresh Prices'}
          </button>
          <InvestmentImport accounts={accounts} setAccounts={setAccounts} />
        </div>
      </div>

      {/* Empty state — no accounts connected */}
      {accounts.length === 0 && (
        <div className="glass-card p-8 text-center">
          <p className="text-text-secondary">No accounts connected yet. Add an account from Settings or import a CSV using the button above.</p>
        </div>
      )}

      {/* Price staleness banner */}
      {(() => {
        if (priceRefreshing) return null;
        const ms = lastPriceRefresh ? Date.now() - new Date(lastPriceRefresh).getTime() : Infinity;
        const hours = Math.floor(ms / 3_600_000);
        const isStale = hours >= 8;
        const isOld = hours >= 2;
        const timeLabel = lastPriceRefresh
          ? hours < 1 ? 'Less than 1 hour ago' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
          : 'Never';
        return (
          <div className={`flex items-center justify-between px-4 py-2 rounded-xl text-xs border ${
            isStale ? 'bg-amber-500/5 border-amber-500/20 text-amber-400'
            : isOld ? 'bg-white/[0.02] border-glass-border text-text-muted'
            : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
          }`}>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isStale ? 'bg-amber-400' : isOld ? 'bg-text-muted' : 'bg-emerald-400'}`} />
              Prices updated: {timeLabel}
              {lastPriceRefresh && <span className="text-text-muted ml-1">({new Date(lastPriceRefresh).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>}
            </span>
            {isStale && (
              <button onClick={handleRefreshPrices} className="text-accent hover:text-accent-light font-medium transition-colors">
                Refresh now
              </button>
            )}
          </div>
        );
      })()}

      {/* Hero Performance Chart */}
      <div className="glass-card p-5">
        <PerformanceChart
          snapshots={netWorthSnapshots}
          currentTotal={totalLiquid}
          label="Portfolio Value"
          snapshotKey="totalLiquidNetWorth"
          height={260}
        />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Liquid" value={formatCurrency(totalLiquid)} />
        <StatCard
          label="Total Gain/Loss"
          value={formatCurrency(totalGain)}
          color={totalGain >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <StatCard
          label="Best Stock"
          value={bestStock ? `${bestStock.ticker} ${formatPercent(bestStock.totalGainLossPercent)}` : '—'}
          color="text-emerald-400"
          sub={bestStock ? formatCurrency(bestStock.totalGainLoss) : undefined}
        />
        {bestCrypto && bestCrypto.totalGainLossPercent !== 0 ? (
          <StatCard
            label="Best Crypto"
            value={`${bestCrypto.ticker} ${formatPercent(bestCrypto.totalGainLossPercent)}`}
            color="text-emerald-400"
            sub={formatCurrency(bestCrypto.totalGainLoss)}
          />
        ) : (
          <StatCard
            label="Worst Performer"
            value={worstPerformer ? `${worstPerformer.ticker} ${formatPercent(worstPerformer.totalGainLossPercent)}` : '—'}
            color={worstPerformer && worstPerformer.totalGainLossPercent < 0 ? 'text-red-400' : 'text-text-secondary'}
            sub={worstPerformer ? formatCurrency(worstPerformer.totalGainLoss) : undefined}
          />
        )}
      </div>

      {/* Allocation Donut + Top Holdings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Donut */}
        <div className="glass-card p-5">
          <h3 className="term-label mb-3">Sector Allocation</h3>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={allocations.filter(a => a.percentage > 1)}
                  dataKey="value"
                  outerRadius={80}
                  innerRadius={50}
                  paddingAngle={2}
                  stroke="none"
                >
                  {allocations.filter(a => a.percentage > 1).map((a, i) => (
                    <Cell key={i} fill={a.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-3">
            {allocations.slice(0, 6).map(a => (
              <div key={a.sector} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                  <span className="text-text-secondary truncate">{a.sector}</span>
                </div>
                <span className="text-text-primary font-medium mono-num">{a.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Holdings */}
        <div className="glass-card p-5 md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="term-label">Top Holdings</h3>
            <div className="flex gap-1 bg-surface-1 rounded-lg p-0.5">
              <button onClick={() => setViewMode('overview')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'overview' ? 'bg-accent/15 text-accent-light' : 'text-text-muted hover:text-text-secondary'}`}>
                All Holdings
              </button>
              <button onClick={() => setViewMode('accounts')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'accounts' ? 'bg-accent/15 text-accent-light' : 'text-text-muted hover:text-text-secondary'}`}>
                By Account
              </button>
            </div>
          </div>

          {/* Top 5 holdings as horizontal bars */}
          <div className="space-y-2">
            {flatHoldings.slice(0, 5).map(h => (
              <div key={h.ticker} className="flex items-center gap-3">
                <div className="w-12 text-xs font-mono font-bold text-accent-light">{h.ticker}</div>
                <div className="flex-1 relative">
                  <div className="h-6 bg-surface-3 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all"
                      style={{
                        width: `${Math.min((h.portfolioPct / (flatHoldings[0]?.portfolioPct || 1)) * 100, 100)}%`,
                        backgroundColor: getSectorColor(getSector(h.ticker)),
                        opacity: 0.7,
                      }}
                    />
                  </div>
                </div>
                <div className="w-20 text-right text-xs font-medium text-text-primary mono-num">{formatCurrency(h.currentValue)}</div>
                <div className={`w-16 text-right text-xs font-medium mono-num ${h.totalGainLossPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {h.totalGainLossPercent >= 0 ? '▲' : '▼'} {formatPercent(h.totalGainLossPercent)}
                </div>
                <div className="w-12 text-right text-[10px] text-text-muted mono-num">{h.portfolioPct.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Holdings / Accounts View */}
      {viewMode === 'overview' ? (
        <div className="space-y-6">
          {/* Brokerage holdings */}
          {stockHoldings.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📈</span>
                  <h2 className="text-lg font-semibold text-text-primary">Investments</h2>
                  <span className="text-xs text-text-muted">Fidelity · {stockHoldings.length} holdings</span>
                </div>
                <span className="text-sm font-medium text-text-secondary mono-num">{formatCurrency(stockHoldings.reduce((s, h) => s + h.currentValue, 0))}</span>
              </div>
              <div className="space-y-1.5">
                {stockHoldings.map(h => (
                  <HoldingRow key={h.ticker} holding={h} expanded={expandedTicker === h.ticker} onToggle={() => setExpandedTicker(expandedTicker === h.ticker ? null : h.ticker)} accounts={accounts} setAccounts={setAccounts} />
                ))}
              </div>
              {activeAccounts.filter(a => a.type === 'brokerage').map(acct => (
                <AddHoldingButton key={acct.id} account={acct} accounts={accounts} setAccounts={setAccounts} showAccountLabel={activeAccounts.filter(a => a.type === 'brokerage').length > 1} />
              ))}
            </div>
          )}

          {/* Crypto holdings */}
          {cryptoHoldings.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">₿</span>
                  <h2 className="text-lg font-semibold text-text-primary">Crypto</h2>
                  <span className="text-xs text-text-muted">Coinbase · {cryptoHoldings.length} holdings</span>
                </div>
                <span className="text-sm font-medium text-text-secondary mono-num">{formatCurrency(cryptoHoldings.reduce((s, h) => s + h.currentValue, 0))}</span>
              </div>
              <div className="space-y-1.5">
                {cryptoHoldings.map(h => (
                  <HoldingRow key={h.ticker} holding={h} expanded={expandedTicker === h.ticker} onToggle={() => setExpandedTicker(expandedTicker === h.ticker ? null : h.ticker)} accounts={accounts} setAccounts={setAccounts} />
                ))}
              </div>
              {activeAccounts.filter(a => a.type === 'crypto').map(acct => (
                <AddHoldingButton key={acct.id} account={acct} accounts={accounts} setAccounts={setAccounts} showAccountLabel={activeAccounts.filter(a => a.type === 'crypto').length > 1} />
              ))}
            </div>
          )}

          {/* 401k holdings */}
          {(() => {
            const retirementHoldings = flatHoldings.filter(h => h.accountType === '401k');
            if (retirementHoldings.length === 0) return null;
            return (
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏛</span>
                    <h2 className="text-lg font-semibold text-text-primary">Retirement</h2>
                    <span className="text-xs text-text-muted">401(k) · {retirementHoldings.length} holdings</span>
                  </div>
                  <span className="text-sm font-medium text-text-secondary mono-num">{formatCurrency(retirementHoldings.reduce((s, h) => s + h.currentValue, 0))}</span>
                </div>
                <div className="space-y-1.5">
                  {retirementHoldings.map(h => (
                    <HoldingRow key={h.ticker} holding={h} expanded={expandedTicker === h.ticker} onToggle={() => setExpandedTicker(expandedTicker === h.ticker ? null : h.ticker)} accounts={accounts} setAccounts={setAccounts} />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Company Equity — inline drill-down. Full IPO-scenario view lives on the
              dedicated /equity route; this surfaces it alongside liquid holdings because
              it's often a majority of net worth. */}
          {equity && equity.grants.length > 0 && (
            <EquitySection equity={equity} variant="compact" onOpenFull={() => setView('equity')} />
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {SECTION_ORDER.map(section => {
            const sectionAccounts = grouped.get(section.type);
            if (!sectionAccounts || sectionAccounts.length === 0) return null;
            const activeSectionAccounts = sectionAccounts.filter(a => a.status !== 'closed');
            const closedSectionAccounts = sectionAccounts.filter(a => a.status === 'closed');
            const sectionTotal = activeSectionAccounts.reduce((s, a) => s + a.totalValue, 0);
            return (
              <div key={section.type} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{section.icon}</span>
                    <h2 className="text-lg font-semibold text-text-primary">{section.label}</h2>
                    <span className="text-xs text-text-muted">({activeSectionAccounts.length})</span>
                  </div>
                  <div className="text-sm font-medium text-text-secondary mono-num">{formatCurrency(sectionTotal)}</div>
                </div>
                {activeSectionAccounts.map(account => (
                  <AccountCard key={account.id} account={account} accounts={accounts} setAccounts={setAccounts} />
                ))}
                {closedSectionAccounts.map(account => (
                  <AccountCard key={account.id} account={account} accounts={accounts} setAccounts={setAccounts} />
                ))}
              </div>
            );
          })}
          {/* Catch-all for unlisted account types */}
          {Array.from(grouped.entries())
            .filter(([type]) => !SECTION_ORDER.some(s => s.type === type))
            .map(([type, accts]) => (
              <div key={type} className="space-y-3">
                <h2 className="text-lg font-semibold text-text-primary px-1">{getAccountTypeLabel(type)}</h2>
                {accts.map(account => <AccountCard key={account.id} account={account} accounts={accounts} setAccounts={setAccounts} />)}
              </div>
            ))}

          {/* Company Equity — appears in both overview and by-account modes since
              it's a major net-worth component, even though it isn't an Account. */}
          {equity && equity.grants.length > 0 && (
            <EquitySection equity={equity} variant="compact" onOpenFull={() => setView('equity')} />
          )}

          {/* Add Account */}
          <AddAccountButton accounts={accounts} setAccounts={setAccounts} />
        </div>
      )}

      {/* Price timestamp — handled by staleness banner above */}
    </div>
  );
}

// ─── Sub-components ───

function StatCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="stat-card p-4">
      <div className="term-label">{label}</div>
      <div className={`text-lg font-bold mt-1 mono-num ${color || 'text-text-primary'}`}>{value}</div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5 mono-num">{sub}</div>}
    </div>
  );
}

function HoldingRow({ holding, expanded, onToggle, accounts, setAccounts }: {
  holding: FlatHolding; expanded: boolean; onToggle: () => void;
  accounts?: Account[]; setAccounts?: React.Dispatch<React.SetStateAction<Account[]>>;
}) {
  const sectorColor = getSectorColor(getSector(holding.ticker));
  const isPositive = holding.totalGainLossPercent >= 0;

  // Any account's matching holding can carry conviction; display true if ANY are flagged.
  const isConviction = !!accounts?.some(a => a.holdings.some(h => h.ticker === holding.ticker && h.conviction));
  const existingNote = accounts
    ?.flatMap(a => a.holdings)
    .find(h => h.ticker === holding.ticker && h.conviction && h.convictionNote)
    ?.convictionNote || '';
  const [convictionNoteDraft, setConvictionNoteDraft] = useState(existingNote);

  const updateHoldingField = async (field: 'shares' | 'avgCostBasis', value: number) => {
    if (!accounts || !setAccounts) return;
    for (const acct of accounts) {
      const hIdx = acct.holdings.findIndex(h => h.ticker === holding.ticker);
      if (hIdx < 0) continue;
      const h = acct.holdings[hIdx];
      const newShares = field === 'shares' ? value : h.shares;
      const newCost = field === 'avgCostBasis' ? value : h.avgCostBasis;
      const newValue = Math.round(newShares * h.currentPrice);
      const gainLoss = newValue - Math.round(newShares * newCost);
      const gainPct = newCost > 0 ? ((h.currentPrice - newCost) / newCost) * 100 : 0;
      const updatedHoldings = acct.holdings.map(hh =>
        hh.id === h.id ? { ...hh, [field]: value, shares: newShares, avgCostBasis: newCost, currentValue: newValue, totalGainLoss: gainLoss, totalGainLossPercent: Math.round(gainPct * 100) / 100, lastUpdated: new Date().toISOString().split('T')[0] } : hh
      );
      const updatedAcct = { ...acct, holdings: updatedHoldings, totalValue: updatedHoldings.reduce((s, hh) => s + hh.currentValue, 0), lastUpdated: new Date().toISOString().split('T')[0] };
      setAccounts(prev => prev.map(a => a.id === acct.id ? updatedAcct : a));
      await saveAccount(updatedAcct);
      break; // update first matching account
    }
  };

  const toggleConviction = async () => {
    if (!accounts || !setAccounts) return;
    const nextConviction = !isConviction;
    const today = new Date().toISOString().split('T')[0];
    const trimmedNote = convictionNoteDraft.trim();
    // Apply to every matching holding across accounts so rebalance + deposit both honor it.
    for (const acct of accounts) {
      if (!acct.holdings.some(h => h.ticker === holding.ticker)) continue;
      const updatedHoldings = acct.holdings.map(hh =>
        hh.ticker === holding.ticker
          ? {
              ...hh,
              conviction: nextConviction,
              convictionNote: nextConviction ? (trimmedNote || undefined) : undefined,
              lastUpdated: today,
            }
          : hh
      );
      const updatedAcct = { ...acct, holdings: updatedHoldings, lastUpdated: today };
      setAccounts(prev => prev.map(a => a.id === acct.id ? updatedAcct : a));
      await saveAccount(updatedAcct);
    }
    if (!nextConviction) setConvictionNoteDraft('');
  };

  const saveConvictionNote = async () => {
    if (!accounts || !setAccounts || !isConviction) return;
    const today = new Date().toISOString().split('T')[0];
    const trimmedNote = convictionNoteDraft.trim();
    for (const acct of accounts) {
      if (!acct.holdings.some(h => h.ticker === holding.ticker && h.conviction)) continue;
      const updatedHoldings = acct.holdings.map(hh =>
        hh.ticker === holding.ticker && hh.conviction
          ? { ...hh, convictionNote: trimmedNote || undefined, lastUpdated: today }
          : hh
      );
      const updatedAcct = { ...acct, holdings: updatedHoldings, lastUpdated: today };
      setAccounts(prev => prev.map(a => a.id === acct.id ? updatedAcct : a));
      await saveAccount(updatedAcct);
    }
  };

  const canEdit = !!accounts && !!setAccounts;

  return (
    <div className={`rounded-xl border transition-all ${expanded ? 'border-white/10 bg-white/[0.03]' : 'border-glass-border bg-white/[0.01]'} hover:border-white/10`}>
      <div className="p-3 flex items-center gap-3 cursor-pointer" onClick={onToggle}>
        {/* Ticker badge */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0"
          style={{ backgroundColor: sectorColor + '20', color: sectorColor }}>
          {holding.ticker}
        </div>
        {/* Name + sector */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
            <span className="truncate">{holding.name}</span>
            {isConviction && (
              <span className="text-[11px] flex-shrink-0" title="Conviction hold — excluded from rebalance/deposit suggestions">⭐</span>
            )}
          </div>
          <div className="text-[10px] text-text-muted truncate">{getSector(holding.ticker)}</div>
        </div>
        {/* Inline analytics — shown on wide screens now that the layout is full-width */}
        <div className="hidden lg:flex items-center gap-10 text-xs flex-shrink-0 mr-4">
          <InlineStat label="Shares" value={holding.shares.toLocaleString(undefined, { maximumFractionDigits: holding.shares < 1 ? 4 : 2 })} width="w-24" />
          <InlineStat label="Avg Cost" value={`$${holding.avgCostBasis.toFixed(2)}`} width="w-24" />
          <InlineStat label="Price" value={`$${holding.currentPrice.toFixed(2)}`} width="w-24" />
          <InlineStat label="Gain" value={formatCurrency(holding.totalGainLoss)} width="w-28" color={isPositive ? 'text-emerald-400' : 'text-red-400'} />
          <InlineStat label="Weight" value={`${holding.portfolioPct.toFixed(1)}%`} width="w-16" />
        </div>
        {/* Value */}
        <div className="text-right flex-shrink-0 w-24">
          <div className="text-sm font-semibold text-text-primary mono-num">{formatCurrency(holding.currentValue)}</div>
          <div className={`text-xs font-medium mono-num ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? '▲' : '▼'} {formatPercent(holding.totalGainLossPercent)}
          </div>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-text-muted transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-glass-border">
          {/* On narrow screens, show the analytics grid (they're hidden in the row). On wide screens, skip — already inline above. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 lg:hidden">
            <MiniStat label="Shares" value={holding.shares.toLocaleString(undefined, { maximumFractionDigits: 3 })} />
            <MiniStat label="Avg Cost" value={`$${holding.avgCostBasis.toFixed(2)}`} />
            <MiniStat label="Current Price" value={`$${holding.currentPrice.toFixed(2)}`} />
            <MiniStat label="Gain/Loss" value={formatCurrency(holding.totalGainLoss)} color={isPositive ? 'text-emerald-400' : 'text-red-400'} />
          </div>
          {/* Editable fields — primary reason to expand besides conviction */}
          {canEdit && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <EditableStat label="Shares" value={holding.shares} decimals={6} onSave={(v) => updateHoldingField('shares', v)} />
              <EditableStat label="Avg Cost" value={holding.avgCostBasis} prefix="$" decimals={2} onSave={(v) => updateHoldingField('avgCostBasis', v)} />
            </div>
          )}
          {holding.notes && (
            <div className="mt-2 text-xs text-text-muted bg-white/[0.02] rounded-lg p-2">{holding.notes}</div>
          )}
          <div className="mt-2 text-[10px] text-text-muted">Held in: {holding.accountName}</div>

          {canEdit && (
            <div className={`mt-3 rounded-lg p-3 border ${isConviction ? 'bg-amber-500/5 border-amber-500/20' : 'bg-white/[0.02] border-glass-border'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-text-primary flex items-center gap-1.5">
                    <span>{isConviction ? '⭐' : '☆'}</span>
                    <span>Conviction hold</span>
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5 leading-relaxed">
                    {isConviction
                      ? 'Excluded from rebalance trims and deposit reallocation. Still appears in X-Ray.'
                      : 'Flag this if you\'ll hold it regardless of target math — we\'ll stop suggesting trims or deposits against it.'}
                  </p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); toggleConviction(); }}
                  className={`text-[10px] px-2.5 py-1 rounded-md font-semibold transition-colors flex-shrink-0 ${
                    isConviction
                      ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                      : 'bg-white/5 text-text-muted hover:bg-accent/15 hover:text-accent-light'
                  }`}>
                  {isConviction ? 'Unmark' : 'Mark as conviction'}
                </button>
              </div>
              {isConviction && (
                <div className="mt-2" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    placeholder="Why is this a conviction hold? (optional)"
                    value={convictionNoteDraft}
                    onChange={e => setConvictionNoteDraft(e.target.value)}
                    onBlur={saveConvictionNote}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-full bg-surface-2 border border-glass-border rounded px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted/50 outline-none focus:border-amber-500/40"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="term-label">{label}</div>
      <div className={`text-sm font-medium mt-0.5 mono-num ${color || 'text-text-primary'}`}>{value}</div>
    </div>
  );
}

function InlineStat({ label, value, color, width }: { label: string; value: string; color?: string; width?: string }) {
  return (
    <div className={`text-right ${width || ''}`}>
      <div className="term-label leading-tight">{label}</div>
      <div className={`text-sm font-medium mt-0.5 mono-num ${color || 'text-text-primary'}`}>{value}</div>
    </div>
  );
}

function EditableStat({ label, value, prefix, decimals, compact, onSave }: {
  label: string; value: number; prefix?: string; decimals?: number; compact?: boolean;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const handleSave = () => {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed >= 0) onSave(parsed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={compact ? 'inline-flex items-center gap-1' : ''}>
        {!compact && <div className="text-[10px] text-accent uppercase tracking-wider font-bold">{label}</div>}
        <div className={`flex items-center gap-1 ${compact ? '' : 'mt-0.5'}`}>
          {prefix && <span className={`${compact ? 'text-xs' : 'text-sm'} text-text-muted`}>{prefix}</span>}
          <input
            type="number"
            step="any"
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={handleSave}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            className={`${compact ? 'w-20 text-xs' : 'w-24 text-sm'} bg-surface-2 border border-accent/30 rounded px-1.5 py-0.5 text-text-primary outline-none focus:border-accent/60`}
          />
        </div>
      </div>
    );
  }

  // Compact mode: subtle display, "Track fees" if 0
  if (compact) {
    if (value === 0) {
      return (
        <button onClick={(e) => { e.stopPropagation(); setDraft('0'); setEditing(true); }}
          className="text-[10px] text-text-muted/50 hover:text-accent/70 transition-colors mt-0.5">
          + Track fees
        </button>
      );
    }
    return (
      <div className="cursor-pointer group inline-flex items-center gap-1 mt-0.5" onClick={(e) => { e.stopPropagation(); setDraft(String(value)); setEditing(true); }}>
        <span className="text-[10px] text-text-muted group-hover:text-accent transition-colors">
          {prefix || ''}{value.toLocaleString(undefined, { maximumFractionDigits: decimals ?? 2 })} fees
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-text-muted/0 group-hover:text-accent transition-colors">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="cursor-pointer group" onClick={() => { setDraft(String(value)); setEditing(true); }}>
      <div className="text-[10px] text-text-muted uppercase tracking-wider flex items-center gap-1">
        {label}
        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-text-muted/0 group-hover:text-accent transition-colors">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
      </div>
      <div className="text-sm font-medium mt-0.5 text-text-primary group-hover:text-accent transition-colors">
        {prefix || ''}{value.toLocaleString(undefined, { maximumFractionDigits: decimals ?? 3 })}
      </div>
    </div>
  );
}

function AddHoldingButton({ account, accounts: _accounts, setAccounts, showAccountLabel }: {
  account: Account;
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  showAccountLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');

  const handleAdd = async () => {
    const t = ticker.trim().toUpperCase();
    if (!t || !shares) return;
    const today = new Date().toISOString().split('T')[0];
    const s = parseFloat(shares) || 0;
    const cb = parseFloat(costBasis) || 0;
    const newHolding: Holding = {
      id: `manual-${t.toLowerCase()}-${Date.now()}`,
      accountId: account.id,
      ticker: t,
      name: t, // Will be enriched after price refresh
      assetClass: account.type === 'crypto' ? 'crypto' : 'stock',
      shares: s,
      avgCostBasis: cb,
      currentPrice: cb || 0, // Will be updated by price refresh
      currentValue: Math.round(s * (cb || 0)),
      totalGainLoss: 0,
      totalGainLossPercent: 0,
      status: 'active',
      notes: `Manually added (${today})`,
      lastUpdated: today,
    };
    const updatedHoldings = [...account.holdings, newHolding];
    const updatedAcct = {
      ...account,
      holdings: updatedHoldings,
      totalValue: updatedHoldings.filter(h => h.status !== 'sold').reduce((s2, h) => s2 + h.currentValue, 0),
      lastUpdated: today,
    };
    setAccounts(prev => prev.map(a => a.id === account.id ? updatedAcct : a));
    await saveAccount(updatedAcct);
    await auditHoldingAdded(account.id, account.name, t, s, cb);
    setOpen(false);
    setTicker('');
    setShares('');
    setCostBasis('');
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors py-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Add holding{showAccountLabel ? ` to ${account.name}` : ''}
      </button>
    );
  }

  return (
    <div className="p-3 rounded-xl border border-accent/20 bg-accent/5 space-y-2 mt-2">
      <div className="text-xs font-bold text-accent uppercase tracking-wider">Add to {account.name}</div>
      <div className="flex gap-2">
        <input placeholder="Ticker (e.g. AAPL)" value={ticker} onChange={e => setTicker(e.target.value)}
          className="flex-1 bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary uppercase placeholder:normal-case placeholder:text-text-muted/50 outline-none focus:border-accent/50" />
        <input placeholder="Shares" type="number" step="any" value={shares} onChange={e => setShares(e.target.value)}
          className="w-24 bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50" />
        <input placeholder="Avg cost" type="number" step="any" value={costBasis} onChange={e => setCostBasis(e.target.value)}
          className="w-24 bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50" />
      </div>
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={!ticker.trim() || !shares}
          className="px-3 py-1.5 bg-accent hover:bg-accent-dim disabled:opacity-40 rounded-lg text-xs font-medium text-white transition-colors">
          Add
        </button>
        <button onClick={() => setOpen(false)}
          className="px-3 py-1.5 bg-surface-3 hover:bg-surface-4 rounded-lg text-xs text-text-muted transition-colors">
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-text-muted">Price will auto-fill on next Refresh Prices. Cost basis is optional.</p>
    </div>
  );
}

function AccountCard({ account, accounts: _accounts, setAccounts }: { account: Account; accounts: Account[]; setAccounts: React.Dispatch<React.SetStateAction<Account[]>> }) {
  const badge = account.type === '401k' ? get401kBadge(account) : null;
  const isClosed = account.status === 'closed';
  const [confirmClose, setConfirmClose] = useState(false);

  const updateFees = async (value: number) => {
    const updated = { ...account, totalFeesPaid: value, lastUpdated: new Date().toISOString().split('T')[0] };
    setAccounts(prev => prev.map(a => a.id === account.id ? updated : a));
    await saveAccount(updated);
  };

  const handleCloseAccount = async () => {
    const finalValue = account.totalValue;
    // Zero out all holdings and mark them sold
    const closedHoldings = account.holdings.map(h => ({
      ...h, status: 'sold' as const, currentValue: 0, shares: 0,
      notes: `${h.notes ? h.notes + ' | ' : ''}Account closed ${new Date().toISOString().split('T')[0]}`,
    }));
    const closedAccount = { ...account, status: 'closed' as const, totalValue: 0, holdings: closedHoldings, lastUpdated: new Date().toISOString().split('T')[0] };
    setAccounts(prev => prev.map(a => a.id === account.id ? closedAccount : a));
    await saveAccount(closedAccount);
    await auditAccountClosed(account.id, account.name, finalValue);
    setConfirmClose(false);
  };

  return (
    <div className={`glass-card overflow-hidden transition-opacity ${isClosed ? 'opacity-40' : ''}`}>
      <div className="p-4 border-b border-glass-border flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-text-primary">{account.name}</h3>
            {badge && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>{badge.label}</span>}
            {isClosed && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-text-muted bg-white/5 border-white/10">CLOSED</span>}
          </div>
          <p className="text-xs text-text-muted">{account.institution} · {getAccountTypeLabel(account.type)}</p>
        </div>
        <div className="text-right flex items-start gap-3">
          {!isClosed && (
            <div>
              {confirmClose ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-amber-400">Close & archive?</span>
                  <button onClick={handleCloseAccount} className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors">Yes, close</button>
                  <button onClick={() => setConfirmClose(false)} className="text-[10px] px-2 py-0.5 bg-white/5 text-text-muted rounded hover:bg-white/10 transition-colors">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmClose(true)} className="text-[10px] text-text-muted/40 hover:text-red-400/70 transition-colors">close account</button>
              )}
            </div>
          )}
          <div>
            <div className="font-semibold text-text-primary">{formatCurrency(account.totalValue)}</div>
            {!isClosed && (
              <EditableStat
                label="Fees Paid"
                value={account.totalFeesPaid ?? 0}
                prefix="$"
                decimals={2}
                compact
                onSave={updateFees}
              />
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-text-muted uppercase tracking-wider">
              <th className="text-left p-3">Ticker</th>
              <th className="text-left p-3">Name</th>
              <th className="text-right p-3">Shares</th>
              <th className="text-right p-3">Price</th>
              <th className="text-right p-3">Value</th>
              <th className="text-right p-3">Gain/Loss</th>
            </tr>
          </thead>
          <tbody>
            {account.holdings.map(h => (
              <tr key={h.id} className="border-t border-glass-border hover:bg-white/[0.02] transition-colors group">
                <td className="p-3 text-sm font-mono font-semibold text-accent-light">{h.ticker}</td>
                <td className="p-3 text-sm text-text-secondary">
                  <div>{h.name}</div>
                  {h.notes && <div className="text-[10px] text-text-muted mt-0.5 leading-tight max-w-xs">{h.notes}</div>}
                </td>
                <td className="p-3 text-right">
                  <input type="number" step="any" value={h.shares}
                    onChange={async (e) => {
                      const shares = Number(e.target.value);
                      const newValue = shares * h.currentPrice;
                      const gainLoss = newValue - (shares * h.avgCostBasis);
                      const gainPct = h.avgCostBasis > 0 ? (gainLoss / (shares * h.avgCostBasis)) * 100 : 0;
                      const updatedHoldings = account.holdings.map(hh => hh.id === h.id ? { ...hh, shares, currentValue: Math.round(newValue), totalGainLoss: Math.round(gainLoss), totalGainLossPercent: gainPct, lastUpdated: new Date().toISOString().split('T')[0] } : hh);
                      const updatedAccount = { ...account, holdings: updatedHoldings, totalValue: updatedHoldings.reduce((s, hh) => s + hh.currentValue, 0), lastUpdated: new Date().toISOString().split('T')[0] };
                      setAccounts(prev => prev.map(a => a.id === account.id ? updatedAccount : a));
                      await saveAccount(updatedAccount);
                    }}
                    className="w-20 bg-transparent border border-transparent group-hover:border-glass-border rounded px-1 py-0.5 text-sm text-text-primary text-right outline-none focus:border-accent/50 transition-colors"
                  />
                </td>
                <td className="p-3 text-right">
                  <input type="number" step="any" value={h.currentPrice}
                    onChange={async (e) => {
                      const price = Number(e.target.value);
                      const newValue = h.shares * price;
                      const gainLoss = newValue - (h.shares * h.avgCostBasis);
                      const gainPct = h.avgCostBasis > 0 ? (gainLoss / (h.shares * h.avgCostBasis)) * 100 : 0;
                      const updatedHoldings = account.holdings.map(hh => hh.id === h.id ? { ...hh, currentPrice: price, currentValue: Math.round(newValue), totalGainLoss: Math.round(gainLoss), totalGainLossPercent: gainPct, lastUpdated: new Date().toISOString().split('T')[0] } : hh);
                      const updatedAccount = { ...account, holdings: updatedHoldings, totalValue: updatedHoldings.reduce((s, hh) => s + hh.currentValue, 0), lastUpdated: new Date().toISOString().split('T')[0] };
                      setAccounts(prev => prev.map(a => a.id === account.id ? updatedAccount : a));
                      await saveAccount(updatedAccount);
                    }}
                    className="w-24 bg-transparent border border-transparent group-hover:border-glass-border rounded px-1 py-0.5 text-sm text-text-primary text-right outline-none focus:border-accent/50 transition-colors"
                  />
                </td>
                <td className="p-3 text-sm text-text-primary text-right font-medium">{formatCurrency(h.currentValue)}</td>
                <td className={`p-3 text-sm text-right font-medium ${h.totalGainLoss >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {h.totalGainLoss !== 0 ? formatPercent(h.totalGainLossPercent) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Institution-agnostic Investment Import ───

function InvestmentImport({ accounts, setAccounts }: { accounts: Account[]; setAccounts: React.Dispatch<React.SetStateAction<Account[]>> }) {
  const SKIP_TICKERS = new Set(['CASH', 'SPAXX', 'FDRXX', 'VMFXX', 'DGCXX', 'FCASH', 'FZFXX', 'MMDA1', 'SWVXX', 'SPRXX']);
  const [showPicker, setShowPicker] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ text: string; institution: string; rows: ParsedRow[] } | null>(null);
  const brokerageAccounts = accounts.filter(a => a.type === 'brokerage' && a.status !== 'closed');

  const runImport = async (targetAcct: Account, rows: ParsedRow[], institution: string) => {
    const today = new Date().toISOString().split('T')[0];
    let updated = 0, added = 0, sold = 0;
    const importedTickers = new Set(rows.map(r => r.ticker));
    let workingHoldings = [...targetAcct.holdings];

    for (const row of rows) {
      if (SKIP_TICKERS.has(row.ticker)) continue;
      const holdingIdx = workingHoldings.findIndex(h => h.ticker === row.ticker && h.status !== 'sold');
      const newValue = Math.round(row.shares * row.price);
      const gainLoss = newValue - Math.round(row.shares * (row.costBasis || 0));
      const gainPct = row.costBasis > 0 ? ((row.price - row.costBasis) / row.costBasis) * 100 : 0;

      if (holdingIdx >= 0) {
        workingHoldings[holdingIdx] = {
          ...workingHoldings[holdingIdx],
          shares: row.shares, currentPrice: row.price,
          avgCostBasis: row.costBasis || workingHoldings[holdingIdx].avgCostBasis,
          currentValue: newValue, totalGainLoss: gainLoss,
          totalGainLossPercent: Math.round(gainPct * 100) / 100,
          lastUpdated: today, status: 'active',
        };
        updated++;
      } else {
        workingHoldings.push({
          id: `${institution.toLowerCase()}-${row.ticker.toLowerCase()}-${Date.now()}`,
          accountId: targetAcct.id, ticker: row.ticker, name: row.ticker,
          assetClass: 'stock', shares: row.shares, avgCostBasis: row.costBasis,
          currentPrice: row.price, currentValue: newValue, totalGainLoss: gainLoss,
          totalGainLossPercent: Math.round(gainPct * 100) / 100, status: 'active',
          notes: `Added via ${institution} import (${today})`, lastUpdated: today,
        });
        added++;
      }
    }

    // Mark holdings not in import as sold (only if same account)
    for (let i = 0; i < workingHoldings.length; i++) {
      const h = workingHoldings[i];
      if (h.status === 'sold' || SKIP_TICKERS.has(h.ticker) || h.accountId !== targetAcct.id) continue;
      if (!importedTickers.has(h.ticker)) {
        workingHoldings[i] = { ...h, status: 'sold', shares: 0, currentValue: 0, notes: `${h.notes ? h.notes + ' | ' : ''}Sold/removed — last seen ${h.lastUpdated || today}`, lastUpdated: today };
        sold++;
      }
    }

    const updatedAcct = { ...targetAcct, holdings: workingHoldings, totalValue: workingHoldings.filter(h => h.status !== 'sold').reduce((s, h) => s + h.currentValue, 0), lastUpdated: today };
    setAccounts(prev => prev.map(a => a.id === targetAcct.id ? updatedAcct : a));
    await saveAccount(updatedAcct);
    await auditCsvImport(targetAcct.id, targetAcct.name, institution, { updated, added, removed: sold, total: rows.length });

    const parts = [];
    if (updated > 0) parts.push(`${updated} updated`);
    if (added > 0) parts.push(`${added} added`);
    if (sold > 0) parts.push(`${sold} removed`);
    alert(`${institution} import into "${targetAcct.name}": ${parts.join(', ') || 'no changes'} (${rows.length} rows)`);
    setPendingFile(null);
    setShowPicker(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { rows, institution } = parseInvestmentCSV(text);

    if (rows.length === 0) {
      alert(`Could not parse this CSV (detected: ${institution}). Make sure it's a holdings export, not a transaction history.`);
      e.target.value = '';
      return;
    }

    if (brokerageAccounts.length === 1) {
      await runImport(brokerageAccounts[0], rows, institution);
    } else if (brokerageAccounts.length > 1) {
      setPendingFile({ text, institution, rows });
      setShowPicker(true);
    } else {
      alert('No active brokerage account found. Add one first using the "Add Account" button.');
    }
    e.target.value = '';
  };

  return (
    <>
      <input type="file" id="investment-upload" accept=".csv,.txt" className="hidden" onChange={handleFile} />
      <button onClick={() => document.getElementById('investment-upload')?.click()}
        className="px-3 py-1.5 bg-surface-3 hover:bg-surface-4 rounded-lg text-xs text-text-secondary transition-colors">
        Import CSV
      </button>

      {/* Account picker modal when multiple brokerage accounts exist */}
      {showPicker && pendingFile && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowPicker(false)}>
          <div className="glass-card p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="font-semibold text-text-primary">Select Target Account</h3>
              <p className="text-xs text-text-muted mt-1">Detected: <strong className="text-accent">{pendingFile.institution}</strong> · {pendingFile.rows.length} holdings</p>
            </div>
            <div className="space-y-2">
              {brokerageAccounts.map(acct => (
                <button key={acct.id} onClick={() => runImport(acct, pendingFile.rows, pendingFile.institution)}
                  className="w-full text-left p-3 rounded-xl border border-glass-border hover:border-accent/30 hover:bg-accent/5 transition-colors">
                  <div className="text-sm font-medium text-text-primary">{acct.name}</div>
                  <div className="text-xs text-text-muted">{acct.institution} · {formatCurrency(acct.totalValue)}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowPicker(false)} className="w-full py-2 text-xs text-text-muted hover:text-text-secondary transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Add Account ───

const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string; icon: string }[] = [
  { value: 'bank', label: 'Bank / Checking / Savings', icon: '🏦' },
  { value: 'brokerage', label: 'Individual Brokerage', icon: '📈' },
  { value: 'crypto', label: 'Crypto Exchange', icon: '₿' },
  { value: '401k', label: '401(k)', icon: '🏛' },
  { value: 'ira', label: 'Traditional IRA', icon: '🏛' },
  { value: 'roth_ira', label: 'Roth IRA', icon: '🌱' },
  { value: 'hsa', label: 'HSA', icon: '🏥' },
];

function AddAccountButton({ accounts, setAccounts }: {
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [value, setValue] = useState('');

  const handleAdd = async () => {
    const n = name.trim();
    const inst = institution.trim();
    if (!n || !inst) return;
    const today = new Date().toISOString().split('T')[0];
    const slug = inst.toLowerCase().replace(/\s+/g, '-');
    const id = `${slug}-${type}-${Date.now()}`;
    // Optional "current value" → a single balance holding so net worth is right
    // immediately (saveAccount recomputes totalValue FROM holdings, so an empty
    // holdings array would zero it out). Detailed ticker-level holdings can be
    // added later via the account's holdings table; a CSV/Coinbase import will
    // replace this placeholder with real positions.
    const val = parseFloat(value) || 0;
    const assetClass = type === 'crypto' ? 'crypto' : type === 'bank' ? 'cash' : 'mutual_fund';
    const holdings = val > 0 ? [{
      id: `${id}-bal`,
      accountId: id,
      ticker: 'BAL',
      name: 'Balance (manual)',
      assetClass: assetClass as 'crypto' | 'cash' | 'mutual_fund',
      shares: val,
      avgCostBasis: 1,
      currentPrice: 1,
      currentValue: val,
      totalGainLoss: 0,
      totalGainLossPercent: 0,
      status: 'active' as const,
      lastUpdated: today,
    }] : [];
    const newAccount: Account = {
      id,
      name: n,
      institution: inst,
      type,
      holdings,
      totalValue: val,
      lastUpdated: today,
      status: 'active',
    };
    const updated = [...accounts, newAccount];
    setAccounts(updated);
    await saveAccount(newAccount);
    await auditAccountAdded(newAccount.id, n, inst, type);
    setOpen(false);
    setName('');
    setInstitution('');
    setType('bank');
    setValue('');
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-text-muted hover:text-accent transition-colors py-2 px-1">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Add account
      </button>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-accent/20 bg-accent/5 space-y-3">
      <div className="text-sm font-bold text-accent">Add New Account</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Account Name</label>
          <input placeholder="e.g. Main Checking" value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50" />
        </div>
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Institution</label>
          <input placeholder="e.g. Chase, Fidelity, Coinbase" value={institution} onChange={e => setInstitution(e.target.value)}
            className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50" />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Account Type</label>
        <div className="grid grid-cols-2 gap-1.5">
          {ACCOUNT_TYPE_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setType(opt.value)}
              className={`text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${type === opt.value ? 'bg-accent/15 border border-accent/30 text-accent-light' : 'bg-surface-2 border border-glass-border text-text-secondary hover:border-accent/20'}`}>
              <span>{opt.icon}</span><span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Current Value <span className="text-text-muted/60 normal-case">(optional — enter a balance to skip ticker-level entry)</span></label>
        <input type="number" step="any" inputMode="decimal" placeholder="e.g. 66842" value={value} onChange={e => setValue(e.target.value)}
          className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50" />
      </div>
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={!name.trim() || !institution.trim()}
          className="px-4 py-1.5 bg-accent hover:bg-accent-dim disabled:opacity-40 rounded-lg text-xs font-medium text-white transition-colors">
          Add Account
        </button>
        <button onClick={() => setOpen(false)}
          className="px-4 py-1.5 bg-surface-3 hover:bg-surface-4 rounded-lg text-xs text-text-muted transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useAppData, formatCurrency } from '../../context/AppDataContext';
import { generateXrayReport, findHiddenConcentrations, isStockOnly, type UnderlyingExposure } from '../../utils/etfXray';
import type { AssetClass } from '../../types/portfolio';

const MAX_SOURCES_PREVIEW = 3;

export default function EtfXrayPanel() {
  const { accounts } = useAppData();
  const report = useMemo(() => generateXrayReport(accounts), [accounts]);
  const concentrations = useMemo(() => findHiddenConcentrations(report), [report]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'stocks' | 'hidden' | 'direct-only'>('all');

  const stocksOnly = useMemo(() => report.exposures.filter(isStockOnly), [report.exposures]);
  const directOnly = useMemo(() => report.exposures.filter(e => e.etfValue === 0), [report.exposures]);

  const filtered = useMemo(() => {
    if (filter === 'stocks') return stocksOnly;
    if (filter === 'hidden') {
      const hiddenTickers = new Set(concentrations.map(c => c.ticker));
      return report.exposures.filter(e => hiddenTickers.has(e.ticker));
    }
    if (filter === 'direct-only') return directOnly;
    return report.exposures;
  }, [report.exposures, stocksOnly, directOnly, concentrations, filter]);

  if (report.totalPortfolioValue === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-5xl mb-3">🔬</div>
        <h3 className="text-lg font-bold text-text-primary mb-1">X-Ray has nothing to scan</h3>
        <p className="text-sm text-text-muted max-w-md mx-auto">
          Add some holdings to your portfolio and come back — X-Ray shows every stock you own, directly <em>and</em> through your ETFs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Allocation strip */}
      <AllocationStrip byAssetClass={report.byAssetClass} total={report.totalPortfolioValue} />

      {/* Hero */}
      <div className="glass-card p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-accent/5 to-transparent pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-accent/20 flex items-center justify-center text-2xl">🔬</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-text-primary">Portfolio X-Ray</h2>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">
              What you actually own — every stock in your portfolio, counting direct holdings AND what lives inside your ETFs.
              Covers <span className="text-accent font-semibold">{report.coveredEtfs.length}</span> of your funds totaling <span className="text-accent font-semibold">{formatCurrency(report.totalEtfValueCovered)}</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Hidden Concentrations */}
      {concentrations.length > 0 && (
        <div className="glass-card p-5 border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">⚠️</span>
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Hidden Concentrations</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">{concentrations.length}</span>
          </div>
          <p className="text-xs text-text-muted mb-4">
            These stocks show up in multiple places in your portfolio — you may be more concentrated than you think.
          </p>
          <div className="space-y-2">
            {concentrations.slice(0, 5).map(c => (
              <button
                key={c.ticker}
                onClick={() => { setFilter('all'); setExpanded(c.ticker); document.getElementById(`xray-${c.ticker}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-glass-border hover:border-amber-500/30 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center text-[10px] font-bold text-amber-400 flex-shrink-0">
                  {c.ticker.length <= 5 ? c.ticker : c.ticker.slice(0, 4)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{c.name}</span>
                    {c.hasConviction && (
                      <span className="text-[10px]" title="Flagged as a conviction hold">⭐</span>
                    )}
                    <span className="text-xs text-text-muted">·</span>
                    <span className="text-xs text-text-muted">{c.fundCount} sources</span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 truncate">{c.message}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold text-text-primary">{formatCurrency(c.totalValue)}</div>
                  <div className="text-[10px] text-amber-400 font-semibold">{c.portfolioPct.toFixed(1)}%</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider text-text-muted font-bold mr-1">Show</span>
        {[
          { id: 'all' as const, label: 'Everything', count: report.exposures.length },
          { id: 'stocks' as const, label: 'Stocks Only', count: stocksOnly.length },
          { id: 'hidden' as const, label: 'Concentrations', count: concentrations.length },
          { id: 'direct-only' as const, label: 'Direct Only', count: directOnly.length },
        ].map(opt => (
          <button
            key={opt.id}
            onClick={() => setFilter(opt.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
              filter === opt.id
                ? 'bg-accent/15 text-accent-light border border-accent/30'
                : 'bg-white/5 text-text-muted hover:bg-white/10 border border-transparent'
            }`}
          >
            {opt.label}
            <span className="text-[10px] opacity-60">{opt.count}</span>
          </button>
        ))}
      </div>

      {/* Exposure list */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-3 border-b border-glass-border flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Underlying Exposures</h3>
          <span className="text-xs text-text-muted">{filtered.length} stock{filtered.length === 1 ? '' : 's'}</span>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">No stocks match this filter.</div>
        ) : (
          <ul className="divide-y divide-glass-border">
            {filtered.slice(0, 50).map((exp, i) => (
              <ExposureRow
                key={exp.ticker}
                exp={exp}
                rank={i + 1}
                expanded={expanded === exp.ticker}
                onToggle={() => setExpanded(expanded === exp.ticker ? null : exp.ticker)}
              />
            ))}
          </ul>
        )}
        {filtered.length > 50 && (
          <div className="p-3 text-center text-xs text-text-muted border-t border-glass-border">
            Showing top 50 of {filtered.length}
          </div>
        )}
      </div>

      {/* Uncovered ETFs */}
      {report.uncoveredEtfs.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-2">Funds Not Yet In X-Ray</h3>
          <p className="text-xs text-text-muted mb-3">
            These tickers look like ETFs but aren't in our constituent table yet. They're counted as direct positions for now.
            Dynamic constituent lookups are planned for v2.
          </p>
          <div className="flex flex-wrap gap-2">
            {report.uncoveredEtfs.map(u => (
              <span key={u.ticker} className="px-2.5 py-1 rounded-lg text-xs bg-white/[0.03] border border-glass-border text-text-secondary">
                {u.ticker} <span className="text-text-muted">· {formatCurrency(u.value)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExposureRow({
  exp, rank, expanded, onToggle,
}: {
  exp: UnderlyingExposure;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isHidden = exp.sourceCount >= 2 && exp.portfolioPct >= 1;
  const directPct = exp.totalValue > 0 ? (exp.directValue / exp.totalValue) * 100 : 0;
  return (
    <li id={`xray-${exp.ticker}`}>
      <button onClick={onToggle} className="w-full text-left px-5 py-3 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-4">
          <div className="text-sm font-black text-text-muted/30 w-6 text-center flex-shrink-0">{rank}</div>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/15 to-violet-500/10 flex items-center justify-center text-[10px] font-bold text-accent flex-shrink-0">
            {exp.ticker.length <= 5 ? exp.ticker : exp.ticker.slice(0, 4)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-text-primary">{exp.name}</span>
              {exp.hasConviction && (
                <span className="text-[11px]" title="Conviction hold — you've flagged this one as intentional">⭐</span>
              )}
              {isHidden && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400">Hidden</span>
              )}
            </div>
            <div className="text-xs text-text-muted mt-0.5 truncate">
              {sourcesSummary(exp)}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold text-text-primary">{formatCurrency(exp.totalValue)}</div>
            <div className="text-[11px] text-text-muted">{exp.portfolioPct.toFixed(2)}% of portfolio</div>
          </div>
          <div className="text-text-muted text-xs flex-shrink-0 w-4 text-center">{expanded ? '−' : '+'}</div>
        </div>
        {/* Direct vs ETF split bar */}
        {exp.directValue > 0 && exp.etfValue > 0 && (
          <div className="h-1 rounded-full overflow-hidden flex mt-2 ml-16">
            <div className="bg-accent/70" style={{ width: `${directPct}%` }} title={`Direct: ${formatCurrency(exp.directValue)}`} />
            <div className="bg-violet-500/70" style={{ width: `${100 - directPct}%` }} title={`Through ETFs: ${formatCurrency(exp.etfValue)}`} />
          </div>
        )}
      </button>
      {expanded && (
        <div className="px-5 pb-4 pt-1 pl-20 space-y-1 bg-white/[0.01]">
          {exp.sources.map((s, i) => (
            <div key={`${s.via}-${i}`} className="flex items-center justify-between gap-3 text-xs py-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase flex-shrink-0 ${
                  s.kind === 'direct'
                    ? 'bg-accent/15 text-accent-light'
                    : 'bg-violet-500/15 text-violet-300'
                }`}>
                  {s.kind === 'direct' ? 'Direct' : 'ETF'}
                </span>
                <span className="text-text-primary font-medium truncate">{s.via}</span>
                {s.viaName && <span className="text-text-muted truncate">· {s.viaName}</span>}
                {s.weight !== undefined && (
                  <span className="text-text-muted flex-shrink-0">· {(s.weight * 100).toFixed(1)}% weight</span>
                )}
              </div>
              <span className="text-text-secondary font-medium flex-shrink-0">{formatCurrency(s.value)}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

const ASSET_CLASS_META: Record<AssetClass, { label: string; color: string; dot: string }> = {
  stock: { label: 'Stocks', color: 'text-accent-light', dot: 'bg-accent' },
  etf: { label: 'ETFs', color: 'text-violet-300', dot: 'bg-violet-500' },
  mutual_fund: { label: 'Mutual funds', color: 'text-blue-300', dot: 'bg-blue-500' },
  crypto: { label: 'Crypto', color: 'text-amber-300', dot: 'bg-amber-500' },
  bond: { label: 'Bonds', color: 'text-emerald-300', dot: 'bg-emerald-500' },
  rsu: { label: 'Equity grants', color: 'text-rose-300', dot: 'bg-rose-500' },
  option: { label: 'Options', color: 'text-fuchsia-300', dot: 'bg-fuchsia-500' },
  cash: { label: 'Cash', color: 'text-text-muted', dot: 'bg-text-muted' },
};

const ASSET_CLASS_ORDER: AssetClass[] = ['stock', 'etf', 'mutual_fund', 'crypto', 'bond', 'rsu', 'option', 'cash'];

function AllocationStrip({ byAssetClass, total }: { byAssetClass: Partial<Record<AssetClass, number>>; total: number }) {
  if (total <= 0) return null;
  const entries = ASSET_CLASS_ORDER
    .map(ac => ({ ac, value: byAssetClass[ac] ?? 0 }))
    .filter(e => e.value > 0)
    .map(e => ({ ...e, pct: (e.value / total) * 100 }));
  if (entries.length === 0) return null;
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-text-muted font-bold">Portfolio Composition</span>
        <span className="text-[11px] text-text-muted">{formatCurrency(total)} total</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex border border-glass-border">
        {entries.map(e => (
          <div
            key={e.ac}
            className={`${ASSET_CLASS_META[e.ac].dot} transition-all`}
            style={{ width: `${e.pct}%` }}
            title={`${ASSET_CLASS_META[e.ac].label}: ${formatCurrency(e.value)} (${e.pct.toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap mt-2">
        {entries.map(e => (
          <div key={e.ac} className="flex items-center gap-1.5 text-[11px]">
            <span className={`w-2 h-2 rounded-full ${ASSET_CLASS_META[e.ac].dot}`} />
            <span className={ASSET_CLASS_META[e.ac].color}>{ASSET_CLASS_META[e.ac].label}</span>
            <span className="text-text-muted">{e.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function sourcesSummary(exp: UnderlyingExposure): string {
  const direct = exp.sources.find(s => s.kind === 'direct');
  const etfs = exp.sources.filter(s => s.kind === 'etf');
  const parts: string[] = [];
  if (direct) parts.push(`Direct (${formatCurrency(direct.value)})`);
  if (etfs.length) {
    const top = etfs.slice(0, MAX_SOURCES_PREVIEW).map(s => s.via).join(', ');
    const rest = etfs.length - MAX_SOURCES_PREVIEW;
    parts.push(`via ${top}${rest > 0 ? ` +${rest} more` : ''}`);
  }
  return parts.join(' · ') || 'No sources';
}

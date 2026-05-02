import { useState, useMemo, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { PortfolioSnapshot } from '../../types/portfolio';
import { formatCurrency } from '../../context/AppDataContext';

type TimePeriod = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

interface PerformanceChartProps {
  snapshots: PortfolioSnapshot[];
  currentTotal: number;
  label?: string;
  height?: number;
  showTimePeriods?: boolean;
  compact?: boolean;
  /** Which snapshot field to chart. Defaults to 'totalNetWorth'. */
  snapshotKey?: 'totalNetWorth' | 'totalLiquidNetWorth';
}

const TIME_PERIODS: TimePeriod[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

function getStartDate(period: TimePeriod): Date {
  const now = new Date();
  switch (period) {
    case '1W': return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    case '1M': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case '3M': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case '6M': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case 'YTD': return new Date(now.getFullYear(), 0, 1);
    case '1Y': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case 'ALL': return new Date(2000, 0, 1);
  }
}

function formatAxisDate(dateStr: string, totalDays: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (totalDays <= 14) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (totalDays <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (totalDays <= 365) return d.toLocaleDateString('en-US', { month: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function PerformanceChart({
  snapshots,
  currentTotal,
  label = 'Total Net Worth',
  height = 300,
  showTimePeriods = true,
  compact = false,
  snapshotKey = 'totalNetWorth',
}: PerformanceChartProps) {
  const [period, setPeriod] = useState<TimePeriod>('ALL');
  const [hoverValue, setHoverValue] = useState<{ value: number; date: string } | null>(null);

  // Filter snapshots to period
  const filteredData = useMemo(() => {
    if (snapshots.length === 0) return [];
    const startDate = getStartDate(period);
    const filtered = snapshots.filter(s => new Date(s.date + 'T00:00:00') >= startDate);
    // Always include at least the earliest available if filter is too aggressive
    if (filtered.length === 0 && snapshots.length > 0) return snapshots;
    return filtered;
  }, [snapshots, period]);

  const chartData = useMemo(() => {
    const totalDays = filteredData.length > 1
      ? (new Date(filteredData[filteredData.length - 1].date).getTime() - new Date(filteredData[0].date).getTime()) / 86400000
      : 30;

    return filteredData.map(s => ({
      date: s.date,
      label: formatAxisDate(s.date, totalDays),
      value: s[snapshotKey],
      liquid: s.totalLiquidNetWorth,
    }));
  }, [filteredData, snapshotKey]);

  // Calculate gain/loss for period
  const periodStart = filteredData.length > 0 ? filteredData[0][snapshotKey] : currentTotal;
  const displayValue = hoverValue?.value ?? currentTotal;
  const displayDate = hoverValue?.date ?? null;
  const gainLoss = displayValue - periodStart;
  const gainLossPct = periodStart > 0 ? (gainLoss / periodStart) * 100 : 0;
  const isPositive = gainLoss >= 0;

  const handleMouseMove = useCallback((data: any) => {
    if (data?.activePayload?.[0]) {
      setHoverValue({
        value: data.activePayload[0].payload.value,
        date: data.activePayload[0].payload.date,
      });
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverValue(null);
  }, []);

  // Not enough data
  if (snapshots.length < 2) {
    return (
      <div className="glass-card p-6 text-center">
        <div className="text-text-muted text-sm">
          More data points needed — Iris snapshots your portfolio daily. Check back in a few days.
        </div>
        <div className="mt-3">
          <span className={`text-${compact ? '2xl' : '3xl'} font-bold text-text-primary`}>{formatCurrency(currentTotal)}</span>
          <div className="text-xs text-text-muted mt-1">{label}</div>
        </div>
      </div>
    );
  }

  const strokeColor = isPositive ? '#22c55e' : '#ef4444';
  const gradientId = `perfGradient-${isPositive ? 'up' : 'down'}`;

  return (
    <div>
      {/* Value display */}
      <div className={compact ? 'mb-3' : 'mb-4'}>
        <div className={`${compact ? 'text-2xl' : 'text-3xl'} font-bold text-text-primary leading-tight`}>
          {formatCurrency(displayValue)}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? '+' : ''}{formatCurrency(gainLoss)} ({isPositive ? '+' : ''}{gainLossPct.toFixed(2)}%)
          </span>
          <span className="text-xs text-text-muted">
            {displayDate
              ? new Date(displayDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : period === 'ALL' ? 'All time' : `Past ${period}`}
          </span>
        </div>
      </div>

      {/* Time period toggles */}
      {showTimePeriods && (
        <div className={`flex gap-1 ${compact ? 'mb-3' : 'mb-4'}`}>
          {TIME_PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                period === p
                  ? 'bg-accent/15 text-accent-light'
                  : 'text-text-muted hover:text-text-secondary hover:bg-white/5'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={chartData}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.2} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            hide
            domain={['dataMin', 'dataMax']}
            padding={{ top: 20, bottom: 20 }}
          />
          <Tooltip
            content={<></>}
            cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: strokeColor, stroke: '#0a0a0f', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Label */}
      {!compact && (
        <div className="text-xs text-text-muted mt-2 text-center">{label}</div>
      )}
    </div>
  );
}

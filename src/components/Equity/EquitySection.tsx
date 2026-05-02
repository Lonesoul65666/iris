import type { EquityProfile } from '../../types/portfolio';
import { formatCurrency } from '../../context/AppDataContext';

/**
 * Company-equity section — rendered inline inside PortfolioView (compact) and
 * inside EquityView (full, with IPO-scenario table + equity notes).
 *
 * Why this lives in its own component: Scott's equity can be >50% of net
 * worth, so it needs to show up alongside brokerage/crypto/401k in Portfolio
 * rather than being hidden behind a separate route. Full scenario planning
 * still lives on /equity for detail work.
 */
interface Props {
  equity: EquityProfile;
  /** Full mode shows IPO-scenario table + key notes. Compact embeds inside Portfolio. */
  variant?: 'compact' | 'full';
  /** Called when user clicks "Open full equity view". Only relevant in compact variant. */
  onOpenFull?: () => void;
}

export default function EquitySection({ equity, variant = 'compact', onOpenFull }: Props) {
  const netValue = equity.totalCurrentValue - equity.totalExerciseCost;

  return (
    <div className="space-y-4">
      {/* Section header — matches the other Portfolio sections */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏢</span>
          <h2 className="text-lg font-semibold text-text-primary">Company Equity</h2>
          <span className="text-xs text-text-muted">{equity.company} · {equity.grants.length} grants</span>
        </div>
        <span className="text-sm font-medium text-text-secondary">{formatCurrency(equity.totalCurrentValue)}</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Shares" value={equity.totalShares.toLocaleString()} sub="Across all grants" />
        <StatCard label="Current Value" value={formatCurrency(equity.totalCurrentValue)} sub={`@ $${equity.currentFMV}/share`} />
        <StatCard label="Exercise Cost" value={formatCurrency(equity.totalExerciseCost)} sub="To buy all exercisable" />
        <StatCard label="Net Equity" value={formatCurrency(netValue)} color="text-emerald-400" sub="Value minus cost" />
      </div>

      {/* Grants — compact row list (keeps style consistent with HoldingRow) */}
      <div className="space-y-1.5">
        {equity.grants.map(g => {
          const val = g.type === 'iso'
            ? (g.exercisedShares + g.exercisableShares) * equity.currentFMV
            : g.outstandingShares * equity.currentFMV;
          return (
            <div
              key={g.id}
              className="rounded-xl border border-glass-border bg-white/[0.01] hover:border-white/10 transition-colors p-3 flex items-center gap-3"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  g.type === 'iso' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                }`}
              >
                {g.type.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{g.grantName}</div>
                <div className="text-[11px] text-text-muted truncate">
                  {g.totalShares.toLocaleString()} shares
                  {g.strikePrice > 0 ? <> · Strike <span className="font-mono">${g.strikePrice.toFixed(2)}</span></> : null}
                  {g.exercisableShares > 0 ? <> · <span className="text-positive">{g.exercisableShares.toLocaleString()} exercisable</span></> : null}
                  {g.outstandingShares > 0 && g.type === 'rsu' ? <> · {g.outstandingShares.toLocaleString()} outstanding</> : null}
                </div>
              </div>
              <div className="text-right flex-shrink-0 w-24">
                <div className="text-sm font-semibold text-text-primary">{formatCurrency(val)}</div>
                <div className="text-[10px] text-text-muted">current value</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact → link to full view; Full → include IPO scenarios + notes */}
      {variant === 'compact' && onOpenFull && (
        <button
          onClick={onOpenFull}
          className="text-xs text-accent hover:text-accent-light font-medium transition-colors"
        >
          Open full equity view (IPO scenarios, exercise timing) →
        </button>
      )}

      {variant === 'full' && (
        <>
          {/* IPO Scenario Table */}
          <div className="glass-card p-6">
            <h3 className="font-semibold text-text-primary mb-4">IPO Scenario Analysis</h3>
            <p className="text-xs text-text-muted mb-4">
              Based on {equity.totalShares.toLocaleString()} total shares (exercised ISOs + exercisable ISOs + RSUs)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-text-muted uppercase tracking-wider">
                    <th className="text-left p-3">Valuation</th>
                    <th className="text-right p-3">Est. Price/Share</th>
                    <th className="text-right p-3">Gross Value</th>
                    <th className="text-right p-3">Exercise Cost</th>
                    <th className="text-right p-3">Est. Tax (blended)</th>
                    <th className="text-right p-3">Net Proceeds</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { val: 6, price: 25 },
                    { val: 8, price: 33 },
                    { val: 10, price: 42 },
                    { val: 15, price: 62 },
                    { val: 20, price: 83 },
                  ].map(({ val, price }, i) => {
                    const gross = equity.totalShares * price;
                    const exerciseCost = equity.totalExerciseCost;
                    const taxRate = 0.27;
                    const tax = (gross - exerciseCost) * taxRate;
                    const net = gross - exerciseCost - tax;
                    return (
                      <tr key={i} className="border-t border-glass-border hover:bg-white/[0.02]">
                        <td className="p-3 text-sm text-text-primary font-medium">${val}B</td>
                        <td className="p-3 text-sm text-text-secondary text-right font-mono">${price}</td>
                        <td className="p-3 text-sm text-text-primary text-right">{formatCurrency(gross)}</td>
                        <td className="p-3 text-sm text-text-muted text-right">{formatCurrency(exerciseCost)}</td>
                        <td className="p-3 text-sm text-negative text-right">{formatCurrency(tax)}</td>
                        <td className="p-3 text-sm text-positive text-right font-bold">{formatCurrency(net)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-text-muted mt-3">
              * Tax estimates use a blended 27% rate (mix of LTCG on exercised ISOs and ordinary income on RSUs).
              Actual tax depends on exercise timing, holding periods, and AMT. Consult your CPA.
            </p>
          </div>

          {/* Key Notes */}
          <div className="glass-card p-6 border-warning/20">
            <h3 className="font-semibold text-warning mb-3 flex items-center gap-2">⚠️ Critical Equity Notes</h3>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex gap-2"><span className="text-negative">!</span> 15,768 ISOs exercisable at $0.76 — exercise before IPO for LTCG treatment (~$90k tax savings vs waiting)</li>
              <li className="flex gap-2"><span className="text-negative">!</span> 2022 ISO exercises may not have been reported for AMT — get CPA to review and file amended return</li>
              <li className="flex gap-2"><span className="text-warning">!</span> 17,882 RSUs will be taxed as ordinary income at distribution (~32-35% federal)</li>
              <li className="flex gap-2"><span className="text-warning">!</span> Post-IPO: consider diversifying 25-50% after lockup — salary + equity = extreme single-company risk</li>
              <li className="flex gap-2"><span className="text-text-muted">i</span> ISO expiration dates: ES-199 expires Apr 2031, ES-395 expires Oct 2031</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="stat-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold">{label}</div>
      <div className={`text-lg font-bold mt-1 ${color || 'text-text-primary'}`}>{value}</div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

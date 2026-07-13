import { formatCurrency } from '../../context/AppDataContext';
import type { SubscriptionRadar as Radar, RadarItem, SubStatus } from '../../utils/subscriptionRadar';

/**
 * Subscription & recurring-charge radar — ranked monthly-cost hit-list, now
 * manageable: mark a charge Canceled (watchdog alerts if it bills again) or
 * Ignored (not really a subscription — hide it). Bare content for a DashSection.
 */

const CADENCE_LABEL: Record<RadarItem['cadence'], string> = {
  weekly: 'weekly',
  biweekly: 'every 2 wks',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
  irregular: '',
};

const actionBtn = 'text-[11px] px-2 py-0.5 rounded-md border border-glass-border text-text-muted hover:text-text-primary hover:bg-white/[0.04] transition-colors';

export default function SubscriptionRadar({ radar, onSetStatus }: {
  radar: Radar;
  onSetStatus: (merchant: string, status: SubStatus) => void;
}) {
  if (radar.count === 0 && radar.canceled.length === 0 && radar.ignored.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No recurring charges detected yet. As Iris sees more history, your subscriptions and standing
        bills will show up here, ranked by monthly cost.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-text-secondary">
          {radar.count} active recurring charge{radar.count === 1 ? '' : 's'}
        </span>
        <span className="text-sm text-text-muted tabular-nums">
          <span className="font-bold text-text-primary">{formatCurrency(radar.totalMonthly)}</span>/mo
          {' · '}
          {formatCurrency(radar.totalAnnual)}/yr
        </span>
      </div>

      {/* Active — the standing load, each cancel/ignore-able. */}
      <div className="space-y-1.5">
        {radar.items.map((it, i) => (
          <div key={`${it.merchant}-${i}`} className="group flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-text-secondary truncate">{it.merchant}</span>
              {CADENCE_LABEL[it.cadence] && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-accent/10 text-accent-light flex-shrink-0">
                  {CADENCE_LABEL[it.cadence]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="hidden group-hover:flex items-center gap-1.5">
                <button className={actionBtn} onClick={() => onSetStatus(it.merchant, 'canceled')}>Canceled</button>
                <button className={actionBtn} onClick={() => onSetStatus(it.merchant, 'ignored')}>Not a sub</button>
              </span>
              <span className="text-right">
                <span className="text-sm font-semibold text-text-primary tabular-nums">{formatCurrency(it.monthlyCost)}</span>
                <span className="text-[11px] text-text-muted">/mo</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Canceled — kept out of the total; the watchdog flags any that bill again. */}
      {radar.canceled.length > 0 && (
        <div className="pt-3 border-t border-glass-border space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">Canceled</div>
          {radar.canceled.map((it, i) => (
            <div key={`c-${it.merchant}-${i}`} className="group flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-sm truncate ${it.resurrected ? 'text-negative' : 'text-text-muted line-through'}`}>{it.merchant}</span>
                {it.resurrected && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-negative/15 text-negative flex-shrink-0">
                    charged again {it.lastDate}
                  </span>
                )}
              </div>
              <button className={`${actionBtn} hidden group-hover:inline-block`} onClick={() => onSetStatus(it.merchant, 'active')}>Restore</button>
            </div>
          ))}
        </div>
      )}

      {/* Ignored — false positives the user hid. */}
      {radar.ignored.length > 0 && (
        <div className="pt-3 border-t border-glass-border space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">Ignored</div>
          {radar.ignored.map((it, i) => (
            <div key={`ig-${it.merchant}-${i}`} className="group flex items-center justify-between gap-3">
              <span className="text-sm text-text-muted truncate">{it.merchant}</span>
              <button className={`${actionBtn} hidden group-hover:inline-block`} onClick={() => onSetStatus(it.merchant, 'active')}>Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

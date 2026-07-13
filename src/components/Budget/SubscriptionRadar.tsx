import { formatCurrency } from '../../context/AppDataContext';
import type { SubscriptionRadar as Radar, RadarItem } from '../../utils/subscriptionRadar';

/**
 * Subscription & recurring-charge radar — ranked monthly-cost hit-list.
 * Bare content for a DashSection. Complements the cash-flow calendar: the
 * calendar shows WHEN charges hit, this shows HOW MUCH each one costs you a
 * month so you can spot creep and cancel what you don't use.
 */

const CADENCE_LABEL: Record<RadarItem['cadence'], string> = {
  weekly: 'weekly',
  biweekly: 'every 2 wks',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
  irregular: '',
};

export default function SubscriptionRadar({ radar }: { radar: Radar }) {
  if (radar.count === 0) {
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
          {radar.count} recurring charge{radar.count === 1 ? '' : 's'}
        </span>
        <span className="text-sm text-text-muted tabular-nums">
          <span className="font-bold text-text-primary">{formatCurrency(radar.totalMonthly)}</span>/mo
          {' · '}
          {formatCurrency(radar.totalAnnual)}/yr
        </span>
      </div>

      <div className="space-y-1.5">
        {radar.items.map((it, i) => (
          <div key={`${it.merchant}-${i}`} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-text-secondary truncate">{it.merchant}</span>
              {CADENCE_LABEL[it.cadence] && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-accent/10 text-accent-light flex-shrink-0">
                  {CADENCE_LABEL[it.cadence]}
                </span>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-sm font-semibold text-text-primary tabular-nums">
                {formatCurrency(it.monthlyCost)}
              </span>
              <span className="text-[11px] text-text-muted">/mo</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

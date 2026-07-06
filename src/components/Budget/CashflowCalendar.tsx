import { formatCurrency } from '../../context/AppDataContext';
import type { CashflowForecast, ForecastItem } from '../../utils/cashflowForecast';

/**
 * "Coming up · next 30 days" — the forward cash-flow calendar. Renders the
 * projected recurring bills (from cashflowForecast) grouped by day. Bare
 * content: meant to live inside a DashSection which supplies the card chrome.
 */

const CADENCE_LABEL: Record<ForecastItem['cadence'], string> = {
  weekly: 'weekly',
  biweekly: 'every 2 wks',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
  irregular: '',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayLabel(iso: string): string {
  const d = parseISO(iso);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function daysAway(iso: string): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((parseISO(iso).getTime() - today.getTime()) / 86_400_000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return `in ${diff} days`;
}

export default function CashflowCalendar({ forecast }: { forecast: CashflowForecast }) {
  if (forecast.days.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No recurring bills detected in the next {forecast.horizonDays} days. As Iris sees more of your
        history, regular charges will show up here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {forecast.days.map((day) => (
        <div key={day.date}>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-text-primary">{dayLabel(day.date)}</span>
              <span className="text-[11px] text-text-muted">{daysAway(day.date)}</span>
            </div>
            <span className="text-sm font-bold text-text-primary tabular-nums">
              {formatCurrency(day.total)}
            </span>
          </div>
          <div className="space-y-1">
            {day.items.map((it, i) => (
              <div
                key={`${it.merchant}-${i}`}
                className="flex items-center justify-between pl-3 border-l-2 border-accent/20"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-text-secondary truncate">{it.merchant}</span>
                  {CADENCE_LABEL[it.cadence] && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-accent/10 text-accent-light flex-shrink-0">
                      {CADENCE_LABEL[it.cadence]}
                    </span>
                  )}
                </div>
                <span className="text-sm text-text-secondary tabular-nums flex-shrink-0 ml-3">
                  {formatCurrency(it.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

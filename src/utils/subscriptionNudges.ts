// Subscription watchdog nudges — the top-of-dashboard alerts.
//
//   • Resurrection: you canceled something and it charged again anyway.
//   • New detected: a recurring charge appeared that wasn't in your known set
//     (accidental signup / creep). Suppressed on first run via the baseline set
//     so you're not flooded with "new!" for everything you already have.
//
// Pure — the dashboard supplies the radar + the baseline set and handles
// persistence / dismissal.

import type { Nudge } from './nudgeEngine';
import type { SubscriptionRadar } from './subscriptionRadar';
import { subKey } from './subscriptionRadar';

function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

export interface SubNudgeResult {
  nudges: Nudge[];
  /** Active merchants not yet in the baseline set — genuinely new arrivals. */
  newMerchants: string[];
}

/**
 * @param radar    status-annotated radar
 * @param baseline keys already known (null = feature has never run → baseline
 *                 pending, emit NO new-charge nudges this pass)
 */
export function buildSubscriptionNudges(radar: SubscriptionRadar, baseline: string[] | null): SubNudgeResult {
  const nudges: Nudge[] = [];

  // Resurrections — canceled charges that billed again after the cancel date.
  for (const it of radar.canceled) {
    if (!it.resurrected) continue;
    nudges.push({
      id: `sub-resurrected:${subKey(it.merchant)}`,
      severity: 'warning',
      category: 'budget',
      icon: '',
      title: 'A canceled subscription charged again',
      body: `You marked ${it.merchant} canceled, but it billed about ${fmt(it.chargeAmount)} on ${it.lastDate}. The cancellation may not have gone through — worth a look.`,
    });
  }

  // New detections — active charges not in the known baseline set.
  const known = new Set(baseline ?? []);
  const newMerchants = radar.items.filter((it) => !known.has(subKey(it.merchant))).map((it) => it.merchant);

  // Only alert once a baseline exists; the very first run seeds silently.
  if (baseline !== null) {
    for (const m of newMerchants) {
      const it = radar.items.find((x) => x.merchant === m);
      if (!it) continue;
      nudges.push({
        id: `sub-new:${subKey(m)}`,
        severity: 'info',
        category: 'budget',
        icon: '',
        title: 'New recurring charge detected',
        body: `${m} looks like a new recurring charge (~${fmt(it.monthlyCost)}/mo). If that wasn't intentional, you can cancel or ignore it under Subscriptions & Recurring.`,
      });
    }
  }

  return { nudges, newMerchants };
}

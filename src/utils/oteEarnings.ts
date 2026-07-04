// On-Target Earnings (OTE) — track total comp received this year against an
// annual target, with the variable/commission portion (everything above the
// base "floor" paycheck) broken out. Scott is paid twice a month: a base check
// mid-month and a base+commission check end-of-month; the commission is the
// at-risk, lands-in-checking money that needs deploying. Pure, no IO.

export interface OtePaycheck { date: string; amount: number }

export interface OteMonth {
  month: string;       // 'YYYY-MM'
  total: number;       // all comp received in the month
  commission: number;  // portion above the base floor
}

export interface OteStatus {
  target: number;            // annual OTE target
  earnedYtd: number;         // total comp received this year (base + commission)
  baseYtd: number;           // base portion (earned − commission)
  commissionYtd: number;     // variable/commission portion (above the floor)
  fractionElapsed: number;   // 0..1 of the year gone by (day-granular)
  targetToDate: number;      // where you "should" be today (straight-line)
  pace: number;              // earnedYtd − targetToDate (>0 = ahead)
  onPace: boolean;           // pace >= 0
  projectedYearEnd: number;  // year-end total at the current rate
  pctOfTarget: number;       // earnedYtd / target × 100 (0..∞)
  byMonth: OteMonth[];       // Jan → current month of this year
}

function daysInYear(year: number): number {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
}

/** Build the OTE status from paychecks, the detected base floor per check, and
 *  the annual target. `floor` is the modal base paycheck; anything a check pays
 *  above it counts as commission. `periodStart` anchors the window — defaults to
 *  Jan 1 (calendar YTD), but pass the pay-raise date to measure the run-rate
 *  since a role change against the annual target. `fractionElapsed` is always the
 *  fraction of a YEAR that has elapsed since periodStart, so the target-to-date
 *  and the annualized projection stay on an annual basis. */
export function computeOteStatus(
  paychecks: OtePaycheck[],
  floor: number,
  target: number,
  now: Date = new Date(),
  periodStart?: Date,
): OteStatus {
  const year = now.getFullYear();
  const start = periodStart ?? new Date(year, 0, 1);
  const dayMs = 86_400_000;
  const DAYS_YR = daysInYear(now.getFullYear());
  // +1 so day one counts as elapsed (not zero); capped at a full year.
  const daysElapsed = Math.min(DAYS_YR, Math.floor((now.getTime() - start.getTime()) / dayMs) + 1);
  const fractionElapsed = daysElapsed / DAYS_YR;

  const ytd = paychecks.filter(p => {
    const d = new Date(`${p.date}T00:00:00`);
    return d >= start && d <= now;
  });

  const earnedYtd = ytd.reduce((s, p) => s + p.amount, 0);
  const commissionYtd = ytd.reduce((s, p) => s + Math.max(0, p.amount - floor), 0);
  const baseYtd = earnedYtd - commissionYtd;

  const targetToDate = target * fractionElapsed;
  const pace = earnedYtd - targetToDate;
  const projectedYearEnd = fractionElapsed > 0 ? earnedYtd / fractionElapsed : 0;
  const pctOfTarget = target > 0 ? (earnedYtd / target) * 100 : 0;

  // Month-by-month from the anchor month (or Jan) through the current month.
  const byMonth: OteMonth[] = [];
  const firstMonth = start.getFullYear() === year ? start.getMonth() : 0;
  for (let m = firstMonth; m <= now.getMonth(); m++) {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    const inMonth = ytd.filter(p => p.date.startsWith(key));
    byMonth.push({
      month: key,
      total: inMonth.reduce((s, p) => s + p.amount, 0),
      commission: inMonth.reduce((s, p) => s + Math.max(0, p.amount - floor), 0),
    });
  }

  return {
    target, earnedYtd, baseYtd, commissionYtd,
    fractionElapsed, targetToDate, pace, onPace: pace >= 0,
    projectedYearEnd, pctOfTarget, byMonth,
  };
}

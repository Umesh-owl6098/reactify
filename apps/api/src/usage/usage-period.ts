/** UTC calendar-month billing periods (1st 00:00 UTC through next month 1st 00:00 UTC). */
export interface UsagePeriod {
  periodStart: Date;
  periodEnd: Date;
}

export function getCurrentUsagePeriod(now: Date = new Date()): UsagePeriod {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { periodStart, periodEnd };
}

export function getUtcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

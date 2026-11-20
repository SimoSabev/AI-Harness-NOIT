/** Dates are plain "YYYY-MM-DD" strings and hours are 0–23 in the shop's own time zone (Sofia). */
export type Day = string;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(s: string): s is Day {
  return DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function addDays(day: Day, n: number): Day {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(day: Day): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

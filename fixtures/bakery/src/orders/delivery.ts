import { addDays, weekday } from "../shared/dates.js";
import type { Day } from "../shared/dates.js";

/** the bakery delivers 8–12 and 14–18; orders until 18:00 go out the next day; closed on Sunday */
export type Slot = "morning" | "afternoon";
export interface DeliverySlot { day: Day; slot: Slot }

export const ORDER_CUTOFF_HOUR = 18;
export const SLOTS: readonly Slot[] = ["morning", "afternoon"];

const closed = (day: Day) => weekday(day) === 0;

/** the first slot an order placed on `day` at `hour` can get */
export function firstSlot(day: Day, hour: number): DeliverySlot {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError(`bad hour: ${hour}`);
  let d = addDays(day, hour < ORDER_CUTOFF_HOUR ? 1 : 2);
  while (closed(d)) d = addDays(d, 1);
  return { day: d, slot: "morning" };
}

/** the next `n` slots from the first one, skipping Sundays */
export function nextSlots(day: Day, hour: number, n: number): DeliverySlot[] {
  const out: DeliverySlot[] = [];
  let d = firstSlot(day, hour).day;
  while (out.length < n) {
    if (!closed(d)) for (const slot of SLOTS) if (out.length < n) out.push({ day: d, slot });
    d = addDays(d, 1);
  }
  return out;
}

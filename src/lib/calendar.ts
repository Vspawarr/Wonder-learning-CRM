// Date helpers for the To-do calendar, used by the server page and the client calendar.
import { addDays } from "./dates";

/** Monday = 0 … Sunday = 6. */
export const weekday = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
export const weekStart = (d: string) => addDays(d, -weekday(d));

/** First and last day shown for a month view (whole Monday–Sunday weeks) or a week view. */
export function calendarRange(mode: "month" | "week", anchor: string) {
  if (mode === "week") {
    const from = weekStart(anchor);
    return { from, to: addDays(from, 6) };
  }
  const first = `${anchor.slice(0, 7)}-01`;
  const [y, m] = first.split("-").map(Number);
  const last = addDays(`${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01`, -1);
  return { from: weekStart(first), to: addDays(weekStart(last), 6) };
}

/** The first of the month n months away. */
export function addMonths(d: string, n: number) {
  const [y, m] = d.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

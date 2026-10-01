// Calendar dates are "YYYY-MM-DD" strings in app code and @db.Date columns in
// Postgres (returned by Prisma as UTC midnight). "Today" is always India time.

export type DateStr = string;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function todayIST(now: Date = new Date()): DateStr {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

export const isDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

export const toDbDate = (s: DateStr) => new Date(s + "T00:00:00Z");
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);
export const optDate = (d: Date | null | undefined) => (d ? fromDbDate(d) : null);

export function addDays(s: DateStr, n: number): DateStr {
  const d = toDbDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDbDate(d);
}

/** Whole days from `today` to `s` (negative = past). */
export function daysFrom(s: DateStr, today: DateStr = todayIST()): number {
  return Math.round((toDbDate(s).getTime() - toDbDate(today).getTime()) / 864e5);
}

/** "5 Oct", or "5 Oct '27" outside the current year. */
export function fmtDate(s: DateStr | null | undefined, today: DateStr = todayIST()): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${MON[m - 1]}${String(y) !== today.slice(0, 4) ? " '" + String(y).slice(2) : ""}`;
}

/** Start (inclusive) of the IST calendar day as an instant, for timestamp columns. */
export const istDayStart = (s: DateStr) => new Date(s + "T00:00:00+05:30");

/** The IST calendar date of a timestamp. */
export const istDate = (iso: string | Date) => todayIST(new Date(iso));

/** "01/10/2026, 03:45:12 PM" in India time, for record timestamps. */
export function fmtDateTimeIST(at: Date | string): string {
  const d = new Date(at);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}:${p.second} ${String(p.dayPeriod).toUpperCase()}`;
}

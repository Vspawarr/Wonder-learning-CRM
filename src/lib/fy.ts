// Indian financial year (1 April – 31 March), used for receipt and PO numbers and the academic year on POs.
import type { DateStr } from "./dates";

export function financialYear(date: DateStr) {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return {
    start,
    /** "2026-27" */
    label: `${start}-${two(start + 1)}`,
    /** "26-27", as on the receipt book (117/26-27) */
    short: `${two(start)}-${two(start + 1)}`,
    /** "2627", as in PO numbers (PO/2627/93) */
    compact: `${two(start)}${two(start + 1)}`,
    /** Prisma filter for rows stored with year/month columns inside this FY. */
    months: { OR: [{ year: start, month: { gte: 4 } }, { year: start + 1, month: { lte: 3 } }] },
  };
}

/** First and last day of the financial year that starts in April of `start` ("2026-04-01" … "2027-03-31"). */
export function fyRange(start: number): { from: DateStr; to: DateStr } {
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** "2026-27" for the year starting April 2026. */
export const fyLabel = (start: number) => `${start}-${String((start + 1) % 100).padStart(2, "0")}`;

/** The year chosen after login: a start year, or null for "All years". */
export type YearChoice = number | null;

/** Cookie that remembers the chosen financial year on this device ("2026" or "all"). */
export const YEAR_COOKIE = "wl_fy";

export function parseYearCookie(v: string | undefined, today: DateStr): YearChoice {
  if (v === "all") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : financialYear(today).start;
}

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

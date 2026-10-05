// The financial year chosen after login (Apr–Mar), kept in a cookie on the device. Lists, the dashboard
// and exports follow it; a record's own page always shows its whole history. Null means "All years".
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { fromDbDate, isDateStr, todayIST } from "@/lib/dates";
import { YEAR_COOKIE, financialYear, fyLabel, fyRange, parseYearCookie, type YearChoice } from "@/lib/fy";

export async function selectedYear(): Promise<YearChoice> {
  const jar = await cookies();
  return parseYearCookie(jar.get(YEAR_COOKIE)?.value, todayIST());
}

/** Start/end dates of the chosen year, or undefined for All years. */
export async function selectedRange() {
  const y = await selectedYear();
  return y === null ? undefined : fyRange(y);
}

/** "Today" inside the chosen year: today for the current year, else the year's last (or first) day. */
export function yearAnchor(y: { from: string; to: string } | undefined, today = todayIST()) {
  if (!y) return today;
  return today > y.to ? y.to : today < y.from ? y.from : today;
}

/** Years to offer: from the first year with data (or this year) up to this year, plus next year from February. */
export async function yearOptions(): Promise<{ start: number; label: string; current: boolean }[]> {
  const today = todayIST();
  const now = financialYear(today).start;
  const [lead, client, inv] = await Promise.all([
    db.lead.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.client.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.invoice.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  const firsts = [lead?.createdAt.toISOString().slice(0, 10), client?.createdAt.toISOString().slice(0, 10), inv ? fromDbDate(inv.date) : undefined]
    .filter((d): d is string => !!d)
    .map((d) => financialYear(d).start);
  const first = Math.min(now, ...firsts);
  const last = Number(today.slice(5, 7)) >= 2 && Number(today.slice(5, 7)) <= 3 ? now + 1 : now;
  const out = [];
  for (let y = last; y >= first; y--) out.push({ start: y, label: fyLabel(y), current: y === now });
  return out;
}

/** A period for money screens: the ?from / ?to filter if set, else the chosen year (All years → this year). */
export async function periodOrYear(from?: string, to?: string) {
  const y = (await selectedRange()) ?? fyRange(financialYear(todayIST()).start);
  return { from: from && isDateStr(from) ? from : y.from, to: to && isDateStr(to) ? to : y.to };
}

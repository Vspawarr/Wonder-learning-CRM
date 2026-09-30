// Pure period helpers, shared by the dashboard service and its filter bar.
import { addDays, todayIST, type DateStr } from "@/lib/dates";

export const PERIODS = [
  ["month", "This month"],
  ["last-month", "Last month"],
  ["quarter", "This quarter"],
  ["fy", "This financial year"],
  ["30d", "Last 30 days"],
  ["custom", "Custom"],
] as const;

export type DashFilters = { period?: string; from?: string; to?: string; exec?: string; state?: string };

/** Inclusive IST date range for a period preset (financial year starts 1 April). */
export function periodRange(f: DashFilters, today: DateStr = todayIST()): { from: DateStr; to: DateStr } {
  const [y, m] = today.split("-").map(Number);
  const iso = (yy: number, mm: number, dd = 1) => `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  switch (f.period) {
    case "last-month": {
      const first = iso(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
      return { from: first, to: addDays(iso(y, m), -1) };
    }
    case "quarter": {
      // FY quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar
      const qStart = [1, 4, 7, 10].filter((q) => q <= m).pop()!;
      return { from: iso(y, qStart), to: today };
    }
    case "fy":
      return { from: m >= 4 ? iso(y, 4) : iso(y - 1, 4), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "custom":
      if (f.from && f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.from) && /^\d{4}-\d{2}-\d{2}$/.test(f.to) && f.from <= f.to)
        return { from: f.from, to: f.to };
      return { from: iso(y, m), to: today };
    default:
      return { from: iso(y, m), to: today };
  }
}

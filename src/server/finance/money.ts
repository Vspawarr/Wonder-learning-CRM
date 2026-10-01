// Pure money and status rules for orders, invoices and payments (unit-tested).
import { daysFrom, todayIST, type DateStr } from "@/lib/dates";

/** Rounds to paise. */
export const r2 = (n: number) => Math.round(n * 100) / 100;

export type Line = { qty: number; price: number; gstRate: number };

export function lineAmount(l: Line) {
  return r2(l.qty * l.price);
}

export function totals(lines: Line[]) {
  const subtotal = r2(lines.reduce((s, l) => s + lineAmount(l), 0));
  const gstAmount = r2(lines.reduce((s, l) => s + (lineAmount(l) * l.gstRate) / 100, 0));
  return { subtotal, gstAmount, total: r2(subtotal + gstAmount) };
}

export type InvoiceState = "PAID" | "PARTIAL" | "UNPAID" | "OVERDUE" | "CANCELLED";

export const INVOICE_STATE_LABEL: Record<InvoiceState, string> = {
  PAID: "Paid",
  PARTIAL: "Partially paid",
  UNPAID: "Unpaid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

/** Paid / balance / status of an invoice from its total, payments, credit notes and due date. */
export function invoiceState(
  inv: {
    total: number;
    status: "ISSUED" | "CANCELLED";
    dueDate: DateStr;
    credited?: number;
  },
  paid: number,
  today: DateStr = todayIST(),
): { paid: number; balance: number; state: InvoiceState; daysOverdue: number } {
  const balance = r2(Math.max(0, inv.total - paid - (inv.credited ?? 0)));
  if (inv.status === "CANCELLED") return { paid: r2(paid), balance: 0, state: "CANCELLED", daysOverdue: 0 };
  if (balance <= 0) return { paid: r2(paid), balance: 0, state: "PAID", daysOverdue: 0 };
  const late = -daysFrom(inv.dueDate, today);
  if (late > 0) return { paid: r2(paid), balance, state: "OVERDUE", daysOverdue: late };
  return {
    paid: r2(paid),
    balance,
    state: paid > 0 ? "PARTIAL" : "UNPAID",
    daysOverdue: 0,
  };
}

/** Invoiced / received / outstanding / overdue across a set of invoices (cancelled ones left out). */
export function outstandingSummary(rows: { total: number; paid: number; balance: number; state: InvoiceState }[]) {
  const live = rows.filter((r) => r.state !== "CANCELLED");
  return {
    invoiced: r2(live.reduce((s, r) => s + r.total, 0)),
    received: r2(live.reduce((s, r) => s + r.paid, 0)),
    outstanding: r2(live.reduce((s, r) => s + r.balance, 0)),
    overdue: r2(live.filter((r) => r.state === "OVERDUE").reduce((s, r) => s + r.balance, 0)),
    overdueCount: live.filter((r) => r.state === "OVERDUE").length,
  };
}

/** Payment statuses that count as money received (cheques only once cleared). */
export const COUNTED_STATUSES = ["RECEIVED", "CLEARED"] as const;
/** Cheques taken but not yet cleared. */
export const PENDING_STATUSES = ["IN_HAND", "DEPOSITED"] as const;

type Pay = { amount: { toString(): string } | number; status: string };
const sumIf = (ps: Pay[], ok: readonly string[]) => r2(ps.filter((p) => ok.includes(p.status)).reduce((s, p) => s + Number(p.amount), 0));
/** Money actually received. */
export const receivedOf = (ps: Pay[]) => sumIf(ps, COUNTED_STATUSES);
/** Cheques in hand or deposited, not yet cleared. */
export const pendingOf = (ps: Pay[]) => sumIf(ps, PENDING_STATUSES);
export const creditedOf = (cns: { amount: { toString(): string } | number }[]) => r2(cns.reduce((s, c) => s + Number(c.amount), 0));

export const AGE_BUCKETS = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;

/** Still-owed amounts by how late they are. */
export function ageing(rows: { balance: number; state: InvoiceState; daysOverdue: number }[]) {
  const out = AGE_BUCKETS.map((label) => ({ label, amount: 0, count: 0 }));
  for (const r of rows) {
    if (r.state === "PAID" || r.state === "CANCELLED" || r.balance <= 0) continue;
    const d = r.daysOverdue;
    const i = d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4;
    out[i].amount = r2(out[i].amount + r.balance);
    out[i].count++;
  }
  return out;
}

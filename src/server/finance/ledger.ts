// Client ledger (statement of account), built automatically from invoices
// (debit: what the school owes) and payments (credit: what it paid).
// Cancelled invoices are left out. Periods default to the Indian financial
// year, April to March.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { addDays, fromDbDate, isDateStr, todayIST, toDbDate, type DateStr } from "@/lib/dates";
import { seesAllSales, type SessionUser } from "@/lib/permissions";
import { clientScope } from "../access";
import { NotFoundError } from "../errors";
import { COUNTED_WHERE, r2 } from "./money";

export type LedgerPeriod = { from: DateStr; to: DateStr; label: string };

/** Financial year (1 April – 31 March) containing the date. */
export function financialYear(date: DateStr): LedgerPeriod {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `FY ${start}-${String(start + 1).slice(2)}` };
}

export type PeriodKey = "fy" | "lastfy" | "month" | "custom";

export function resolvePeriod(p: { period?: string; from?: string; to?: string }, today: DateStr = todayIST()): LedgerPeriod & { key: PeriodKey } {
  if (p.period === "lastfy") return { ...financialYear(addDays(financialYear(today).from, -1)), key: "lastfy" };
  if (p.period === "month") {
    const from = `${today.slice(0, 8)}01`;
    const next = new Date(`${from}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return { from, to: addDays(next.toISOString().slice(0, 10), -1), label: "This month", key: "month" };
  }
  if (p.period === "custom" && p.from && p.to && isDateStr(p.from) && isDateStr(p.to) && p.from <= p.to)
    return { from: p.from, to: p.to, label: `${dmy(p.from)} – ${dmy(p.to)}`, key: "custom" };
  return { ...financialYear(today), key: "fy" };
}

const dmy = (s: string) => s.split("-").reverse().join("/");

export type LedgerEntry = {
  date: DateStr;
  kind: "INVOICE" | "PAYMENT" | "CREDIT_NOTE";
  ref: string;
  /** The school's PO number for the order behind this entry. */
  po: string | null;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
};

/** One client's statement for the period, with opening and closing balance. */
export async function clientLedger(user: SessionUser, clientId: string, period: LedgerPeriod) {
  const client = await db.client.findFirst({
    where: { id: clientId, ...clientScope(user) },
    select: { id: true, number: true, schoolName: true, city: true, owner: { select: { name: true } } },
  });
  if (!client) throw new NotFoundError("Client");
  const [invoices, payments, credits] = await Promise.all([
    db.invoice.findMany({
      where: { clientId, status: "ISSUED", date: { lte: toDbDate(period.to) } },
      include: { salesOrder: { select: { number: true, poNumber: true } } },
    }),
    db.payment.findMany({
      where: { clientId, date: { lte: toDbDate(period.to) }, ...COUNTED_WHERE },
      include: { invoice: { select: { number: true, salesOrder: { select: { poNumber: true } } } }, salesOrder: { select: { number: true, poNumber: true } } },
    }),
    db.creditNote.findMany({
      where: { clientId, date: { lte: toDbDate(period.to) } },
      include: { invoice: { select: { number: true, salesOrder: { select: { poNumber: true } } } } },
    }),
  ]);
  const all = [
    ...invoices.map((i) => ({
      date: fromDbDate(i.date),
      at: i.createdAt.getTime(),
      kind: "INVOICE" as const,
      ref: i.number,
      po: i.salesOrder.poNumber,
      particulars: `Invoice · order ${i.salesOrder.number}`,
      debit: Number(i.total),
      credit: 0,
    })),
    ...payments.map((p) => ({
      date: fromDbDate(p.date),
      at: p.createdAt.getTime(),
      kind: "PAYMENT" as const,
      ref: p.number ?? "",
      po: p.invoice?.salesOrder.poNumber ?? p.salesOrder?.poNumber ?? null,
      particulars: `${p.invoice ? "Payment received" : "Advance received"} · ${p.mode}${p.reference ? ` ${p.reference}` : ""} · against ${p.invoice?.number ?? `order ${p.salesOrder?.number}`}`,
      debit: 0,
      credit: Number(p.amount),
    })),
    ...credits.map((c) => ({
      date: fromDbDate(c.date),
      at: c.createdAt.getTime(),
      kind: "CREDIT_NOTE" as const,
      ref: c.number,
      po: c.invoice.salesOrder.poNumber,
      particulars: `Credit note on ${c.invoice.number} · ${c.reason}`,
      debit: 0,
      credit: Number(c.amount),
    })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // On the same day the invoice comes before money received against it.
    if ((a.kind === "INVOICE") !== (b.kind === "INVOICE")) return a.kind === "INVOICE" ? -1 : 1;
    return a.at - b.at;
  });

  const before = all.filter((e) => e.date < period.from);
  const opening = r2(before.reduce((s, e) => s + e.debit - e.credit, 0));
  let balance = opening;
  const entries: LedgerEntry[] = all
    .filter((e) => e.date >= period.from)
    .map((e) => {
      balance = r2(balance + e.debit - e.credit);
      return { date: e.date, kind: e.kind, ref: e.ref, po: e.po, particulars: e.particulars, debit: e.debit, credit: e.credit, balance };
    });
  const debit = r2(entries.reduce((s, e) => s + e.debit, 0));
  const credit = r2(entries.reduce((s, e) => s + e.credit, 0));
  return { client, period, opening, debit, credit, closing: r2(opening + debit - credit), entries };
}
export type ClientLedger = Awaited<ReturnType<typeof clientLedger>>;

export type LedgerSummaryRow = {
  clientId: string;
  number: number;
  schoolName: string;
  city: string;
  owner: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
};

/** Every visible client's opening, invoiced, received and closing balance for the period. */
export async function ledgerSummary(user: SessionUser, period: LedgerPeriod, f: { owner?: string } = {}) {
  const where: Prisma.ClientWhereInput = { ...clientScope(user), ...(f.owner && seesAllSales(user.role) ? { ownerId: f.owner } : {}) };
  const to = toDbDate(period.to);
  const from = toDbDate(period.from);
  const clients = await db.client.findMany({
    where,
    select: {
      id: true,
      number: true,
      schoolName: true,
      city: true,
      owner: { select: { name: true } },
      invoices: { where: { status: "ISSUED", date: { lte: to } }, select: { date: true, total: true } },
      payments: { where: { date: { lte: to }, ...COUNTED_WHERE }, select: { date: true, amount: true } },
      creditNotes: { where: { date: { lte: to } }, select: { date: true, amount: true } },
    },
    orderBy: { schoolName: "asc" },
  });
  const rows: LedgerSummaryRow[] = clients
    .map((c) => {
      const inv = (pred: (d: Date) => boolean) => c.invoices.filter((i) => pred(i.date)).reduce((s, i) => s + Number(i.total), 0);
      const pay = (pred: (d: Date) => boolean) =>
        [...c.payments, ...c.creditNotes].filter((p) => pred(p.date)).reduce((s, p) => s + Number(p.amount), 0);
      const opening = r2(inv((d) => d < from) - pay((d) => d < from));
      const debit = r2(inv((d) => d >= from));
      const credit = r2(pay((d) => d >= from));
      return {
        clientId: c.id,
        number: c.number,
        schoolName: c.schoolName,
        city: c.city,
        owner: c.owner.name,
        opening,
        debit,
        credit,
        closing: r2(opening + debit - credit),
      };
    })
    .filter((r) => r.opening || r.debit || r.credit || r.closing);
  const sum = (k: "opening" | "debit" | "credit" | "closing") => r2(rows.reduce((s, r) => s + r[k], 0));
  return { period, rows, totals: { opening: sum("opening"), debit: sum("debit"), credit: sum("credit"), closing: sum("closing") } };
}

/** Clients for the "Select client" list. */
export async function ledgerClients(user: SessionUser) {
  return db.client.findMany({ where: clientScope(user), select: { id: true, schoolName: true, city: true }, orderBy: { schoolName: "asc" } });
}

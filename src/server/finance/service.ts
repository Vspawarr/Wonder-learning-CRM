// Sales orders, invoices and payments for clients. Visible to Directors, Admins,
// the Sales Head and the client's own account owner (clientScope).
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { CHEQUE_MODES, DEFAULT_PAYMENT_DAYS, PAYMENT_MODES } from "@/lib/constants";
import { addDays, fmtDateTimeIST, fromDbDate, isDateStr, todayIST, toDbDate } from "@/lib/dates";
import { inr } from "@/lib/format";
import { accountForMode, accountOrDefault } from "../money-accounts";
import { canApprovePayments, canManageFinance, seesAllSales, type SessionUser } from "@/lib/permissions";
import { clientScope } from "../access";
import { DomainError, NotFoundError } from "../errors";
import { isEmailConfigured, sendMail } from "../mailer";
import { getQuotationContent } from "../quotation/content";
import { financialYear } from "@/lib/fy";
import { getDocumentSettings, startingNumber } from "../documents";
import { emailInput } from "../quotation/service";
import { parse } from "../validation";
import { renderInvoicePdf, type InvoicePdfData } from "./invoice-pdf";
import { renderReceiptPdf } from "./receipt-pdf";
import { renderCreditNotePdf } from "./credit-note-pdf";
import { rupeesInWords } from "./words";
import { COUNTED_STATUSES, COUNTED_WHERE, awaitingOf, ageing, creditedOf, invoiceState, lineAmount, outstandingSummary, pendingOf, r2, receivedOf, totals } from "./money";
import { getFeatures } from "../features";

const num = (label: string, min: number) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? (v.trim() === "" ? NaN : Number(v.replace(/,/g, "").trim())) : v))
    .refine((n) => Number.isFinite(n) && n >= min && n < 1e10, `Enter a valid ${label}.`);
const optDate = z
  .string()
  .nullish()
  .transform((s) => s || null)
  .refine((s) => s === null || isDateStr(s), "Enter a valid date.");

export const salesOrderInput = z.object({
  date: z.string().refine(isDateStr, "Enter the order date."),
  poNumber: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((s) => s || null),
  poDate: optDate,
  expectedDelivery: optDate,
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((s) => s || null),
  quotationId: z
    .string()
    .nullish()
    .transform((s) => s || null),
  items: z
    .array(
      z.object({
        productId: z
          .string()
          .nullish()
          .transform((s) => s || null),
        description: z.string().trim().min(1, "Each line needs a description.").max(200),
        qty: num("number of kits", 1).refine((n) => Number.isInteger(n), "Number of kits must be a whole number."),
        price: num("price", 0),
        gstRate: num("GST %", 0).refine((n) => n <= 100, "GST must be a percentage."),
      }),
    )
    .min(1, "Add at least one product.")
    .max(50),
});

export const invoiceInput = z.object({
  date: z.string().refine(isDateStr, "Enter the invoice date."),
  dueDate: z.string().refine(isDateStr, "Enter the due date."),
});

export const paymentInput = z.object({
  bank: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((s) => s || null),
  /** The date written on the cheque (later than today for a PDC). */
  chequeDate: optDate,
  /** When part is still owed: the date the school promised to pay the rest. */
  promiseDate: optDate,
  amount: num("amount", 0.01),
  date: z.string().refine(isDateStr, "Enter the payment date."),
  mode: z.string().refine((m) => (PAYMENT_MODES as readonly string[]).includes(m), "Choose how it was paid."),
  reference: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((s) => s || null),
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((s) => s || null),
});

const code = (prefix: string, y: number, m: number, seq: number) => `${prefix}/${y}/${String(m).padStart(2, "0")}/${String(seq).padStart(3, "0")}`;

/** Creates a record with the next running number for this month, retrying on a clash. */
export async function withNextNumber<T>(
  model: "salesOrder" | "invoice" | "payment" | "creditNote" | "dispatch",
  prefix: string,
  create: (tx: Tx, n: { number: string; year: number; month: number; seq: number }) => Promise<T>,
) {
  const today = todayIST();
  const [y, m] = today.split("-").map(Number);
  // Receipts follow the client's receipt book: 117/26-27, running through the financial year
  // and never below the starting number set in Settings → Documents.
  const fy = model === "payment" ? financialYear(today) : null;
  const floor = fy ? await startingNumber("receipt", fy.label) : 1;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const where = fy ? fy.months : { year: y, month: m };
        const agg =
          model === "salesOrder"
            ? await tx.salesOrder.aggregate({ where, _max: { seq: true } })
            : model === "invoice"
              ? await tx.invoice.aggregate({ where, _max: { seq: true } })
              : model === "payment"
                ? await tx.payment.aggregate({ where, _max: { seq: true } })
                : model === "creditNote"
                  ? await tx.creditNote.aggregate({
                      where,
                      _max: { seq: true },
                    })
                  : await tx.dispatch.aggregate({ where, _max: { seq: true } });
        const seq = Math.max((agg._max.seq ?? 0) + 1, floor);
        return create(tx, {
          number: fy ? `${seq}/${fy.short}` : code(prefix, y, m, seq),
          year: y,
          month: m,
          seq,
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new DomainError("Couldn't number the record. Please try again.");
}

async function loadClient(user: SessionUser, clientId: string) {
  const c = await db.client.findFirst({
    where: { id: clientId, ...clientScope(user) },
  });
  if (!c) throw new NotFoundError("Client");
  return c;
}

async function loadOrder(user: SessionUser, id: string) {
  const so = await db.salesOrder.findFirst({
    where: { id, client: clientScope(user) },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      invoices: { select: { id: true, status: true } },
      client: true,
      quotation: { select: { number: true, createdAt: true } },
      advances: { where: { invoiceId: null } },
    },
  });
  if (!so) throw new NotFoundError("Sales order");
  return so;
}

async function loadInvoice(user: SessionUser, id: string) {
  const inv = await db.invoice.findFirst({
    where: { id, client: clientScope(user) },
    include: invoiceInclude,
  });
  if (!inv) throw new NotFoundError("Invoice");
  return inv;
}

const invoiceInclude = {
  payments: true,
  creditNotes: true,
  client: true,
  items: { orderBy: { sortOrder: "asc" } },
  salesOrder: true,
  createdBy: true,
} as const;

/** Money received (cleared) on these payments. */
const paidOf = receivedOf;

/** What is still owed and how it stands, from an invoice with its payments and credit notes. */
const stateOf = (inv: {
  total: Prisma.Decimal;
  status: "ISSUED" | "CANCELLED";
  dueDate: Date;
  payments: { amount: Prisma.Decimal; status: string; approval: string }[];
  creditNotes: { amount: Prisma.Decimal }[];
}) =>
  invoiceState(
    {
      total: Number(inv.total),
      status: inv.status,
      dueDate: fromDbDate(inv.dueDate),
      credited: creditedOf(inv.creditNotes),
    },
    paidOf(inv.payments),
  );

const assertFinance = (user: SessionUser) => {
  if (!canManageFinance(user.role)) throw new DomainError("Only an Admin or the Sales Head can do this. Please ask them.");
};

async function assertFeature(key: "advance" | "cheques" | "creditNotes") {
  if (!(await getFeatures())[key]) throw new DomainError("This feature is switched off in Settings → Features.");
}

/* ---------- sales orders ---------- */

/** Quotations this client's orders can be made from (repeat-order ones and the original deal's). */
export async function orderableQuotations(user: SessionUser, clientId: string) {
  const c = await loadClient(user, clientId);
  const rows = await db.quotation.findMany({
    where: {
      status: "SENT",
      OR: [{ clientId: c.id }, { opportunityId: c.opportunityId }, { opportunity: { renewalOfId: c.id } }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, createdAt: true },
  });
  return rows.map((q) => ({
    id: q.id,
    label: `${q.number} · created ${fmtDateTimeIST(q.createdAt)}`,
  }));
}

/** Lines for a new order: copied from the chosen quotation (kits left for the user to fill in). */
export async function salesOrderDefaults(user: SessionUser, clientId: string, quotationId?: string | null) {
  await loadClient(user, clientId);
  const q = quotationId
    ? await db.quotation.findFirst({
        where: { id: quotationId, OR: [{ clientId }, { opportunity: { client: { id: clientId } } }, { opportunity: { renewalOfId: clientId } }] },
        select: { number: true, createdAt: true, poNumber: true, poDetails: true },
      })
    : null;
  // What the PO template already said: our PO number, kits per line and delivery date.
  const po = (q?.poDetails ?? {}) as { kits?: (number | null)[]; deliveryDate?: string | null };
  const items = quotationId
    ? (
        await db.quotationItem.findMany({
          where: {
            quotationId,
            quotation: {
              OR: [{ clientId }, { opportunity: { client: { id: clientId } } }, { opportunity: { renewalOfId: clientId } }],
            },
          },
          orderBy: { sortOrder: "asc" },
        })
      ).map((i, idx) => ({
        productId: i.productId,
        description: i.description,
        qty: po.kits?.[idx] ? String(po.kits[idx]) : "",
        price: String(Number(i.price)),
        gstRate: "0",
      }))
    : [];
  return {
    date: todayIST(),
    expectedDelivery: po.deliveryDate ?? "",
    notes: "",
    poNumber: q?.poNumber ?? "",
    poDate: "",
    quotationId: quotationId ?? "",
    quotationLabel: q ? `${q.number} · created ${fmtDateTimeIST(q.createdAt)}` : "",
    items,
  };
}

export async function createSalesOrder(user: SessionUser, clientId: string, raw: unknown) {
  const d = parse(salesOrderInput, raw);
  const c = await loadClient(user, clientId);
  if (d.quotationId) {
    const ok = await db.quotation.count({
      where: {
        id: d.quotationId,
        OR: [{ clientId: c.id }, { opportunityId: c.opportunityId }, { opportunity: { renewalOfId: c.id } }],
      },
    });
    if (!ok) throw new DomainError("That quotation doesn't belong to this client.");
  }
  return withNextNumber("salesOrder", "SO", async (tx, n) => {
    const so = await tx.salesOrder.create({
      data: {
        ...n,
        clientId: c.id,
        quotationId: d.quotationId,
        date: toDbDate(d.date),
        expectedDelivery: d.expectedDelivery ? toDbDate(d.expectedDelivery) : null,
        notes: d.notes,
        poNumber: d.poNumber,
        poDate: d.poDate ? toDbDate(d.poDate) : null,
        createdById: user.id,
        items: { create: d.items.map((it, i) => ({ ...it, sortOrder: i })) },
      },
    });
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Sales order ${so.number} created · ${inr(totals(d.items).total)}${d.poNumber ? ` · PO ${d.poNumber}` : ""}`,
        byId: user.id,
        clientId: c.id,
      },
    });
    return so.id;
  });
}

export async function updateSalesOrder(user: SessionUser, id: string, raw: unknown) {
  const d = parse(salesOrderInput, raw);
  const so = await loadOrder(user, id);
  if (so.status === "CANCELLED") throw new DomainError("This order is cancelled.");
  if (so.invoices.some((i) => i.status === "ISSUED")) throw new DomainError("This order has been invoiced; cancel the invoice first to change it.");
  await db.$transaction([
    db.salesOrderItem.deleteMany({ where: { salesOrderId: id } }),
    db.salesOrder.update({
      where: { id },
      data: {
        date: toDbDate(d.date),
        expectedDelivery: d.expectedDelivery ? toDbDate(d.expectedDelivery) : null,
        notes: d.notes,
        poNumber: d.poNumber,
        poDate: d.poDate ? toDbDate(d.poDate) : null,
        items: { create: d.items.map((it, i) => ({ ...it, sortOrder: i })) },
      },
    }),
  ]);
}

export async function salesOrderForEdit(user: SessionUser, id: string) {
  const so = await loadOrder(user, id);
  return {
    date: fromDbDate(so.date),
    expectedDelivery: so.expectedDelivery ? fromDbDate(so.expectedDelivery) : "",
    notes: so.notes ?? "",
    poNumber: so.poNumber ?? "",
    poDate: so.poDate ? fromDbDate(so.poDate) : "",
    quotationId: so.quotationId ?? "",
    quotationLabel: so.quotation ? `${so.quotation.number} · created ${fmtDateTimeIST(so.quotation.createdAt)}` : "",
    items: so.items.map((i) => ({
      productId: i.productId,
      description: i.description,
      qty: String(i.qty),
      price: String(Number(i.price)),
      gstRate: String(Number(i.gstRate)),
    })),
  };
}

export async function markDelivered(user: SessionUser, id: string, date: string) {
  if (!isDateStr(date)) throw new DomainError("Enter the delivery date.");
  const so = await loadOrder(user, id);
  if (so.status === "CANCELLED") throw new DomainError("This order is cancelled.");
  await db.$transaction([
    db.salesOrder.update({
      where: { id },
      data: { status: "DELIVERED", deliveredOn: toDbDate(date) },
    }),
    db.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Sales order ${so.number} delivered`,
        byId: user.id,
        clientId: so.clientId,
      },
    }),
  ]);
}

export async function cancelSalesOrder(user: SessionUser, id: string) {
  const so = await loadOrder(user, id);
  if (so.invoices.some((i) => i.status === "ISSUED")) throw new DomainError("Cancel the order's invoice first.");
  if (so.advances.some((a) => a.status !== "BOUNCED"))
    throw new DomainError("This order has an advance payment. Ask an Admin to delete it (or refund it) first.");
  await db.$transaction([
    db.salesOrder.update({ where: { id }, data: { status: "CANCELLED" } }),
    db.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Sales order ${so.number} cancelled`,
        byId: user.id,
        clientId: so.clientId,
      },
    }),
  ]);
}

/* ---------- invoices ---------- */

export async function invoiceDefaults(user: SessionUser, salesOrderId: string) {
  await loadOrder(user, salesOrderId);
  const today = todayIST();
  return { date: today, dueDate: addDays(today, DEFAULT_PAYMENT_DAYS) };
}

const collectTitle = (balance: number, number: string, school: string) => `Collect ${inr(balance)}: ${number} – ${school}`;

/** Invoices the whole order; books a payment follow-up for the account owner on the due date. */
export async function createInvoice(user: SessionUser, salesOrderId: string, raw: unknown) {
  const d = parse(invoiceInput, raw);
  if (d.dueDate < d.date) throw new DomainError("The due date can't be before the invoice date.");
  const so = await loadOrder(user, salesOrderId);
  if (so.status === "CANCELLED") throw new DomainError("This order is cancelled.");
  if (so.invoices.some((i) => i.status === "ISSUED")) throw new DomainError("This order already has an invoice.");
  const lines = so.items.map((i) => ({
    qty: i.qty,
    price: Number(i.price),
    gstRate: Number(i.gstRate),
  }));
  const t = totals(lines);
  return withNextNumber("invoice", "INV", async (tx, n) => {
    const inv = await tx.invoice.create({
      data: {
        ...n,
        clientId: so.clientId,
        salesOrderId: so.id,
        date: toDbDate(d.date),
        dueDate: toDbDate(d.dueDate),
        subtotal: t.subtotal,
        gstAmount: t.gstAmount,
        total: t.total,
        shareToken: randomBytes(24).toString("base64url"),
        createdById: user.id,
        items: {
          create: so.items.map((i, idx) => ({
            productId: i.productId,
            description: i.description,
            qty: i.qty,
            price: i.price,
            gstRate: i.gstRate,
            amount: lineAmount(lines[idx]),
            sortOrder: idx,
          })),
        },
      },
    });
    await tx.task.create({
      data: {
        type: "Call",
        title: collectTitle(t.total, inv.number, so.client.schoolName),
        remark: `Payment due on ${d.dueDate.split("-").reverse().join("/")}.`,
        dueDate: toDbDate(d.dueDate),
        priority: "HIGH",
        isAuto: true,
        assigneeId: so.client.ownerId,
        createdById: user.id,
        clientId: so.clientId,
        invoiceId: inv.id,
      },
    });
    // Advances taken on the order now count toward this invoice.
    const adv = await tx.payment.updateMany({
      where: { salesOrderId: so.id, invoiceId: null },
      data: { invoiceId: inv.id },
    });
    if (adv.count) await syncCollectionTask(tx, user, inv.id);
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Invoice ${inv.number} raised · ${inr(t.total)}${so.poNumber ? ` · PO ${so.poNumber}` : ""}${adv.count ? ` · ${adv.count} advance payment(s) adjusted` : ""}`,
        byId: user.id,
        clientId: so.clientId,
      },
    });
    return inv.id;
  });
}

export async function cancelInvoice(user: SessionUser, id: string) {
  assertFinance(user);
  const inv = await loadInvoice(user, id);
  if (inv.status === "CANCELLED") return;
  if (inv.payments.length) throw new DomainError("This invoice has payments; delete them first if they were recorded by mistake.");
  await db.$transaction([
    db.invoice.update({ where: { id }, data: { status: "CANCELLED" } }),
    db.task.updateMany({
      where: { invoiceId: id, status: "OPEN" },
      data: {
        status: "CANCELLED",
        outcome: "Invoice cancelled",
        completedAt: new Date(),
      },
    }),
    db.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Invoice ${inv.number} cancelled`,
        byId: user.id,
        clientId: inv.clientId,
      },
    }),
  ]);
}

/* ---------- payments ---------- */

/** Keeps the invoice's open "Collect …" follow-up in step with what is still owed. */
async function syncCollectionTask(tx: Tx, user: SessionUser, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { payments: true, creditNotes: true, client: true },
  });
  const s = stateOf(inv);
  const open = await tx.task.findMany({ where: { invoiceId, status: "OPEN" } });
  if (s.balance <= 0) {
    await tx.task.updateMany({
      where: { invoiceId, status: "OPEN" },
      data: {
        status: "DONE",
        outcome: "Paid in full",
        completedAt: new Date(),
      },
    });
    return s;
  }
  const title = collectTitle(s.balance, inv.number, inv.client.schoolName);
  if (open.length)
    await tx.task.updateMany({
      where: { invoiceId, status: "OPEN" },
      data: { title },
    });
  else {
    const today = todayIST();
    const due = fromDbDate(inv.dueDate);
    await tx.task.create({
      data: {
        type: "Call",
        title,
        dueDate: toDbDate(due > today ? due : today),
        priority: "HIGH",
        isAuto: true,
        assigneeId: inv.client.ownerId,
        createdById: user.id,
        clientId: inv.clientId,
        invoiceId,
      },
    });
  }
  return s;
}

type PaymentData = z.output<typeof paymentInput>;

/** Creates a payment (with its receipt number) and, for a cheque, a "deposit cheque" reminder. */
/** Does a payment recorded by this person wait for Accounts? (Switchable; Accounts' own entries don't.) */
async function needsApproval(user: SessionUser) {
  return (await getFeatures()).paymentApproval && !canApprovePayments(user.role);
}

/** Reminder to deposit a cheque, once the payment counts (recorded by Accounts, or approved). */
async function depositReminder(tx: Tx, user: SessionUser, p: { id: string; amount: Prisma.Decimal | number; reference: string | null; bank: string | null; chequeDate: Date | null; clientId: string }, school: string, ownerId: string) {
  const today = todayIST();
  const cd = p.chequeDate ? fromDbDate(p.chequeDate) : null;
  const on = cd && cd > today ? cd : today;
  await tx.task.create({
    data: {
      type: "Other",
      title: `Deposit cheque ${p.reference ?? ""} (${inr(Number(p.amount))}) – ${school}`.replace("  ", " "),
      remark: [p.bank, cd ? `cheque dated ${cd.split("-").reverse().join("/")}` : null].filter(Boolean).join(" · ") || null,
      dueDate: toDbDate(on),
      priority: "HIGH",
      isAuto: true,
      assigneeId: ownerId,
      createdById: user.id,
      clientId: p.clientId,
      paymentId: p.id,
    },
  });
}

async function createPayment(
  user: SessionUser,
  target: {
    clientId: string;
    invoiceId: string | null;
    salesOrderId: string;
    school: string;
    ownerId: string;
  },
  d: PaymentData,
) {
  const cheque = CHEQUE_MODES.includes(d.mode) && (await getFeatures()).cheques;
  const data = {
    shareToken: randomBytes(24).toString("base64url"),
    invoiceId: target.invoiceId,
    salesOrderId: target.salesOrderId,
    clientId: target.clientId,
    amount: d.amount,
    date: toDbDate(d.date),
    mode: d.mode,
    reference: d.reference,
    note: d.note,
    bank: cheque ? d.bank : null,
    chequeDate: cheque && d.chequeDate ? toDbDate(d.chequeDate) : null,
    status: cheque ? ("IN_HAND" as const) : ("RECEIVED" as const),
    recordedById: user.id,
  };
  // Recorded by the team: waits for Accounts, with no receipt number yet (R36).
  if (await needsApproval(user)) {
    const p = await db.payment.create({ data: { ...data, approval: "PENDING" } });
    return { p, cheque, awaiting: true };
  }
  const moneyAccountId = await accountForMode(d.mode);
  return withNextNumber("payment", "RCPT", async (tx, n) => {
    const p = await tx.payment.create({ data: { ...data, ...n, moneyAccountId, approval: "APPROVED", approvedById: user.id, approvedAt: new Date() } });
    if (cheque) await depositReminder(tx, user, p, target.school, target.ownerId);
    return { p, cheque, awaiting: false };
  });
}

const chequeText = (d: PaymentData) => `${d.mode}${d.reference ? ` ${d.reference}` : ""}`;

export async function recordPayment(user: SessionUser, invoiceId: string, raw: unknown) {
  const d = parse(paymentInput, raw);
  const inv = await loadInvoice(user, invoiceId);
  if (inv.status === "CANCELLED") throw new DomainError("This invoice is cancelled.");
  const s0 = stateOf(inv);
  const available = r2(s0.balance - pendingOf(inv.payments) - awaitingOf(inv.payments));
  if (s0.balance <= 0) throw new DomainError("This invoice is already fully paid.");
  if (available <= 0) throw new DomainError("Payments already recorded (cheques not cleared, or waiting for Accounts approval) cover the balance.");
  if (d.amount > available + 0.001) throw new DomainError(`That's more than the ${inr(available)} still due on ${inv.number}.`);
  if (d.promiseDate && d.promiseDate < todayIST()) throw new DomainError("The promised payment date can't be in the past.");
  {
    const { p, cheque, awaiting } = await createPayment(
      user,
      {
        clientId: inv.clientId,
        invoiceId,
        salesOrderId: inv.salesOrderId,
        school: inv.client.schoolName,
        ownerId: inv.client.ownerId,
      },
      d,
    );
    const s = await db.$transaction((tx) => syncCollectionTask(tx, user, invoiceId));
    const promised = s.balance > 0 && d.promiseDate ? d.promiseDate : null;
    if (promised)
      await db.task.updateMany({
        where: { invoiceId, status: "OPEN" },
        data: {
          dueDate: toDbDate(promised),
          remark: `School promised to pay the balance on ${dmy(toDbDate(promised)).replace(/-/g, "/")}.`,
        },
      });
    await db.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Payment ${inr(d.amount)} ${cheque ? "by cheque (not yet cleared)" : "received"} for ${inv.number}${inv.salesOrder.poNumber ? ` (PO ${inv.salesOrder.poNumber})` : ""} (${chequeText(d)}) · ${awaiting ? "sent to Accounts for approval" : `receipt ${p.number} · ${s.balance > 0 ? `${inr(s.balance)} still due` : "paid in full"}`}${promised ? ` · next payment promised ${dmy(toDbDate(promised)).replace(/-/g, "/")}` : ""}`,
        byId: user.id,
        clientId: inv.clientId,
      },
    });
    return {
      ...s,
      paymentId: p.id,
      receiptNumber: p.number,
      shareToken: p.shareToken,
      amount: d.amount,
      /** True when it waits for Accounts: no receipt until approved (R36). */
      awaiting,
    };
  }
}

/** Advance against a sales order before it is invoiced; it counts toward the invoice later. */
export async function recordAdvance(user: SessionUser, salesOrderId: string, raw: unknown) {
  await assertFeature("advance");
  const d = parse(paymentInput, raw);
  const so = await loadOrder(user, salesOrderId);
  if (so.status === "CANCELLED") throw new DomainError("This order is cancelled.");
  if (so.invoices.some((i) => i.status === "ISSUED")) throw new DomainError("This order is invoiced; record the payment on its invoice.");
  const total = totals(
    so.items.map((i) => ({
      qty: i.qty,
      price: Number(i.price),
      gstRate: Number(i.gstRate),
    })),
  ).total;
  const taken = r2(receivedOf(so.advances) + pendingOf(so.advances) + awaitingOf(so.advances));
  const available = r2(total - taken);
  if (available <= 0) throw new DomainError("Advances already cover the whole order.");
  if (d.amount > available + 0.001) throw new DomainError(`That's more than the order's remaining ${inr(available)}.`);
  const { p, cheque, awaiting } = await createPayment(
    user,
    {
      clientId: so.clientId,
      invoiceId: null,
      salesOrderId: so.id,
      school: so.client.schoolName,
      ownerId: so.client.ownerId,
    },
    d,
  );
  await db.activity.create({
    data: {
      type: "SYSTEM",
      subject: `Advance ${inr(d.amount)} ${cheque ? "by cheque (not yet cleared)" : "received"} on order ${so.number}${so.poNumber ? ` (PO ${so.poNumber})` : ""} (${chequeText(d)}) · ${awaiting ? "sent to Accounts for approval" : `receipt ${p.number}`}`,
      byId: user.id,
      clientId: so.clientId,
    },
  });
  return {
    balance: r2(available - d.amount),
    paymentId: p.id,
    receiptNumber: p.number,
    shareToken: p.shareToken,
    amount: d.amount,
    awaiting,
  };
}

/** Cheque progress: In hand → Deposited → Cleared, or Bounced. Clearing and bouncing are for Admin / Sales Head. */
export async function setChequeStatus(user: SessionUser, paymentId: string, status: "DEPOSITED" | "CLEARED" | "BOUNCED") {
  const p = await db.payment.findFirst({
    where: { id: paymentId, client: clientScope(user) },
    include: { client: true },
  });
  if (!p) throw new NotFoundError("Payment");
  if (p.approval !== "APPROVED") throw new DomainError("This payment is waiting for Accounts approval.");
  if (p.status !== "IN_HAND" && p.status !== "DEPOSITED") throw new DomainError("This cheque is already settled.");
  if (status === "DEPOSITED" && p.status !== "IN_HAND") throw new DomainError("This cheque is already deposited.");
  if (status !== "DEPOSITED") assertFinance(user);
  const label = {
    DEPOSITED: "deposited",
    CLEARED: "cleared",
    BOUNCED: "BOUNCED",
  }[status];
  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: { status, statusAt: new Date() },
    });
    await tx.task.updateMany({
      where: { paymentId, status: "OPEN" },
      data: {
        status: "DONE",
        outcome: `Cheque ${label}`,
        completedAt: new Date(),
      },
    });
    if (p.invoiceId) {
      await syncCollectionTask(tx, user, p.invoiceId);
      if (status === "BOUNCED")
        await tx.task.updateMany({
          where: { invoiceId: p.invoiceId, status: "OPEN" },
          data: {
            dueDate: toDbDate(todayIST()),
            priority: "CRITICAL",
            remark: `Cheque ${p.reference ?? ""} bounced. Collect again.`,
          },
        });
    }
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Cheque ${p.reference ?? ""} for ${inr(Number(p.amount))} ${label} · receipt ${p.number ?? "—"}`,
        byId: user.id,
        clientId: p.clientId,
      },
    });
  });
}

export async function deletePayment(user: SessionUser, paymentId: string) {
  const p = await db.payment.findFirst({
    where: { id: paymentId, client: clientScope(user) },
    include: { invoice: true, salesOrder: true },
  });
  if (!p) throw new NotFoundError("Payment");
  // Whoever recorded it may remove their own entry while it is waiting or after it was rejected (R36).
  if (!(p.approval !== "APPROVED" && p.recordedById === user.id)) assertFinance(user);
  await db.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: paymentId } });
    if (p.invoiceId) await syncCollectionTask(tx, user, p.invoiceId);
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Payment ${inr(Number(p.amount))} (${p.number ?? (p.approval === "REJECTED" ? "rejected" : "awaiting approval")}) for ${p.invoice?.number ?? `order ${p.salesOrder?.number}`} deleted`,
        byId: user.id,
        clientId: p.clientId,
      },
    });
  });
}

/* ---------- credit notes ---------- */

export const creditNoteInput = z.object({
  date: z.string().refine(isDateStr, "Enter the credit note date."),
  amount: num("amount", 0.01),
  reason: z.string().trim().min(3, "Write the reason (e.g. 5 kits returned).").max(300),
});

/** Reduces what is owed on an invoice (returns, discount, write-off). Admin / Sales Head only. */
export async function createCreditNote(user: SessionUser, invoiceId: string, raw: unknown) {
  assertFinance(user);
  await assertFeature("creditNotes");
  const d = parse(creditNoteInput, raw);
  const inv = await loadInvoice(user, invoiceId);
  if (inv.status === "CANCELLED") throw new DomainError("This invoice is cancelled.");
  const s0 = stateOf(inv);
  if (d.amount > s0.balance + 0.001) throw new DomainError(`A credit note can't be more than the ${inr(s0.balance)} still due.`);
  return withNextNumber("creditNote", "CN", async (tx, n) => {
    const cn = await tx.creditNote.create({
      data: {
        ...n,
        clientId: inv.clientId,
        invoiceId,
        date: toDbDate(d.date),
        amount: d.amount,
        reason: d.reason,
        createdById: user.id,
      },
    });
    const s = await syncCollectionTask(tx, user, invoiceId);
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Credit note ${cn.number} for ${inr(d.amount)} on ${inv.number}: ${d.reason} · ${s.balance > 0 ? `${inr(s.balance)} still due` : "nothing due now"}`,
        byId: user.id,
        clientId: inv.clientId,
      },
    });
    return cn.id;
  });
}

export async function deleteCreditNote(user: SessionUser, id: string) {
  assertFinance(user);
  const cn = await db.creditNote.findFirst({
    where: { id, client: clientScope(user) },
    include: { invoice: true },
  });
  if (!cn) throw new NotFoundError("Credit note");
  await db.$transaction(async (tx) => {
    await tx.creditNote.delete({ where: { id } });
    await syncCollectionTask(tx, user, cn.invoiceId);
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Credit note ${cn.number} on ${cn.invoice.number} deleted`,
        byId: user.id,
        clientId: cn.clientId,
      },
    });
  });
}

/** Logs that a payment reminder went out (WhatsApp is opened in the browser). */
export async function logReminder(user: SessionUser, invoiceId: string, via: "whatsapp" | "email", to?: string) {
  const inv = await loadInvoice(user, invoiceId);
  const s = stateOf(inv);
  await db.activity.create({
    data: {
      type: via === "email" ? "EMAIL" : "WHATSAPP",
      subject: `Payment reminder for ${inv.number} (${inr(s.balance)} due) ${via === "email" ? `emailed to ${to}` : "sent on WhatsApp"}`,
      byId: user.id,
      clientId: inv.clientId,
    },
  });
}

export async function logInvoiceShared(user: SessionUser, invoiceId: string) {
  const inv = await loadInvoice(user, invoiceId);
  await db.activity.create({
    data: {
      type: "WHATSAPP",
      subject: `Invoice ${inv.number} shared on WhatsApp`,
      byId: user.id,
      clientId: inv.clientId,
    },
  });
}

/* ---------- PDF, link and email ---------- */

const dmy = (d: Date) => fromDbDate(d).split("-").reverse().join("-");

async function pdfFor(inv: Awaited<ReturnType<typeof loadInvoice>>) {
  const content = await getQuotationContent();
  const paid = paidOf(inv.payments);
  const credited = creditedOf(inv.creditNotes);
  const c = inv.client;
  const data: InvoicePdfData = {
    number: inv.number,
    date: dmy(inv.date),
    dueDate: dmy(inv.dueDate),
    orderNumber: inv.salesOrder.number,
    poNumber: inv.salesOrder.poNumber,
    poDate: inv.salesOrder.poDate ? dmy(inv.salesOrder.poDate) : null,
    schoolName: c.schoolName,
    contactName: c.contactName,
    address: [c.address, c.area, c.city].filter(Boolean).join(", ") || null,
    cancelled: inv.status === "CANCELLED",
    items: inv.items.map((i) => ({
      description: i.description,
      qty: i.qty,
      price: Number(i.price),
      gstRate: Number(i.gstRate),
      amount: Number(i.amount),
    })),
    subtotal: Number(inv.subtotal),
    gstAmount: Number(inv.gstAmount),
    total: Number(inv.total),
    paid,
    credited,
    balance: inv.status === "CANCELLED" ? 0 : r2(Math.max(0, Number(inv.total) - paid - credited)),
    payments: inv.payments
      .filter((p) => p.approval === "APPROVED" && (COUNTED_STATUSES as readonly string[]).includes(p.status))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((p) => ({
        date: dmy(p.date),
        amount: Number(p.amount),
        mode: p.mode,
        reference: p.reference,
      })),
    footerLines: content.footerLines,
    company: content.company,
  };
  return { number: inv.number, pdf: await renderInvoicePdf(data) };
}

export const invoiceFileName = (number: string) => `Invoice-${number.replace(/\//g, "-")}.pdf`;

export async function invoicePdf(user: SessionUser, id: string) {
  return pdfFor(await loadInvoice(user, id));
}

/** For the WhatsApp link: anyone with the secret link may view that one invoice. */
export async function invoicePdfByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const inv = await db.invoice.findUnique({
    where: { shareToken: token },
    include: invoiceInclude,
  });
  if (!inv || inv.status === "CANCELLED") return null;
  return pdfFor(inv);
}

/** Emails the invoice PDF (as the invoice itself or as a payment reminder). */
export async function emailInvoice(user: SessionUser, id: string, raw: unknown, kind: "invoice" | "reminder") {
  if (!isEmailConfigured()) throw new DomainError("Email sending isn't set up yet. Use WhatsApp or download the PDF instead.");
  const d = parse(emailInput, raw);
  const inv = await loadInvoice(user, id);
  if (inv.status === "CANCELLED") throw new DomainError("This invoice is cancelled.");
  const { pdf } = await pdfFor(inv);
  try {
    await sendMail({
      to: d.to,
      cc: d.cc ?? undefined,
      replyTo: user.email,
      subject: kind === "reminder" ? `Payment reminder: Invoice ${inv.number} – Wonder Learning` : `Invoice ${inv.number} – Wonder Learning`,
      text: d.message,
      attachments: [
        {
          filename: invoiceFileName(inv.number),
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e) {
    console.error(e);
    throw new DomainError("The email couldn't be sent. Check the address and try again, or download the PDF instead.");
  }
  if (kind === "reminder") await logReminder(user, id, "email", d.to);
  else
    await db.activity.create({
      data: {
        type: "EMAIL",
        subject: `Invoice ${inv.number} emailed to ${d.to}`,
        byId: user.id,
        clientId: inv.clientId,
      },
    });
}

/* ---------- payment receipts ---------- */

const receiptInclude = {
  invoice: {
    include: {
      payments: {
        select: { id: true, amount: true, status: true, approval: true, createdAt: true },
      },
      creditNotes: { select: { amount: true } },
    },
  },
  salesOrder: {
    include: {
      items: true,
      advances: {
        select: { id: true, amount: true, status: true, approval: true, createdAt: true },
      },
    },
  },
  client: true,
  recordedBy: { select: { name: true } },
} as const;

async function loadPayment(user: SessionUser, id: string) {
  const p = await db.payment.findFirst({
    where: { id, client: clientScope(user) },
    include: receiptInclude,
  });
  if (!p) throw new NotFoundError("Payment");
  return p;
}

async function receiptFor(p: Awaited<ReturnType<typeof loadPayment>>) {
  if (p.approval !== "APPROVED" || !p.number)
    throw new DomainError(p.approval === "REJECTED" ? "This payment was rejected by Accounts, so it has no receipt." : "This payment is waiting for Accounts approval. The receipt can be sent once it is approved.");
  const number = p.number;
  const docs = await getDocumentSettings();
  const so = p.salesOrder;
  // Like the client's receipt book: the whole PO's value, everything received on it so far
  // (counted payments up to this one, plus this one even while its cheque clears), and the balance.
  const siblings = so ? so.advances : (p.invoice?.payments ?? []);
  const before = siblings.filter((x) => x.id !== p.id && x.createdAt.getTime() <= p.createdAt.getTime());
  const amount = Number(p.amount);
  const receivedToDate = r2(receivedOf(before) + (p.status === "BOUNCED" ? 0 : amount));
  const poValue = so
    ? totals(so.items.map((i) => ({ qty: i.qty, price: Number(i.price), gstRate: Number(i.gstRate) }))).total
    : Number(p.invoice?.total ?? 0);
  const credited = so
    ? Number((await db.creditNote.aggregate({ where: { invoice: { salesOrderId: so.id } }, _sum: { amount: true } }))._sum.amount ?? 0)
    : creditedOf(p.invoice?.creditNotes ?? []);
  const kitsOnly = !!so?.items.length && so.items.every((i) => /kit|TB|NB|book/i.test(i.description));
  const onAccountOf =
    `${p.invoice ? "" : "Advance – "}` +
    (kitsOnly || !so ? "Student Book Set" : so.items.map((i) => i.description).join(", ").slice(0, 60));
  const cheque = CHEQUE_MODES.includes(p.mode);
  const paidBy = cheque
    ? [`Cheque # ${p.reference ?? "—"}`, ...(p.bank ? [`${p.bank},`] : []), ...(p.chequeDate ? [`dtd. ${dmy(p.chequeDate).replace(/-/g, "/")}`] : [])]
    : [p.mode, ...(p.reference ? [`Ref. ${p.reference}`] : []), ...(p.bank ? [p.bank] : [])];
  const pdf = await renderReceiptPdf({
    number,
    date: dmy(p.date).replace(/-/g, "/"),
    schoolName: p.client.schoolName,
    amount,
    amountWords: rupeesInWords(amount).replace(/^Rupees\s+/, ""),
    onAccountOf,
    paidBy,
    statusNote:
      p.status === "BOUNCED"
        ? "This cheque was returned unpaid (bounced)."
        : p.status === "IN_HAND" || p.status === "DEPOSITED"
          ? "Subject to realisation of the cheque."
          : null,
    poValue: r2(poValue),
    receivedToDate,
    balance: r2(Math.max(0, poValue - credited - receivedToDate)),
    signatory: docs.signatory,
    addressLines: docs.receiptLines,
  });
  return { number, pdf };
}

export const receiptFileName = (number: string) => `Receipt-${number.replace(/\//g, "-")}.pdf`;

export async function receiptPdf(user: SessionUser, paymentId: string) {
  return receiptFor(await loadPayment(user, paymentId));
}

/** For the WhatsApp link: anyone with the secret link may view that one receipt. */
export async function receiptPdfByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const p = await db.payment.findUnique({
    where: { shareToken: token },
    include: receiptInclude,
  });
  return p && p.approval === "APPROVED" ? receiptFor(p) : null;
}

export async function logReceiptShared(user: SessionUser, paymentId: string) {
  const p = await loadPayment(user, paymentId);
  if (p.approval !== "APPROVED") throw new DomainError("This payment is waiting for Accounts approval.");
  await receiptSent(paymentId, "shared on WhatsApp");
  await db.activity.create({
    data: {
      type: "WHATSAPP",
      subject: `Receipt ${p.number} (${inr(Number(p.amount))}) shared on WhatsApp`,
      byId: user.id,
      clientId: p.clientId,
    },
  });
}

export async function emailReceipt(user: SessionUser, paymentId: string, raw: unknown) {
  if (!isEmailConfigured()) throw new DomainError("Email sending isn't set up yet. Use WhatsApp or download the PDF instead.");
  const d = parse(emailInput, raw);
  const p = await loadPayment(user, paymentId);
  const { pdf, number } = await receiptFor(p);
  try {
    await sendMail({
      to: d.to,
      cc: d.cc ?? undefined,
      replyTo: user.email,
      subject: `Payment receipt ${number} – Wonder Learning`,
      text: d.message,
      attachments: [
        {
          filename: receiptFileName(number),
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e) {
    console.error(e);
    throw new DomainError("The email couldn't be sent. Check the address and try again, or download the PDF instead.");
  }
  await receiptSent(paymentId, `emailed to ${d.to}`);
  await db.activity.create({
    data: {
      type: "EMAIL",
      subject: `Receipt ${number} emailed to ${d.to}`,
      byId: user.id,
      clientId: p.clientId,
    },
  });
}

export async function creditNotePdf(user: SessionUser, id: string) {
  const cn = await db.creditNote.findFirst({
    where: { id, client: clientScope(user) },
    include: { invoice: true, client: true },
  });
  if (!cn) throw new NotFoundError("Credit note");
  const content = await getQuotationContent();
  const c = cn.client;
  const amount = Number(cn.amount);
  return {
    number: cn.number,
    pdf: await renderCreditNotePdf({
      number: cn.number,
      date: dmy(cn.date),
      schoolName: c.schoolName,
      contactName: c.contactName,
      address: [c.address, c.area, c.city].filter(Boolean).join(", ") || null,
      invoiceNumber: cn.invoice.number,
      invoiceDate: dmy(cn.invoice.date),
      amount,
      amountWords: rupeesInWords(amount),
      reason: cn.reason,
      footerLines: content.footerLines,
      company: content.company,
    }),
  };
}

/* ---------- proforma invoice ---------- */

/** The order's proforma number, given the first time it is printed (PI/YYYY/MM/NNN). */
async function ensureProformaNumber(so: { id: string; proformaNumber: string | null }) {
  if (so.proformaNumber) return so.proformaNumber;
  const [y, m] = todayIST().split("-").map(Number);
  const prefix = `PI/${y}/${String(m).padStart(2, "0")}/`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const last = await tx.salesOrder.findFirst({
          where: { proformaNumber: { startsWith: prefix } },
          orderBy: { proformaNumber: "desc" },
          select: { proformaNumber: true },
        });
        const seq = last?.proformaNumber ? Number(last.proformaNumber.slice(prefix.length)) + 1 : 1;
        const number = `${prefix}${String(seq).padStart(3, "0")}`;
        await tx.salesOrder.update({
          where: { id: so.id },
          data: { proformaNumber: number, proformaDate: toDbDate(todayIST()) },
        });
        return number;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new DomainError("Couldn't number the proforma invoice. Please try again.");
}

/** A proforma invoice for an order (to collect the advance / PDC before the final invoice). */
export async function proformaPdf(user: SessionUser, salesOrderId: string) {
  await assertFeature("advance");
  const so0 = await loadOrder(user, salesOrderId);
  if (so0.status === "CANCELLED") throw new DomainError("This order is cancelled.");
  const number = await ensureProformaNumber(so0);
  const so = await loadOrder(user, salesOrderId);
  const content = await getQuotationContent();
  const lines = so.items.map((i) => ({
    qty: i.qty,
    price: Number(i.price),
    gstRate: Number(i.gstRate),
  }));
  const t = totals(lines);
  const paid = receivedOf(so.advances);
  const c = so.client;
  const pdf = await renderInvoicePdf({
    title: "PROFORMA INVOICE",
    numberLabel: "Proforma No.",
    number,
    date: dmy(so.proformaDate ?? toDbDate(todayIST())),
    dueDate: "As per payment terms",
    orderNumber: so.number,
    poNumber: so.poNumber,
    poDate: so.poDate ? dmy(so.poDate) : null,
    schoolName: c.schoolName,
    contactName: c.contactName,
    address: [c.address, c.area, c.city].filter(Boolean).join(", ") || null,
    cancelled: false,
    items: so.items.map((i, idx) => ({
      description: i.description,
      qty: i.qty,
      price: Number(i.price),
      gstRate: Number(i.gstRate),
      amount: lineAmount(lines[idx]),
    })),
    subtotal: t.subtotal,
    gstAmount: t.gstAmount,
    total: t.total,
    paid,
    credited: 0,
    balance: r2(Math.max(0, t.total - paid)),
    payments: so.advances
      .filter((p) => p.approval === "APPROVED" && (COUNTED_STATUSES as readonly string[]).includes(p.status))
      .map((p) => ({
        date: dmy(p.date),
        amount: Number(p.amount),
        mode: p.mode,
        reference: p.reference,
      })),
    paymentTerms: content.payment,
    footerLines: content.footerLines,
    company: content.company,
  });
  return { number, pdf };
}

export const proformaFileName = (number: string) => `Proforma-${number.replace(/\//g, "-")}.pdf`;

/* ---------- reading ---------- */

export { invoiceState, paidOf, loadInvoice, loadOrder };

export type InvoiceRow = {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  total: number;
  paid: number;
  /** Cheques received but not yet cleared. */
  pending: number;
  /** Recorded, waiting for Accounts approval (R36). */
  awaiting: number;
  credited: number;
  balance: number;
  state: ReturnType<typeof invoiceState>["state"];
  daysOverdue: number;
  shareToken: string;
  salesOrder: { id: string; number: string; poNumber: string | null };
  client: {
    id: string;
    schoolName: string;
    mobile: string;
    email: string | null;
    owner: { id: string; name: string };
    /** The person marked for payments (Accounts etc.), if any. */
    payContact: {
      name: string;
      mobile: string | null;
      email: string | null;
    } | null;
  };
};

export async function invoiceRows(user: SessionUser, where: Prisma.InvoiceWhereInput = {}): Promise<InvoiceRow[]> {
  const rows = await db.invoice.findMany({
    where: {
      ...where,
      client: {
        is: {
          ...clientScope(user),
          ...((where.client as Prisma.ClientWhereInput) ?? {}),
        },
      },
    },
    include: {
      payments: { select: { amount: true, status: true, approval: true } },
      creditNotes: { select: { amount: true } },
      salesOrder: { select: { id: true, number: true, poNumber: true } },
      client: {
        select: {
          id: true,
          schoolName: true,
          mobile: true,
          email: true,
          owner: { select: { id: true, name: true } },
          contacts: {
            where: { forPayments: true },
            select: { name: true, mobile: true, email: true },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    date: fromDbDate(r.date),
    dueDate: fromDbDate(r.dueDate),
    total: Number(r.total),
    pending: pendingOf(r.payments),
    /** Recorded, waiting for Accounts to approve (R36). */
    awaiting: awaitingOf(r.payments),
    credited: creditedOf(r.creditNotes),
    ...stateOf(r),
    shareToken: r.shareToken,
    salesOrder: r.salesOrder,
    client: {
      ...r.client,
      contacts: undefined,
      payContact: r.client.contacts[0] ?? null,
    },
  }));
}

/** Dashboard tiles: what is owed now, and what was collected in the period. */
export async function collectionsSummary(user: SessionUser, f: { exec?: string; state?: string }, from: string, to: string) {
  const client: Prisma.ClientWhereInput = {
    ...(f.exec ? { ownerId: f.exec } : {}),
    ...(f.state ? { state: f.state } : {}),
  };
  const [rows, collected] = await Promise.all([
    invoiceRows(user, { client }),
    db.payment.aggregate({
      where: {
        date: { gte: toDbDate(from), lte: toDbDate(to) },
        ...COUNTED_WHERE,
        client: { ...clientScope(user), ...client },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  return {
    ...outstandingSummary(rows),
    collected: Number(collected._sum.amount ?? 0),
    collectedCount: collected._count._all,
    /** Recorded by the team, waiting for Accounts (R36). */
    awaiting: r2(rows.reduce((t, r) => t + r.awaiting, 0)),
  };
}

export type OutstandingFilters = {
  q?: string;
  show?: string;
  owner?: string;
  from?: string;
  to?: string;
  /** Chosen financial year: its invoices, plus earlier ones still unpaid (they are still owed). */
  year?: { from: string; to: string };
};

/** The Outstanding page's rows and totals (same filters for the screen and its exports). */
export async function outstandingList(user: SessionUser, f: OutstandingFilters) {
  const y = f.year;
  const rows = (await invoiceRows(user, seesAllSales(user.role) && f.owner ? { client: { ownerId: f.owner } } : {})).filter(
    (r) => !y || (r.date <= y.to && (r.date >= y.from || (r.balance > 0 && r.state !== "CANCELLED"))),
  );
  const q = (f.q ?? "").toLowerCase();
  const shown = rows.filter((r) => {
    if (q && !r.client.schoolName.toLowerCase().includes(q) && !r.number.toLowerCase().includes(q)) return false;
    // Custom date range on the invoice date.
    if (f.from && r.date < f.from) return false;
    if (f.to && r.date > f.to) return false;
    if (f.show === "overdue") return r.state === "OVERDUE";
    if (f.show === "paid") return r.state === "PAID";
    if (f.show === "all") return true;
    return r.state === "UNPAID" || r.state === "PARTIAL" || r.state === "OVERDUE";
  });
  return {
    all: rows,
    shown,
    summary: outstandingSummary(rows),
    ageing: ageing(rows),
    forecast: await collectionForecast(rows),
  };
}

/**
 * When money is expected: each open invoice on its payment follow-up date (which
 * moves with the school's promised date), or its due date.
 */
async function collectionForecast(rows: InvoiceRow[]) {
  const open = rows.filter((r) => r.balance > 0 && r.state !== "CANCELLED");
  const tasks = await db.task.findMany({
    where: { invoiceId: { in: open.map((r) => r.id) }, status: "OPEN" },
    select: { invoiceId: true, dueDate: true },
    orderBy: { dueDate: "asc" },
  });
  const when = new Map<string, string>();
  for (const t of tasks) if (t.invoiceId && !when.has(t.invoiceId)) when.set(t.invoiceId, fromDbDate(t.dueDate));
  const today = todayIST();
  const weekEnd = addDays(today, 6);
  const [y, m] = today.split("-").map(Number);
  const monthEnd = addDays(`${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01`, -1);
  const buckets = [
    { label: "Late: chase now", amount: 0, count: 0 },
    { label: "This week", amount: 0, count: 0 },
    { label: "Rest of this month", amount: 0, count: 0 },
    { label: "Later", amount: 0, count: 0 },
  ];
  for (const r of open) {
    const on = when.get(r.id) ?? r.dueDate;
    const i = on < today ? 0 : on <= weekEnd ? 1 : on <= monthEnd ? 2 : 3;
    buckets[i].amount = r2(buckets[i].amount + r.balance);
    buckets[i].count++;
  }
  return {
    buckets,
    chequesPending: r2(open.reduce((t, r) => t + r.pending, 0)),
  };
}

/* ---------- Accounts: payment approval (R36) ---------- */

function assertAccounts(user: SessionUser) {
  if (!canApprovePayments(user.role)) throw new DomainError("Only Accounts can approve or reject payments.");
}

/** Finishes the "Send receipt" to-do once the receipt has gone to the school. */
async function receiptSent(paymentId: string, how: string) {
  await db.task.updateMany({
    where: { paymentId, status: "OPEN", title: { startsWith: "Send receipt" } },
    data: { status: "DONE", outcome: `Receipt ${how}`, completedAt: new Date() },
  });
}

/** Accounts approves: the payment counts as received, gets its receipt number, and the receipt can be sent. */
export async function approvePayment(user: SessionUser, paymentId: string, intoAccountId?: string | null) {
  assertAccounts(user);
  const p = await db.payment.findUnique({
    where: { id: paymentId },
    include: { client: true, invoice: { select: { number: true } }, salesOrder: { select: { number: true } } },
  });
  if (!p) throw new NotFoundError("Payment");
  if (p.approval !== "PENDING") throw new DomainError(`This payment is already ${p.approval === "APPROVED" ? "approved" : "rejected"}.`);
  const against = p.invoice ? `invoice ${p.invoice.number}` : `order ${p.salesOrder?.number} (advance)`;
  // Which company account the money went into (R39): chosen on approval, else by mode (cash → office cash).
  const moneyAccountId = await accountOrDefault(intoAccountId, p.mode);
  const done = await withNextNumber("payment", "RCPT", async (tx, n) => {
    const upd = await tx.payment.update({
      where: { id: paymentId, approval: "PENDING" },
      data: { ...n, moneyAccountId, approval: "APPROVED", approvedById: user.id, approvedAt: new Date(), rejectReason: null },
    });
    if (upd.status === "IN_HAND") await depositReminder(tx, user, upd, p.client.schoolName, p.client.ownerId);
    if (upd.invoiceId) await syncCollectionTask(tx, user, upd.invoiceId);
    if (p.recordedById !== user.id)
      await tx.task.create({
        data: {
          type: "Other",
          title: `Send receipt ${n.number} to ${p.client.schoolName}`,
          remark: `Payment ${inr(Number(p.amount))} for ${against} approved by Accounts.`,
          dueDate: toDbDate(todayIST()),
          priority: "HIGH",
          isAuto: true,
          assigneeId: p.recordedById,
          createdById: user.id,
          clientId: p.clientId,
          paymentId,
        },
      });
    await tx.activity.create({
      data: { type: "SYSTEM", subject: `Payment ${inr(Number(p.amount))} for ${against} approved by Accounts · receipt ${n.number}`, byId: user.id, clientId: p.clientId },
    });
    return upd;
  });
  return { paymentId, receiptNumber: done.number!, shareToken: done.shareToken, amount: Number(done.amount), against };
}

export const rejectInput = z.object({ reason: z.string().trim().min(3, "Write why it is rejected (e.g. amount not in bank).").max(300) });

/** Accounts rejects: it never counts, has no receipt, and whoever recorded it is told why. */
export async function rejectPayment(user: SessionUser, paymentId: string, raw: unknown) {
  assertAccounts(user);
  const { reason } = parse(rejectInput, raw);
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { client: true, invoice: { select: { number: true } }, salesOrder: { select: { number: true } } } });
  if (!p) throw new NotFoundError("Payment");
  if (p.approval !== "PENDING") throw new DomainError(`This payment is already ${p.approval === "APPROVED" ? "approved" : "rejected"}.`);
  const against = p.invoice ? `invoice ${p.invoice.number}` : `order ${p.salesOrder?.number} (advance)`;
  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { approval: "REJECTED", rejectReason: reason, approvedById: user.id, approvedAt: new Date() } });
    if (p.invoiceId) await syncCollectionTask(tx, user, p.invoiceId);
    if (p.recordedById !== user.id)
      await tx.task.create({
        data: {
          type: "Other",
          title: `Payment ${inr(Number(p.amount))} rejected by Accounts – ${p.client.schoolName}`,
          remark: `${reason}. Check with the school, then record it again (and delete the rejected entry).`,
          dueDate: toDbDate(todayIST()),
          priority: "HIGH",
          isAuto: true,
          assigneeId: p.recordedById,
          createdById: user.id,
          clientId: p.clientId,
          paymentId,
        },
      });
    await tx.activity.create({
      data: { type: "SYSTEM", subject: `Payment ${inr(Number(p.amount))} for ${against} rejected by Accounts: ${reason}`, byId: user.id, clientId: p.clientId },
    });
  });
}

const queueInclude = {
  client: { select: { id: true, schoolName: true, city: true, mobile: true, email: true, owner: { select: { name: true } } } },
  invoice: { select: { number: true } },
  salesOrder: { select: { number: true } },
  recordedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
} as const;

const queueRow = (p: Prisma.PaymentGetPayload<{ include: typeof queueInclude }>) => ({
  id: p.id,
  number: p.number,
  shareToken: p.shareToken,
  approval: p.approval,
  rejectReason: p.rejectReason,
  amount: Number(p.amount),
  date: fromDbDate(p.date),
  mode: p.mode,
  reference: p.reference,
  bank: p.bank,
  chequeDate: p.chequeDate ? fromDbDate(p.chequeDate) : null,
  note: p.note,
  status: p.status,
  against: p.invoice ? `Invoice ${p.invoice.number}` : `Order ${p.salesOrder?.number ?? ""} (advance)`,
  client: p.client,
  recordedBy: p.recordedBy.name,
  recordedAt: p.createdAt.toISOString(),
  decidedBy: p.approvedBy?.name ?? null,
  decidedAt: p.approvedAt?.toISOString() ?? null,
});
export type ApprovalRow = ReturnType<typeof queueRow>;

/** The Accounts page: payments waiting (oldest first) and recent decisions (last 30 days). */
export async function approvalQueue(user: SessionUser) {
  assertAccounts(user);
  const since = new Date(Date.now() - 30 * 864e5);
  const [waiting, decided] = await Promise.all([
    db.payment.findMany({ where: { approval: "PENDING" }, include: queueInclude, orderBy: { createdAt: "asc" } }),
    db.payment.findMany({ where: { approval: { not: "PENDING" }, approvedAt: { gte: since } }, include: queueInclude, orderBy: { approvedAt: "desc" }, take: 100 }),
  ]);
  return { waiting: waiting.map(queueRow), decided: decided.map(queueRow) };
}

/** How many payments wait for Accounts (menu badge, bell). */
export async function approvalCount() {
  return db.payment.count({ where: { approval: "PENDING" } });
}

// Sales orders, invoices and payments for clients. Visible to Directors, Admins,
// the Sales Head and the client's own account owner (clientScope).
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { DEFAULT_PAYMENT_DAYS, PAYMENT_MODES } from "@/lib/constants";
import { addDays, fmtDateTimeIST, fromDbDate, isDateStr, todayIST, toDbDate } from "@/lib/dates";
import { inr } from "@/lib/format";
import { seesAllSales, type SessionUser } from "@/lib/permissions";
import { clientScope } from "../access";
import { DomainError, NotFoundError } from "../errors";
import { isEmailConfigured, sendMail } from "../mailer";
import { getQuotationContent } from "../quotation/content";
import { emailInput } from "../quotation/service";
import { parse } from "../validation";
import { renderInvoicePdf, type InvoicePdfData } from "./invoice-pdf";
import { renderReceiptPdf } from "./receipt-pdf";
import { rupeesInWords } from "./words";
import { invoiceState, lineAmount, outstandingSummary, r2, totals } from "./money";

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
async function withNextNumber<T>(model: "salesOrder" | "invoice" | "payment", prefix: string, create: (tx: Tx, n: { number: string; year: number; month: number; seq: number }) => Promise<T>) {
  const [y, m] = todayIST().split("-").map(Number);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const where = { year: y, month: m };
        const agg =
          model === "salesOrder"
            ? await tx.salesOrder.aggregate({ where, _max: { seq: true } })
            : model === "invoice"
              ? await tx.invoice.aggregate({ where, _max: { seq: true } })
              : await tx.payment.aggregate({ where, _max: { seq: true } });
        const seq = (agg._max.seq ?? 0) + 1;
        return create(tx, { number: code(prefix, y, m, seq), year: y, month: m, seq });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new DomainError("Couldn't number the record. Please try again.");
}

async function loadClient(user: SessionUser, clientId: string) {
  const c = await db.client.findFirst({ where: { id: clientId, ...clientScope(user) } });
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
    },
  });
  if (!so) throw new NotFoundError("Sales order");
  return so;
}

async function loadInvoice(user: SessionUser, id: string) {
  const inv = await db.invoice.findFirst({
    where: { id, client: clientScope(user) },
    include: { payments: true, client: true, items: { orderBy: { sortOrder: "asc" } }, salesOrder: true, createdBy: true },
  });
  if (!inv) throw new NotFoundError("Invoice");
  return inv;
}

const paidOf = (payments: { amount: Prisma.Decimal }[]) => r2(payments.reduce((s, p) => s + Number(p.amount), 0));

/* ---------- sales orders ---------- */

/** Quotations this client's orders can be made from (repeat-order ones and the original deal's). */
export async function orderableQuotations(user: SessionUser, clientId: string) {
  const c = await loadClient(user, clientId);
  const rows = await db.quotation.findMany({
    where: { status: "SENT", OR: [{ clientId: c.id }, { opportunityId: c.opportunityId }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, createdAt: true },
  });
  return rows.map((q) => ({ id: q.id, label: `${q.number} · created ${fmtDateTimeIST(q.createdAt)}` }));
}

/** Lines for a new order: copied from the chosen quotation (kits left for the user to fill in). */
export async function salesOrderDefaults(user: SessionUser, clientId: string, quotationId?: string | null) {
  await loadClient(user, clientId);
  const q = quotationId ? await db.quotation.findUnique({ where: { id: quotationId }, select: { number: true, createdAt: true } }) : null;
  const items = quotationId
    ? (
        await db.quotationItem.findMany({
          where: { quotationId, quotation: { OR: [{ clientId }, { opportunity: { client: { id: clientId } } }] } },
          orderBy: { sortOrder: "asc" },
        })
      ).map((i) => ({ productId: i.productId, description: i.description, qty: "", price: String(Number(i.price)), gstRate: "0" }))
    : [];
  return {
    date: todayIST(),
    expectedDelivery: "",
    notes: "",
    poNumber: "",
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
    const ok = await db.quotation.count({ where: { id: d.quotationId, OR: [{ clientId: c.id }, { opportunityId: c.opportunityId }] } });
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
      data: { type: "SYSTEM", subject: `Sales order ${so.number} created · ${inr(totals(d.items).total)}`, byId: user.id, clientId: c.id },
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
    db.salesOrder.update({ where: { id }, data: { status: "DELIVERED", deliveredOn: toDbDate(date) } }),
    db.activity.create({ data: { type: "SYSTEM", subject: `Sales order ${so.number} delivered`, byId: user.id, clientId: so.clientId } }),
  ]);
}

export async function cancelSalesOrder(user: SessionUser, id: string) {
  const so = await loadOrder(user, id);
  if (so.invoices.some((i) => i.status === "ISSUED")) throw new DomainError("Cancel the order's invoice first.");
  await db.$transaction([
    db.salesOrder.update({ where: { id }, data: { status: "CANCELLED" } }),
    db.activity.create({ data: { type: "SYSTEM", subject: `Sales order ${so.number} cancelled`, byId: user.id, clientId: so.clientId } }),
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
  const lines = so.items.map((i) => ({ qty: i.qty, price: Number(i.price), gstRate: Number(i.gstRate) }));
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
    await tx.activity.create({
      data: { type: "SYSTEM", subject: `Invoice ${inv.number} raised · ${inr(t.total)}`, byId: user.id, clientId: so.clientId },
    });
    return inv.id;
  });
}

export async function cancelInvoice(user: SessionUser, id: string) {
  const inv = await loadInvoice(user, id);
  if (inv.status === "CANCELLED") return;
  if (inv.payments.length) throw new DomainError("This invoice has payments; delete them first if they were recorded by mistake.");
  await db.$transaction([
    db.invoice.update({ where: { id }, data: { status: "CANCELLED" } }),
    db.task.updateMany({ where: { invoiceId: id, status: "OPEN" }, data: { status: "CANCELLED", outcome: "Invoice cancelled", completedAt: new Date() } }),
    db.activity.create({ data: { type: "SYSTEM", subject: `Invoice ${inv.number} cancelled`, byId: user.id, clientId: inv.clientId } }),
  ]);
}

/* ---------- payments ---------- */

/** Keeps the invoice's open "Collect …" follow-up in step with what is still owed. */
async function syncCollectionTask(tx: Tx, user: SessionUser, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true, client: true } });
  const s = invoiceState({ total: Number(inv.total), status: inv.status, dueDate: fromDbDate(inv.dueDate) }, paidOf(inv.payments));
  const open = await tx.task.findMany({ where: { invoiceId, status: "OPEN" } });
  if (s.balance <= 0) {
    await tx.task.updateMany({ where: { invoiceId, status: "OPEN" }, data: { status: "DONE", outcome: "Paid in full", completedAt: new Date() } });
    return s;
  }
  const title = collectTitle(s.balance, inv.number, inv.client.schoolName);
  if (open.length) await tx.task.updateMany({ where: { invoiceId, status: "OPEN" }, data: { title } });
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

export async function recordPayment(user: SessionUser, invoiceId: string, raw: unknown) {
  const d = parse(paymentInput, raw);
  const inv = await loadInvoice(user, invoiceId);
  if (inv.status === "CANCELLED") throw new DomainError("This invoice is cancelled.");
  const balance = r2(Number(inv.total) - paidOf(inv.payments));
  if (balance <= 0) throw new DomainError("This invoice is already fully paid.");
  if (d.amount > balance + 0.001) throw new DomainError(`That's more than the ${inr(balance)} still due on ${inv.number}.`);
  if (d.promiseDate && d.promiseDate < todayIST()) throw new DomainError("The promised payment date can't be in the past.");
  return withNextNumber("payment", "RCPT", async (tx, n) => {
    const p = await tx.payment.create({
      data: {
        ...n,
        shareToken: randomBytes(24).toString("base64url"),
        invoiceId,
        clientId: inv.clientId,
        amount: d.amount,
        date: toDbDate(d.date),
        mode: d.mode,
        reference: d.reference,
        note: d.note,
        recordedById: user.id,
      },
    });
    const s = await syncCollectionTask(tx, user, invoiceId);
    const promised = s.balance > 0 && d.promiseDate ? d.promiseDate : null;
    if (promised)
      await tx.task.updateMany({
        where: { invoiceId, status: "OPEN" },
        data: { dueDate: toDbDate(promised), remark: `School promised to pay the balance on ${dmy(toDbDate(promised)).replace(/-/g, "/")}.` },
      });
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Payment ${inr(d.amount)} received for ${inv.number} (${d.mode}${d.reference ? ` ${d.reference}` : ""}) · receipt ${p.number} · ${s.balance > 0 ? `${inr(s.balance)} still due` : "paid in full"}${promised ? ` · next payment promised ${dmy(toDbDate(promised)).replace(/-/g, "/")}` : ""}`,
        byId: user.id,
        clientId: inv.clientId,
      },
    });
    return { ...s, paymentId: p.id, receiptNumber: p.number, shareToken: p.shareToken, amount: d.amount };
  });
}

export async function deletePayment(user: SessionUser, paymentId: string) {
  const p = await db.payment.findFirst({ where: { id: paymentId, client: clientScope(user) }, include: { invoice: true } });
  if (!p) throw new NotFoundError("Payment");
  await db.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: paymentId } });
    await syncCollectionTask(tx, user, p.invoiceId);
    await tx.activity.create({
      data: { type: "SYSTEM", subject: `Payment ${inr(Number(p.amount))} for ${p.invoice.number} deleted`, byId: user.id, clientId: p.clientId },
    });
  });
}

/** Logs that a payment reminder went out (WhatsApp is opened in the browser). */
export async function logReminder(user: SessionUser, invoiceId: string, via: "whatsapp" | "email", to?: string) {
  const inv = await loadInvoice(user, invoiceId);
  const s = invoiceState({ total: Number(inv.total), status: inv.status, dueDate: fromDbDate(inv.dueDate) }, paidOf(inv.payments));
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
    data: { type: "WHATSAPP", subject: `Invoice ${inv.number} shared on WhatsApp`, byId: user.id, clientId: inv.clientId },
  });
}

/* ---------- PDF, link and email ---------- */

const dmy = (d: Date) => fromDbDate(d).split("-").reverse().join("-");

async function pdfFor(inv: Awaited<ReturnType<typeof loadInvoice>>) {
  const content = await getQuotationContent();
  const paid = paidOf(inv.payments);
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
    items: inv.items.map((i) => ({ description: i.description, qty: i.qty, price: Number(i.price), gstRate: Number(i.gstRate), amount: Number(i.amount) })),
    subtotal: Number(inv.subtotal),
    gstAmount: Number(inv.gstAmount),
    total: Number(inv.total),
    paid,
    balance: inv.status === "CANCELLED" ? 0 : r2(Math.max(0, Number(inv.total) - paid)),
    payments: [...inv.payments]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((p) => ({ date: dmy(p.date), amount: Number(p.amount), mode: p.mode, reference: p.reference })),
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
    include: { payments: true, client: true, items: { orderBy: { sortOrder: "asc" } }, salesOrder: true, createdBy: true },
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
      attachments: [{ filename: invoiceFileName(inv.number), content: pdf, contentType: "application/pdf" }],
    });
  } catch (e) {
    console.error(e);
    throw new DomainError("The email couldn't be sent. Check the address and try again, or download the PDF instead.");
  }
  if (kind === "reminder") await logReminder(user, id, "email", d.to);
  else
    await db.activity.create({
      data: { type: "EMAIL", subject: `Invoice ${inv.number} emailed to ${d.to}`, byId: user.id, clientId: inv.clientId },
    });
}

/* ---------- payment receipts ---------- */

const receiptInclude = {
  invoice: { include: { payments: { select: { id: true, amount: true, date: true, createdAt: true } } } },
  client: true,
  recordedBy: { select: { name: true } },
} as const;

async function loadPayment(user: SessionUser, id: string) {
  const p = await db.payment.findFirst({ where: { id, client: clientScope(user) }, include: receiptInclude });
  if (!p) throw new NotFoundError("Payment");
  return p;
}

async function receiptFor(p: Awaited<ReturnType<typeof loadPayment>>) {
  const content = await getQuotationContent();
  // "Received so far" counts this payment and the ones recorded before it.
  const upTo = p.invoice.payments.filter((x) => x.createdAt.getTime() <= p.createdAt.getTime());
  const receivedToDate = paidOf(upTo);
  const c = p.client;
  const amount = Number(p.amount);
  const pdf = await renderReceiptPdf({
    number: p.number,
    date: dmy(p.date),
    schoolName: c.schoolName,
    contactName: c.contactName,
    address: [c.address, c.area, c.city].filter(Boolean).join(", ") || null,
    amount,
    amountWords: rupeesInWords(amount),
    mode: p.mode,
    reference: p.reference,
    note: p.note,
    invoiceNumber: p.invoice.number,
    invoiceDate: dmy(p.invoice.date),
    invoiceTotal: Number(p.invoice.total),
    receivedToDate,
    balance: r2(Math.max(0, Number(p.invoice.total) - receivedToDate)),
    receivedBy: p.recordedBy.name,
    footerLines: content.footerLines,
    company: content.company,
  });
  return { number: p.number, pdf };
}

export const receiptFileName = (number: string) => `Receipt-${number.replace(/\//g, "-")}.pdf`;

export async function receiptPdf(user: SessionUser, paymentId: string) {
  return receiptFor(await loadPayment(user, paymentId));
}

/** For the WhatsApp link: anyone with the secret link may view that one receipt. */
export async function receiptPdfByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const p = await db.payment.findUnique({ where: { shareToken: token }, include: receiptInclude });
  return p ? receiptFor(p) : null;
}

export async function logReceiptShared(user: SessionUser, paymentId: string) {
  const p = await loadPayment(user, paymentId);
  await db.activity.create({
    data: { type: "WHATSAPP", subject: `Receipt ${p.number} (${inr(Number(p.amount))}) shared on WhatsApp`, byId: user.id, clientId: p.clientId },
  });
}

export async function emailReceipt(user: SessionUser, paymentId: string, raw: unknown) {
  if (!isEmailConfigured()) throw new DomainError("Email sending isn't set up yet. Use WhatsApp or download the PDF instead.");
  const d = parse(emailInput, raw);
  const p = await loadPayment(user, paymentId);
  const { pdf } = await receiptFor(p);
  try {
    await sendMail({
      to: d.to,
      cc: d.cc ?? undefined,
      replyTo: user.email,
      subject: `Payment receipt ${p.number} – Wonder Learning`,
      text: d.message,
      attachments: [{ filename: receiptFileName(p.number), content: pdf, contentType: "application/pdf" }],
    });
  } catch (e) {
    console.error(e);
    throw new DomainError("The email couldn't be sent. Check the address and try again, or download the PDF instead.");
  }
  await db.activity.create({
    data: { type: "EMAIL", subject: `Receipt ${p.number} emailed to ${d.to}`, byId: user.id, clientId: p.clientId },
  });
}

/* ---------- reading ---------- */

export { invoiceState, paidOf, loadInvoice, loadOrder };

export type InvoiceRow = {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  total: number;
  paid: number;
  balance: number;
  state: ReturnType<typeof invoiceState>["state"];
  daysOverdue: number;
  shareToken: string;
  salesOrder: { id: string; number: string; poNumber: string | null };
  client: { id: string; schoolName: string; mobile: string; email: string | null; owner: { id: string; name: string } };
};

export async function invoiceRows(user: SessionUser, where: Prisma.InvoiceWhereInput = {}): Promise<InvoiceRow[]> {
  const rows = await db.invoice.findMany({
    where: { ...where, client: { is: { ...clientScope(user), ...((where.client as Prisma.ClientWhereInput) ?? {}) } } },
    include: {
      payments: { select: { amount: true } },
      salesOrder: { select: { id: true, number: true, poNumber: true } },
      client: { select: { id: true, schoolName: true, mobile: true, email: true, owner: { select: { id: true, name: true } } } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    date: fromDbDate(r.date),
    dueDate: fromDbDate(r.dueDate),
    total: Number(r.total),
    ...invoiceState({ total: Number(r.total), status: r.status, dueDate: fromDbDate(r.dueDate) }, paidOf(r.payments)),
    shareToken: r.shareToken,
    salesOrder: r.salesOrder,
    client: r.client,
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
      where: { date: { gte: toDbDate(from), lte: toDbDate(to) }, client: { ...clientScope(user), ...client } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  return { ...outstandingSummary(rows), collected: Number(collected._sum.amount ?? 0), collectedCount: collected._count._all };
}

export type OutstandingFilters = { q?: string; show?: string; owner?: string };

/** The Outstanding page's rows and totals (same filters for the screen and its exports). */
export async function outstandingList(user: SessionUser, f: OutstandingFilters) {
  const rows = await invoiceRows(user, seesAllSales(user.role) && f.owner ? { client: { ownerId: f.owner } } : {});
  const q = (f.q ?? "").toLowerCase();
  const shown = rows.filter((r) => {
    if (q && !r.client.schoolName.toLowerCase().includes(q) && !r.number.toLowerCase().includes(q)) return false;
    if (f.show === "overdue") return r.state === "OVERDUE";
    if (f.show === "paid") return r.state === "PAID";
    if (f.show === "all") return true;
    return r.state === "UNPAID" || r.state === "PARTIAL" || r.state === "OVERDUE";
  });
  return { all: rows, shown, summary: outstandingSummary(rows) };
}

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { convertToClient } from "@/server/clients";
import { convertLead, createLead } from "@/server/leads";
import { moveOpportunity } from "@/server/opportunities";
import { createQuotation, markQuotationSent } from "@/server/quotation/service";
import { invoiceState, totals } from "@/server/finance/money";
import {
  cancelInvoice,
  cancelSalesOrder,
  createInvoice,
  createSalesOrder,
  deletePayment,
  emailInvoice,
  invoiceDefaults,
  invoicePdf,
  invoicePdfByToken,
  invoiceRows,
  logReminder,
  markDelivered,
  orderableQuotations,
  recordPayment,
  salesOrderDefaults,
  updateSalesOrder,
} from "@/server/finance/service";
import { leadData, makeUser, resetData } from "./helpers";

const today = todayIST();
const [Y, M] = today.split("-");
let exA: SessionUser, exB: SessionUser, head: SessionUser;
let clientId: string, oppId: string;

const order = (over: Record<string, unknown> = {}) => ({
  date: today,
  items: [
    { description: "PG Academic Kit", qty: "40", price: "2800", gstRate: "0" },
    { description: "NUR Academic Kit", qty: 25, price: 3400, gstRate: 0 },
  ],
  ...over,
});
const pay = (amount: number | string, over: Record<string, unknown> = {}) => ({ amount, date: today, mode: "UPI", ...over });

beforeEach(async () => {
  await resetData();
  exA = await makeUser("SALES_EXECUTIVE");
  exB = await makeUser("SALES_EXECUTIVE");
  head = await makeUser("SALES_HEAD");
  oppId = await convertLead(exA, await createLead(exA, leadData(exA.id, { schoolName: "Little Stars" })));
  await moveOpportunity(exA, oppId, { stage: "WON" });
  clientId = await convertToClient(exA, oppId);
});

describe("money rules", () => {
  it("totals lines with per-line GST, rounded to paise", () => {
    expect(totals([{ qty: 3, price: 33.335, gstRate: 0 }])).toEqual({ subtotal: 100.01, gstAmount: 0, total: 100.01 });
    expect(totals([{ qty: 2, price: 100, gstRate: 18 }, { qty: 1, price: 50, gstRate: 0 }])).toEqual({ subtotal: 250, gstAmount: 36, total: 286 });
  });

  it("works out unpaid, partial, paid and overdue", () => {
    const due = "2026-10-10";
    expect(invoiceState({ total: 1000, status: "ISSUED", dueDate: due }, 0, "2026-10-01").state).toBe("UNPAID");
    expect(invoiceState({ total: 1000, status: "ISSUED", dueDate: due }, 400, "2026-10-01")).toMatchObject({ state: "PARTIAL", balance: 600 });
    expect(invoiceState({ total: 1000, status: "ISSUED", dueDate: due }, 400, "2026-10-13")).toMatchObject({ state: "OVERDUE", daysOverdue: 3 });
    expect(invoiceState({ total: 1000, status: "ISSUED", dueDate: due }, 1000, "2026-12-01").state).toBe("PAID");
    expect(invoiceState({ total: 1000, status: "CANCELLED", dueDate: due }, 0).state).toBe("CANCELLED");
  });
});

describe("sales orders", () => {
  it("numbers them SO/YYYY/MM/NNN and needs whole kits", async () => {
    const id = await createSalesOrder(exA, clientId, order());
    const so = await db.salesOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(so).toMatchObject({ number: `SO/${Y}/${M}/001`, status: "CONFIRMED" });
    expect(so.items).toHaveLength(2);
    await expect(createSalesOrder(exA, clientId, order({ items: [{ description: "X", qty: "2.5", price: "1", gstRate: "0" }] }))).rejects.toThrow(/whole number/);
    await expect(createSalesOrder(exA, clientId, order({ items: [{ description: "X", qty: "", price: "1", gstRate: "0" }] }))).rejects.toThrow(/number of kits/);
  });

  it("can start from a sent quotation of the deal or the client", async () => {
    // (made on the client, then moved onto the deal as if quoted before it was won)
    const q1 = await createQuotation(exA, { clientId }, {
      date: today, validityDays: 3, toLine: "The Director", schoolName: "Little Stars",
      items: [{ description: "PG Academic Kit", mrp: 3700, price: 2800 }],
    });
    await db.quotation.update({ where: { id: q1 }, data: { clientId: null, opportunityId: oppId } });
    await markQuotationSent(exA, q1, "download");
    const q2 = await createQuotation(exA, { clientId }, {
      date: today, validityDays: 3, toLine: "The Director", schoolName: "Little Stars",
      items: [{ description: "LKG Academic Kit", mrp: 5600, price: 3800 }],
    });
    expect((await orderableQuotations(exA, clientId)).map((q) => q.id)).toEqual([q1]);
    await markQuotationSent(exA, q2, "whatsapp");
    expect(await orderableQuotations(exA, clientId)).toHaveLength(2);
    const d = await salesOrderDefaults(exA, clientId, q2);
    expect(d.items).toEqual([{ productId: null, description: "LKG Academic Kit", qty: "", price: "3800", gstRate: "0" }]);
    const id = await createSalesOrder(exA, clientId, { ...d, items: [{ ...d.items[0], qty: 10 }] });
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id } })).quotationId).toBe(q2);
  });

  it("is limited to the client's owner and the sales head", async () => {
    await expect(createSalesOrder(exB, clientId, order())).rejects.toThrow(/not found/);
    const id = await createSalesOrder(head, clientId, order());
    await expect(markDelivered(exB, id, today)).rejects.toThrow(/not found/);
    await markDelivered(exA, id, today);
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id } })).status).toBe("DELIVERED");
  });

  it("is locked once invoiced", async () => {
    const id = await createSalesOrder(exA, clientId, order());
    await createInvoice(exA, id, await invoiceDefaults(exA, id));
    await expect(updateSalesOrder(exA, id, order())).rejects.toThrow(/invoiced/);
    await expect(cancelSalesOrder(exA, id)).rejects.toThrow(/invoice first/);
    await expect(createInvoice(exA, id, await invoiceDefaults(exA, id))).rejects.toThrow(/already has an invoice/);
  });
});

describe("invoices and payments", () => {
  async function invoice() {
    const so = await createSalesOrder(exA, clientId, order());
    return createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
  }

  it("raises an invoice with totals and a collection follow-up on the due date", async () => {
    const id = await invoice();
    const inv = await db.invoice.findUniqueOrThrow({ where: { id }, include: { tasks: true } });
    expect(inv).toMatchObject({ number: `INV/${Y}/${M}/001` });
    expect(Number(inv.total)).toBe(40 * 2800 + 25 * 3400);
    expect(inv.tasks).toHaveLength(1);
    expect(inv.tasks[0]).toMatchObject({ assigneeId: exA.id, status: "OPEN", clientId, isAuto: true });
    expect(inv.tasks[0].title).toMatch(/^Collect ₹1,97,000/);
  });

  it("takes payments in instalments until paid, then closes the follow-up", async () => {
    const id = await invoice();
    expect(await recordPayment(exA, id, pay(50000))).toMatchObject({ state: "PARTIAL", balance: 147000 });
    const task = await db.task.findFirstOrThrow({ where: { invoiceId: id, status: "OPEN" } });
    expect(task.title).toMatch(/^Collect ₹1,47,000/);
    await expect(recordPayment(exA, id, pay(200000))).rejects.toThrow(/more than/);
    await expect(recordPayment(exA, id, pay(10, { mode: "Barter" }))).rejects.toThrow(/how it was paid/);
    expect(await recordPayment(exA, id, pay("1,47,000", { mode: "Cheque", reference: "001234" }))).toMatchObject({ state: "PAID", balance: 0 });
    expect(await db.task.count({ where: { invoiceId: id, status: "OPEN" } })).toBe(0);
    await expect(recordPayment(exA, id, pay(1))).rejects.toThrow(/fully paid/);
  });

  it("deleting a payment reopens what is owed", async () => {
    const id = await invoice();
    await recordPayment(exA, id, pay(197000));
    const p = await db.payment.findFirstOrThrow({ where: { invoiceId: id } });
    await expect(deletePayment(exB, p.id)).rejects.toThrow(/not found/);
    await deletePayment(exA, p.id);
    const open = await db.task.findMany({ where: { invoiceId: id, status: "OPEN" } });
    expect(open).toHaveLength(1);
    expect(open[0].title).toMatch(/^Collect ₹1,97,000/);
  });

  it("lists outstanding per invoice, only for those who can see the client", async () => {
    const id = await invoice();
    await recordPayment(exA, id, pay(97000));
    const [row] = await invoiceRows(exA);
    expect(row).toMatchObject({ id, total: 197000, paid: 97000, balance: 100000, state: "PARTIAL" });
    expect(await invoiceRows(exB)).toHaveLength(0);
    expect(await invoiceRows(head)).toHaveLength(1);
  });

  it("cancelling needs no payments and closes the follow-up", async () => {
    const id = await invoice();
    await recordPayment(exA, id, pay(1000));
    await expect(cancelInvoice(exA, id)).rejects.toThrow(/has payments/);
    await deletePayment(exA, (await db.payment.findFirstOrThrow({ where: { invoiceId: id } })).id);
    await cancelInvoice(exA, id);
    expect(await db.task.count({ where: { invoiceId: id, status: "OPEN" } })).toBe(0);
    expect((await invoiceRows(exA))[0].state).toBe("CANCELLED");
  });

  it("renders the PDF, shares by link, logs reminders", async () => {
    const id = await invoice();
    const { pdf, number } = await invoicePdf(exA, id);
    expect(number).toMatch(/^INV\//);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const { shareToken } = await db.invoice.findUniqueOrThrow({ where: { id } });
    expect((await invoicePdfByToken(shareToken))?.number).toBe(number);
    await logReminder(exA, id, "whatsapp");
    expect(await db.activity.count({ where: { clientId, subject: { contains: "Payment reminder" } } })).toBe(1);
    await expect(emailInvoice(exA, id, { to: "school@example.com", message: "Hi" }, "reminder")).rejects.toThrow(/isn't set up/);
  });
});

describe("collection follow-ups", () => {
  it("a rescheduled collect follow-up stays linked to the invoice", async () => {
    const { completeTask } = await import("@/server/tasks");
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, { date: today, dueDate: today });
    const t = await db.task.findFirstOrThrow({ where: { invoiceId: id, status: "OPEN" } });
    await completeTask(exA, t.id, { outcome: "Promised next week", nextDate: addDays(today, 7) });
    const next = await db.task.findFirstOrThrow({ where: { invoiceId: id, status: "OPEN" } });
    expect(next.title).toBe(t.title);
    await recordPayment(exA, id, pay(197000));
    expect(await db.task.count({ where: { invoiceId: id, status: "OPEN" } })).toBe(0);
  });
});

describe("payment receipts", () => {
  it("numbers each payment RCPT/YYYY/MM/NNN and renders a shareable receipt", async () => {
    const { receiptPdf, receiptPdfByToken, emailReceipt } = await import("@/server/finance/service");
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
    const a = await recordPayment(exA, id, pay(50000));
    const b = await recordPayment(exA, id, pay(47000));
    expect([a.receiptNumber, b.receiptNumber]).toEqual([`RCPT/${Y}/${M}/001`, `RCPT/${Y}/${M}/002`]);
    const { pdf, number } = await receiptPdf(exA, b.paymentId);
    expect(number).toBe(b.receiptNumber);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    await expect(receiptPdf(exB, b.paymentId)).rejects.toThrow(/not found/);
    expect((await receiptPdfByToken(a.shareToken))?.number).toBe(a.receiptNumber);
    expect(await receiptPdfByToken("not-a-real-token-at-all-xyz")).toBeNull();
    await expect(emailReceipt(exA, a.paymentId, { to: "school@example.com", message: "Hi" })).rejects.toThrow(/isn't set up/);
  });

  it("writes amounts in words, Indian style", async () => {
    const { rupeesInWords } = await import("@/server/finance/words");
    expect(rupeesInWords(197000)).toBe("Rupees One Lakh Ninety-Seven Thousand Only");
    expect(rupeesInWords(12345678.5)).toBe("Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Fifty Paise Only");
    expect(rupeesInWords(1000)).toBe("Rupees One Thousand Only");
  });
});

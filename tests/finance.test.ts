import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, fromDbDate, todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { convertToClient } from "@/server/clients";
import { convertLead, createLead, disqualifyLead } from "@/server/leads";
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
const pay = (amount: number | string, over: Record<string, unknown> = {}) => ({
  amount,
  date: today,
  mode: "UPI",
  ...over,
});

beforeEach(async () => {
  await resetData();
  exA = await makeUser("SALES_EXECUTIVE");
  exB = await makeUser("SALES_EXECUTIVE");
  head = await makeUser("SALES_HEAD");
  oppId = await convertLead(exA, await createLead(exA, leadData(exA.id, { schoolName: "Little Stars" })), { temperature: "WARM" });
  await moveOpportunity(exA, oppId, { stage: "WON" });
  clientId = await convertToClient(exA, oppId);
  // These tests are about the money rules; Accounts approval (R36) has its own tests below, with it switched on.
  await db.appSetting.upsert({ where: { key: "features" }, create: { key: "features", value: { paymentApproval: false } }, update: { value: { paymentApproval: false } } });
});

describe("money rules", () => {
  it("totals lines with per-line GST, rounded to paise", () => {
    expect(totals([{ qty: 3, price: 33.335, gstRate: 0 }])).toEqual({
      subtotal: 100.01,
      gstAmount: 0,
      total: 100.01,
    });
    expect(
      totals([
        { qty: 2, price: 100, gstRate: 18 },
        { qty: 1, price: 50, gstRate: 0 },
      ]),
    ).toEqual({ subtotal: 250, gstAmount: 36, total: 286 });
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
    const so = await db.salesOrder.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });
    expect(so).toMatchObject({
      number: `SO/${Y}/${M}/001`,
      status: "CONFIRMED",
    });
    expect(so.items).toHaveLength(2);
    await expect(
      createSalesOrder(
        exA,
        clientId,
        order({
          items: [{ description: "X", qty: "2.5", price: "1", gstRate: "0" }],
        }),
      ),
    ).rejects.toThrow(/whole number/);
    await expect(
      createSalesOrder(
        exA,
        clientId,
        order({
          items: [{ description: "X", qty: "", price: "1", gstRate: "0" }],
        }),
      ),
    ).rejects.toThrow(/number of kits/);
  });

  it("can start from a sent quotation of the deal or the client", async () => {
    // (made on the client, then moved onto the deal as if quoted before it was won)
    const q1 = await createQuotation(
      exA,
      { clientId },
      {
        date: today,
        validityDays: 3,
        toLine: "The Director",
        schoolName: "Little Stars",
        items: [{ description: "PG Academic Kit", mrp: 3700, price: 2800 }],
      },
    );
    await db.quotation.update({
      where: { id: q1 },
      data: { clientId: null, opportunityId: oppId },
    });
    await markQuotationSent(exA, q1, "download");
    const q2 = await createQuotation(
      exA,
      { clientId },
      {
        date: today,
        validityDays: 3,
        toLine: "The Director",
        schoolName: "Little Stars",
        items: [{ description: "LKG Academic Kit", mrp: 5600, price: 3800 }],
      },
    );
    expect((await orderableQuotations(exA, clientId)).map((q) => q.id)).toEqual([q1]);
    await markQuotationSent(exA, q2, "whatsapp");
    expect(await orderableQuotations(exA, clientId)).toHaveLength(2);
    const d = await salesOrderDefaults(exA, clientId, q2);
    expect(d.items).toEqual([
      {
        productId: null,
        description: "LKG Academic Kit",
        qty: "",
        price: "3800",
        gstRate: "0",
      },
    ]);
    const id = await createSalesOrder(exA, clientId, {
      ...d,
      items: [{ ...d.items[0], qty: 10 }],
    });
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
    const inv = await db.invoice.findUniqueOrThrow({
      where: { id },
      include: { tasks: true },
    });
    expect(inv).toMatchObject({ number: `INV/${Y}/${M}/001` });
    expect(Number(inv.total)).toBe(40 * 2800 + 25 * 3400);
    expect(inv.tasks).toHaveLength(1);
    expect(inv.tasks[0]).toMatchObject({
      assigneeId: exA.id,
      status: "OPEN",
      clientId,
      isAuto: true,
    });
    expect(inv.tasks[0].title).toMatch(/^Collect ₹1,97,000/);
  });

  it("takes payments in instalments until paid, then closes the follow-up", async () => {
    const id = await invoice();
    expect(await recordPayment(exA, id, pay(50000))).toMatchObject({
      state: "PARTIAL",
      balance: 147000,
    });
    const task = await db.task.findFirstOrThrow({
      where: { invoiceId: id, status: "OPEN" },
    });
    expect(task.title).toMatch(/^Collect ₹1,47,000/);
    await expect(recordPayment(exA, id, pay(200000))).rejects.toThrow(/more than/);
    await expect(recordPayment(exA, id, pay(10, { mode: "Barter" }))).rejects.toThrow(/how it was paid/);
    expect(await recordPayment(exA, id, pay("1,47,000", { mode: "NEFT/RTGS", reference: "UTR001234" }))).toMatchObject({ state: "PAID", balance: 0 });
    expect(await db.task.count({ where: { invoiceId: id, status: "OPEN" } })).toBe(0);
    await expect(recordPayment(exA, id, pay(1))).rejects.toThrow(/fully paid/);
  });

  it("deleting a payment reopens what is owed", async () => {
    const id = await invoice();
    await recordPayment(exA, id, pay(197000));
    const p = await db.payment.findFirstOrThrow({ where: { invoiceId: id } });
    await expect(deletePayment(exA, p.id)).rejects.toThrow(/Admin or the Sales Head/);
    await deletePayment(head, p.id);
    const open = await db.task.findMany({
      where: { invoiceId: id, status: "OPEN" },
    });
    expect(open).toHaveLength(1);
    expect(open[0].title).toMatch(/^Collect ₹1,97,000/);
  });

  it("lists outstanding per invoice, only for those who can see the client", async () => {
    const id = await invoice();
    await recordPayment(exA, id, pay(97000));
    const [row] = await invoiceRows(exA);
    expect(row).toMatchObject({
      id,
      total: 197000,
      paid: 97000,
      balance: 100000,
      state: "PARTIAL",
    });
    expect(await invoiceRows(exB)).toHaveLength(0);
    expect(await invoiceRows(head)).toHaveLength(1);
  });

  it("cancelling needs no payments and closes the follow-up", async () => {
    const id = await invoice();
    await recordPayment(exA, id, pay(1000));
    await expect(cancelInvoice(exA, id)).rejects.toThrow(/Admin or the Sales Head/);
    await expect(cancelInvoice(head, id)).rejects.toThrow(/has payments/);
    await deletePayment(head, (await db.payment.findFirstOrThrow({ where: { invoiceId: id } })).id);
    await cancelInvoice(head, id);
    expect(await db.task.count({ where: { invoiceId: id, status: "OPEN" } })).toBe(0);
    expect((await invoiceRows(exA))[0].state).toBe("CANCELLED");
  });

  it("renders the PDF, shares by link, logs reminders", async () => {
    const id = await invoice();
    const { pdf, number } = await invoicePdf(exA, id);
    expect(number).toMatch(/^INV\//);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const { shareToken } = await db.invoice.findUniqueOrThrow({
      where: { id },
    });
    expect((await invoicePdfByToken(shareToken))?.number).toBe(number);
    await logReminder(exA, id, "whatsapp");
    expect(
      await db.activity.count({
        where: { clientId, subject: { contains: "Payment reminder" } },
      }),
    ).toBe(1);
    await expect(emailInvoice(exA, id, { to: "school@example.com", message: "Hi" }, "reminder")).rejects.toThrow(/isn't set up/);
  });
});

describe("collection follow-ups", () => {
  it("a rescheduled collect follow-up stays linked to the invoice", async () => {
    const { completeTask } = await import("@/server/tasks");
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, { date: today, dueDate: today });
    const t = await db.task.findFirstOrThrow({
      where: { invoiceId: id, status: "OPEN" },
    });
    await completeTask(exA, t.id, {
      outcome: "Promised next week",
      nextDate: addDays(today, 7),
    });
    const next = await db.task.findFirstOrThrow({
      where: { invoiceId: id, status: "OPEN" },
    });
    expect(next.title).toBe(t.title);
    await recordPayment(exA, id, pay(197000));
    expect(await db.task.count({ where: { invoiceId: id, status: "OPEN" } })).toBe(0);
  });
});

describe("payment receipts", () => {
  it("numbers receipts like the client's book (1/26-27), from a starting number, and renders a shareable receipt", async () => {
    const { receiptPdf, receiptPdfByToken, emailReceipt } = await import("@/server/finance/service");
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, {
      date: today,
      dueDate: addDays(today, 45),
    });
    const { financialYear } = await import("@/lib/fy");
    const { saveDocumentSettings, DEFAULT_DOCUMENTS } = await import("@/server/documents");
    const fy = financialYear(today).short;
    const a = await recordPayment(exA, id, pay(50000));
    expect(a.receiptNumber).toBe(`1/${fy}`);
    // Continue from the client's own receipt book (they were at 117).
    await saveDocumentSettings(exA.id, { ...DEFAULT_DOCUMENTS, numbering: { fy: "", nextReceipt: 118, nextPo: null } });
    const b = await recordPayment(exA, id, pay(47000));
    expect(b.receiptNumber).toBe(`118/${fy}`);
    const { pdf, number } = await receiptPdf(exA, b.paymentId);
    expect(number).toBe(b.receiptNumber);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    await expect(receiptPdf(exB, b.paymentId)).rejects.toThrow(/not found/);
    expect((await receiptPdfByToken(a.shareToken))?.number).toBe(a.receiptNumber);
    expect(await receiptPdfByToken("not-a-real-token-at-all-xyz")).toBeNull();
    await expect(
      emailReceipt(exA, a.paymentId, {
        to: "school@example.com",
        message: "Hi",
      }),
    ).rejects.toThrow(/isn't set up/);
  });

  it("writes amounts in words, Indian style", async () => {
    const { rupeesInWords } = await import("@/server/finance/words");
    expect(rupeesInWords(197000)).toBe("Rupees One Lakh Ninety-Seven Thousand Only");
    expect(rupeesInWords(12345678.5)).toBe("Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Fifty Paise Only");
    expect(rupeesInWords(1000)).toBe("Rupees One Thousand Only");
  });
});

describe("purchase orders", () => {
  it("PO number is saved on the order, can be set after invoicing, and prints on the invoice", async () => {
    const { setPurchaseOrder } = await import("@/server/finance/po");
    const so = await createSalesOrder(exA, clientId, order({ poNumber: "PO/LS/17", poDate: today }));
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: so } })).poNumber).toBe("PO/LS/17");
    const inv = await createInvoice(exA, so, {
      date: today,
      dueDate: addDays(today, 45),
    });
    await setPurchaseOrder(exA, so, { poNumber: "PO/LS/18", poDate: today });
    expect((await invoiceRows(exA))[0].salesOrder.poNumber).toBe("PO/LS/18");
    await expect(setPurchaseOrder(exB, so, { poNumber: "X" })).rejects.toThrow(/not found/);
    await expect(setPurchaseOrder(exA, so, { poNumber: "" })).rejects.toThrow(/PO number/);
    expect((await invoicePdf(exA, inv)).pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("stores the signed PO file (PDF or photo up to 4 MB)", async () => {
    const { poFile, savePoFile } = await import("@/server/finance/po");
    const so = await createSalesOrder(exA, clientId, order());
    const bytes = new TextEncoder().encode("%PDF-1.4 test");
    await expect(
      savePoFile(exA, so, {
        name: "po.exe",
        type: "application/x-msdownload",
        bytes,
      }),
    ).rejects.toThrow(/PDF or a photo/);
    await expect(
      savePoFile(exA, so, {
        name: "big.pdf",
        type: "application/pdf",
        bytes: new Uint8Array(5 * 1024 * 1024),
      }),
    ).rejects.toThrow(/4 MB/);
    await savePoFile(exA, so, {
      name: "po.pdf",
      type: "application/pdf",
      bytes,
    });
    await savePoFile(exA, so, {
      name: "po-v2.pdf",
      type: "application/pdf",
      bytes,
    });
    expect((await poFile(exA, so)).fileName).toBe("po-v2.pdf");
    await expect(poFile(exB, so)).rejects.toThrow(/not found/);
  });

  it("makes a PO template in the client's format from a sent quotation, numbered once", async () => {
    const { poTemplatePdf, poTemplatePdfByToken, savePoTemplate } = await import("@/server/finance/po");
    const { saveDocumentSettings, DEFAULT_DOCUMENTS } = await import("@/server/documents");
    const { financialYear } = await import("@/lib/fy");
    const q = await createQuotation(
      exA,
      { clientId },
      {
        date: today,
        validityDays: 3,
        toLine: "The Director",
        schoolName: "Little Stars",
        items: [
          { description: "Play Group Kit", mrp: 3700, price: 2360 },
          { description: "Nursery Kit", mrp: 4800, price: 2760 },
        ],
      },
    );
    await expect(poTemplatePdf(exA, q)).rejects.toThrow(/Send the quotation first/);
    await expect(savePoTemplate(exA, q, {})).rejects.toThrow(/Send the quotation first/);
    await markQuotationSent(exA, q, "download");
    // Continue from the client's own PO book: next number 93 this financial year.
    await saveDocumentSettings(exA.id, { ...DEFAULT_DOCUMENTS, numbering: { fy: "", nextReceipt: null, nextPo: 93 } });
    const fy = financialYear(today);
    const details = {
      kits: [10, null],
      requisitioner: "Mrs. Manali Jagdale",
      deliveryDate: addDays(today, 30),
      remarks: ["Add Hindi Swar TB, NB in LKG", ""],
      customise: [true, false, true, true],
      cheques: [{ mode: "CDC", date: today, amount: 98580 }],
    };
    const poNumber = await savePoTemplate(exA, q, details);
    expect(poNumber).toBe(`PO/${fy.compact}/93`);
    // Saving again keeps the same number.
    expect(await savePoTemplate(exA, q, { ...details, kits: [10, 30] })).toBe(poNumber);
    const saved = await db.quotation.findUniqueOrThrow({ where: { id: q } });
    expect(saved.poDetails).toMatchObject({ kits: [10, 30], requisitioner: "Mrs. Manali Jagdale" });
    await expect(savePoTemplate(exB, q, details)).rejects.toThrow(/not found/);
    const { pdf } = await poTemplatePdf(exA, q);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect((await poTemplatePdfByToken(saved.shareToken))?.schoolName).toBe("Little Stars");
  });
});

describe("payment promise date", () => {
  it("moves the collection follow-up to the promised date on a part payment", async () => {
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, {
      date: today,
      dueDate: addDays(today, 45),
    });
    await expect(recordPayment(exA, id, pay(1000, { promiseDate: addDays(today, -1) }))).rejects.toThrow(/past/);
    await recordPayment(exA, id, pay(50000, { promiseDate: addDays(today, 10) }));
    const t = await db.task.findFirstOrThrow({
      where: { invoiceId: id, status: "OPEN" },
    });
    expect(fromDbDate(t.dueDate)).toBe(addDays(today, 10));
    expect(t.remark).toMatch(/promised/);
  });
});

describe("advances and proforma", () => {
  it("takes an advance on an order and adjusts it on the invoice", async () => {
    const { recordAdvance, proformaPdf } = await import("@/server/finance/service");
    const so = await createSalesOrder(exA, clientId, order()); // ₹1,97,000
    const pi = await proformaPdf(exA, so);
    expect(pi.number).toMatch(new RegExp(`^PI/${Y}/${M}/\\d{3}$`));
    expect((await proformaPdf(exA, so)).number).toBe(pi.number); // same number every time
    await recordAdvance(exA, so, pay(78800, { mode: "NEFT/RTGS" }));
    await expect(recordAdvance(exA, so, pay(200000))).rejects.toThrow(/remaining/);
    const id = await createInvoice(exA, so, {
      date: today,
      dueDate: addDays(today, 45),
    });
    const [row] = await invoiceRows(exA);
    expect(row).toMatchObject({
      id,
      paid: 78800,
      balance: 118200,
      state: "PARTIAL",
    });
    const task = await db.task.findFirstOrThrow({
      where: { invoiceId: id, status: "OPEN" },
    });
    expect(task.title).toMatch(/^Collect ₹1,18,200/);
    await expect(recordAdvance(exA, so, pay(1000))).rejects.toThrow(/invoiced/);
  });
});

describe("cheques", () => {
  it("count as received only when cleared; bounced makes the amount due again", async () => {
    const { setChequeStatus, receiptPdf } = await import("@/server/finance/service");
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, {
      date: today,
      dueDate: addDays(today, 45),
    });
    const r = await recordPayment(
      exA,
      id,
      pay(100000, {
        mode: "PDC (Post Dated Cheque)",
        reference: "000111",
        bank: "HDFC",
        chequeDate: addDays(today, 20),
      }),
    );
    let [row] = await invoiceRows(exA);
    expect(row).toMatchObject({ paid: 0, pending: 100000, balance: 197000 });
    const deposit = await db.task.findFirstOrThrow({
      where: { paymentId: r.paymentId },
    });
    expect(fromDbDate(deposit.dueDate)).toBe(addDays(today, 20));
    await expect(recordPayment(exA, id, pay(100000))).rejects.toThrow(/more than/); // only 97,000 left to take
    expect((await receiptPdf(exA, r.paymentId)).pdf.subarray(0, 4).toString()).toBe("%PDF");
    await setChequeStatus(exA, r.paymentId, "DEPOSITED");
    await expect(setChequeStatus(exA, r.paymentId, "CLEARED")).rejects.toThrow(/Admin or the Sales Head/);
    await setChequeStatus(head, r.paymentId, "CLEARED");
    [row] = await invoiceRows(exA);
    expect(row).toMatchObject({ paid: 100000, pending: 0, balance: 97000 });
    expect((await db.task.findUniqueOrThrow({ where: { id: deposit.id } })).status).toBe("DONE");

    const r2 = await recordPayment(exA, id, pay(97000, { mode: "Cheque", reference: "000222" }));
    await setChequeStatus(head, r2.paymentId, "BOUNCED");
    [row] = await invoiceRows(exA);
    expect(row).toMatchObject({ paid: 100000, pending: 0, balance: 97000 });
    expect(
      await db.task.findFirst({
        where: { invoiceId: id, status: "OPEN", priority: "CRITICAL" },
      }),
    ).not.toBeNull();
  });

  it("with cheque tracking switched off, cheques count straight away", async () => {
    const { setFeature } = await import("@/server/features");
    const admin = await makeUser("ADMIN");
    await setFeature(admin, "cheques", false);
    try {
      const so = await createSalesOrder(exA, clientId, order());
      const id = await createInvoice(exA, so, {
        date: today,
        dueDate: addDays(today, 45),
      });
      await recordPayment(exA, id, pay(1000, { mode: "Cheque", reference: "1" }));
      expect((await invoiceRows(exA))[0]).toMatchObject({
        paid: 1000,
        pending: 0,
      });
    } finally {
      await setFeature(admin, "cheques", true);
    }
  });
});

describe("credit notes", () => {
  it("reduce the balance, only for Admin / Sales Head, and show in the ledger", async () => {
    const { createCreditNote, deleteCreditNote, creditNotePdf } = await import("@/server/finance/service");
    const { clientLedger, financialYear } = await import("@/server/finance/ledger");
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, {
      date: today,
      dueDate: addDays(today, 45),
    });
    await expect(
      createCreditNote(exA, id, {
        date: today,
        amount: 1000,
        reason: "Discount",
      }),
    ).rejects.toThrow(/Admin or the Sales Head/);
    await expect(
      createCreditNote(head, id, {
        date: today,
        amount: 999999,
        reason: "Too much",
      }),
    ).rejects.toThrow(/can't be more/);
    const cn = await createCreditNote(head, id, {
      date: today,
      amount: 17000,
      reason: "5 NUR kits returned",
    });
    expect((await invoiceRows(exA))[0]).toMatchObject({
      credited: 17000,
      balance: 180000,
    });
    expect((await creditNotePdf(exA, cn)).number).toMatch(/^CN\//);
    const l = await clientLedger(exA, clientId, financialYear(today));
    expect(l.closing).toBe(180000);
    await deleteCreditNote(head, cn);
    expect((await invoiceRows(exA))[0].balance).toBe(197000);
  });
});

describe("dispatch", () => {
  it("sends kits in lots, numbers challans, and marks the order delivered when all are sent", async () => {
    const { createDispatch, challanPdf, markDispatchReceived } = await import("@/server/finance/dispatch");
    const so = await createSalesOrder(exA, clientId, order()); // 40 PG + 25 NUR
    const items = await db.salesOrderItem.findMany({
      where: { salesOrderId: so },
      orderBy: { sortOrder: "asc" },
    });
    const lot = (a: number, b: number) => ({
      date: today,
      transporter: "VRL",
      docketNo: "D1",
      lines: [
        { itemId: items[0].id, qty: a },
        { itemId: items[1].id, qty: b },
      ],
    });
    await expect(createDispatch(exA, so, lot(0, 0))).rejects.toThrow(/number of kits/);
    await expect(createDispatch(exA, so, lot(41, 0))).rejects.toThrow(/Only 40/);
    const dc1 = await createDispatch(exA, so, lot(30, 25));
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: so } })).status).toBe("CONFIRMED");
    await expect(createDispatch(exA, so, lot(11, 0))).rejects.toThrow(/Only 10/);
    await createDispatch(exA, so, lot(10, 0));
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: so } })).status).toBe("DELIVERED");
    const { number, pdf } = await challanPdf(exA, dc1);
    expect(number).toMatch(/^DC\//);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    await markDispatchReceived(exA, dc1, today);
    await expect(challanPdf(exB, dc1)).rejects.toThrow(/not found/);
  });
});

describe("client documents and contacts", () => {
  it("stores documents and proof of delivery files", async () => {
    const { saveClientFile, clientFile, deleteClientFile } = await import("@/server/files");
    const bytes = new TextEncoder().encode("%PDF-1.4");
    await expect(
      saveClientFile(exA, clientId, {
        category: "Secret",
        title: "",
        name: "a.pdf",
        type: "application/pdf",
        bytes,
      }),
    ).rejects.toThrow(/kind of document/);
    await expect(
      saveClientFile(exB, clientId, {
        category: "Agreement / MOU",
        title: "",
        name: "a.pdf",
        type: "application/pdf",
        bytes,
      }),
    ).rejects.toThrow(/not found/);
    await saveClientFile(exA, clientId, {
      category: "Agreement / MOU",
      title: "Agreement 2026-27",
      name: "a.pdf",
      type: "application/pdf",
      bytes,
    });
    const f = await db.clientFile.findFirstOrThrow({ where: { clientId } });
    expect((await clientFile(exA, f.id)).title).toBe("Agreement 2026-27");
    await deleteClientFile(exA, f.id);
    expect(await db.clientFile.count({ where: { clientId } })).toBe(0);
  });

  it("keeps extra contacts; one gets payment messages", async () => {
    const { saveContact, deleteContact } = await import("@/server/contacts");
    await expect(saveContact(exA, clientId, null, { name: "Ravi", role: "Accounts" })).rejects.toThrow(/mobile number or an email/);
    await saveContact(exA, clientId, null, {
      name: "Ravi",
      role: "Accounts",
      mobile: "98989 89898",
      forPayments: true,
    });
    await saveContact(exA, clientId, null, {
      name: "Meera",
      role: "Principal",
      email: "p@school.in",
      forPayments: true,
    });
    const ks = await db.clientContact.findMany({
      where: { clientId },
      orderBy: { createdAt: "asc" },
    });
    expect(ks.map((k) => k.forPayments)).toEqual([false, true]);
    const so = await createSalesOrder(exA, clientId, order());
    await createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
    expect((await invoiceRows(exA))[0].client.payContact).toMatchObject({
      name: "Meera",
      email: "p@school.in",
    });
    await deleteContact(exA, ks[0].id);
    expect(await db.clientContact.count({ where: { clientId } })).toBe(1);
  });
});

describe("renewals", () => {
  it("renewals are for the next financial year (April – March)", async () => {
    const { nextRenewalYear } = await import("@/server/renewals");
    expect(nextRenewalYear("2026-10-01")).toEqual({ label: "2027-28", startsOn: "2027-04-01" });
    expect(nextRenewalYear("2027-03-31").label).toBe("2027-28");
    expect(nextRenewalYear("2027-04-01").label).toBe("2028-29");
  });

  it("creates one renewal per ordering client, worth last year's order", async () => {
    const { createRenewals, renewalCandidates } = await import("@/server/renewals");
    const { convertToClient } = await import("@/server/clients");
    await expect(createRenewals(head)).rejects.toThrow(/already has a renewal/);
    await createSalesOrder(exA, clientId, order());
    expect((await renewalCandidates(head)).clients).toHaveLength(1);
    await expect(createRenewals(exA)).rejects.toThrow(/Admin or the Sales Head/);
    expect(await createRenewals(head)).toMatchObject({ count: 1 });
    const opp = await db.opportunity.findFirstOrThrow({
      where: { renewalOfId: clientId },
    });
    expect(opp).toMatchObject({ ownerId: exA.id, stage: "INTERESTED" });
    expect(Number(opp.expectedValue)).toBe(197000);
    expect((await renewalCandidates(head)).clients).toHaveLength(0);
    await expect(createRenewals(exA, clientId)).rejects.toThrow(/already has a renewal/);
    // A renewal's quotations can be ordered on the client, and it never becomes a second client.
    await moveOpportunity(exA, opp.id, { stage: "WON" });
    await expect(convertToClient(exA, opp.id)).rejects.toThrow(/renewal/);
  });
});

describe("targets, ageing and quotation validity", () => {
  it("targets compare invoiced and cleared money for the month", async () => {
    const { saveTargets, targetProgress, thisMonth } = await import("@/server/targets");
    await expect(saveTargets(exA, thisMonth(), [])).rejects.toThrow(/Admin or the Sales Head/);
    await saveTargets(head, thisMonth(), [{ userId: exA.id, sales: "500000", collection: 200000 }]);
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, {
      date: today,
      dueDate: addDays(today, 45),
    });
    await recordPayment(exA, id, pay(50000));
    const mine = await targetProgress(exA);
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0]).toMatchObject({
      salesTarget: 500000,
      collectionTarget: 200000,
      sales: 197000,
      collection: 50000,
    });
  });

  it("ages overdue money into buckets", async () => {
    const { ageing } = await import("@/server/finance/money");
    const b = ageing([
      { balance: 100, state: "UNPAID", daysOverdue: 0 },
      { balance: 200, state: "OVERDUE", daysOverdue: 45 },
      { balance: 300, state: "OVERDUE", daysOverdue: 120 },
      { balance: 0, state: "PAID", daysOverdue: 0 },
    ]);
    expect(b.map((x) => x.amount)).toEqual([100, 0, 200, 0, 300]);
  });

  it("books a follow-up the day before a sent quotation expires", async () => {
    const q = await createQuotation(
      exA,
      { clientId },
      {
        date: today,
        validityDays: 10,
        toLine: "The Director",
        schoolName: "Little Stars",
        items: [{ description: "PG Academic Kit", mrp: 3700, price: 2800 }],
      },
    );
    await markQuotationSent(exA, q, "download");
    const t = await db.task.findFirstOrThrow({
      where: { clientId, title: { startsWith: "Quotation QUO/" } },
    });
    expect(fromDbDate(t.dueDate)).toBe(addDays(today, 9));
    await markQuotationSent(exA, q, "whatsapp"); // sending again doesn't add another
    expect(
      await db.task.count({
        where: { clientId, title: { startsWith: "Quotation QUO/" } },
      }),
    ).toBe(1);
  });
});

describe("financial year chosen after login (R31)", () => {
  it("parses the remembered year and gives Apr–Mar ranges", async () => {
    const { parseYearCookie, fyRange, fyLabel } = await import("@/lib/fy");
    expect(parseYearCookie("all", "2026-10-03")).toBeNull();
    expect(parseYearCookie("2025", "2026-10-03")).toBe(2025);
    expect(parseYearCookie(undefined, "2027-02-10")).toBe(2026); // nothing chosen: the current year
    expect(fyRange(2026)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    expect(fyLabel(2026)).toBe("2026-27");
  });

  it("dashboard presets work inside the chosen year; a past year opens on the whole year", async () => {
    const { periodRange } = await import("@/server/dashboard-periods");
    const y25 = { from: "2025-04-01", to: "2026-03-31" };
    expect(periodRange({ year: y25 }, "2026-10-03")).toEqual(y25);
    expect(periodRange({ year: y25, period: "month" }, "2026-10-03")).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(periodRange({ year: { from: "2026-04-01", to: "2027-03-31" } }, "2026-10-03")).toEqual({ from: "2026-10-01", to: "2026-10-03" });
  });

  it("clients stay listed every year with their standing: renewed, new, not renewed", async () => {
    const { clientsList } = await import("@/server/queries");
    const { fyRange } = await import("@/lib/fy");
    const { financialYear } = await import("@/lib/fy");
    const now = financialYear(today).start;
    // Last year's order only → this year "Not renewed", last year "New".
    const so = await createSalesOrder(exA, clientId, order());
    await db.salesOrder.update({ where: { id: so }, data: { date: new Date(`${now - 1}-06-15T00:00:00Z`) } });
    await db.client.update({ where: { id: clientId }, data: { createdAt: new Date(`${now - 1}-05-01T00:00:00Z`) } });
    const thisYear = await clientsList(head, { year: fyRange(now) });
    expect(thisYear.find((c) => c.id === clientId)).toMatchObject({ standing: "NOT_RENEWED", lastOrdered: `${now - 1}-${String((now) % 100).padStart(2, "0")}` });
    expect((await clientsList(head, { year: fyRange(now - 1) })).find((c) => c.id === clientId)?.standing).toBe("NEW");
    expect(await clientsList(head, { year: fyRange(now), yr: "notrenewed" })).toHaveLength(1);
    expect(await clientsList(head, { year: fyRange(now), yr: "renewed" })).toHaveLength(0);
    // Ordering again this year → "Renewed". The client never disappears.
    await createSalesOrder(exA, clientId, order());
    expect((await clientsList(head, { year: fyRange(now) })).find((c) => c.id === clientId)?.standing).toBe("RENEWED");
    // A year before the school became a client: not listed. All years: always listed.
    expect(await clientsList(head, { year: fyRange(now - 3) })).toHaveLength(0);
    expect((await clientsList(head, {})).find((c) => c.id === clientId)?.standing).toBeNull();
  });

  it("leads and deals still open carry into the next year; closed ones stay in their year", async () => {
    const { leadsList, pipelineCards } = await import("@/server/queries");
    const { fyRange, financialYear } = await import("@/lib/fy");
    const now = financialYear(today).start;
    const lastYear = new Date(`${now - 1}-08-01T06:00:00Z`);
    const open = await createLead(exA, leadData(exA.id, { schoolName: "Carry Over School" }));
    const closed = await createLead(exA, leadData(exA.id, { schoolName: "Closed Last Year" }));
    await disqualifyLead(exA, closed, { reason: "Not Interested" });
    await db.lead.updateMany({ where: { id: { in: [open, closed] } }, data: { createdAt: lastYear } });
    await db.lead.update({ where: { id: closed }, data: { disqualifiedAt: lastYear } });
    const names = async (y: number) => (await leadsList(head, { year: fyRange(y) })).map((l) => l.schoolName);
    expect(await names(now)).toEqual(expect.arrayContaining(["Carry Over School"]));
    expect(await names(now)).not.toContain("Closed Last Year");
    expect(await names(now - 1)).toEqual(expect.arrayContaining(["Carry Over School", "Closed Last Year"]));
    // The won deal from setup was made today: not in last year's pipeline.
    expect((await pipelineCards(head, { year: fyRange(now - 1) })).map((o) => o.id)).not.toContain(oppId);
    expect((await pipelineCards(head, { year: fyRange(now) })).map((o) => o.id)).toContain(oppId);
  });
});

describe("PO template shows what is excluded and carries the checklist (R33)", () => {
  it("lists removed kit items under Material Exclude and appends the kit's checklist page", async () => {
    const { poTemplatePdf } = await import("@/server/finance/po");
    const kit = await db.product.create({
      data: { code: "KPO", name: "PO Test Kit", type: "MATERIAL", price: 300, contents: [{ title: "Group", items: ["Shape Kit", "Book"], prices: [{ sp: 20, mrp: 35 }, { sp: 280, mrp: 400 }] }] },
    });
    const q = await createQuotation(exA, { clientId }, {
      date: today,
      validityDays: 7,
      toLine: "The Director",
      schoolName: "Little Stars",
      items: [{ productId: kit.id, description: "PO Test Kit (without Shape Kit)", mrp: 365, price: 280, kit: { removed: ["Shape Kit"], added: [] } }],
    });
    await markQuotationSent(exA, q, "download");
    const { pdf } = await poTemplatePdf(exA, q);
    const raw = pdf.toString("latin1");
    // Two pages: the PO, then the kit checklist.
    expect((raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(2);
    await db.quotation.deleteMany({ where: { id: q } });
    await db.product.delete({ where: { id: kit.id } });
  });
});

describe("correct a school's details once, everywhere (R35)", () => {
  const fix = (over: Record<string, unknown> = {}) => ({
    schoolName: "Little Stars International",
    contactName: "Mrs. Correct Name",
    mobile: "98111 00099",
    email: "office@littlestars.in",
    state: "Maharashtra",
    city: "Pune",
    address: "New address, Pune",
    ...over,
  });

  it("from the converted lead: updates the lead, opportunity, client and draft quotations (not sent ones)", async () => {
    const { editSchool } = await import("@/server/school");
    const lead = await db.lead.findUniqueOrThrow({ where: { id: (await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).leadId! } });
    const draft = await createQuotation(exA, { clientId }, { date: today, validityDays: 7, toLine: "The Director", schoolName: "Little Stars", items: [{ description: "Kit", mrp: 1, price: 1 }] });
    const sent = await createQuotation(exA, { clientId }, { date: today, validityDays: 7, toLine: "The Director", schoolName: "Little Stars", items: [{ description: "Kit", mrp: 1, price: 1 }] });
    await markQuotationSent(exA, sent, "download");
    await expect(editSchool(exB, { leadId: lead.id }, fix())).rejects.toThrow(/not found/);
    const changed = await editSchool(exA, { leadId: lead.id }, fix());
    expect(changed).toEqual(expect.arrayContaining(["school name", "contact person", "mobile"]));
    expect(await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ schoolName: "Little Stars International", mobile: "9811100099" });
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).schoolName).toBe("Little Stars International");
    expect(await db.client.findUniqueOrThrow({ where: { id: clientId } })).toMatchObject({ schoolName: "Little Stars International", contactName: "Mrs. Correct Name", address: "New address, Pune" });
    expect((await db.quotation.findUniqueOrThrow({ where: { id: draft } })).schoolName).toBe("Little Stars International");
    expect((await db.quotation.findUniqueOrThrow({ where: { id: sent } })).schoolName).toBe("Little Stars");
  });

  it("from the opportunity window and from the client's Edit details", async () => {
    const { editSchool } = await import("@/server/school");
    const { updateClient } = await import("@/server/clients");
    await editSchool(exA, { opportunityId: oppId }, fix({ contactName: "Via Opportunity" }));
    expect((await db.client.findUniqueOrThrow({ where: { id: clientId } })).contactName).toBe("Via Opportunity");
    await updateClient(exA, clientId, { ...fix({ schoolName: "Little Stars Pre-school", mobile: "98111 00777" }), ownerId: exA.id });
    const lead = await db.lead.findUniqueOrThrow({ where: { id: (await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).leadId! } });
    expect(lead).toMatchObject({ schoolName: "Little Stars Pre-school", mobile: "9811100777" });
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).schoolName).toBe("Little Stars Pre-school");
  });
});

describe("Accounts approves payments before they count (R36)", () => {
  const on = () => db.appSetting.update({ where: { key: "features" }, data: { value: { paymentApproval: true } } });
  const invoice = async () => {
    const so = await createSalesOrder(exA, clientId, order());
    return createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
  };

  it("a salesperson's payment waits: not counted, no receipt; Accounts approves and the receipt can go", async () => {
    const svc = await import("@/server/finance/service");
    await on();
    const admin = await makeUser("ADMIN");
    const inv = await invoice();
    const before = (await invoiceRows(exA)).find((r) => r.id === inv)!;
    const r = await recordPayment(exA, inv, pay(1000));
    expect(r).toMatchObject({ awaiting: true, receiptNumber: null });
    const row = (await invoiceRows(exA)).find((x) => x.id === inv)!;
    expect(row).toMatchObject({ paid: 0, balance: before.balance, awaiting: 1000, state: "UNPAID" });
    await expect(svc.receiptPdf(exA, r.paymentId)).rejects.toThrow(/waiting for Accounts approval/);
    expect(await svc.receiptPdfByToken(r.shareToken)).toBeNull();
    // The waiting amount can't be recorded a second time.
    await expect(recordPayment(exA, inv, pay(before.balance))).rejects.toThrow(/more than/);
    // Only Accounts may decide.
    await expect(svc.approvePayment(exA, r.paymentId)).rejects.toThrow(/Only Accounts/);
    await expect(svc.approvePayment(head, r.paymentId)).rejects.toThrow(/Only Accounts/);
    expect((await svc.approvalQueue(admin)).waiting.map((w) => w.id)).toContain(r.paymentId);

    const ok = await svc.approvePayment(admin, r.paymentId);
    expect(ok.receiptNumber).toMatch(/^\d+\/\d\d-\d\d$/);
    expect((await invoiceRows(exA)).find((x) => x.id === inv)).toMatchObject({ paid: 1000, awaiting: 0, state: "PARTIAL" });
    const task = await db.task.findFirstOrThrow({ where: { paymentId: r.paymentId, assigneeId: exA.id, status: "OPEN" } });
    expect(task.title).toMatch(/^Send receipt /);
    expect((await svc.receiptPdf(exA, r.paymentId)).pdf.subarray(0, 4).toString()).toBe("%PDF");
    await svc.logReceiptShared(exA, r.paymentId);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("DONE");
    await expect(svc.approvePayment(admin, r.paymentId)).rejects.toThrow(/already approved/);
  });

  it("rejected: never counts, the recorder is told why and may delete their entry; Accounts' own entries count at once", async () => {
    const svc = await import("@/server/finance/service");
    await on();
    const admin = await makeUser("ADMIN");
    const inv = await invoice();
    const r = await recordPayment(exA, inv, pay(500, { reference: "UTR9" }));
    await expect(svc.rejectPayment(admin, r.paymentId, { reason: "" })).rejects.toThrow(/why/);
    await svc.rejectPayment(admin, r.paymentId, { reason: "UTR not found in bank" });
    const p = await db.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
    expect(p).toMatchObject({ approval: "REJECTED", rejectReason: "UTR not found in bank", number: null });
    expect((await invoiceRows(exA)).find((x) => x.id === inv)).toMatchObject({ paid: 0, awaiting: 0 });
    expect(await db.task.count({ where: { paymentId: r.paymentId, assigneeId: exA.id, title: { contains: "rejected by Accounts" } } })).toBe(1);
    await expect(deletePayment(exB, r.paymentId)).rejects.toThrow(/not found/);
    await deletePayment(exA, r.paymentId);
    // An Admin's own payment needs no approval.
    const own = await recordPayment(admin, inv, pay(300));
    expect(own.awaiting).toBe(false);
    expect(own.receiptNumber).toBeTruthy();
  });
});

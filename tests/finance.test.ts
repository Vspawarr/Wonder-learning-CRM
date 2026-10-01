import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, fromDbDate, todayIST } from "@/lib/dates";
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
  oppId = await convertLead(
    exA,
    await createLead(exA, leadData(exA.id, { schoolName: "Little Stars" })),
    { temperature: "WARM" },
  );
  await moveOpportunity(exA, oppId, { stage: "WON" });
  clientId = await convertToClient(exA, oppId);
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
    expect(
      invoiceState(
        { total: 1000, status: "ISSUED", dueDate: due },
        0,
        "2026-10-01",
      ).state,
    ).toBe("UNPAID");
    expect(
      invoiceState(
        { total: 1000, status: "ISSUED", dueDate: due },
        400,
        "2026-10-01",
      ),
    ).toMatchObject({ state: "PARTIAL", balance: 600 });
    expect(
      invoiceState(
        { total: 1000, status: "ISSUED", dueDate: due },
        400,
        "2026-10-13",
      ),
    ).toMatchObject({ state: "OVERDUE", daysOverdue: 3 });
    expect(
      invoiceState(
        { total: 1000, status: "ISSUED", dueDate: due },
        1000,
        "2026-12-01",
      ).state,
    ).toBe("PAID");
    expect(
      invoiceState({ total: 1000, status: "CANCELLED", dueDate: due }, 0).state,
    ).toBe("CANCELLED");
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
    expect((await orderableQuotations(exA, clientId)).map((q) => q.id)).toEqual(
      [q1],
    );
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
    expect(
      (await db.salesOrder.findUniqueOrThrow({ where: { id } })).quotationId,
    ).toBe(q2);
  });

  it("is limited to the client's owner and the sales head", async () => {
    await expect(createSalesOrder(exB, clientId, order())).rejects.toThrow(
      /not found/,
    );
    const id = await createSalesOrder(head, clientId, order());
    await expect(markDelivered(exB, id, today)).rejects.toThrow(/not found/);
    await markDelivered(exA, id, today);
    expect(
      (await db.salesOrder.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("DELIVERED");
  });

  it("is locked once invoiced", async () => {
    const id = await createSalesOrder(exA, clientId, order());
    await createInvoice(exA, id, await invoiceDefaults(exA, id));
    await expect(updateSalesOrder(exA, id, order())).rejects.toThrow(
      /invoiced/,
    );
    await expect(cancelSalesOrder(exA, id)).rejects.toThrow(/invoice first/);
    await expect(
      createInvoice(exA, id, await invoiceDefaults(exA, id)),
    ).rejects.toThrow(/already has an invoice/);
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
    await expect(recordPayment(exA, id, pay(200000))).rejects.toThrow(
      /more than/,
    );
    await expect(
      recordPayment(exA, id, pay(10, { mode: "Barter" })),
    ).rejects.toThrow(/how it was paid/);
    expect(
      await recordPayment(
        exA,
        id,
        pay("1,47,000", { mode: "NEFT/RTGS", reference: "UTR001234" }),
      ),
    ).toMatchObject({ state: "PAID", balance: 0 });
    expect(
      await db.task.count({ where: { invoiceId: id, status: "OPEN" } }),
    ).toBe(0);
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
    await deletePayment(
      head,
      (await db.payment.findFirstOrThrow({ where: { invoiceId: id } })).id,
    );
    await cancelInvoice(head, id);
    expect(
      await db.task.count({ where: { invoiceId: id, status: "OPEN" } }),
    ).toBe(0);
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
    await expect(
      emailInvoice(
        exA,
        id,
        { to: "school@example.com", message: "Hi" },
        "reminder",
      ),
    ).rejects.toThrow(/isn't set up/);
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
    expect(
      await db.task.count({ where: { invoiceId: id, status: "OPEN" } }),
    ).toBe(0);
  });
});

describe("payment receipts", () => {
  it("numbers each payment RCPT/YYYY/MM/NNN and renders a shareable receipt", async () => {
    const { receiptPdf, receiptPdfByToken, emailReceipt } =
      await import("@/server/finance/service");
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, {
      date: today,
      dueDate: addDays(today, 45),
    });
    const a = await recordPayment(exA, id, pay(50000));
    const b = await recordPayment(exA, id, pay(47000));
    expect([a.receiptNumber, b.receiptNumber]).toEqual([
      `RCPT/${Y}/${M}/001`,
      `RCPT/${Y}/${M}/002`,
    ]);
    const { pdf, number } = await receiptPdf(exA, b.paymentId);
    expect(number).toBe(b.receiptNumber);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    await expect(receiptPdf(exB, b.paymentId)).rejects.toThrow(/not found/);
    expect((await receiptPdfByToken(a.shareToken))?.number).toBe(
      a.receiptNumber,
    );
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
    expect(rupeesInWords(197000)).toBe(
      "Rupees One Lakh Ninety-Seven Thousand Only",
    );
    expect(rupeesInWords(12345678.5)).toBe(
      "Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Fifty Paise Only",
    );
    expect(rupeesInWords(1000)).toBe("Rupees One Thousand Only");
  });
});

describe("purchase orders", () => {
  it("PO number is saved on the order, can be set after invoicing, and prints on the invoice", async () => {
    const { setPurchaseOrder } = await import("@/server/finance/po");
    const so = await createSalesOrder(
      exA,
      clientId,
      order({ poNumber: "PO/LS/17", poDate: today }),
    );
    expect(
      (await db.salesOrder.findUniqueOrThrow({ where: { id: so } })).poNumber,
    ).toBe("PO/LS/17");
    const inv = await createInvoice(exA, so, {
      date: today,
      dueDate: addDays(today, 45),
    });
    await setPurchaseOrder(exA, so, { poNumber: "PO/LS/18", poDate: today });
    expect((await invoiceRows(exA))[0].salesOrder.poNumber).toBe("PO/LS/18");
    await expect(setPurchaseOrder(exB, so, { poNumber: "X" })).rejects.toThrow(
      /not found/,
    );
    await expect(setPurchaseOrder(exA, so, { poNumber: "" })).rejects.toThrow(
      /PO number/,
    );
    expect((await invoicePdf(exA, inv)).pdf.subarray(0, 4).toString()).toBe(
      "%PDF",
    );
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

  it("makes a PO template from a sent quotation, kits optional", async () => {
    const { parseKits, poTemplatePdf, poTemplatePdfByToken } =
      await import("@/server/finance/po");
    const q = await createQuotation(
      exA,
      { clientId },
      {
        date: today,
        validityDays: 3,
        toLine: "The Director",
        schoolName: "Little Stars",
        items: [
          { description: "PG Academic Kit", mrp: 3700, price: 2800 },
          { description: "NUR Academic Kit", mrp: 4800, price: 3400 },
        ],
      },
    );
    await expect(poTemplatePdf(exA, q, [])).rejects.toThrow(
      /Send the quotation first/,
    );
    await markQuotationSent(exA, q, "download");
    expect(parseKits("40, ,x,25")).toEqual([40, null, null, 25]);
    const { pdf } = await poTemplatePdf(exA, q, parseKits("40,25"));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const { shareToken } = await db.quotation.findUniqueOrThrow({
      where: { id: q },
    });
    expect((await poTemplatePdfByToken(shareToken, []))?.schoolName).toBe(
      "Little Stars",
    );
  });
});

describe("payment promise date", () => {
  it("moves the collection follow-up to the promised date on a part payment", async () => {
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
    await expect(recordPayment(exA, id, pay(1000, { promiseDate: addDays(today, -1) }))).rejects.toThrow(/past/);
    await recordPayment(exA, id, pay(50000, { promiseDate: addDays(today, 10) }));
    const t = await db.task.findFirstOrThrow({ where: { invoiceId: id, status: "OPEN" } });
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
    const id = await createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
    const [row] = await invoiceRows(exA);
    expect(row).toMatchObject({ id, paid: 78800, balance: 118200, state: "PARTIAL" });
    const task = await db.task.findFirstOrThrow({ where: { invoiceId: id, status: "OPEN" } });
    expect(task.title).toMatch(/^Collect ₹1,18,200/);
    await expect(recordAdvance(exA, so, pay(1000))).rejects.toThrow(/invoiced/);
  });
});

describe("cheques", () => {
  it("count as received only when cleared; bounced makes the amount due again", async () => {
    const { setChequeStatus, receiptPdf } = await import("@/server/finance/service");
    const so = await createSalesOrder(exA, clientId, order());
    const id = await createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
    const r = await recordPayment(exA, id, pay(100000, { mode: "PDC (Post Dated Cheque)", reference: "000111", bank: "HDFC", chequeDate: addDays(today, 20) }));
    let [row] = await invoiceRows(exA);
    expect(row).toMatchObject({ paid: 0, pending: 100000, balance: 197000 });
    const deposit = await db.task.findFirstOrThrow({ where: { paymentId: r.paymentId } });
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
    expect(await db.task.findFirst({ where: { invoiceId: id, status: "OPEN", priority: "CRITICAL" } })).not.toBeNull();
  });

  it("with cheque tracking switched off, cheques count straight away", async () => {
    const { setFeature } = await import("@/server/features");
    const admin = await makeUser("ADMIN");
    await setFeature(admin, "cheques", false);
    try {
      const so = await createSalesOrder(exA, clientId, order());
      const id = await createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
      await recordPayment(exA, id, pay(1000, { mode: "Cheque", reference: "1" }));
      expect((await invoiceRows(exA))[0]).toMatchObject({ paid: 1000, pending: 0 });
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
    const id = await createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
    await expect(createCreditNote(exA, id, { date: today, amount: 1000, reason: "Discount" })).rejects.toThrow(/Admin or the Sales Head/);
    await expect(createCreditNote(head, id, { date: today, amount: 999999, reason: "Too much" })).rejects.toThrow(/can't be more/);
    const cn = await createCreditNote(head, id, { date: today, amount: 17000, reason: "5 NUR kits returned" });
    expect((await invoiceRows(exA))[0]).toMatchObject({ credited: 17000, balance: 180000 });
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
    const items = await db.salesOrderItem.findMany({ where: { salesOrderId: so }, orderBy: { sortOrder: "asc" } });
    const lot = (a: number, b: number) => ({ date: today, transporter: "VRL", docketNo: "D1", lines: [{ itemId: items[0].id, qty: a }, { itemId: items[1].id, qty: b }] });
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
    await expect(saveClientFile(exA, clientId, { category: "Secret", title: "", name: "a.pdf", type: "application/pdf", bytes })).rejects.toThrow(/kind of document/);
    await expect(saveClientFile(exB, clientId, { category: "Agreement / MOU", title: "", name: "a.pdf", type: "application/pdf", bytes })).rejects.toThrow(/not found/);
    await saveClientFile(exA, clientId, { category: "Agreement / MOU", title: "Agreement 2026-27", name: "a.pdf", type: "application/pdf", bytes });
    const f = await db.clientFile.findFirstOrThrow({ where: { clientId } });
    expect((await clientFile(exA, f.id)).title).toBe("Agreement 2026-27");
    await deleteClientFile(exA, f.id);
    expect(await db.clientFile.count({ where: { clientId } })).toBe(0);
  });

  it("keeps extra contacts; one gets payment messages", async () => {
    const { saveContact, deleteContact } = await import("@/server/contacts");
    await expect(saveContact(exA, clientId, null, { name: "Ravi", role: "Accounts" })).rejects.toThrow(/mobile number or an email/);
    await saveContact(exA, clientId, null, { name: "Ravi", role: "Accounts", mobile: "98989 89898", forPayments: true });
    await saveContact(exA, clientId, null, { name: "Meera", role: "Principal", email: "p@school.in", forPayments: true });
    const ks = await db.clientContact.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
    expect(ks.map((k) => k.forPayments)).toEqual([false, true]);
    const so = await createSalesOrder(exA, clientId, order());
    await createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
    expect((await invoiceRows(exA))[0].client.payContact).toMatchObject({ name: "Meera", email: "p@school.in" });
    await deleteContact(exA, ks[0].id);
    expect(await db.clientContact.count({ where: { clientId } })).toBe(1);
  });
});

// R53: overall outstanding by school (finance dashboard pie) and material problems after dispatch.
import { beforeEach, describe, expect, it } from "vitest";
import { outstandingByClient, type InvoiceRow } from "@/server/finance/service";
import { db } from "@/lib/db";
import { addDays, todayIST } from "@/lib/dates";
import { convertToClient } from "@/server/clients";
import { convertLead, createLead } from "@/server/leads";
import { moveOpportunity } from "@/server/opportunities";
import { createDispatch, deleteDispatch } from "@/server/finance/dispatch";
import { closeIssue, refundIssue, reportIssue, sendReplacement } from "@/server/finance/material";
import { createInvoice, createSalesOrder, deleteCreditNote } from "@/server/finance/service";
import { leadData, makeUser, resetData } from "./helpers";

const row = (id: string, balance: number, state = "UNPAID") =>
  ({ client: { id, schoolName: `School ${id}` }, balance, state }) as unknown as InvoiceRow;

describe("outstanding by school", () => {
  it("adds up each school's open invoices, biggest first, with % shares", () => {
    const r = outstandingByClient([row("a", 300), row("b", 500), row("a", 200), row("c", 0, "PAID"), row("d", 900, "CANCELLED")]);
    expect(r.total).toBe(1000);
    expect(r.schools).toBe(2);
    expect(r.slices.map((s) => [s.name, s.amount, s.pct])).toEqual([
      ["School a", 500, 50],
      ["School b", 500, 50],
    ]);
  });

  it("groups the smaller schools as Others", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(String(i), (10 - i) * 100));
    const r = outstandingByClient(rows, 3);
    expect(r.slices).toHaveLength(4);
    expect(r.slices[3]).toMatchObject({ id: null, name: "Others (7 schools)", amount: 2800, clients: 7 });
    expect(r.slices.reduce((t, s) => t + s.pct, 0)).toBeCloseTo(100, 0);
  });
});

// R53: material problems after dispatch, settled by replacement or refund.

describe("material problems", () => {
  const today = todayIST();
  let ex: Awaited<ReturnType<typeof makeUser>>;
  let head: Awaited<ReturnType<typeof makeUser>>;
  let soId: string;
  let itemId: string;
  beforeEach(async () => {
    await resetData();
    await db.appSetting.upsert({ where: { key: "features" }, create: { key: "features", value: { paymentApproval: false } }, update: { value: { paymentApproval: false } } });
    ex = await makeUser("SALES_EXECUTIVE");
    head = await makeUser("SALES_HEAD");
    const opp = await convertLead(ex, await createLead(ex, leadData(ex.id)), { temperature: "WARM" });
    await moveOpportunity(ex, opp, { stage: "WON" });
    const clientId = await convertToClient(ex, opp);
    soId = await createSalesOrder(ex, clientId, { date: today, items: [{ description: "LKG Kit", qty: 10, price: 3000, gstRate: 0 }] });
    itemId = (await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: soId } })).id;
  });

  it("a replacement goes on its own challan and doesn't use up the order's kits", async () => {
    const dc = await createDispatch(ex, soId, { date: today, lines: [{ itemId, qty: 10 }] });
    const id = await reportIssue(ex, soId, { kind: "SHORT", itemId, qty: 3, detail: "Bags missing", date: today, dispatchId: dc });
    const rep = await sendReplacement(ex, id, { date: today });
    const r = await db.dispatch.findUniqueOrThrow({ where: { id: rep }, include: { items: true } });
    expect(r.isReplacement).toBe(true);
    expect(r.items[0]).toMatchObject({ qty: 3, note: "replacement: Bags missing" });
    expect((await db.materialIssue.findUniqueOrThrow({ where: { id } })).status).toBe("REPLACED");
    // The order was fully dispatched before; still is, and no more normal kits can go.
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: soId } })).status).toBe("DELIVERED");
    await expect(createDispatch(ex, soId, { date: today, lines: [{ itemId, qty: 1 }] })).rejects.toThrow(/Only 0 kit/);
    // Deleting the replacement challan opens the problem again.
    await deleteDispatch(ex, rep);
    expect((await db.materialIssue.findUniqueOrThrow({ where: { id } })).status).toBe("OPEN");
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: soId } })).status).toBe("DELIVERED");
  });

  it("a refund lowers the invoice with a credit note (Admin / Sales Head only); deleting it reopens the problem", async () => {
    await createDispatch(ex, soId, { date: today, lines: [{ itemId, qty: 10 }] });
    await createInvoice(ex, soId, { date: today, dueDate: addDays(today, 30) });
    const id = await reportIssue(ex, soId, { kind: "RETURNED", itemId, qty: 2, date: today });
    await expect(refundIssue(ex, id, { amount: 6000, date: today, how: "credit" })).rejects.toThrow(/Admin or the Sales Head/);
    await refundIssue(head, id, { amount: 6000, date: today, how: "credit" });
    const m = await db.materialIssue.findUniqueOrThrow({ where: { id }, include: { creditNote: true } });
    expect(m.status).toBe("REFUNDED");
    expect(Number(m.creditNote!.amount)).toBe(6000);
    await deleteCreditNote(head, m.creditNoteId!);
    expect((await db.materialIssue.findUniqueOrThrow({ where: { id } })).status).toBe("OPEN");
    // Money paid back instead (no credit note), then nothing more can be done to it.
    await refundIssue(head, id, { amount: 6000, date: today, how: "paid", note: "NEFT" });
    await expect(closeIssue(ex, id, "done")).rejects.toThrow(/already settled/);
  });

  it("checks the line and the number of kits, and closes with a note", async () => {
    await expect(reportIssue(ex, soId, { kind: "DAMAGED", itemId, qty: 11, date: today })).rejects.toThrow(/only 10 kit/);
    const id = await reportIssue(ex, soId, { kind: "DAMAGED", itemId, qty: 1, date: today });
    await expect(closeIssue(ex, id, "")).rejects.toThrow(/why/);
    await closeIssue(ex, id, "School kept it");
    expect((await db.materialIssue.findUniqueOrThrow({ where: { id } })).status).toBe("CLOSED");
  });
});

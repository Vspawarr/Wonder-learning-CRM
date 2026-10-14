import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, todayIST } from "@/lib/dates";
import { convertLead, createLead } from "@/server/leads";
import { moveOpportunity } from "@/server/opportunities";
import { convertToClient, removeClient } from "@/server/clients";
import { createQuotation } from "@/server/quotation/service";
import { createSalesOrder } from "@/server/finance/service";
import { cancelTransfer, decideTransfer, pendingTransferFor, requestTransfer, transferList } from "@/server/transfers";
import { leadData, makeUser, resetData } from "./helpers";

beforeEach(async () => {
  await resetData();
  await db.appSetting.deleteMany({ where: { key: "features" } });
});

describe("lead / client transfers (R43)", () => {
  it("a salesperson asks, the Sales Head approves; the lead, its deal and to-dos move", async () => {
    const head = await makeUser("SALES_HEAD");
    const exA = await makeUser("SALES_EXECUTIVE");
    const exB = await makeUser("SALES_EXECUTIVE");
    const leadId = await createLead(exA, leadData(exA.id, { schoolName: "Moving School" }));
    const oppId = await convertLead(exA, leadId, { temperature: "WARM" });

    await expect(requestTransfer(exA, { kind: "lead", id: leadId, toUserId: exB.id })).rejects.toThrow(/why/);
    await expect(requestTransfer(exA, { kind: "lead", id: leadId, toUserId: exA.id, reason: "x x x" })).rejects.toThrow(/already with/);
    await expect(requestTransfer(exB, { kind: "lead", id: leadId, toUserId: exB.id, reason: "mine now" })).rejects.toThrow(/not found/i);
    const r = await requestTransfer(exA, { kind: "lead", id: leadId, toUserId: exB.id, reason: "Rohan's area" });
    expect(r.moved).toBe(false);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).assignedToId).toBe(exA.id); // not yet
    await expect(requestTransfer(exA, { kind: "lead", id: leadId, toUserId: exB.id, reason: "again" })).rejects.toThrow(/already waiting/);

    const pending = (await pendingTransferFor("lead", leadId))!;
    expect((await transferList(head)).waiting).toHaveLength(1);
    expect((await transferList(exB)).waiting).toHaveLength(0); // only the approver and the asker see it
    await expect(decideTransfer(exA, pending.id, { approve: true })).rejects.toThrow(/Sales Head or Admin/);
    await decideTransfer(head, pending.id, { approve: true });

    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).assignedToId).toBe(exB.id);
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).ownerId).toBe(exB.id);
    const open = await db.task.findMany({ where: { OR: [{ leadId }, { opportunityId: oppId }], status: "OPEN" } });
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((t) => t.assigneeId === exB.id)).toBe(true);
    expect(open.some((t) => t.title.startsWith("Taken over: Moving School"))).toBe(true);
  });

  it("rejection keeps the owner and tells the asker; the Sales Head's own transfer moves at once; asks can be withdrawn", async () => {
    const head = await makeUser("SALES_HEAD");
    const exA = await makeUser("SALES_EXECUTIVE");
    const exB = await makeUser("SALES_EXECUTIVE");
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id, { schoolName: "Client School" })), { temperature: "HOT" });
    const clientId = await convertToClient(exA, oppId);

    await requestTransfer(exA, { kind: "client", id: clientId, toUserId: exB.id, reason: "I'm moving city" });
    const t = (await pendingTransferFor("client", clientId))!;
    await expect(decideTransfer(head, t.id, { approve: false })).rejects.toThrow(/why/);
    await decideTransfer(head, t.id, { approve: false, reason: "Keep it till March" });
    expect((await db.client.findUniqueOrThrow({ where: { id: clientId } })).ownerId).toBe(exA.id);
    expect(await db.task.count({ where: { assigneeId: exA.id, title: { contains: "rejected: Keep it till March" } } })).toBe(1);

    await requestTransfer(exA, { kind: "client", id: clientId, toUserId: exB.id, reason: "Asking again" });
    await cancelTransfer(exA, (await pendingTransferFor("client", clientId))!.id);
    expect(await pendingTransferFor("client", clientId)).toBeNull();

    const r = await requestTransfer(head, { kind: "client", id: clientId, toUserId: exB.id });
    expect(r.moved).toBe(true);
    expect((await db.client.findUniqueOrThrow({ where: { id: clientId } })).ownerId).toBe(exB.id);
    expect(await db.task.count({ where: { clientId, status: "OPEN", assigneeId: exA.id } })).toBe(0);
  });
});

describe("remove a client converted by mistake (R43)", () => {
  it("Admin only; reopens the deal, keeps the lead and quotations; refused once there are orders", async () => {
    const admin = await makeUser("ADMIN");
    const exA = await makeUser("SALES_EXECUTIVE");
    const leadId = await createLead(exA, leadData(exA.id, { schoolName: "Oops School" }));
    const oppId = await convertLead(exA, leadId, { temperature: "WARM" });
    await moveOpportunity(exA, oppId, { stage: "NEGOTIATION" });
    const clientId = await convertToClient(exA, oppId);
    const q = await createQuotation(exA, { clientId }, { date: todayIST(), validUntil: addDays(todayIST(), 30) }).catch(() => null);

    await expect(removeClient(exA, clientId, "mistake")).rejects.toThrow(/Admin or the Director/);
    await expect(removeClient(admin, clientId, "")).rejects.toThrow(/why/);
    await removeClient(admin, clientId, "Converted by mistake");

    expect(await db.client.count({ where: { id: clientId } })).toBe(0);
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: oppId } });
    expect(opp).toMatchObject({ stage: "NEGOTIATION", closedAt: null });
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("CONVERTED");
    if (q) expect((await db.quotation.findFirstOrThrow({ where: { opportunityId: oppId } })).clientId).toBeNull();
    expect(await db.activity.count({ where: { opportunityId: oppId, subject: { contains: "removed" } } })).toBe(1);

    // Converted again, with a sales order: can't be removed any more.
    const again = await convertToClient(exA, oppId);
    await createSalesOrder(exA, again, { date: todayIST(), items: [{ description: "Kit", qty: 1, price: 1000, gstRate: 0 }] });
    await expect(removeClient(admin, again, "mistake again")).rejects.toThrow(/sales order/);
  });
});

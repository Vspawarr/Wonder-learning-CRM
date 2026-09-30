import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, fromDbDate, todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { logActivity } from "@/server/activities";
import { convertLead, createLead, disqualifyLead, updateLead } from "@/server/leads";
import { moveOpportunity, updateOpportunity } from "@/server/opportunities";
import { completeTask, createTask } from "@/server/tasks";
import { createUser, updateUser } from "@/server/settings";
import { leadData, makeProduct, makeUser, resetData } from "./helpers";

let head: SessionUser, mgr: SessionUser, exA: SessionUser, exB: SessionUser, admin: SessionUser;
const today = todayIST();

beforeEach(async () => {
  await resetData();
  head = await makeUser("SALES_HEAD");
  mgr = await makeUser("SALES_MANAGER");
  exA = await makeUser("SALES_EXECUTIVE");
  exB = await makeUser("SALES_EXECUTIVE");
  admin = await makeUser("ADMIN");
});

describe("creating a lead", () => {
  it("creates the lead, its interests and an auto follow-up task", async () => {
    const p = await makeProduct("Teacher Training");
    const id = await createLead(exA, leadData(exA.id, {
      interests: [p.id],
      nextFollowUpDate: addDays(today, 3),
      followUpType: "WhatsApp",
      followUpRemark: "Send brochure",
      source: "Reference",
      referenceName: "Mrs Rao",
    }));
    const lead = await db.lead.findUniqueOrThrow({ where: { id }, include: { interests: true, tasks: true } });
    expect(lead.number).toBeGreaterThan(0);
    expect(lead.interests.map((i) => i.productId)).toEqual([p.id]);
    expect(lead.referenceName).toBe("Mrs Rao");
    expect(lead.tasks).toHaveLength(1);
    expect(lead.tasks[0]).toMatchObject({ type: "WhatsApp", title: "Send brochure", priority: "HIGH", isAuto: true, assigneeId: exA.id });
    expect(fromDbDate(lead.tasks[0].dueDate)).toBe(addDays(today, 3));
  });

  it("drops the reference name for other sources", async () => {
    const id = await createLead(exA, leadData(exA.id, { referenceName: "Someone" }));
    expect((await db.lead.findUniqueOrThrow({ where: { id } })).referenceName).toBeNull();
  });

  it("uses Call and a default title when no follow-up type is given", async () => {
    const id = await createLead(head, leadData(exA.id, { schoolName: "Sunrise" }));
    const t = await db.task.findFirstOrThrow({ where: { leadId: id } });
    expect(t).toMatchObject({ type: "Call", title: "First call: Sunrise", assigneeId: exA.id });
  });

  it("stops an executive assigning to someone else", async () => {
    await expect(createLead(exA, leadData(exB.id))).rejects.toThrow(/yourself/);
  });

  it("only assigns to the sales team", async () => {
    await expect(createLead(head, leadData(admin.id))).rejects.toThrow(/sales team/);
  });
});

describe("access control", () => {
  it("an executive cannot read or change another executive's lead", async () => {
    const id = await createLead(head, leadData(exB.id));
    await expect(updateLead(exA, id, leadData(exA.id))).rejects.toThrow(/not found/);
    await expect(disqualifyLead(exA, id, { reason: "No Budget" })).rejects.toThrow(/not found/);
    await expect(convertLead(exA, id)).rejects.toThrow(/not found/);
    await expect(logActivity(exA, { leadId: id, type: "PHONE", summary: "hi" })).rejects.toThrow(/not found/);
    await expect(createTask(exA, { title: "x", type: "Call", dueDate: today, assigneeId: exA.id, leadId: id })).rejects.toThrow(/not found/);
  });

  it("an executive cannot move, edit or complete tasks on another's opportunity", async () => {
    const lead = await createLead(head, leadData(exB.id));
    const oppId = await convertLead(head, lead);
    await expect(moveOpportunity(exA, oppId, { stage: "DEMO_SCHEDULED" })).rejects.toThrow(/not found/);
    await expect(updateOpportunity(exA, oppId, { ownerId: exA.id, items: [] })).rejects.toThrow(/not found/);
    const task = await db.task.findFirstOrThrow({ where: { opportunityId: oppId } });
    await expect(completeTask(exA, task.id, {})).rejects.toThrow(/not found/);
    await expect(completeTask(exB, task.id, {})).resolves.toBeUndefined();
  });

  it("the sales head and admin can work on anyone's leads", async () => {
    const id = await createLead(exA, leadData(exA.id));
    await expect(updateLead(head, id, leadData(exB.id, { status: "CONTACTED" }))).resolves.toBeUndefined();
    await expect(disqualifyLead(admin, id, { reason: "Postponed" })).resolves.toBeUndefined();
  });

  it("a sales manager sees only their own leads and opportunities", async () => {
    const other = await createLead(head, leadData(exA.id));
    await expect(updateLead(mgr, other, leadData(mgr.id))).rejects.toThrow(/not found/);
    await expect(convertLead(mgr, other)).rejects.toThrow(/not found/);
    await expect(createLead(mgr, leadData(exA.id))).rejects.toThrow(/yourself/);
    const own = await createLead(mgr, leadData(mgr.id));
    const oppId = await convertLead(mgr, own);
    await expect(moveOpportunity(mgr, oppId, { stage: "DEMO_SCHEDULED" })).resolves.toBeUndefined();
    await expect(moveOpportunity(exA, oppId, { stage: "PROPOSAL_SENT" })).rejects.toThrow(/not found/);
  });
});

describe("updating a lead", () => {
  it("reassigning moves open tasks and keeps the follow-up task in step", async () => {
    const id = await createLead(head, leadData(exA.id));
    await updateLead(head, id, leadData(exB.id, { nextFollowUpDate: addDays(today, 7), followUpType: "Meeting" }));
    const tasks = await db.task.findMany({ where: { leadId: id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigneeId: exB.id, type: "Meeting" });
    expect(fromDbDate(tasks[0].dueDate)).toBe(addDays(today, 7));
    expect(await db.activity.count({ where: { leadId: id, subject: { contains: "Reassigned" } } })).toBe(1);
  });
});

describe("disqualifying", () => {
  it("needs a valid reason and cancels open tasks", async () => {
    const id = await createLead(exA, leadData(exA.id));
    await expect(disqualifyLead(exA, id, { reason: "" })).rejects.toThrow(/reason/);
    await disqualifyLead(exA, id, { reason: "Competitor", remarks: "Chose Kidzee" });
    const lead = await db.lead.findUniqueOrThrow({ where: { id }, include: { tasks: true } });
    expect(lead).toMatchObject({ status: "DISQUALIFIED", disqualifyReason: "Competitor", nextFollowUpDate: null });
    expect(lead.tasks.every((t) => t.status === "CANCELLED")).toBe(true);
    await expect(updateLead(exA, id, leadData(exA.id))).rejects.toThrow(/no longer be edited/);
    await expect(convertLead(exA, id)).rejects.toThrow(/active/);
  });
});

describe("converting and the pipeline", () => {
  it("creates an Interested opportunity with the lead's items and a demo task", async () => {
    const priced = await makeProduct("Curriculum License", 60000);
    const unpriced = await makeProduct("School Audit");
    const leadId = await createLead(exA, leadData(exA.id, { interests: [priced.id, unpriced.id] }));
    const oppId = await convertLead(exA, leadId);
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: oppId }, include: { items: true, tasks: true, stageChanges: true } });
    expect(opp).toMatchObject({ stage: "INTERESTED", probability: 20, ownerId: exA.id, leadId });
    expect(opp.items.map((i) => (i.unitPrice === null ? null : Number(i.unitPrice))).sort()).toEqual([60000, null]);
    expect(opp.tasks.some((t) => t.type === "Demo" && t.isAuto)).toBe(true);
    expect(opp.stageChanges).toHaveLength(1);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe("CONVERTED");
    await expect(convertLead(exA, leadId)).rejects.toThrow();
  });

  it("moves through stages, sets probability and adds follow-up tasks", async () => {
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id)));
    await moveOpportunity(exA, oppId, { stage: "DEMO_SCHEDULED" });
    await moveOpportunity(exA, oppId, { stage: "PROPOSAL_SENT" });
    await moveOpportunity(exA, oppId, { stage: "NEGOTIATION" });
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: oppId }, include: { tasks: true, stageChanges: true } });
    expect(opp.probability).toBe(75);
    expect(opp.stageChanges).toHaveLength(4);
    expect(opp.tasks.filter((t) => t.title.startsWith("Follow up after"))).toHaveLength(2);
  });

  it("lost requires a reason, closes the deal and cancels its tasks", async () => {
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id)));
    await expect(moveOpportunity(exA, oppId, { stage: "LOST", lostReason: "Price Issue" })).rejects.toThrow(/Remarks/);
    await moveOpportunity(exA, oppId, { stage: "LOST", lostReason: "Price Issue", lostRemarks: "Too costly", competitor: "EuroKids" });
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: oppId }, include: { tasks: true } });
    expect(opp).toMatchObject({ stage: "LOST", probability: 0, lostReason: "Price Issue", competitor: "EuroKids" });
    expect(opp.closedAt).not.toBeNull();
    expect(opp.tasks.every((t) => t.status === "CANCELLED")).toBe(true);
    await expect(moveOpportunity(exA, oppId, { stage: "NEGOTIATION" })).rejects.toThrow(/Closed deals/);
  });

  it("won simply closes the deal at 100%", async () => {
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id)));
    await moveOpportunity(exA, oppId, { stage: "WON" });
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: oppId } });
    expect(opp).toMatchObject({ stage: "WON", probability: 100 });
    await expect(updateOpportunity(exA, oppId, { ownerId: exA.id, items: [] })).rejects.toThrow(/Closed/);
  });

  it("editing items keeps existing prices and snapshots new ones", async () => {
    const a = await makeProduct("A", 1000);
    const b = await makeProduct("B", 500);
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id, { interests: [a.id] })));
    await db.product.update({ where: { id: a.id }, data: { price: 9999 } });
    await updateOpportunity(exA, oppId, { ownerId: exA.id, items: [{ productId: a.id, qty: 2 }, { productId: b.id, qty: 3 }] });
    const items = await db.opportunityItem.findMany({ where: { opportunityId: oppId } });
    const byP = Object.fromEntries(items.map((i) => [i.productId, i]));
    expect(Number(byP[a.id].unitPrice)).toBe(1000);
    expect(byP[a.id].qty).toBe(2);
    expect(Number(byP[b.id].unitPrice)).toBe(500);
  });
});

describe("tasks and activity", () => {
  it("completing a task logs it and books the next follow-up", async () => {
    const id = await createLead(exA, leadData(exA.id));
    const t = await db.task.findFirstOrThrow({ where: { leadId: id } });
    await completeTask(exA, t.id, { outcome: "Spoke to owner", nextDate: addDays(today, 5) });
    const lead = await db.lead.findUniqueOrThrow({ where: { id }, include: { tasks: true, activities: true } });
    expect(lead.status).toBe("CONTACTED");
    expect(fromDbDate(lead.nextFollowUpDate!)).toBe(addDays(today, 5));
    expect(lead.tasks.filter((x) => x.status === "OPEN")).toHaveLength(1);
    expect(lead.activities.some((a) => a.type === "PHONE" && a.summary === "Spoke to owner")).toBe(true);
    await expect(completeTask(exA, t.id, {})).rejects.toThrow(/already closed/);
  });

  it("logging an interaction with a date creates a task", async () => {
    const id = await createLead(exA, leadData(exA.id));
    await logActivity(exA, { leadId: id, type: "SITE_VISIT", summary: "Visited", nextAction: "Send proposal", followUpDate: addDays(today, 4) });
    const t = await db.task.findFirstOrThrow({ where: { leadId: id, title: "Send proposal" } });
    expect(t.type).toBe("School Visit");
    const lead = await db.lead.findUniqueOrThrow({ where: { id } });
    expect(fromDbDate(lead.nextFollowUpDate!)).toBe(addDays(today, 4));
  });

  it("an executive can only create tasks for themselves", async () => {
    await expect(createTask(exA, { title: "x", type: "Call", dueDate: today, assigneeId: exB.id })).rejects.toThrow(/yourself/);
    await expect(createTask(head, { title: "x", type: "Call", dueDate: today, assigneeId: exB.id })).resolves.toBeTruthy();
    await expect(createTask(mgr, { title: "x", type: "Call", dueDate: today, assigneeId: exB.id })).rejects.toThrow(/yourself/);
  });
});

describe("user management", () => {
  it("admins add users; others cannot", async () => {
    const data = { name: "New Exec", email: "NEW@x.in", role: "SALES_EXECUTIVE", password: "abcd1234" };
    await expect(createUser(mgr, data)).rejects.toThrow(/Director or Admin/);
    const id = await createUser(admin, data);
    expect((await db.user.findUniqueOrThrow({ where: { id } })).email).toBe("new@x.in");
    await expect(createUser(admin, data)).rejects.toThrow(/already exists/);
  });
  it("an admin cannot create a director or lock themselves out", async () => {
    await expect(createUser(admin, { name: "D", email: "d@x.in", role: "DIRECTOR", password: "abcd1234" })).rejects.toThrow(/Director/);
    await expect(updateUser(admin, admin.id, { name: admin.name, email: admin.email, role: "ADMIN", active: false })).rejects.toThrow(/yourself/);
  });
});

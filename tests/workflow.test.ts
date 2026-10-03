import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, fromDbDate, todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { logActivity } from "@/server/activities";
import { convertLead, createLead, disqualifyLead, updateLead } from "@/server/leads";
import { moveOpportunity, updateOpportunity } from "@/server/opportunities";
import { cancelTask, completeTask, createTask, postponeTask } from "@/server/tasks";
import { pipelineCards, taskList } from "@/server/queries";
import { createUser, saveProduct, updateUser } from "@/server/settings";
import { completeOnboarding, convertToClient } from "@/server/clients";
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
      followUpType: "WhatsApp/Message",
      followUpRemark: "Send brochure",
      source: "Reference",
      referenceName: "Mrs Rao",
    }));
    const lead = await db.lead.findUniqueOrThrow({ where: { id }, include: { interests: true, tasks: true } });
    expect(lead.number).toBeGreaterThan(0);
    expect(lead.interests.map((i) => i.productId)).toEqual([p.id]);
    expect(lead.referenceName).toBe("Mrs Rao");
    expect(lead.tasks).toHaveLength(1);
    expect(lead.tasks[0]).toMatchObject({ type: "WhatsApp/Message", title: "Send brochure", priority: "HIGH", isAuto: true, assigneeId: exA.id });
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
    await expect(convertLead(exA, id, { temperature: "WARM" })).rejects.toThrow(/not found/);
    await expect(logActivity(exA, { leadId: id, type: "PHONE", summary: "hi" })).rejects.toThrow(/not found/);
    await expect(createTask(exA, { title: "x", type: "Call", dueDate: today, assigneeId: exA.id, leadId: id })).rejects.toThrow(/not found/);
  });

  it("an executive cannot move, edit or complete tasks on another's opportunity", async () => {
    const lead = await createLead(head, leadData(exB.id));
    const oppId = await convertLead(head, lead, { temperature: "WARM" });
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
    await expect(convertLead(mgr, other, { temperature: "WARM" })).rejects.toThrow(/not found/);
    await expect(createLead(mgr, leadData(exA.id))).rejects.toThrow(/yourself/);
    const own = await createLead(mgr, leadData(mgr.id));
    const oppId = await convertLead(mgr, own, { temperature: "WARM" });
    await expect(moveOpportunity(mgr, oppId, { stage: "DEMO_SCHEDULED" })).resolves.toBeUndefined();
    await expect(moveOpportunity(exA, oppId, { stage: "PROPOSAL_SENT" })).rejects.toThrow(/not found/);
  });
});

describe("updating a lead", () => {
  it("reassigning moves open tasks and keeps the follow-up task in step", async () => {
    const id = await createLead(head, leadData(exA.id));
    await updateLead(head, id, leadData(exB.id, { nextFollowUpDate: addDays(today, 7), followUpType: "School Visit" }));
    const tasks = await db.task.findMany({ where: { leadId: id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigneeId: exB.id, type: "School Visit" });
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
    await expect(convertLead(exA, id, { temperature: "WARM" })).rejects.toThrow(/active/);
  });
});

describe("converting and the pipeline", () => {
  it("creates an Interested opportunity with the lead's items and a demo task", async () => {
    const priced = await makeProduct("Curriculum License", 60000);
    const unpriced = await makeProduct("School Audit");
    const leadId = await createLead(exA, leadData(exA.id, { interests: [priced.id, unpriced.id] }));
    const oppId = await convertLead(exA, leadId, { temperature: "WARM" });
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: oppId }, include: { items: true, tasks: true, stageChanges: true } });
    expect(opp).toMatchObject({ stage: "INTERESTED", probability: 20, ownerId: exA.id, leadId });
    expect(opp.items.map((i) => (i.unitPrice === null ? null : Number(i.unitPrice))).sort()).toEqual([60000, null]);
    expect(opp.tasks.some((t) => t.type === "Online Demo" && t.isAuto)).toBe(true);
    expect(opp.stageChanges).toHaveLength(1);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe("CONVERTED");
    await expect(convertLead(exA, leadId, { temperature: "WARM" })).rejects.toThrow();
  });

  it("moves through stages, sets probability and adds follow-up tasks", async () => {
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id)), { temperature: "WARM" });
    await moveOpportunity(exA, oppId, { stage: "DEMO_SCHEDULED" });
    await moveOpportunity(exA, oppId, { stage: "PROPOSAL_SENT" });
    await moveOpportunity(exA, oppId, { stage: "NEGOTIATION" });
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: oppId }, include: { tasks: true, stageChanges: true } });
    expect(opp.probability).toBe(75);
    expect(opp.stageChanges).toHaveLength(4);
    expect(opp.tasks.filter((t) => t.title.startsWith("Follow up after"))).toHaveLength(2);
  });

  it("lost requires a reason, closes the deal and cancels its tasks", async () => {
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id)), { temperature: "WARM" });
    await expect(moveOpportunity(exA, oppId, { stage: "LOST", lostReason: "Price Issue" })).rejects.toThrow(/Remarks/);
    await moveOpportunity(exA, oppId, { stage: "LOST", lostReason: "Price Issue", lostRemarks: "Too costly", competitor: "EuroKids" });
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: oppId }, include: { tasks: true } });
    expect(opp).toMatchObject({ stage: "LOST", probability: 0, lostReason: "Price Issue", competitor: "EuroKids" });
    expect(opp.closedAt).not.toBeNull();
    expect(opp.tasks.every((t) => t.status === "CANCELLED")).toBe(true);
    await expect(moveOpportunity(exA, oppId, { stage: "NEGOTIATION" })).rejects.toThrow(/Closed deals/);
  });

  it("won simply closes the deal at 100%", async () => {
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id)), { temperature: "WARM" });
    await moveOpportunity(exA, oppId, { stage: "WON" });
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id: oppId } });
    expect(opp).toMatchObject({ stage: "WON", probability: 100 });
    await expect(updateOpportunity(exA, oppId, { ownerId: exA.id, items: [] })).rejects.toThrow(/Closed/);
  });

  it("editing items keeps existing prices and snapshots new ones", async () => {
    const a = await makeProduct("A", 1000);
    const b = await makeProduct("B", 500);
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id, { interests: [a.id] })), { temperature: "WARM" });
    await db.product.update({ where: { id: a.id }, data: { price: 9999 } });
    await updateOpportunity(exA, oppId, { ownerId: exA.id, items: [{ productId: a.id, qty: 2 }, { productId: b.id, qty: 3 }] });
    const items = await db.opportunityItem.findMany({ where: { opportunityId: oppId } });
    const byP = Object.fromEntries(items.map((i) => [i.productId, i]));
    expect(Number(byP[a.id].unitPrice)).toBe(1000);
    expect(byP[a.id].qty).toBe(2);
    expect(Number(byP[b.id].unitPrice)).toBe(500);
  });
});

describe("expected deal value", () => {
  it("is typed on the opportunity and drives pipeline values", async () => {
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id)), { temperature: "WARM" });
    let card = (await pipelineCards(exA)).find((c) => c.id === oppId)!;
    expect(card).toMatchObject({ value: 0, noValue: true });
    await updateOpportunity(exA, oppId, { ownerId: exA.id, expectedValue: "2,50,000" });
    card = (await pipelineCards(exA)).find((c) => c.id === oppId)!;
    expect(card).toMatchObject({ value: 250000, noValue: false });
    await expect(updateOpportunity(exA, oppId, { ownerId: exA.id, expectedValue: "lots" })).rejects.toThrow(/expected value/);
    // leaving it out keeps it; clearing it removes it
    await updateOpportunity(exA, oppId, { ownerId: exA.id, nextAction: "Call" });
    expect(Number((await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).expectedValue)).toBe(250000);
    await updateOpportunity(exA, oppId, { ownerId: exA.id, expectedValue: "" });
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).expectedValue).toBeNull();
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

describe("locations", () => {
  it("state and city must be listed and active", async () => {
    await expect(createLead(exA, leadData(exA.id, { state: "Kerala" }))).rejects.toThrow(/not in the list of states/);
    await expect(createLead(exA, leadData(exA.id, { city: "Nashik" }))).rejects.toThrow(/not a listed city of Maharashtra/);
    await db.city.create({ data: { stateName: "Maharashtra", name: "Nashik", active: false } });
    await expect(createLead(exA, leadData(exA.id, { city: "Nashik" }))).rejects.toThrow(/not a listed city/);
    await db.city.updateMany({ where: { name: "Nashik" }, data: { active: true } });
    await expect(createLead(exA, leadData(exA.id, { city: "Nashik" }))).resolves.toBeTruthy();
  });

  it("an existing lead keeps a state/city that was later hidden, but can't switch to another unlisted one", async () => {
    const id = await createLead(exA, leadData(exA.id));
    await db.city.updateMany({ where: { name: "Pune" }, data: { active: false } });
    await expect(updateLead(exA, id, leadData(exA.id, { schoolName: "Renamed" }))).resolves.toBeUndefined();
    await expect(updateLead(exA, id, leadData(exA.id, { city: "Mumbai" }))).rejects.toThrow(/not a listed city/);
  });
});

describe("qualified leads convert automatically", () => {
  it("creating a lead as Qualified creates its opportunity", async () => {
    const id = await createLead(exA, leadData(exA.id, { status: "QUALIFIED", temperature: "HOT", currentCurriculum: "Our own books" }));
    const lead = await db.lead.findUniqueOrThrow({ where: { id }, include: { opportunities: true } });
    expect(lead.status).toBe("CONVERTED");
    expect(lead.currentCurriculum).toBe("Our own books");
    expect(lead.opportunities).toHaveLength(1);
    expect(lead.opportunities[0]).toMatchObject({ stage: "INTERESTED", ownerId: exA.id });
    // the lead's first follow-up moves to the opportunity
    const t = await db.task.findFirstOrThrow({ where: { leadId: id, title: { startsWith: "First" } } });
    expect(t.opportunityId).toBe(lead.opportunities[0].id);
  });

  it("changing a lead to Qualified creates its opportunity; other statuses don't", async () => {
    const id = await createLead(exA, leadData(exA.id));
    await updateLead(exA, id, leadData(exA.id, { status: "CONTACTED" }));
    expect(await db.opportunity.count({ where: { leadId: id } })).toBe(0);
    await updateLead(exA, id, leadData(exA.id, { status: "QUALIFIED", temperature: "WARM" }));
    expect(await db.opportunity.count({ where: { leadId: id } })).toBe(1);
    expect((await db.lead.findUniqueOrThrow({ where: { id } })).status).toBe("CONVERTED");
  });

  it("editing keeps existing interests and remarks (no longer on the form)", async () => {
    const p = await makeProduct("Curriculum License");
    const id = await createLead(exA, leadData(exA.id, { interests: [p.id], remarks: "Old note" }));
    await updateLead(exA, id, leadData(exA.id, { schoolName: "Renamed" }));
    const lead = await db.lead.findUniqueOrThrow({ where: { id }, include: { interests: true } });
    expect(lead).toMatchObject({ schoolName: "Renamed", remarks: "Old note" });
    expect(lead.interests).toHaveLength(1);
  });
});

describe("clients", () => {
  async function wonDeal(owner: SessionUser) {
    const oppId = await convertLead(owner, await createLead(owner, leadData(owner.id, { schoolName: "Happy Kids" })), { temperature: "WARM" });
    return oppId;
  }

  it("only a won deal converts; it creates the client and an onboarding task", async () => {
    const oppId = await wonDeal(exA);
    await expect(convertToClient(exA, oppId)).rejects.toThrow(/won deal/);
    await moveOpportunity(exA, oppId, { stage: "WON" });
    const clientId = await convertToClient(exA, oppId);
    const c = await db.client.findUniqueOrThrow({ where: { id: clientId }, include: { tasks: true } });
    expect(c).toMatchObject({ schoolName: "Happy Kids", status: "ONBOARDING", ownerId: exA.id, mobile: "98765 43210" });
    expect(c.number).toBeGreaterThanOrEqual(101);
    expect(c.tasks[0]).toMatchObject({ title: "Start onboarding: Happy Kids", assigneeId: exA.id, isAuto: true });
    await expect(convertToClient(exA, oppId)).rejects.toThrow(/already a client/);
  });

  it("respects access and completes onboarding", async () => {
    const oppId = await wonDeal(exA);
    await moveOpportunity(exA, oppId, { stage: "WON" });
    await expect(convertToClient(exB, oppId)).rejects.toThrow(/not found/);
    await expect(convertToClient(mgr, oppId)).rejects.toThrow(/not found/);
    const clientId = await convertToClient(head, oppId);
    await expect(completeOnboarding(exB, clientId)).rejects.toThrow(/not found/);
    await completeOnboarding(exA, clientId);
    expect((await db.client.findUniqueOrThrow({ where: { id: clientId } })).status).toBe("ACTIVE");
    await expect(completeOnboarding(exA, clientId)).rejects.toThrow(/already complete/);
  });
});

describe("products", () => {
  it("the sales head can set prices; managers cannot", async () => {
    const p = await makeProduct("Parent Workshop");
    const data = { name: "Parent Workshop", price: 12000, gstRate: 18, active: true };
    await expect(saveProduct(mgr, p.id, data)).rejects.toThrow(/Sales Head/);
    await expect(saveProduct(exA, p.id, data)).rejects.toThrow(/Sales Head/);
    await saveProduct(head, p.id, data);
    expect(Number((await db.product.findUniqueOrThrow({ where: { id: p.id } })).price)).toBe(12000);
  });

  it("admins delete a product; leads lose the link but keep everything else", async () => {
    const { deleteProduct } = await import("@/server/settings");
    const p = await makeProduct("Old Kit");
    const leadId = await createLead(exA, leadData(exA.id, { interests: [p.id] }));
    await expect(deleteProduct(mgr, p.id)).rejects.toThrow(/Sales Head/);
    await deleteProduct(admin, p.id);
    expect(await db.product.count({ where: { id: p.id } })).toBe(0);
    expect(await db.lead.count({ where: { id: leadId } })).toBe(1);
    await expect(deleteProduct(admin, p.id)).rejects.toThrow(/already deleted/);
  });
});

describe("list filters", () => {
  it("leads show All by default and can be limited to an added-date range", async () => {
    const { leadsList } = await import("@/server/queries");
    const a = await createLead(exA, leadData(exA.id, { schoolName: "Range A", mobile: "90000 00001" }));
    const b = await createLead(exA, leadData(exA.id, { schoolName: "Range B", mobile: "90000 00002" }));
    await convertLead(exA, b, { temperature: "WARM" });
    await db.lead.update({ where: { id: a }, data: { createdAt: new Date("2026-01-15T10:00:00+05:30") } });
    const all = await leadsList(head, {});
    expect(all.map((l) => l.schoolName)).toEqual(expect.arrayContaining(["Range A", "Range B"])); // converted one included
    expect((await leadsList(head, { status: "Active" })).map((l) => l.schoolName)).not.toContain("Range B");
    const jan = await leadsList(head, { from: "2026-01-01", to: "2026-01-31" });
    expect(jan.map((l) => l.schoolName)).toEqual(["Range A"]);
    expect((await leadsList(head, { from: "2026-01-16" })).map((l) => l.schoolName)).not.toContain("Range A");
  });

  it("products keep an MRP next to the school price", async () => {
    const id = await saveProduct(admin, null, { name: "Swar Book Hindi", price: 140, mrp: 180, gstRate: 0, active: true });
    const p = await db.product.findUniqueOrThrow({ where: { id } });
    expect([Number(p.price), Number(p.mrp)]).toEqual([140, 180]);
  });
});

describe("class kits and the kit checklist", () => {
  it("a kit keeps its contents as groups, gets a K code, and prints on the checklist", async () => {
    const { checklistPdf, checklistKits, checklistForQuotation } = await import("@/server/products/checklist");
    const { KIT_PRODUCTS } = await import("@/lib/kits");
    const id = await saveProduct(admin, null, {
      name: "Play Group Kit",
      price: 2360,
      gstRate: 0,
      active: true,
      color: "#F08A1C",
      contents: "## Common Kit | 19 objects\nSchool Bag\nStudent's Diary\n\n## Academic Kit | 6 Text Books\n- TB - My Scribbling book",
    });
    const p = await db.product.findUniqueOrThrow({ where: { id } });
    expect(p.code).toMatch(/^K\d+$/);
    expect(p.contents).toEqual([
      { title: "Common Kit | 19 objects", items: ["School Bag", "Student's Diary"] },
      { title: "Academic Kit | 6 Text Books", items: ["TB - My Scribbling book"] },
    ]);
    const service = await saveProduct(admin, null, { name: "Teacher Training", active: true, contents: "" });
    expect((await db.product.findUniqueOrThrow({ where: { id: service } })).contents).toBeNull();
    await expect(saveProduct(admin, id, { name: "Play Group Kit", active: true, color: "orange" })).rejects.toThrow(/colour/);

    expect((await checklistKits()).map((k) => k.name)).toEqual(["Play Group Kit"]);
    expect((await checklistPdf())!.subarray(0, 4).toString()).toBe("%PDF");
    // Every kit in the catalogue matches the client's checklist: Common Kit has 19 objects, item counts add up.
    for (const k of KIT_PRODUCTS) expect(k.contents![0].items).toHaveLength(19);
    expect(KIT_PRODUCTS.map((k) => k.contents!.reduce((t, g) => t + g.items.length, 0))).toEqual([34, 39, 45, 48]);
    // A quotation without kits falls back to every active kit.
    const q = await db.quotation.create({
      data: { number: "QUO/T/1", year: 2026, month: 1, seq: 999, date: new Date(), validityDays: 3, toLine: "x", schoolName: "x", shareToken: "t".repeat(24), preparedById: admin.id },
    });
    expect((await checklistForQuotation(q.id))!.subarray(0, 4).toString()).toBe("%PDF");
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

describe("opportunity category", () => {
  it("is chosen when converting, not on the lead", async () => {
    const id = await createLead(exA, leadData(exA.id));
    await expect(convertLead(exA, id, {})).rejects.toThrow(/Hot, Warm or Cold/);
    const oppId = await convertLead(exA, id, { temperature: "HOT" });
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).temperature).toBe("HOT");
  });

  it("a lead saved as Qualified needs the category for its opportunity", async () => {
    await expect(createLead(exA, leadData(exA.id, { status: "QUALIFIED" }))).rejects.toThrow(/category/);
    const id = await createLead(exA, leadData(exA.id, { status: "QUALIFIED", temperature: "COLD" }));
    const opp = await db.opportunity.findFirstOrThrow({ where: { leadId: id } });
    expect(opp.temperature).toBe("COLD");
  });

  it("can be changed on the opportunity", async () => {
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id)), { temperature: "WARM" });
    await updateOpportunity(exA, oppId, { ownerId: exA.id, temperature: "HOT" });
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).temperature).toBe("HOT");
  });
});

describe("to-do", () => {
  it("own to-dos with a time sit next to school follow-ups", async () => {
    await createLead(exA, leadData(exA.id));
    await createTask(exA, { title: "Prepare agreement", type: "Document Preparation", dueDate: today, dueTime: "15:30", assigneeId: exA.id });
    await expect(createTask(exA, { title: "x", type: "Party", dueDate: today, assigneeId: exA.id })).rejects.toThrow(/type/);
    await expect(createTask(exA, { title: "x", type: "Other", dueDate: today, dueTime: "25:00", assigneeId: exA.id })).rejects.toThrow(/time/);
    expect((await taskList(exA, false)).open).toHaveLength(2);
    const own = (await taskList(exA, false, "todos")).open;
    expect(own.map((t) => [t.title, t.dueTime])).toEqual([["Prepare agreement", "15:30"]]);
    expect((await taskList(exA, false, "followups")).open).toHaveLength(1);
  });

  it("postpone moves the date, counts it, and keeps the lead's next follow-up in step", async () => {
    const leadId = await createLead(exA, leadData(exA.id));
    const t = await db.task.findFirstOrThrow({ where: { leadId } });
    await expect(postponeTask(exA, t.id, { dueDate: addDays(today, -1) })).rejects.toThrow(/later date/);
    await expect(postponeTask(exB, t.id, { dueDate: addDays(today, 5) })).rejects.toThrow(/not found/);
    await postponeTask(exA, t.id, { dueDate: addDays(today, 5), dueTime: "11:00", reason: "Principal travelling" });
    const after = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(after).toMatchObject({ postponedCount: 1, dueTime: "11:00", postponeReason: "Principal travelling", status: "OPEN" });
    expect(fromDbDate((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).nextFollowUpDate!)).toBe(addDays(today, 5));
  });

  it("cancel closes a to-do with a reason", async () => {
    const id = await createTask(exA, { title: "Team meeting", type: "Internal Meeting", dueDate: today, assigneeId: exA.id });
    await cancelTask(exA, id, { reason: "Moved online" });
    expect(await db.task.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "CANCELLED", outcome: "Moved online" });
    await expect(postponeTask(exA, id, { dueDate: today })).rejects.toThrow(/already closed/);
  });
});

describe("client editing", () => {
  async function client() {
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id, { schoolName: "Sunshine" })), { temperature: "WARM" });
    await moveOpportunity(exA, oppId, { stage: "WON" });
    return convertToClient(exA, oppId);
  }
  const details = (over: Record<string, unknown> = {}) => ({
    schoolName: "Sunshine Preschool",
    contactName: "New Owner",
    mobile: "98765 00000",
    state: "Maharashtra",
    city: "Pune",
    ownerId: exA.id,
    ...over,
  });

  it("the owner can edit details; only Admin / Sales Head can change the owner", async () => {
    const { updateClient } = await import("@/server/clients");
    const id = await client();
    await updateClient(exA, id, details());
    expect(await db.client.findUniqueOrThrow({ where: { id } })).toMatchObject({ schoolName: "Sunshine Preschool", contactName: "New Owner" });
    await expect(updateClient(exA, id, details({ ownerId: exB.id }))).rejects.toThrow(/assigned salesperson/);
    await expect(updateClient(exB, id, details())).rejects.toThrow(/not found/);
    await updateClient(head, id, details({ ownerId: exB.id }));
    const c = await db.client.findUniqueOrThrow({ where: { id }, include: { tasks: { where: { status: "OPEN" } } } });
    expect(c.ownerId).toBe(exB.id);
    expect(c.tasks.every((t) => t.assigneeId === exB.id)).toBe(true);
    await expect(updateClient(head, id, details({ city: "Atlantis" }))).rejects.toThrow(/Locations/);
  });
});

describe("feature switches", () => {
  it("start on; only an Admin can switch them", async () => {
    const { getFeatures, setFeature } = await import("@/server/features");
    await db.appSetting.deleteMany({ where: { key: "features" } });
    expect((await getFeatures()).cheques).toBe(true);
    await expect(setFeature(head, "cheques", false)).rejects.toThrow(/Admin/);
    await setFeature(admin, "cheques", false);
    expect((await getFeatures()).cheques).toBe(false);
    await setFeature(admin, "cheques", true);
  });
});

describe("duplicate leads", () => {
  it("matches the same mobile (any spacing) or the same school in the same city, company-wide", async () => {
    const { findDuplicateLeads } = await import("@/server/leads");
    await createLead(exA, leadData(exA.id, { schoolName: "Tiny Steps", mobile: "+91 98765-43210" }));
    const byMobile = await findDuplicateLeads(exB, { schoolName: "Other", mobile: "9876543210", city: "Pune" });
    expect(byMobile).toHaveLength(1);
    expect(byMobile[0]).toMatchObject({ kind: "Lead", schoolName: "Tiny Steps", href: null });
    expect(await findDuplicateLeads(exB, { schoolName: " tiny steps ", mobile: "9999999999", city: "pune" })).toHaveLength(1);
    expect(await findDuplicateLeads(exB, { schoolName: "Tiny Steps", mobile: "9999999999", city: "Mumbai" })).toHaveLength(0);
    expect((await findDuplicateLeads(exA, { mobile: "98765 43210" }))[0].href).toMatch(/^\/leads\//);
  });
});

describe("hand over work", () => {
  it("moves open leads, deals, clients and to-dos to a colleague", async () => {
    const { handOverWork, openWorkOf } = await import("@/server/settings");
    await createLead(exA, leadData(exA.id));
    const oppId = await convertLead(exA, await createLead(exA, leadData(exA.id, { schoolName: "Two" })), { temperature: "WARM" });
    await moveOpportunity(exA, oppId, { stage: "WON" });
    await convertToClient(exA, oppId);
    const before = await openWorkOf(exA.id);
    expect(before).toMatchObject({ leads: 1, opportunities: 0, clients: 1 });
    expect(before.tasks).toBeGreaterThan(0);
    await expect(handOverWork(exA, exA.id, exB.id)).rejects.toThrow(/Admin or the Sales Head/);
    await expect(handOverWork(head, exA.id, exA.id)).rejects.toThrow(/different person/);
    const moved = await handOverWork(head, exA.id, exB.id);
    expect(moved).toMatchObject({ leads: 1, clients: 1 });
    expect(await openWorkOf(exA.id)).toEqual({ leads: 0, opportunities: 0, clients: 0, tasks: 0 });
  });
});

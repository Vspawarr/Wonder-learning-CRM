import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { sectionsToText, textToSections } from "@/lib/quotation-text";
import { convertLead, createLead } from "@/server/leads";
import { moveOpportunity } from "@/server/opportunities";
import {
  DEFAULT_CONTENT,
  getQuotationContent,
  saveQuotationContent,
} from "@/server/quotation/content";
import {
  createQuotation,
  deleteQuotation,
  emailQuotation,
  markQuotationSent,
  quotationDefaults,
  quotationPdf,
  quotationPdfByToken,
  reviseQuotation,
  updateQuotation,
} from "@/server/quotation/service";
import { leadData, makeUser, resetData } from "./helpers";

let exA: SessionUser, exB: SessionUser, head: SessionUser;
let oppId: string;
const [Y, M] = todayIST().split("-");

const quote = (over: Record<string, unknown> = {}) => ({
  date: todayIST(),
  validityDays: 3,
  toLine: "The Director",
  schoolName: "Vh English Medium Preschool",
  address: "Marunji Road, Pune",
  items: [
    { description: "PG Academic Kit", mrp: "3700", price: "2800" },
    { description: "NUR Academic Kit", mrp: 4800, price: 3400 },
  ],
  ...over,
});

beforeEach(async () => {
  await resetData();
  await db.quotation.deleteMany();
  await db.appSetting.deleteMany();
  exA = await makeUser("SALES_EXECUTIVE");
  exB = await makeUser("SALES_EXECUTIVE");
  head = await makeUser("SALES_HEAD");
  oppId = await convertLead(
    exA,
    await createLead(
      exA,
      leadData(exA.id, {
        schoolName: "Vh English Medium Preschool",
        address: "S. No. 50/2, Marunji Road",
        area: "Marunji",
      }),
    ),
    { temperature: "WARM" },
  );
});

describe("creating quotations", () => {
  it("numbers them QUO/YYYY/MM/NNN, running per month", async () => {
    const a = await createQuotation(exA, oppId, quote());
    const b = await createQuotation(exA, oppId, quote());
    const rows = await db.quotation.findMany({
      where: { id: { in: [a, b] } },
      orderBy: { seq: "asc" },
    });
    expect(rows.map((r) => r.number)).toEqual([
      `QUO/${Y}/${M}/001`,
      `QUO/${Y}/${M}/002`,
    ]);
    expect(rows[0]).toMatchObject({ status: "DRAFT", preparedById: exA.id });
  });

  it("prices are typed per quotation; MRP and price are both required numbers", async () => {
    const id = await createQuotation(exA, oppId, quote());
    const items = await db.quotationItem.findMany({
      where: { quotationId: id },
      orderBy: { sortOrder: "asc" },
    });
    expect(
      items.map((i) => [i.description, Number(i.mrp), Number(i.price)]),
    ).toEqual([
      ["PG Academic Kit", 3700, 2800],
      ["NUR Academic Kit", 4800, 3400],
    ]);
    await expect(
      createQuotation(
        exA,
        oppId,
        quote({ items: [{ description: "X", mrp: "", price: "10" }] }),
      ),
    ).rejects.toThrow(/valid amount/);
    await expect(
      createQuotation(exA, oppId, quote({ items: [] })),
    ).rejects.toThrow(/at least one product/);
  });

  it("suggests school, address and the opportunity's products", async () => {
    const d = await quotationDefaults(exA, oppId);
    expect(d).toMatchObject({
      schoolName: "Vh English Medium Preschool",
      toLine: "The Director",
      validityDays: 3,
      address: "S. No. 50/2, Marunji Road, Marunji, Pune",
    });
  });

  it("follows the opportunity's access rules and needs an open deal", async () => {
    await expect(createQuotation(exB, oppId, quote())).rejects.toThrow(
      /not found/,
    );
    const id = await createQuotation(head, oppId, quote());
    await expect(quotationPdf(exB, id)).rejects.toThrow(/not found/);
    await moveOpportunity(exA, oppId, {
      stage: "LOST",
      lostReason: "Price Issue",
      lostRemarks: "x",
    });
    await expect(createQuotation(exA, oppId, quote())).rejects.toThrow(
      /closed deal/,
    );
  });
});

describe("drafts, sending and revising", () => {
  it("drafts can be edited or deleted; sent ones are locked", async () => {
    const id = await createQuotation(exA, oppId, quote());
    await updateQuotation(
      exA,
      id,
      quote({
        validityDays: 7,
        items: [{ description: "LKG Academic Kit", mrp: 5600, price: 3800 }],
      }),
    );
    expect(await db.quotationItem.count({ where: { quotationId: id } })).toBe(
      1,
    );
    await markQuotationSent(exA, id, "download");
    await expect(updateQuotation(exA, id, quote())).rejects.toThrow(/Revise/);
    await expect(deleteQuotation(exA, id)).rejects.toThrow(/draft/);
    const other = await createQuotation(exA, oppId, quote());
    await deleteQuotation(exA, other);
    expect(await db.quotation.count({ where: { id: other } })).toBe(0);
  });

  it("sending moves an early deal to Proposal Sent with its follow-up task", async () => {
    const id = await createQuotation(exA, oppId, quote());
    await markQuotationSent(exA, id, "whatsapp");
    const opp = await db.opportunity.findUniqueOrThrow({
      where: { id: oppId },
      include: { tasks: true, activities: true },
    });
    expect(opp).toMatchObject({ stage: "PROPOSAL_SENT", probability: 55 });
    expect(
      opp.tasks.some((t) =>
        t.title.startsWith("Follow up after proposal sent"),
      ),
    ).toBe(true);
    expect(
      opp.activities.some((a) => a.subject.includes("shared on WhatsApp")),
    ).toBe(true);
    expect(
      await db.quotation.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ status: "SENT", sentVia: "whatsapp" });
  });

  it("does not move a deal that is already further along", async () => {
    await moveOpportunity(exA, oppId, { stage: "NEGOTIATION" });
    const id = await createQuotation(exA, oppId, quote());
    await markQuotationSent(exA, id, "download");
    expect(
      (await db.opportunity.findUniqueOrThrow({ where: { id: oppId } })).stage,
    ).toBe("NEGOTIATION");
  });

  it("revise copies a quotation into a new draft with a new number", async () => {
    const id = await createQuotation(exA, oppId, quote());
    await markQuotationSent(exA, id, "download");
    const rev = await reviseQuotation(exA, id);
    const q = await db.quotation.findUniqueOrThrow({
      where: { id: rev },
      include: { items: true },
    });
    expect(q).toMatchObject({ status: "DRAFT", number: `QUO/${Y}/${M}/002` });
    expect(q.items).toHaveLength(2);
  });
});

describe("PDF, link and email", () => {
  it("renders the three-page PDF", async () => {
    const id = await createQuotation(exA, oppId, quote());
    const { pdf, number } = await quotationPdf(exA, id);
    expect(number).toMatch(/^QUO\//);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(
      (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length,
    ).toBe(3);
  });

  it("the share link only works once the quotation is sent", async () => {
    const id = await createQuotation(exA, oppId, quote());
    const { shareToken } = await db.quotation.findUniqueOrThrow({
      where: { id },
    });
    expect(await quotationPdfByToken(shareToken)).toBeNull();
    await markQuotationSent(exA, id, "whatsapp");
    expect((await quotationPdfByToken(shareToken))?.number).toMatch(/^QUO\//);
    expect(await quotationPdfByToken("not-a-real-token-at-all-xyz")).toBeNull();
  });

  it("email is refused until an email account is configured", async () => {
    const id = await createQuotation(exA, oppId, quote());
    await expect(
      emailQuotation(exA, id, { to: "school@example.com", message: "Hi" }),
    ).rejects.toThrow(/isn't set up/);
  });
});

describe("standard text", () => {
  it("defaults to the Wonder Learning format and can be edited", async () => {
    expect(await getQuotationContent()).toEqual(DEFAULT_CONTENT);
    await saveQuotationContent(head.id, {
      ...DEFAULT_CONTENT,
      defaultValidityDays: 14,
      closing: ["Thanks!"],
    });
    expect((await getQuotationContent()).defaultValidityDays).toBe(14);
    expect((await quotationDefaults(exA, oppId)).validityDays).toBe(14);
  });

  it("kit sections round-trip through the plain-text editor format", () => {
    expect(textToSections(sectionsToText(DEFAULT_CONTENT.kitLeft))).toEqual(
      DEFAULT_CONTENT.kitLeft,
    );
    expect(
      textToSections(
        "## Study Kit\n- Text Books\n\n## Optional\nCursive Text Book",
      ),
    ).toEqual([
      { title: "Study Kit", items: ["Text Books"] },
      { title: "Optional", items: ["Cursive Text Book"] },
    ]);
  });
});

describe("quotation on a lead (before it becomes an opportunity)", () => {
  it("is made on the lead, follows the lead's access, and moves to the opportunity on conversion", async () => {
    const leadId = await createLead(exA, leadData(exA.id, { schoolName: "Early Ask School", mobile: "98111 22334" }));
    const q = await createQuotation(exA, { leadId }, quote({ schoolName: "Early Ask School" }));
    let row = await db.quotation.findUniqueOrThrow({ where: { id: q } });
    expect(row).toMatchObject({ leadId, opportunityId: null, clientId: null });
    await expect(createQuotation(exB, { leadId }, quote())).rejects.toThrow(/not found/);
    await expect(quotationPdf(exB, q)).rejects.toThrow(/not found/);
    expect((await quotationPdf(head, q)).pdf.subarray(0, 4).toString()).toBe("%PDF");

    // Sending it counts as contacting a new lead.
    await markQuotationSent(exA, q, "whatsapp");
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("CONTACTED");

    const opp = await convertLead(exA, leadId, { temperature: "HOT" });
    row = await db.quotation.findUniqueOrThrow({ where: { id: q } });
    expect(row.opportunityId).toBe(opp);
    // After conversion, a new quotation "on the lead" goes on its opportunity.
    const q2 = await createQuotation(exA, { leadId }, quote());
    expect((await db.quotation.findUniqueOrThrow({ where: { id: q2 } })).opportunityId).toBe(opp);
  });

  it("can't be made on a disqualified lead", async () => {
    const { disqualifyLead } = await import("@/server/leads");
    const leadId = await createLead(exA, leadData(exA.id, { schoolName: "No Go School", mobile: "98111 22335" }));
    await disqualifyLead(exA, leadId, { reason: "Not Interested" });
    await expect(createQuotation(exA, { leadId }, quote())).rejects.toThrow(/disqualified/);
  });
});

describe("kits changed per school and hidden transport (R29)", () => {
  it("item prices round-trip through the kit text format and add up", async () => {
    const { itemsTotal } = await import("@/lib/quotation-text");
    const s = textToSections("## Class Connect\nBook 1 to 9 | 1792 | 2688\n## Essential Kit | 2 objects\nI-card - Student | 60 | 70\nEscort Card 2");
    expect(s[0]).toEqual({ title: "Class Connect", items: ["Book 1 to 9"], prices: [{ sp: 1792, mrp: 2688 }] });
    expect(s[1].prices).toEqual([{ sp: 60, mrp: 70 }, null]);
    expect(textToSections(sectionsToText(s))).toEqual(s);
    expect(itemsTotal(s)).toEqual({ sp: 1852, mrp: 2758 });
    // Unpriced lists (the quotation's standard text) stay as before.
    expect(textToSections("## A\nx | y")).toEqual([{ title: "A", items: ["x | y"] }]);
  });

  it("taking items out and adding optional items moves the price, label and checklist", async () => {
    const { customDelta, customLabel, customSections } = await import("@/lib/kit-custom");
    const sections = textToSections("## Skill Booster | 2 objects\nShape Kit | 20 | 35\nArt & Craft | 220 | 430");
    const c = { removed: ["Shape Kit"], added: [{ productId: null, name: "Bag", sp: 225, mrp: 300 }] };
    expect(customDelta(sections, c)).toEqual({ sp: 205, mrp: 265 });
    expect(customLabel("Nursery Focus Kit", c)).toBe("Nursery Focus Kit (without Shape Kit; with Bag)");
    expect(customSections(sections, c)).toEqual([
      { title: "Skill Booster", items: ["Art & Craft"], prices: [{ sp: 220, mrp: 430 }] },
      { title: "Added for this school", items: ["Bag"] },
    ]);
  });

  it("transport is stored apart, included in the price the school sees, and kept on edit and revise", async () => {
    const kit = await db.product.create({
      data: {
        code: "KT1",
        name: "Test Kit",
        type: "MATERIAL",
        price: 300,
        mrp: 500,
        contents: [{ title: "G", items: ["A", "B"], prices: [{ sp: 100, mrp: 200 }, { sp: 200, mrp: 300 }] }],
      },
    });
    const custom = { removed: ["A"], added: [{ productId: null, name: "Bag", sp: 225, mrp: 300 }] };
    const id = await createQuotation(
      exA,
      oppId,
      quote({ items: [{ productId: kit.id, description: "Test Kit (without A; with Bag)", mrp: 600, price: 425, transport: "75", kit: custom }] }),
    );
    const row = await db.quotationItem.findFirstOrThrow({ where: { quotationId: id } });
    expect([Number(row.price), Number(row.transport)]).toEqual([500, 75]);
    expect(row.kit).toEqual(custom);

    const { quotationForEdit } = await import("@/server/quotation/service");
    const edit = await quotationForEdit(exA, id);
    expect(edit.items[0]).toMatchObject({ price: "425", transport: "75", kit: custom });

    await markQuotationSent(exA, id, "download");
    const copy = await reviseQuotation(exA, id);
    const copied = await db.quotationItem.findFirstOrThrow({ where: { quotationId: copy } });
    expect([Number(copied.price), Number(copied.transport)]).toEqual([500, 75]);

    // The checklist sent with the PO leaves out A and lists the added Bag.
    const { checklistForQuotation } = await import("@/server/products/checklist");
    const pdf = await checklistForQuotation(id);
    expect(pdf?.subarray(0, 4).toString()).toBe("%PDF");
    await db.quotation.deleteMany();
    await db.product.delete({ where: { id: kit.id } });
  });

  it("prices come only from the Excel price list: class kits are unpriced, freight is out of the kits", async () => {
    const { KIT_PRODUCTS, NURSERY_KIT_TYPES } = await import("@/lib/kits");
    expect(KIT_PRODUCTS.every((k) => k.price === null)).toBe(true);
    for (const k of NURSERY_KIT_TYPES) {
      const items = k.groups.flatMap((g) => g.items);
      expect(items.some((i) => /freight/i.test(i.name))).toBe(false);
      expect(items.reduce((t, i) => t + i.sp, 0)).toBe(k.sp);
      expect(items.reduce((t, i) => t + i.mrp, 0)).toBe(k.mrp);
    }
    expect(NURSERY_KIT_TYPES.map((k) => k.sp)).toEqual([2112, 2854, 3144]);
  });
});

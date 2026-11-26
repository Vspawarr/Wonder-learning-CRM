// R60: old records (the team's earlier DSR) uploaded through Leads → Upload leads on an "Old records" sheet.
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { importLeads } from "@/server/lead-excel/import";
import { NOT_RECORDED, OLD_HEADERS, OLD_SHEET, matchPerson } from "@/server/lead-excel/old-records";
import { makeUser, resetData } from "./helpers";

let head: SessionUser, pramod: SessionUser;

beforeEach(async () => {
  await resetData();
  await db.state.upsert({ where: { name: "Maharashtra" }, update: { active: true }, create: { name: "Maharashtra" } });
  head = await makeUser("SALES_HEAD", "Viren Desai");
  pramod = await makeUser("SALES_EXECUTIVE", "Pramod Patil");
  await makeUser("SALES_EXECUTIVE", "Vinay Rao");
  await makeUser("SALES_EXECUTIVE", "Vinay Kulkarni");
});

type Row = Partial<Record<"school" | "contact" | "mobile" | "state" | "city" | "area" | "pub" | "strength" | "source" | "ref" | "rep" | "visit" | "remarks", string | Date>>;
async function file(rows: Row[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(OLD_SHEET);
  ws.addRow(OLD_HEADERS);
  for (const r of rows)
    ws.addRow([r.school ?? "", r.contact ?? "", r.mobile ?? "", r.state ?? "Maharashtra", r.city ?? "Navi Mumbai", r.area ?? "", r.pub ?? "", r.strength ?? "", r.source ?? "", r.ref ?? "", r.rep ?? "Pramod", r.visit ?? "", r.remarks ?? ""]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("old records upload", () => {
  it("makes Contacted leads with no follow-up or to-do, blanks allowed, and the visit in the history", async () => {
    const r = await importLeads(
      head,
      await file([
        { school: "Kinder Joy Preschool", contact: "Daya More", mobile: "7738006515", area: "Umbarde Rd", strength: "100", source: "Google", visit: new Date("2025-12-15T00:00:00Z"), remarks: "Old DSR · Fees: 25K\nLike the kit." },
        { school: "Good Shephard School", rep: "pramod  patil", source: "Reference", ref: "Viren Sir", visit: "16/12/2025" },
      ]),
    );
    expect(r.skipped).toEqual([]);
    expect(r.created.map((c) => c.school)).toEqual(["Kinder Joy Preschool", "Good Shephard School"]);
    expect(r.newCities).toEqual(["Navi Mumbai, Maharashtra"]);

    const leads = await db.lead.findMany({ orderBy: { number: "asc" }, include: { activities: { orderBy: { occurredAt: "asc" } }, tasks: true } });
    expect(leads[0]).toMatchObject({ status: "CONTACTED", assignedToId: pramod.id, nextFollowUpDate: null, studentStrength: 100, remarks: "Old DSR · Fees: 25K\nLike the kit." });
    expect(leads[0].createdAt.toISOString().slice(0, 10)).toBe("2025-12-15");
    expect(leads[0].tasks).toEqual([]);
    const visit = leads[0].activities.find((a) => a.type === "SITE_VISIT")!;
    expect(visit).toMatchObject({ byId: pramod.id, summary: "Old DSR · Fees: 25K\nLike the kit." });
    expect(leads[1]).toMatchObject({ contactName: NOT_RECORDED, mobile: "", referenceName: "Viren Sir" });
  });

  it("adds a repeat visit to the same school instead of a second lead, and skips schools already in the CRM", async () => {
    const rows = [
      { school: "Petite Explore Preschool", mobile: "9876543210", visit: "01/12/2025", remarks: "First visit" },
      { school: "petite  explore preschool", mobile: "+91 98765 43210", visit: "10/12/2025", remarks: "Second visit" },
      { school: "No Phone School", visit: "02/12/2025" },
      { school: "No Phone School", city: "Pune", visit: "03/12/2025" },
    ];
    const r = await importLeads(head, await file(rows));
    expect(r.created.map((c) => c.school)).toEqual(["Petite Explore Preschool", "No Phone School", "No Phone School"]);
    expect(r.skipped).toEqual([{ row: 3, school: "petite  explore preschool", reason: expect.stringMatching(/earlier row/) }]);
    const petite = await db.lead.findFirstOrThrow({ where: { schoolName: "Petite Explore Preschool" }, include: { activities: { where: { type: "SITE_VISIT" } } } });
    expect(petite.activities).toHaveLength(2);
    expect(petite.remarks).toBe("First visit\nSecond visit");

    const again = await importLeads(head, await file(rows.slice(0, 1)));
    expect(again.created).toEqual([]);
    expect(again.skipped[0].reason).toMatch(/Already in the CRM/);
  });

  it("checks each row and reports what was skipped", async () => {
    const r = await importLeads(
      head,
      await file([
        { school: "", rep: "Pramod" },
        { school: "A", state: "Atlantis" },
        { school: "B", mobile: "70" },
        { school: "C", rep: "Vinay" },
        { school: "D", rep: "Harshal" },
        { school: "E", source: "Just Dial" },
        { school: "F", visit: "31/02/2025" },
        { school: "G", strength: "80+" },
      ]),
    );
    expect(r.created).toEqual([]);
    const reasons = r.skipped.map((s) => s.reason).join("\n");
    for (const m of ['"School Name" is required', '"Atlantis" is not in the list', '"70" is not a 10-digit', 'more than one salesperson is called "Vinay"', 'no active salesperson called "Harshal"', '"Just Dial" is not an allowed', '"31/02/2025" is not a valid date', '"80+" must be a whole number'])
      expect(reasons).toContain(m);
  });

  it("is for Admin, Director and Sales Head only", async () => {
    await expect(importLeads(pramod, await file([{ school: "X" }]))).rejects.toThrow(/Only Admin, Director or Sales Head/);
  });

  it("matches a rep by full name or a first name only one person has", () => {
    const people = [{ name: "Pramod Patil" }, { name: "Vinay Rao" }, { name: "Vinay Kulkarni" }];
    expect(matchPerson(people, "pramod")).toEqual({ name: "Pramod Patil" });
    expect(matchPerson(people, "Vinay Rao")).toEqual({ name: "Vinay Rao" });
    expect(matchPerson(people, "Vinay")).toBe("many");
    expect(matchPerson(people, "Roshan")).toBeNull();
  });
});

import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DESIGNATIONS, FOLLOWUP_TYPES, SOURCES } from "@/lib/constants";
import { addDays, fromDbDate, todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { getLocations } from "@/server/locations";
import { COLUMNS, DATA_SHEET, EXAMPLE_SCHOOL, HEADERS } from "@/server/lead-excel/columns";
import { buildLeadTemplate } from "@/server/lead-excel/template";
import { importLeads } from "@/server/lead-excel/import";
import { createLead } from "@/server/leads";
import { leadData, makeUser, resetData } from "./helpers";

let head: SessionUser, exA: SessionUser;
const today = todayIST();

beforeEach(async () => {
  await resetData();
  await db.state.upsert({ where: { name: "Madhya Pradesh" }, update: { active: true }, create: { name: "Madhya Pradesh" } });
  await db.city.createMany({
    data: [
      { stateName: "Maharashtra", name: "Mumbai" },
      { stateName: "Madhya Pradesh", name: "Indore" },
    ],
  });
  head = await makeUser("SALES_HEAD", "Viren Head");
  exA = await makeUser("SALES_EXECUTIVE", "Asha Exec");
  await makeUser("SALES_EXECUTIVE", "Bala Exec");
});

async function template(user = head) {
  const loc = await getLocations();
  const names = (await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }))
    .filter((u) => u.role !== "ADMIN" && u.role !== "DIRECTOR")
    .map((u) => u.name);
  const buf = await buildLeadTemplate({ ...loc, assignees: user.role === "SALES_EXECUTIVE" ? [user.name] : names });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

const good = (over: Record<string, unknown> = {}) => ({
  schoolName: "Tiny Tots",
  contactName: "Meena",
  mobile: "98765 00001",
  state: "Maharashtra",
  city: "Pune",
  source: "Website",
  assignedTo: "Asha Exec",
  nextFollowUpDate: new Date(addDays(today, 3) + "T00:00:00Z"),
  ...over,
});

/** Fill the downloaded template like a user would (example row removed) and return the file. */
async function filled(rows: Record<string, unknown>[], wb?: ExcelJS.Workbook) {
  wb ??= await template();
  const ws = wb.getWorksheet(DATA_SHEET)!;
  ws.spliceRows(2, 1);
  rows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    COLUMNS.forEach((c, j) => {
      if (r[c.key] !== undefined) row.getCell(j + 1).value = r[c.key] as ExcelJS.CellValue;
    });
    row.commit();
  });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("template", () => {
  it("has the form's columns, a Read me tab and a hidden Lists tab", async () => {
    const wb = await template();
    const ws = wb.getWorksheet(DATA_SHEET)!;
    expect(HEADERS.map((_, i) => ws.getRow(1).getCell(i + 1).value)).toEqual(HEADERS);
    expect(HEADERS.filter((h) => h.endsWith("*"))).toEqual([
      "School Name*",
      "Owner/Contact Person Name*",
      "Mobile Number*",
      "State*",
      "City*",
      "Lead Source*",
      "Assigned To*",
      "Next Follow-up Date*",
    ]);
    expect(wb.getWorksheet("Read me")).toBeTruthy();
    expect(wb.getWorksheet("Lists")!.state).toBe("veryHidden");
    expect(ws.getRow(2).getCell(1).value).toBe(EXAMPLE_SCHOOL);
    expect(ws.getRow(2).font?.italic).toBe(true);
  });

  it("dropdowns are hard (stop) and read the live lists", async () => {
    const wb = await template();
    const ws = wb.getWorksheet(DATA_SHEET)! as unknown as { dataValidations: { model: Record<string, ExcelJS.DataValidation> } };
    const col = (key: string) => String.fromCharCode(65 + COLUMNS.findIndex((c) => c.key === key));
    for (const key of ["designation", "state", "city", "source", "status", "category", "assignedTo", "followUpType"]) {
      const v = ws.dataValidations.model[`${col(key)}500`];
      expect(v, key).toBeTruthy();
      expect(v.type).toBe("list");
      expect(v.errorStyle).toBe("stop");
    }
    expect(ws.dataValidations.model[`${col("city")}2`].formulae[0]).toBe("INDIRECT(VLOOKUP($F2,L_StateMap,2,FALSE))");
    expect(ws.dataValidations.model[`${col("nextFollowUpDate")}2`].type).toBe("date");

    // The Lists sheet holds exactly the constants and the live tables.
    const lists = wb.getWorksheet("Lists")!;
    const column = (title: string) => {
      const c = lists.getRow(1).values as string[];
      const idx = c.indexOf(title);
      const out: string[] = [];
      for (let r = 2; lists.getCell(r, idx).value; r++) out.push(String(lists.getCell(r, idx).value));
      return out;
    };
    expect(column("designation")).toEqual([...DESIGNATIONS]);
    expect(column("source")).toEqual([...SOURCES]);
    expect(column("followUpType")).toEqual([...FOLLOWUP_TYPES]);
    expect(column("status")).toEqual(["New", "Contacted", "Qualified"]);
    expect(column("category")).toEqual(["Hot", "Warm"]);
    expect(column("state")).toEqual((await getLocations()).states);
    expect(column("Maharashtra")).toEqual(["Mumbai", "Pune"]);
    expect(column("Madhya Pradesh")).toEqual(["Indore"]);
    expect(column("assignee")).toEqual(["Asha Exec", "Bala Exec", "Viren Head"]);
    // A city added in Settings shows up in the next download.
    await db.city.create({ data: { stateName: "Madhya Pradesh", name: "Bhopal" } });
    const again = (await template()).getWorksheet("Lists")!;
    const titles = again.getRow(1).values as string[];
    const mp = titles.indexOf("Madhya Pradesh");
    expect([again.getCell(2, mp).value, again.getCell(3, mp).value]).toEqual(["Bhopal", "Indore"]);
  });
});

describe("upload", () => {
  it("creates valid rows exactly like a manual lead, with the first follow-up task", async () => {
    const r = await importLeads(head, await filled([good({ followUpType: "Email", followUpRemark: "Send deck", category: "Hot" })]));
    expect(r.skipped).toEqual([]);
    expect(r.created).toEqual([{ row: 2, school: "Tiny Tots" }]);
    const lead = await db.lead.findFirstOrThrow({ where: { schoolName: "Tiny Tots" }, include: { tasks: true } });
    expect(lead).toMatchObject({ status: "NEW", assignedToId: exA.id, city: "Pune", createdById: head.id });
    expect(fromDbDate(lead.nextFollowUpDate!)).toBe(addDays(today, 3));
    expect(lead.tasks[0]).toMatchObject({ type: "Email", title: "Send deck", isAuto: true, assigneeId: exA.id });
  });

  it("accepts dates typed as DD/MM/YYYY text", async () => {
    const [y, m, d] = addDays(today, 5).split("-");
    const r = await importLeads(head, await filled([good({ nextFollowUpDate: `${d}/${m}/${y}` })]));
    expect(r.created).toHaveLength(1);
    const lead = await db.lead.findFirstOrThrow({ where: { schoolName: "Tiny Tots" } });
    expect(fromDbDate(lead.nextFollowUpDate!)).toBe(addDays(today, 5));
  });

  it("re-checks every row and says which column and value are wrong", async () => {
    const r = await importLeads(
      head,
      await filled([
        good({ schoolName: "A", source: "Facebok" }),
        good({ schoolName: "B", city: "Indore" }),
        good({ schoolName: "C", state: "Kerala", city: "Kochi" }),
        good({ schoolName: "D", assignedTo: "Nobody" }),
        good({ schoolName: "E", nextFollowUpDate: "31/02/2026" }),
        good({ schoolName: "F", contactName: "", mobile: "" }),
        good({ schoolName: "G", designation: "CEO" }),
        good({ schoolName: "H", mobile: "12345" }),
        good({ schoolName: "I", studentStrength: "lots" }),
      ]),
    );
    expect(r.created).toEqual([]);
    const reasons = Object.fromEntries(r.skipped.map((s) => [s.school, s.reason]));
    expect(reasons.A).toMatch(/"Lead Source": "Facebok" is not an allowed value/);
    expect(reasons.B).toMatch(/"City": "Indore" is not a listed city of Maharashtra/);
    expect(reasons.C).toMatch(/"State": "Kerala" is not an allowed value/);
    expect(reasons.D).toMatch(/"Assigned To": "Nobody" is not an allowed value/);
    expect(reasons.E).toMatch(/"Next Follow-up Date": "31\/02\/2026" is not a valid date/);
    expect(reasons.F).toMatch(/"Owner\/Contact Person Name" is required.*"Mobile Number" is required/);
    expect(reasons.G).toMatch(/"Designation": "CEO" is not an allowed value/);
    expect(reasons.H).toMatch(/"Mobile Number": "12345" is not a 10-digit mobile number/);
    expect(reasons.I).toMatch(/"Current Student Strength": "lots" must be a whole number/);
    expect(r.skipped.map((s) => s.row)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("a Qualified row needs its opportunity category; other rows ignore it", async () => {
    const r = await importLeads(
      head,
      await filled([
        good({ schoolName: "Q no cat", status: "Qualified" }),
        good({ schoolName: "Q hot", mobile: "98765 00002", status: "Qualified", category: "Hot" }),
        good({ schoolName: "New with cat", mobile: "98765 00003", category: "Cold" }),
      ]),
    );
    expect(r.skipped).toEqual([{ row: 2, school: "Q no cat", reason: expect.stringMatching(/"Opportunity Category": choose Hot or Warm/) }]);
    expect(r.created.map((c) => c.school)).toEqual(["Q hot", "New with cat"]);
    const opp = await db.opportunity.findFirstOrThrow({ where: { schoolName: "Q hot" } });
    expect(opp.temperature).toBe("HOT");
    expect(await db.opportunity.count({ where: { schoolName: "New with cat" } })).toBe(0);
  });

  it("skips possible duplicates, in the database and within the file", async () => {
    await createLead(head, leadData(exA.id, { schoolName: "Tiny  TOTS", mobile: "+91 98765-00001" }));
    const r = await importLeads(head, await filled([good(), good({ schoolName: "New One", mobile: "90000 11111" }), good({ schoolName: "new one", mobile: "9000011111" })]));
    expect(r.created.map((c) => c.school)).toEqual(["New One"]);
    expect(r.skipped.map((s) => [s.row, s.reason.slice(0, 18)])).toEqual([
      [2, "Possible duplicate"],
      [4, "Possible duplicate"],
    ]);
  });

  it("reports the example row instead of importing it", async () => {
    const wb = await template();
    const ws = wb.getWorksheet(DATA_SHEET)!;
    COLUMNS.forEach((c, j) => (ws.getRow(3).getCell(j + 1).value = ((good() as Record<string, unknown>)[c.key] ?? null) as ExcelJS.CellValue));
    const r = await importLeads(head, (await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(r.skipped[0]).toMatchObject({ row: 2, reason: expect.stringMatching(/Example row/) });
    expect(r.created).toEqual([{ row: 3, school: "Tiny Tots" }]);
  });

  it("a sales executive can only upload leads assigned to themselves", async () => {
    const r = await importLeads(exA, await filled([good({ assignedTo: "Bala Exec" }), good({ schoolName: "Mine" })]));
    expect(r.created.map((c) => c.school)).toEqual(["Mine"]);
    expect(r.skipped[0].reason).toMatch(/only assign work to yourself/);
  });

  it("rejects files that aren't the template", async () => {
    const other = new ExcelJS.Workbook();
    other.addWorksheet("Sheet1").addRow(["Name", "Phone"]);
    await expect(importLeads(head, (await other.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow(/no "Leads" sheet/);

    const renamed = await template();
    renamed.getWorksheet(DATA_SHEET)!.getCell("A1").value = "School";
    await expect(importLeads(head, await filled([good()], renamed))).rejects.toThrow(/column 1 should be "School Name\*" but is "School"/);

    const extra = await template();
    extra.getWorksheet(DATA_SHEET)!.getCell(1, HEADERS.length + 1).value = "Notes";
    await expect(importLeads(head, await filled([good()], extra))).rejects.toThrow(/extra column "Notes"/);

    await expect(importLeads(head, Buffer.from("not a spreadsheet"))).rejects.toThrow(/couldn't be read/);
    await expect(importLeads(head, await filled([]))).rejects.toThrow(/no leads/);
  });
});

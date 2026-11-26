// R60: old sales records (the team's earlier daily sales report, "DSR") brought into the CRM as leads through the same
// Leads → Upload leads button. The file has an "Old records" sheet instead of the template's "Leads" sheet. Owner's
// rules: every row becomes a lead marked Contacted (no opportunities); a missing contact person shows "Not recorded"
// and a missing mobile stays blank (the rep fills it in later); no follow-up date and no to-do; the old visit and its
// discussion remark go into the school's history on the visit date. Admin / Director / Sales Head only.
import type ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { REF_SOURCES, SOURCES } from "@/lib/constants";
import { MOBILE_RE, normalizeMobile } from "@/lib/phone";
import { SALES_ROLES, seesAllSales, type SessionUser } from "@/lib/permissions";
import { DomainError } from "../errors";
import { ensureCity, getLocations } from "../locations";
import type { ImportResult } from "./import";

export const OLD_SHEET = "Old records";
export const NOT_RECORDED = "Not recorded";

export const OLD_COLUMNS = [
  { key: "schoolName", header: "School Name*", required: true },
  { key: "contactName", header: "Contact Person", required: false },
  { key: "mobile", header: "Mobile Number", required: false },
  { key: "state", header: "State*", required: true },
  { key: "city", header: "City*", required: true },
  { key: "area", header: "Area/Location", required: false },
  { key: "currentCurriculum", header: "Current Publication/Curriculum", required: false },
  { key: "studentStrength", header: "Current Student Strength", required: false },
  { key: "source", header: "Lead Source", required: false },
  { key: "referenceName", header: "Reference Name", required: false },
  { key: "assignedTo", header: "Assigned To*", required: true },
  { key: "visitDate", header: "Visit Date", required: false },
  { key: "remarks", header: "Remarks", required: false },
] as const;
type OldKey = (typeof OLD_COLUMNS)[number]["key"];
export const OLD_HEADERS = OLD_COLUMNS.map((c) => c.header);

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Finds the salesperson: the full name, or a first name that only one active salesperson has
 * ("Pramod" → "Pramod Patil"), ignoring capitals and extra spaces.
 */
export function matchPerson<T extends { name: string }>(people: T[], name: string): T | "many" | null {
  const n = norm(name);
  if (!n) return null;
  const full = people.filter((p) => norm(p.name) === n);
  if (full.length) return full.length > 1 ? "many" : full[0];
  const first = people.filter((p) => norm(p.name).split(" ")[0] === n);
  return first.length > 1 ? "many" : (first[0] ?? null);
}

export async function importOldRecords(
  user: SessionUser,
  sheet: ExcelJS.Worksheet,
  cellText: (v: ExcelJS.CellValue) => string,
  parseDate: (v: ExcelJS.CellValue) => string | null,
): Promise<ImportResult> {
  if (!seesAllSales(user.role)) throw new DomainError("Only Admin, Director or Sales Head can upload old records.");
  const found = OLD_HEADERS.map((_, i) => cellText(sheet.getRow(1).getCell(i + 1).value));
  const bad = OLD_HEADERS.findIndex((h, i) => found[i] !== h);
  if (bad >= 0)
    throw new DomainError(`The "${OLD_SHEET}" sheet's column ${bad + 1} should be "${OLD_HEADERS[bad]}" but is "${found[bad] || "(empty)"}".`);

  const rows: { row: number; values: Record<OldKey, ExcelJS.CellValue> }[] = [];
  sheet.eachRow({ includeEmpty: false }, (r, n) => {
    if (n === 1) return;
    const values = {} as Record<OldKey, ExcelJS.CellValue>;
    OLD_COLUMNS.forEach((c, i) => (values[c.key] = r.getCell(i + 1).value));
    if (OLD_COLUMNS.some((c) => cellText(values[c.key]) !== "")) rows.push({ row: n, values });
  });
  if (!rows.length) throw new DomainError("The file has no records in it.");
  if (rows.length > 2000) throw new DomainError(`The file has ${rows.length} rows; the limit is 2000 per upload.`);

  const [locations, people, existing] = await Promise.all([
    getLocations(),
    db.user.findMany({ where: { active: true, role: { in: [...SALES_ROLES] } }, select: { id: true, name: true } }),
    db.lead.findMany({ select: { id: true, schoolName: true, mobile: true, city: true } }),
  ]);
  // Same school twice: by name + mobile, or by name + city when there is no mobile. A repeat row in the file
  // (a later visit to the same school) adds its visit to the lead made from the first row.
  const key = (school: string, mobile: string, city: string) => `${norm(school)}|${mobile ? normalizeMobile(mobile).slice(-10) : `@${norm(city)}`}`;
  const before = new Set(existing.map((l) => key(l.schoolName, l.mobile, l.city)));
  const madeNow = new Map<string, string>();

  const result: ImportResult = { created: [], skipped: [], newCities: [] };
  for (const { row, values } of rows) {
    const t = Object.fromEntries(OLD_COLUMNS.map((c) => [c.key, cellText(values[c.key])])) as Record<OldKey, string>;
    const school = t.schoolName || "(no school name)";
    const skip = (reason: string) => result.skipped.push({ row, school, reason });

    const problems: string[] = [];
    for (const c of OLD_COLUMNS) if (c.required && !t[c.key]) problems.push(`"${c.header.replace(/\*$/, "")}" is required`);
    if (t.state && !locations.states.includes(t.state)) problems.push(`"State": "${t.state}" is not in the list of states`);
    const mobile = t.mobile ? normalizeMobile(t.mobile) : "";
    if (mobile && !MOBILE_RE.test(mobile)) problems.push(`"Mobile Number": "${t.mobile}" is not a 10-digit mobile number (leave it blank if not known)`);
    if (t.source && !(SOURCES as readonly string[]).includes(t.source)) problems.push(`"Lead Source": "${t.source}" is not an allowed value`);
    const strength = t.studentStrength ? Number(t.studentStrength) : null;
    if (t.studentStrength && !(Number.isInteger(strength) && strength! >= 0)) problems.push(`"Current Student Strength": "${t.studentStrength}" must be a whole number`);
    const visit = t.visitDate ? parseDate(values.visitDate) : null;
    if (t.visitDate && !visit) problems.push(`"Visit Date": "${t.visitDate}" is not a valid date (use DD/MM/YYYY)`);
    const person = matchPerson(people, t.assignedTo);
    if (t.assignedTo && person === "many") problems.push(`"Assigned To": more than one salesperson is called "${t.assignedTo}"; write the full name`);
    else if (t.assignedTo && !person) problems.push(`"Assigned To": no active salesperson called "${t.assignedTo}"`);
    if (problems.length) {
      skip(problems.join("; ") + ".");
      continue;
    }
    const rep = person as { id: string; name: string };
    const k = key(t.schoolName, mobile, t.city);
    if (before.has(k)) {
      skip("Already in the CRM (same school name and mobile, or same name and city when there is no mobile).");
      continue;
    }

    try {
      const city = await ensureCity(db, t.state, t.city);
      if (city.added) {
        result.newCities.push(`${city.name}, ${t.state}`);
        locations.cities[t.state]?.push(city.name);
      }
      const when = visit ? new Date(`${visit}T09:00:00+05:30`) : new Date();
      const summary = t.remarks || null;
      const leadId = await db.$transaction(async (tx) => {
        let id = madeNow.get(k);
        if (!id) {
          const lead = await tx.lead.create({
            data: {
              schoolName: t.schoolName,
              contactName: t.contactName || NOT_RECORDED,
              mobile,
              state: t.state,
              city: city.name,
              area: t.area || null,
              currentCurriculum: t.currentCurriculum || null,
              studentStrength: strength,
              source: t.source || null,
              referenceName: t.source && REF_SOURCES.includes(t.source) ? t.referenceName || null : null,
              remarks: summary,
              status: "CONTACTED",
              assignedToId: rep.id,
              createdById: user.id,
              // No follow-up for old records (owner, R60): no date, no to-do.
              nextFollowUpDate: null,
              createdAt: when,
            },
          });
          id = lead.id;
          await tx.activity.create({
            data: { type: "SYSTEM", subject: `Lead L-${lead.number} added from old records (DSR)`, byId: user.id, leadId: id },
          });
        } else if (summary) {
          const prev = await tx.lead.findUniqueOrThrow({ where: { id }, select: { remarks: true } });
          await tx.lead.update({ where: { id }, data: { remarks: [prev.remarks, summary].filter(Boolean).join("\n") } });
        }
        if (visit)
          await tx.activity.create({
            data: { type: "SITE_VISIT", subject: `School visit (old DSR) by ${rep.name}`, summary, occurredAt: when, byId: rep.id, leadId: id },
          });
        return id;
      });
      if (madeNow.has(k)) result.skipped.push({ row, school, reason: "Same school as an earlier row: its visit was added to that lead." });
      else {
        madeNow.set(k, leadId);
        result.created.push({ row, school: t.schoolName });
      }
    } catch (e) {
      if (e instanceof DomainError) skip(e.message);
      else throw e;
    }
  }
  return result;
}

// Reads an uploaded lead template and creates leads, re-checking every row from
// scratch: Excel's own dropdown rules can be bypassed (pasted values, other apps
// that drop validation), so they are never trusted.
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { REF_SOURCES } from "@/lib/constants";
import { fromDbDate, isDateStr } from "@/lib/dates";
import { SALES_ROLES, type SessionUser } from "@/lib/permissions";
import { DomainError } from "../errors";
import { createLead } from "../leads";
import { getLocations, locationProblem } from "../locations";
import { MOBILE_RE, normalizeMobile } from "@/lib/phone";
import {
  CATEGORY_BY_LABEL,
  COLUMNS,
  DATA_SHEET,
  EXAMPLE_SCHOOL,
  HEADERS,
  MAX_ROWS,
  STATUS_BY_LABEL,
  allowedValues,
  type Column,
  type ColumnKey,
} from "./columns";

export type ImportResult = {
  created: { row: number; school: string }[];
  skipped: { row: number; school: string; reason: string }[];
};

/** Plain text of any cell value exceljs can return. */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return fromDbDate(v);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v && typeof v.text === "string") return v.text.trim(); // hyperlinks, e.g. emails
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue); // formulas
    if ("error" in v) return "";
    return "";
  }
  return String(v).trim();
}

/** DD/MM/YYYY, D/M/YYYY, DD-MM-YYYY, YYYY-MM-DD, real Excel dates or serial numbers → YYYY-MM-DD. */
function parseDate(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : fromDbDate(v);
  if (typeof v === "number" && v > 0 && v < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    return fromDbDate(d);
  }
  if (typeof v === "object" && v && "result" in v) return parseDate(v.result as ExcelJS.CellValue);
  const s = cellText(v);
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isDateStr(iso) && fromDbDate(new Date(iso + "T00:00:00Z")) === iso ? iso : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m && isDateStr(s) && fromDbDate(new Date(s + "T00:00:00Z")) === s) return s;
  return null;
}

const label = (c: Column) => c.header.replace(/\*$/, "");
const normSchool = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const normMobile = (s: string) => s.replace(/\D/g, "").slice(-10);
const dupKey = (school: string, mobile: string) => `${normSchool(school)}|${normMobile(mobile)}`;

export async function importLeads(user: SessionUser, file: ArrayBuffer | Buffer): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file as ArrayBuffer);
  } catch {
    throw new DomainError("This file couldn't be read. Upload the .xlsx template downloaded from the Leads screen.");
  }
  const sheet = wb.getWorksheet(DATA_SHEET);
  if (!sheet) throw new DomainError(`This isn't the lead template: it has no "${DATA_SHEET}" sheet. Download the template and fill that in.`);

  // The header row must match the template exactly.
  const found = HEADERS.map((_, i) => cellText(sheet.getRow(1).getCell(i + 1).value));
  const extra = cellText(sheet.getRow(1).getCell(HEADERS.length + 1).value);
  const firstBad = HEADERS.findIndex((h, i) => found[i] !== h);
  if (firstBad >= 0)
    throw new DomainError(
      `The header row doesn't match the template: column ${firstBad + 1} should be "${HEADERS[firstBad]}" but is "${found[firstBad] || "(empty)"}". Download a fresh template and copy your rows into it.`,
    );
  if (extra) throw new DomainError(`The header row has an extra column "${extra}". Don't add columns to the template.`);

  // Collect non-empty rows.
  const rows: { row: number; values: Record<ColumnKey, ExcelJS.CellValue> }[] = [];
  sheet.eachRow({ includeEmpty: false }, (r, n) => {
    if (n === 1) return;
    const values = {} as Record<ColumnKey, ExcelJS.CellValue>;
    COLUMNS.forEach((c, i) => (values[c.key] = r.getCell(i + 1).value));
    if (COLUMNS.some((c) => cellText(values[c.key]) !== "")) rows.push({ row: n, values });
  });
  if (!rows.length) throw new DomainError("The file has no leads in it.");
  if (rows.length > MAX_ROWS) throw new DomainError(`The file has ${rows.length} rows; the limit is ${MAX_ROWS} per upload. Split it into smaller files.`);

  // Live lists, read once.
  const [locations, people, existing] = await Promise.all([
    getLocations(),
    db.user.findMany({ where: { active: true, role: { in: [...SALES_ROLES] } }, select: { id: true, name: true } }),
    db.lead.findMany({ select: { schoolName: true, mobile: true } }),
  ]);
  const allowed = allowedValues({ ...locations, assignees: people.map((p) => p.name) });
  const seen = new Set(existing.map((l) => dupKey(l.schoolName, l.mobile)));

  const result: ImportResult = { created: [], skipped: [] };
  for (const { row, values } of rows) {
    const text = Object.fromEntries(COLUMNS.map((c) => [c.key, cellText(values[c.key])])) as Record<ColumnKey, string>;
    const school = text.schoolName || "(no school name)";
    const skip = (reason: string) => result.skipped.push({ row, school, reason });

    if (text.schoolName === EXAMPLE_SCHOOL) {
      skip("Example row from the template — not imported.");
      continue;
    }

    const problems: string[] = [];
    const qualified = STATUS_BY_LABEL[text.status] === "QUALIFIED";
    for (const c of COLUMNS) if (c.required && !text[c.key]) problems.push(`"${label(c)}" is required`);
    for (const c of COLUMNS) {
      if (!c.list || c.list === "city" || !text[c.key]) continue;
      // The category only matters on a Qualified row; elsewhere it is ignored, whatever it says.
      if (c.list === "category" && !qualified) continue;
      if (!allowed[c.list].includes(text[c.key])) problems.push(`"${label(c)}": "${text[c.key]}" is not an allowed value`);
    }
    if (text.state && text.city && allowed.state.includes(text.state)) {
      const p = locationProblem(locations, text.state, text.city);
      if (p) problems.push(`"City": ${p.replace(/\.$/, "")}`);
    }
    if (text.mobile && !MOBILE_RE.test(normalizeMobile(text.mobile))) problems.push(`"Mobile Number": "${text.mobile}" is not a 10-digit mobile number`);
    for (const c of COLUMNS.filter((c) => c.kind === "int"))
      if (text[c.key] && !(/^\d+$/.test(text[c.key]) && Number(text[c.key]) >= (c.min ?? 0)))
        problems.push(`"${label(c)}": "${text[c.key]}" must be a whole number of at least ${c.min ?? 0}`);
    const date = text.nextFollowUpDate ? parseDate(values.nextFollowUpDate) : null;
    if (text.nextFollowUpDate && !date) problems.push(`"Next Follow-up Date": "${text.nextFollowUpDate}" is not a valid date (use DD/MM/YYYY)`);
    if (qualified && !text.category) problems.push(`"Opportunity Category": choose Hot or Warm for a Qualified lead`);
    const matches = people.filter((p) => p.name === text.assignedTo);
    if (text.assignedTo && matches.length > 1) problems.push(`"Assigned To": more than one active user is called "${text.assignedTo}"`);

    if (problems.length) {
      skip(problems.join("; ") + ".");
      continue;
    }

    const key = dupKey(text.schoolName, text.mobile);
    if (seen.has(key)) {
      skip("Possible duplicate: a lead with this school name and mobile number already exists.");
      continue;
    }

    try {
      await createLead(user, {
        schoolName: text.schoolName,
        contactName: text.contactName,
        designation: text.designation || null,
        mobile: text.mobile,
        email: text.email || null,
        state: text.state,
        city: text.city,
        area: text.area || null,
        address: text.address || null,
        currentCurriculum: text.currentCurriculum || null,
        studentStrength: text.studentStrength || null,
        branches: text.branches || null,
        source: text.source,
        referenceName: REF_SOURCES.includes(text.source) ? text.referenceName || null : null,
        interests: [],
        status: text.status ? STATUS_BY_LABEL[text.status] : "NEW",
        // The category belongs to the opportunity, so it's only used for Qualified rows.
        temperature: qualified ? CATEGORY_BY_LABEL[text.category] : null,
        assignedToId: matches[0].id,
        nextFollowUpDate: date!,
        followUpType: text.followUpType || null,
        followUpRemark: text.followUpRemark || null,
      });
      seen.add(key);
      result.created.push({ row, school: text.schoolName });
    } catch (e) {
      // Same rules as a lead added on screen, e.g. a Sales Executive assigning to someone else.
      if (e instanceof DomainError) skip(e.message);
      else throw e;
    }
  }
  return result;
}

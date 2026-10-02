// Builds the lead upload template on demand, from the live column list,
// constants, Settings → Locations and active users.
import ExcelJS from "exceljs";
import { addDays, todayIST } from "@/lib/dates";
import { COLUMNS, DATA_SHEET, EXAMPLE_SCHOOL, MAX_ROWS, allowedValues, type ListKey, type LiveLists } from "./columns";

const LISTS_SHEET = "Lists";
const LAST_ROW = MAX_ROWS + 1; // header + data rows
const colLetter = (n: number) => {
  let s = "";
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const listName = (key: string) => `L_${key}`;

const STOP = { showErrorMessage: true, errorStyle: "stop" as const, allowBlank: true };

export async function buildLeadTemplate(live: LiveLists): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wonder Learning CRM";
  wb.created = new Date();

  const sheet = wb.addWorksheet(DATA_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  const readMe = wb.addWorksheet("Read me");
  const lists = wb.addWorksheet(LISTS_SHEET);
  lists.state = "veryHidden"; // only reachable through the validation rules

  /* ---- Lists sheet: one named range per dropdown ---- */
  const values = allowedValues(live);
  let col = 0;
  const addList = (name: string, title: string, items: readonly string[]) => {
    const letter = colLetter(col++);
    lists.getCell(`${letter}1`).value = title;
    items.forEach((v, i) => (lists.getCell(`${letter}${i + 2}`).value = v));
    // An empty list still needs a range; it points at one blank cell so nothing can be chosen.
    const end = Math.max(items.length, 1) + 1;
    wb.definedNames.add(`${LISTS_SHEET}!$${letter}$2:$${letter}$${end}`, name);
  };
  for (const [key, items] of Object.entries(values)) addList(listName(key), key, items);

  // Dependent City list: one named range per state, plus a State → range-name lookup.
  // Range names are generated (City_1, City_2…) because state names may contain
  // spaces or symbols that aren't allowed in Excel names.
  const mapLetter = colLetter(col++);
  const mapValueLetter = colLetter(col++);
  lists.getCell(`${mapLetter}1`).value = "State";
  lists.getCell(`${mapValueLetter}1`).value = "City list";
  live.states.forEach((state, i) => {
    const name = `City_${i + 1}`;
    addList(name, state, live.cities[state] ?? []);
    lists.getCell(`${mapLetter}${i + 2}`).value = state;
    lists.getCell(`${mapValueLetter}${i + 2}`).value = name;
  });
  wb.definedNames.add(
    `${LISTS_SHEET}!$${mapLetter}$2:$${mapValueLetter}$${Math.max(live.states.length, 1) + 1}`,
    "L_StateMap",
  );

  /* ---- Data sheet ---- */
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const header = sheet.getRow(1);
  header.height = 32;
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.font = { bold: true, color: { argb: c.required ? "FF3D3BA8" : "FF1D1A3B" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? "FFECEBFB" : "FFF9F8FD" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    if (c.note) cell.note = c.note;
  });

  // exceljs supports range-wide validation at runtime but its type definitions omit it.
  const validations = (sheet as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } })
    .dataValidations;
  const stateCol = colLetter(COLUMNS.findIndex((c) => c.key === "state"));
  COLUMNS.forEach((c, i) => {
    const letter = colLetter(i);
    const range = `${letter}2:${letter}${LAST_ROW}`;
    const column = sheet.getColumn(i + 1);
    if (c.kind === "date") {
      column.numFmt = "dd/mm/yyyy";
      validations.add(range, {
        ...STOP,
        type: "date",
        operator: "greaterThan",
        formulae: [new Date(Date.UTC(2000, 0, 1))],
        errorTitle: "Date needed",
        error: "Enter a date as DD/MM/YYYY.",
      });
    } else if (c.kind === "int") {
      validations.add(range, {
        ...STOP,
        type: "whole",
        operator: "greaterThanOrEqual",
        formulae: [c.min ?? 0],
        errorTitle: "Whole number needed",
        error: `Enter a whole number of at least ${c.min ?? 0}.`,
      });
    } else if (c.list === "city") {
      validations.add(range, {
        ...STOP,
        type: "list",
        // Relative to the first cell of the range: each row looks up its own State.
        formulae: [`INDIRECT(VLOOKUP($${stateCol}2,L_StateMap,2,FALSE))`],
        errorTitle: "Choose a listed city",
        error: "Pick the State first, then a city from the list. New cities are added in the CRM under Settings → Locations.",
      });
    } else if (c.list) {
      validations.add(range, {
        ...STOP,
        type: "list",
        formulae: [listName(c.list as Exclude<ListKey, "city">)],
        errorTitle: "Choose from the list",
        error: `${c.header.replace("*", "")} must be one of the values in the dropdown.`,
      });
    } else {
      column.numFmt = "@"; // keep mobile numbers etc. as typed
    }
  });

  /* ---- Example row ---- */
  const exampleState = live.states.find((s) => (live.cities[s] ?? []).length) ?? "";
  const example: Record<string, string | number | Date> = {
    schoolName: EXAMPLE_SCHOOL,
    contactName: "Priya Sharma",
    designation: values.designation[0] ?? "",
    mobile: "98220 12345",
    email: "owner@example.com",
    state: exampleState,
    city: exampleState ? live.cities[exampleState][0] : "",
    area: "Near main market",
    address: "",
    currentCurriculum: "Own books",
    studentStrength: 80,
    branches: 1,
    source: values.source[0] ?? "",
    referenceName: "",
    status: values.status[0] ?? "",
    category: "", // only for Qualified rows
    assignedTo: live.assignees[0] ?? "",
    nextFollowUpDate: new Date(addDays(todayIST(), 1) + "T00:00:00Z"),
    followUpType: values.followUpType[0] ?? "",
    followUpRemark: "Send brochure",
  };
  const ex = sheet.addRow(example);
  ex.font = { italic: true, color: { argb: "FF9A97B5" } };
  ex.getCell(1).note = "Example only — delete this row before uploading. (If left in, the upload skips it.)";

  /* ---- Read me ---- */
  readMe.getColumn(1).width = 110;
  const lines: [string, boolean?][] = [
    ["How to fill in this sheet", true],
    [""],
    [`1. Enter one lead per row on the "${DATA_SHEET}" tab, starting on row 3. Row 2 is a grey example — delete it.`],
    ["2. Columns with * are required: School Name, Owner/Contact Person Name, Mobile Number, State, City, Lead Source, Assigned To, Next Follow-up Date."],
    ["3. Columns with a dropdown only accept values from their list. Choose the State before the City — the City list follows the State on that row."],
    ["4. Dates must be DD/MM/YYYY (for example 25/12/2026)."],
    ["5. Lead Status blank = New. Choosing Qualified turns the lead into an opportunity straight away, so a Qualified row also needs its Opportunity Category (Hot, Warm or Cold). Leave the category blank for New or Contacted leads."],
    ["6. Assigned To is the salesperson who will work the lead (not the school's owner). Sales Executives and Managers can only assign leads to themselves."],
    ["7. Don't rename, move or add columns, and don't change the header row — the upload checks it exactly."],
    [`8. Up to ${MAX_ROWS} leads per file. Save as .xlsx, then use "Upload leads" on the Leads screen.`],
    [""],
    ["What the upload does", true],
    ["• Every row is checked again by the CRM, even if the dropdowns were bypassed."],
    ["• A row with the same School Name and Mobile Number as an existing lead is skipped as a possible duplicate."],
    ["• Each new lead gets its first follow-up task automatically, exactly like a lead added on screen."],
    ["• Afterwards you see how many leads were created and the reason for every row that was skipped."],
    [""],
    ["Lists in this file", true],
    [`Made on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. States, cities and people come from the CRM at that moment — download a fresh template if they have changed.`],
  ];
  lines.forEach(([text, bold], i) => {
    const cell = readMe.getCell(`A${i + 1}`);
    cell.value = text;
    cell.alignment = { wrapText: true };
    if (bold) cell.font = { bold: true, size: 13 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

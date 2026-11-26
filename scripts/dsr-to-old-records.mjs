// R60: converts the team's old daily sales report (DSR, sheet "Field Visit Report") into the CRM's "Old records"
// upload file, plus a check list of rows with missing details.
// Usage: node scripts/dsr-to-old-records.mjs <DSR.xlsx> <Old-records.xlsx> <Check-list.xlsx>
// Then upload <Old-records.xlsx> in Leads → Upload leads (Admin / Sales Head). Rules: src/server/lead-excel/old-records.ts.
import ExcelJS from "exceljs";
const val = (v) => (v && typeof v === "object" ? (v instanceof Date ? v : v.result !== undefined ? v.result : v.text ?? (v.richText ? v.richText.map((r) => r.text).join("") : "")) : v);
const s = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x ?? "").replace(/\s+/g, " ").trim());
const title = (x) => s(x).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const nd = (x) => (/^(nd|-|na|n\/a)$/i.test(s(x)) ? "" : s(x));
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const CITY = { "navi mumbai": ["Maharashtra", "Navi Mumbai"], pune: ["Maharashtra", "Pune"], mumbai: ["Maharashtra", "Mumbai"], thane: ["Maharashtra", "Thane"], kalyan: ["Maharashtra", "Kalyan"], nashik: ["Maharashtra", "Nashik"], kolhapur: ["Maharashtra", "Kolhapur"], ahmedabad: ["Gujarat", "Ahmedabad"], varodara: ["Gujarat", "Vadodara"], vadodara: ["Gujarat", "Vadodara"], surat: ["Gujarat", "Surat"] };
const SOURCE = (x) => {
  const k = s(x).toLowerCase();
  if (!k) return ["", ""];
  if (k === "google") return ["Google", ""];
  if (/whatsapp/.test(k)) return ["WhatsApp", ""];
  if (/self|direct visit|call and visit/.test(k)) return ["Direct School Visit", ""];
  if (/just ?dial/.test(k)) return ["Other", ""];
  return ["Reference", s(x)]; // Viren Sir, Amod Kalamkar …
};
const CAT = (x) => ({ cold: "Cold", clod: "Cold", "very cold": "Very cold", warm: "Warm", worm: "Warm", hot: "Hot", won: "Won", "done'": "Deal done", "deal done": "Deal done" })[s(x).toLowerCase()] ?? s(x);
(async () => {
  const [, , inFile, outFile, reportFile] = process.argv;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(inFile);
  const ws = wb.getWorksheet("Field Visit Report");
  const out = []; const notes = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const v = r.values.slice(1).map(val);
    if (!s(v[3])) { if (v.some((x) => s(x))) notes.push([n, "(no school name)", "Not imported: no school name"]); return; }
    let cityKey = s(v[5]).toLowerCase(), area = s(v[4]);
    if (cityKey === "gujrat") { cityKey = area.toLowerCase(); area = ""; }
    const loc = CITY[cityKey];
    const digits = s(v[7]).replace(/\D/g, "").replace(/^(91|0)(\d{10})$/, "$2");
    const mobile = /^[6-9]\d{9}$/.test(digits) ? digits : "";
    const [source, ref] = SOURCE(v[18]);
    const str = nd(v[10]); const strength = /\d/.test(str) ? String(Math.max(...str.match(/\d+/g).map(Number))) : "";
    const visit = s(v[2]).slice(0, 10), call = s(v[13]).slice(0, 10), fu = s(v[16]).slice(0, 10);
    const bits = [
      "Old DSR",
      s(v[1]) && `Rep: ${title(v[1])}`,
      nd(v[9]) && `Program: ${s(v[9]).replace(/\s*-\s*/g, "-").replace(/\s+/g, "-")}`,
      nd(v[11]) && `Fees: ${s(v[11])}`,
      str && str !== strength && `Strength: ${str}`,
      call && `Called: ${dmy(call)}`,
      fu && `Follow-up visit was: ${dmy(fu)}`,
      s(v[15]) && `Category then: ${CAT(v[15])}`,
      s(v[17]) && `Client type: ${title(v[17])}`,
      /just ?dial/i.test(s(v[18])) && "Source: Just Dial",
      !mobile && s(v[7]) && `Mobile in DSR: ${s(v[7])}`,
    ].filter(Boolean).join(" · ");
    const remark = s(v[14]);
    out.push({
      schoolName: s(v[3]), contactName: s(v[6]), mobile, state: loc?.[0] ?? "", city: loc?.[1] ?? title(v[5]), area,
      currentCurriculum: nd(v[12]), studentStrength: strength, source, referenceName: ref, assignedTo: title(v[1]),
      visitDate: visit ? new Date(visit + "T00:00:00Z") : null, remarks: remark ? `${bits}\n${remark}` : bits, _row: n,
    });
    if (!loc) notes.push([n, s(v[3]), `City "${s(v[5])}" not recognised: fill State and City`]);
    if (!mobile) notes.push([n, s(v[3]), "Mobile not recorded: imported blank, rep to add"]);
    if (!s(v[6])) notes.push([n, s(v[3]), "Contact person not recorded"]);
  });
  const owb = new ExcelJS.Workbook();
  const sh = owb.addWorksheet("Old records", { views: [{ state: "frozen", ySplit: 1 }] });
  const cols = [["School Name*", "schoolName", 30], ["Contact Person", "contactName", 24], ["Mobile Number", "mobile", 14], ["State*", "state", 14], ["City*", "city", 14], ["Area/Location", "area", 18], ["Current Publication/Curriculum", "currentCurriculum", 20], ["Current Student Strength", "studentStrength", 12], ["Lead Source", "source", 18], ["Reference Name", "referenceName", 16], ["Assigned To*", "assignedTo", 14], ["Visit Date", "visitDate", 12], ["Remarks", "remarks", 70]];
  sh.columns = cols.map(([header, key, width]) => ({ header, key, width }));
  sh.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sh.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6C2D91" } };
  for (const o of out) sh.addRow(o);
  sh.getColumn("visitDate").numFmt = "dd/mm/yyyy";
  sh.getColumn("mobile").numFmt = "@";
  sh.getColumn("remarks").alignment = { wrapText: true, vertical: "top" };
  const rd = owb.addWorksheet("Read me");
  rd.getColumn(1).width = 110;
  ["Old records from the DSR (Field Visit Report), ready for the CRM: Leads → Upload leads → choose this file.",
   "Admin, Director or Sales Head uploads it. Every school becomes a lead marked Contacted, assigned to the rep in 'Assigned To'.",
   "No follow-up date and no to-do is created. The visit and discussion remark go into the school's history on the visit date.",
   "Blank contact person shows 'Not recorded'; blank mobile stays blank: the rep adds it with Edit on the lead.",
   "Program, fee structure, call date, Hot/Warm/Cold, client type are kept in Remarks.",
   "Assigned To: first name is enough when only one active salesperson has it; a rep who is not a CRM user yet: add the user first, or change the name.",
   "Don't change the column headings. The sheet must stay named 'Old records'.",
  ].forEach((t) => rd.addRow([t]));
  await owb.xlsx.writeFile(outFile);
  const rb = new ExcelJS.Workbook(); const rs = rb.addWorksheet("Check list"); rs.columns = [{ header: "DSR row", width: 9 }, { header: "School", width: 36 }, { header: "Note", width: 70 }];
  rs.getRow(1).font = { bold: true }; notes.forEach((x) => rs.addRow(x)); await rb.xlsx.writeFile(reportFile);
  const by = {}; out.forEach((o) => (by[o.assignedTo] = (by[o.assignedTo] || 0) + 1));
  console.log("rows", out.length, "by rep", JSON.stringify(by), "notes", notes.length, "no state", out.filter((o) => !o.state).length, "no mobile", out.filter((o) => !o.mobile).length);
})();

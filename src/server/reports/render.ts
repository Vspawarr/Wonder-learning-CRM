// Renders a Report to an Excel workbook or a PDF (landscape A4 tables).
import ExcelJS from "exceljs";
import { fmtDateTimeIST } from "@/lib/dates";
import { renderReportPdf } from "./pdf";
import type { Report } from "./types";

export const reportFileName = (r: Report, ext: "pdf" | "xlsx") =>
  `${r.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${new Date().toISOString().slice(0, 10)}.${ext}`;

const BRAND = "FF3D3BA8";

export async function reportXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wonder Learning CRM";
  const ws = wb.addWorksheet(r.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "), {
    pageSetup: { orientation: r.landscape === false ? "portrait" : "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const widest = Math.max(...r.sections.map((s) => s.columns.length), 1);
  const titleRow = ws.addRow([r.title]);
  titleRow.font = { bold: true, size: 14, color: { argb: BRAND } };
  ws.mergeCells(titleRow.number, 1, titleRow.number, widest);
  const sub = ws.addRow([`${r.subtitle ? `${r.subtitle} · ` : ""}Exported ${fmtDateTimeIST(new Date())}`]);
  sub.font = { italic: true, color: { argb: "FF666666" } };
  ws.mergeCells(sub.number, 1, sub.number, widest);

  const widths: number[] = [];
  for (const s of r.sections) {
    ws.addRow([]);
    if (s.heading) {
      const h = ws.addRow([s.heading]);
      h.font = { bold: true, size: 12 };
    }
    const head = ws.addRow(s.columns.map((c) => c.header));
    head.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    const put = (values: Record<string, unknown>, bold = false) => {
      const row = ws.addRow(s.columns.map((c) => values[c.key] ?? null));
      s.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (c.kind === "money") cell.numFmt = '"₹"#,##,##0.00';
        if (c.kind === "money" || c.kind === "number") cell.alignment = { horizontal: "right" };
        if (bold) cell.font = { bold: true };
      });
      return row;
    };
    if (!s.rows.length) ws.addRow([s.empty ?? "Nothing to show."]).font = { italic: true, color: { argb: "FF888888" } };
    for (const row of s.rows) put(row);
    if (s.totals) {
      const t = put(s.totals, true);
      t.eachCell((cell) => (cell.border = { top: { style: "thin" } }));
    }
    s.columns.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 10, c.width ?? (c.kind === "money" ? 15 : 18))));
  }
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function reportPdf(r: Report): Promise<Buffer> {
  return renderReportPdf(r, fmtDateTimeIST(new Date()));
}

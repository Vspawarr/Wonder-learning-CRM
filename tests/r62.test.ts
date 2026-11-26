// R62: Preview opens PDFs / files in the CRM's viewer on phones and in the Android app.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PREVIEWABLE, needsViewer, safeFileSrc, viewerHref } from "@/lib/file-preview";

describe("file preview", () => {
  it("only opens the CRM's own files", () => {
    expect(safeFileSrc("/api/quotations/abc123/pdf")).toBe("/api/quotations/abc123/pdf");
    expect(safeFileSrc("/api/products/checklist?ids=a1")).toBe("/api/products/checklist?ids=a1");
    for (const bad of ["https://evil.example/x.pdf", "//evil.example/x", "/api/../secret", "/dashboard", "javascript:alert(1)", "/api/x\"onload", "", null])
      expect(safeFileSrc(bad)).toBeNull();
  });

  it("uses the viewer on phones and in the app, not on computers", () => {
    expect(needsViewer("Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/120 Mobile Safari/537.36")).toBe(true);
    expect(needsViewer("Mozilla/5.0 (Linux; Android 14; wv) Chrome/120 Mobile Safari/537.36 WonderCRMApp/1.0")).toBe(true);
    expect(needsViewer("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")).toBe(true);
    expect(needsViewer("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36")).toBe(false);
    expect(viewerHref("/api/invoices/x/pdf")).toBe("/view?src=%2Fapi%2Finvoices%2Fx%2Fpdf");
  });

  it("sends previews to the viewer, but not exports, templates or backups", () => {
    for (const ok of ["/api/quotations/a1/pdf", "/api/quotations/a1/po-template", "/api/quotations/a1/received-po", "/api/sales-orders/a1/po", "/api/sales-orders/a1/proforma", "/api/invoices/a1/pdf", "/api/credit-notes/a1/pdf", "/api/payments/a1/receipt", "/api/dispatches/a1/challan", "/api/products/checklist", "/api/files/a1", "/api/company/files/bill/a1", "/api/expenses/files/a1", "/api/marketing/a1"])
      expect(PREVIEWABLE.test(ok), ok).toBe(true);
    for (const no of ["/api/export/leads", "/api/leads/template", "/api/admin/backup", "/api/version", "/api/quotations/a1", "/view"]) expect(PREVIEWABLE.test(no), no).toBe(false);
  });

  it("the PDF reader's helper file in public/ matches the installed library", () => {
    expect(readFileSync("public/pdfjs/pdf.worker.min.mjs").equals(readFileSync("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs")), "copy node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs to public/pdfjs/").toBe(true);
  });
});

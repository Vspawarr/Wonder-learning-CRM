import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { convertToClient } from "@/server/clients";
import { clientLedger, financialYear, ledgerSummary, resolvePeriod } from "@/server/finance/ledger";
import { cancelInvoice, createInvoice, createSalesOrder, recordPayment } from "@/server/finance/service";
import { convertLead, createLead } from "@/server/leads";
import { moveOpportunity } from "@/server/opportunities";
import { REPORTS, buildReport } from "@/server/reports";
import { reportPdf, reportXlsx } from "@/server/reports/render";
import { leadData, makeUser, resetData } from "./helpers";

const today = todayIST();
let exA: SessionUser, exB: SessionUser, head: SessionUser, clientId: string;

beforeEach(async () => {
  await resetData();
  exA = await makeUser("SALES_EXECUTIVE");
  exB = await makeUser("SALES_EXECUTIVE");
  head = await makeUser("SALES_HEAD");
  const opp = await convertLead(exA, await createLead(exA, leadData(exA.id, { schoolName: "Little Stars" })), { temperature: "HOT" });
  await moveOpportunity(exA, opp, { stage: "WON" });
  clientId = await convertToClient(exA, opp);
});

async function invoiceOf(amount: number, date = today) {
  const so = await createSalesOrder(exA, clientId, { date, items: [{ description: "Kit", qty: 1, price: amount, gstRate: 0 }] });
  return createInvoice(exA, so, { date, dueDate: addDays(date, 45) });
}
const pay = (amount: number, date = today) => ({ amount, date, mode: "UPI" });

describe("ledger", () => {
  it("uses the April–March financial year", () => {
    expect(financialYear("2026-10-01")).toMatchObject({ from: "2026-04-01", to: "2027-03-31", label: "FY 2026-27" });
    expect(financialYear("2027-02-10").from).toBe("2026-04-01");
    expect(resolvePeriod({ period: "lastfy" }, "2026-10-01")).toMatchObject({ from: "2025-04-01", to: "2026-03-31" });
    expect(resolvePeriod({ period: "month" }, "2026-02-14")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolvePeriod({ period: "custom", from: "2026-05-01", to: "2026-04-01" }, "2026-10-01").key).toBe("fy");
  });

  it("debits invoices, credits payments, keeps a running balance and skips cancelled invoices", async () => {
    const a = await invoiceOf(100000);
    const b = await invoiceOf(50000);
    await recordPayment(exA, a, pay(40000));
    await recordPayment(exA, a, pay(60000));
    await cancelInvoice(head, b);
    await invoiceOf(25000);
    const l = await clientLedger(exA, clientId, financialYear(today));
    expect(l.opening).toBe(0);
    expect(l.entries.map((e) => [e.kind, e.debit, e.credit, e.balance])).toEqual([
      ["INVOICE", 100000, 0, 100000],
      ["INVOICE", 25000, 0, 125000],
      ["PAYMENT", 0, 40000, 85000],
      ["PAYMENT", 0, 60000, 25000],
    ]);
    expect(l).toMatchObject({ debit: 125000, credit: 100000, closing: 25000 });
    await expect(clientLedger(exB, clientId, financialYear(today))).rejects.toThrow(/not found/);
  });

  it("carries earlier entries into the opening balance", async () => {
    const a = await invoiceOf(80000);
    await recordPayment(exA, a, pay(30000));
    const later = { from: addDays(today, 1), to: addDays(today, 30), label: "x" };
    const l = await clientLedger(exA, clientId, later);
    expect(l).toMatchObject({ opening: 50000, debit: 0, credit: 0, closing: 50000, entries: [] });
    const s = await ledgerSummary(head, later);
    expect(s.rows).toHaveLength(1);
    expect(s.totals).toMatchObject({ opening: 50000, closing: 50000 });
    expect((await ledgerSummary(exB, later)).rows).toHaveLength(0);
  });
});

describe("exports", () => {
  it("every report renders to PDF and Excel", async () => {
    const a = await invoiceOf(90000);
    await recordPayment(exA, a, pay(10000));
    for (const name of Object.keys(REPORTS)) {
      const params = name === "ledger" ? { client: clientId } : {};
      const r = await buildReport(head, name, params);
      expect(r.sections.length).toBeGreaterThan(0);
      const pdf = await reportPdf(r);
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await reportXlsx(r)) as unknown as ArrayBuffer);
      expect(wb.worksheets[0].getCell(1, 1).value).toBe(r.title);
    }
  });

  it("exports respect the same access as the screens", async () => {
    await invoiceOf(90000);
    const mine = await buildReport(exB, "outstanding", {});
    expect(mine.sections[1].rows).toHaveLength(0);
    const all = await buildReport(head, "outstanding", {});
    expect(all.sections[1].rows).toHaveLength(1);
    await expect(buildReport(head, "nope", {})).rejects.toThrow(/not found/);
  });
});

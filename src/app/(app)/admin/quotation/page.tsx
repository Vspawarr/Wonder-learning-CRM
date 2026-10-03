import { PageHeader } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { financialYear } from "@/lib/fy";
import { requireSettingsAdmin } from "@/server/session";
import { getQuotationContent } from "@/server/quotation/content";
import { getDocumentSettings } from "@/server/documents";
import { QuotationSettingsForm } from "./form";
import { DocumentSettingsForm } from "./documents-form";

export const metadata = { title: "Documents" };

export default async function DocumentsSettingsPage() {
  await requireSettingsAdmin();
  const fy = financialYear(todayIST());
  const [content, docs, lastReceipt, pos] = await Promise.all([
    getQuotationContent(),
    getDocumentSettings(),
    db.payment.aggregate({ where: fy.months, _max: { seq: true } }),
    db.quotation.findMany({ where: { poNumber: { startsWith: `PO/${fy.compact}/` } }, select: { poNumber: true } }),
  ]);
  const lastPo = Math.max(0, ...pos.map((p) => Number(p.poNumber!.split("/").pop()) || 0));
  return (
    <>
      <PageHeader title="Documents" sub="The text and settings printed on quotations, PO templates and receipts. Changes apply to every document from now on.">
        <a className="btn" href="/api/quotations/sample" target="_blank" rel="noreferrer">
          Preview sample quotation
        </a>
        <a className="btn" href="/api/products/checklist" target="_blank" rel="noreferrer">
          Kit checklist
        </a>
      </PageHeader>
      <Tabs
        tabs={[
          { id: "quotation", label: "Quotation", panel: <QuotationSettingsForm initial={content} /> },
          {
            id: "po-receipt",
            label: "PO template, receipt & numbering",
            panel: <DocumentSettingsForm initial={docs} fy={fy.label} used={{ receipt: lastReceipt._max.seq ?? 0, po: lastPo }} />,
          },
        ]}
      />
    </>
  );
}

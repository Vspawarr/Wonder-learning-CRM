import { PageHeader } from "@/components/ui";
import { requireSettingsAdmin } from "@/server/session";
import { getQuotationContent } from "@/server/quotation/content";
import { QuotationSettingsForm } from "./form";

export const metadata = { title: "Quotation" };

export default async function QuotationSettingsPage() {
  await requireSettingsAdmin();
  const content = await getQuotationContent();
  return (
    <>
      <PageHeader title="Quotation" sub="The standard text printed on every quotation. Changes apply to all quotations from now on, including when an older one is viewed again.">
        <a className="btn" href="/api/quotations/sample" target="_blank" rel="noreferrer">
          Preview sample PDF
        </a>
      </PageHeader>
      <QuotationSettingsForm initial={content} />
    </>
  );
}

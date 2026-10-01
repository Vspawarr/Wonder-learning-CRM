import { PageHeader } from "@/components/ui";
import { requireSettingsAdmin } from "@/server/session";
import { keptCounts, testDataCounts } from "@/server/reset";
import { ClearDataForm } from "./form";

export const metadata = { title: "Clear test data" };

export default async function ClearDataPage() {
  await requireSettingsAdmin();
  const [gone, kept] = await Promise.all([testDataCounts(), keptCounts()]);
  const goneRows: [string, number][] = [
    ["Leads", gone.leads],
    ["Opportunities", gone.opportunities],
    ["Quotations", gone.quotations],
    ["Clients (with their contacts and documents)", gone.clients],
    ["Purchase orders & sales orders (with dispatches)", gone.salesOrders],
    ["Invoices (with credit notes)", gone.invoices],
    ["Payments & receipts", gone.payments],
    ["To-dos & follow-ups", gone.tasks],
    ["Activity / interaction history", gone.activities],
    ["Monthly targets", gone.targets],
  ];
  const keptRows: [string, number | string][] = [
    ["User logins & passwords", kept.users],
    ["Products & prices", kept.products],
    ["States & cities", `${kept.states} / ${kept.cities}`],
    ["Quotation template, feature switches & other settings", kept.settings],
    ["PO template, invoice/receipt/challan formats, Excel upload template", "built in"],
  ];
  return (
    <>
      <PageHeader
        title="Clear test data"
        sub="Use this once testing is over, so the team starts with an empty CRM. Logins, products and templates stay."
      />
      <div className="grid grid-cols-1 gap-4 min-[901px]:grid-cols-2">
        <div className="card">
          <h2 className="text-coral">Will be deleted</h2>
          {goneRows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line py-2 last:border-0">
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
          <p className="small muted mt-3">Numbering starts again from the beginning: L-1001, O-2001, C-101, and /001 for quotations, orders, invoices and receipts.</p>
        </div>
        <div className="card">
          <h2 className="text-mint">Will be kept</h2>
          {keptRows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line py-2 last:border-0">
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
      </div>
      <ClearDataForm empty={Object.values(gone).every((n) => n === 0)} />
    </>
  );
}

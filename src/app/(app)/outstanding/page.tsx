import { ExportButtons } from "@/components/export-buttons";
import Link from "next/link";
import { seesAllSales } from "@/lib/permissions";
import { dmy, inr, inrExact as money } from "@/lib/format";
import { AvatarName, Empty, Kpi, PageHeader, Table } from "@/components/ui";
import { outstandingList } from "@/server/finance/service";
import { isEmailConfigured } from "@/server/mailer";
import { assignees } from "@/server/queries";
import { requireUser } from "@/server/session";
import { InvoiceButtons, InvoiceStatePill } from "../clients/[id]/finance";
import { OutstandingFilterBar } from "./filters";

export const metadata = { title: "Outstanding" };

export default async function OutstandingPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string; owner?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const all = seesAllSales(user.role);
  const [{ all: rows, shown, summary: sum }, owners] = await Promise.all([outstandingList(user, sp), all ? assignees(user) : Promise.resolve(null)]);
  const emailReady = isEmailConfigured();
  const me = { name: user.name };
  const empty = rows.length ? "No invoices match these filters." : "No invoices yet. Raise one from a client's sales order.";

  return (
    <>
      <PageHeader title="Outstanding" sub={`${all ? "" : "Your clients only. "}Invoices, payments received and what is still to collect.`}>
        <ExportButtons report="outstanding" />
      </PageHeader>
      <div className="kgrid kgrid-2 mb-4">
        <Kpi label="Invoiced" value={inr(sum.invoiced)} color="#1C86C4" />
        <Kpi label="Received" value={inr(sum.received)} color="#0E8F79" />
        <Kpi label="Outstanding" value={inr(sum.outstanding)} sub="Still to collect" color="#C77A00" href="/outstanding" />
        <Kpi label="Overdue" value={inr(sum.overdue)} sub={`${sum.overdueCount} invoice(s) past due`} color="#D9412D" href="/outstanding?show=overdue" />
      </div>
      <OutstandingFilterBar owners={owners} />

      <div className="hidden min-[1101px]:block">
        <Table head={["Invoice", "School", "Due", ["Total", "num"], ["Received", "num"], ["Balance", "num"], "Status", "Owner", ""]} empty={empty}>
          {shown.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                <b>{r.number}</b>
                <div className="small muted">
                  {dmy(r.date)}
                  {r.salesOrder.poNumber ? ` · PO ${r.salesOrder.poNumber}` : ""}
                </div>
              </td>
              <td>
                <Link href={`/clients/${r.client.id}`} className="font-bold text-ink no-underline hover:underline">
                  {r.client.schoolName}
                </Link>
              </td>
              <td className="whitespace-nowrap">{dmy(r.dueDate)}</td>
              <td className="num">{money(r.total)}</td>
              <td className="num">{money(r.paid)}</td>
              <td className="num font-bold">{money(r.balance)}</td>
              <td>
                <InvoiceStatePill row={r} />
              </td>
              <td>
                <AvatarName id={r.client.owner.id} name={r.client.owner.name} />
              </td>
              <td>
                <InvoiceButtons row={r} contact={r.client} emailReady={emailReady} me={me} compact />
              </td>
            </tr>
          ))}
        </Table>
      </div>

      <div className="flex flex-col gap-2.5 min-[1101px]:hidden">
        {shown.map((r) => (
          <div key={r.id} className="card p-3.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/clients/${r.client.id}`} className="min-w-0 font-bold text-ink no-underline">
                {r.client.schoolName}
              </Link>
              <InvoiceStatePill row={r} />
            </div>
            <div className="small muted mt-0.5">
              {r.number} · due {dmy(r.dueDate)} · {r.client.owner.name}
            </div>
            <div className="my-2 grid grid-cols-3 gap-2 text-[13px]">
              <div>
                <div className="small faint">Total</div>
                <b>{money(r.total)}</b>
              </div>
              <div>
                <div className="small faint">Received</div>
                <b>{money(r.paid)}</b>
              </div>
              <div>
                <div className="small faint">Balance</div>
                <b>{money(r.balance)}</b>
              </div>
            </div>
            <InvoiceButtons row={r} contact={r.client} emailReady={emailReady} me={me} compact />
          </div>
        ))}
        {!shown.length ? (
          <div className="card">
            <Empty>{empty}</Empty>
          </div>
        ) : null}
      </div>
    </>
  );
}

import { ExportButtons } from "@/components/export-buttons";
import Link from "next/link";
import { CLIENT_STATUS_LABEL, clientCode } from "@/lib/constants";
import { fmtDate, istDate, todayIST } from "@/lib/dates";
import { seesAllSales } from "@/lib/permissions";
import { AvatarName, Empty, PageHeader, Pill, Table } from "@/components/ui";
import { requireUser } from "@/server/session";
import { clientsList } from "@/server/queries";
import { ClientFilterBar } from "./filters";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const rows = await clientsList(user, sp);
  const today = todayIST();
  const filtered = !!(sp.q || sp.status);
  const empty = filtered ? "No clients match these filters." : "No clients yet. Won opportunities can be converted to clients.";

  return (
    <>
      <PageHeader
        title="Clients"
        sub={`${seesAllSales(user.role) ? "" : "Your clients only. "}Schools that signed up. New clients start in Onboarding.`}
      >
        <ExportButtons report="clients" />
      </PageHeader>
      <ClientFilterBar />

      <div className="hidden min-[901px]:block">
        <Table head={["Client", "School", "City", "Mobile", "Status", "Since", "Owner"]} empty={empty}>
          {rows.map((c) => (
            <tr key={c.id} className="click">
              <td className="faint">
                <Link href={`/clients/${c.id}`} className="text-inherit no-underline">
                  {clientCode(c.number)}
                </Link>
              </td>
              <td>
                <Link href={`/clients/${c.id}`} className="font-bold text-ink no-underline hover:underline">
                  {c.schoolName}
                </Link>
                <div className="small muted">{c.contactName}</div>
              </td>
              <td>{c.city}</td>
              <td className="whitespace-nowrap">{c.mobile}</td>
              <td>
                <Pill tone={c.status === "ACTIVE" ? "ok" : "warn"}>{CLIENT_STATUS_LABEL[c.status]}</Pill>
              </td>
              <td className="whitespace-nowrap">{fmtDate(istDate(c.since), today)}</td>
              <td>
                <AvatarName id={c.owner.id} name={c.owner.name} />
              </td>
            </tr>
          ))}
        </Table>
      </div>

      <div className="flex flex-col gap-2.5 min-[901px]:hidden">
        {rows.map((c) => (
          <Link key={c.id} href={`/clients/${c.id}`} className="card block p-3.5 text-ink no-underline">
            <div className="flex items-start justify-between gap-2">
              <b className="min-w-0">{c.schoolName}</b>
              <Pill tone={c.status === "ACTIVE" ? "ok" : "warn"}>{CLIENT_STATUS_LABEL[c.status]}</Pill>
            </div>
            <div className="small muted mt-0.5">
              {c.contactName} · {c.city}
            </div>
            <div className="small mt-1">
              {clientCode(c.number)} · since {fmtDate(istDate(c.since), today)} · {c.owner.name}
            </div>
          </Link>
        ))}
        {!rows.length ? (
          <div className="card">
            <Empty>{empty}</Empty>
          </div>
        ) : null}
      </div>
    </>
  );
}

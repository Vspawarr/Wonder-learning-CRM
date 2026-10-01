import Link from "next/link";
import { ExportButtons } from "@/components/export-buttons";
import { LEAD_STATUS_LABEL, leadCode } from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import { seesAllSales } from "@/lib/permissions";
import { AvatarName, Empty, FollowUp, PageHeader, Pill, Table } from "@/components/ui";
import { ConvertLeadButton } from "@/components/convert-lead";
import { requireUser } from "@/server/session";
import { assignees, leadsList } from "@/server/queries";
import { getLocations } from "@/server/locations";
import { LeadFilters } from "./lead-filters";
import { NewLeadButton } from "./new-lead";
import { BulkLeadButtons } from "./bulk-upload";

export const metadata = { title: "Leads" };

type SP = Promise<{ q?: string; status?: string; src?: string; sort?: string; new?: string }>;

export default async function LeadsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [rows, team, locations] = await Promise.all([
    leadsList(user, sp),
    assignees(user),
    getLocations(),
  ]);
  const today = todayIST();
  const empty = sp.q || sp.src || (sp.status && sp.status !== "Active") ? "No leads match these filters." : "No leads yet. Add your first lead.";
  // Leads that haven't become an opportunity yet (Qualified ones convert automatically).
  const convertible = (status: string) => status === "NEW" || status === "CONTACTED";

  return (
    <>
      <PageHeader
        title="Leads"
        sub={`${seesAllSales(user.role) ? "" : "Your leads only. "}${sp.sort === "follow" ? "Sorted by next follow-up." : sp.sort === "old" ? "Oldest first." : "Newest first."}`}
      >
        <BulkLeadButtons />
        <ExportButtons report="leads" />
        <NewLeadButton key={sp.new} autoOpen={!!sp.new} team={team} locations={locations} defaultAssignee={team.some((t) => t.id === user.id) ? user.id : ""} />
      </PageHeader>
      <LeadFilters />
      <div className="hidden min-[901px]:block">
        <Table head={["Lead", "Added", "School", "City", "Source", "Status", "Assigned to", "Next follow-up", ""]} empty={empty}>
          {rows.map((l) => (
            <tr key={l.id} className="click">
              <td className="faint">
                <Link href={`/leads/${l.id}`} className="text-inherit no-underline">
                  {leadCode(l.number)}
                </Link>
              </td>
              <td className="small whitespace-nowrap text-ink2">
                {l.createdAt.split(", ")[0]}
                <div className="faint">{l.createdAt.split(", ")[1]}</div>
              </td>
              <td>
                <Link href={`/leads/${l.id}`} className="font-bold text-ink no-underline hover:underline">
                  {l.schoolName}
                </Link>
                <div className="small muted">{l.contactName}</div>
              </td>
              <td>{l.city}</td>
              <td>{l.source}</td>
              <td>
                <Pill>{LEAD_STATUS_LABEL[l.status]}</Pill>
              </td>
              <td>
                <AvatarName id={l.owner.id} name={l.owner.name} />
              </td>
              <td className="whitespace-nowrap">
                <FollowUp date={l.nextFollowUpDate} today={today} />
              </td>
              <td className="whitespace-nowrap">{convertible(l.status) ? <ConvertLeadButton leadId={l.id} schoolName={l.schoolName} small /> : null}</td>
            </tr>
          ))}
        </Table>
      </div>

      <div className="flex flex-col gap-2.5 min-[901px]:hidden">
        {rows.map((l) => (
          <div key={l.id} className="card p-3.5">
            <Link href={`/leads/${l.id}`} className="block text-ink no-underline">
              <div className="flex items-start justify-between gap-2">
                <b className="min-w-0">{l.schoolName}</b>
                <Pill>{LEAD_STATUS_LABEL[l.status]}</Pill>
              </div>
              <div className="small muted mt-0.5">
                {l.contactName} · {l.city}
              </div>
              <div className="small mt-1.5 flex flex-wrap items-center gap-2">
                <span>
                  Next: <FollowUp date={l.nextFollowUpDate} today={today} />
                </span>
                <span className="faint">Added {l.createdAt}</span>
              </div>
            </Link>
            {convertible(l.status) ? (
              <div className="mt-2.5">
                <ConvertLeadButton leadId={l.id} schoolName={l.schoolName} small />
              </div>
            ) : null}
          </div>
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

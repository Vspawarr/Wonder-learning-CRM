import Link from "next/link";
import { LEAD_STATUS_LABEL, TEMPERATURE_LABEL, leadCode } from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import { seesAllSales } from "@/lib/permissions";
import { AvatarName, FollowUp, PageHeader, Pill, Table } from "@/components/ui";
import { requireUser } from "@/server/session";
import { assignees, citiesByState, leadsList } from "@/server/queries";
import { LeadFilters } from "./lead-filters";
import { NewLeadButton } from "./new-lead";

export const metadata = { title: "Leads" };

type SP = Promise<{ q?: string; status?: string; temp?: string; src?: string }>;

export default async function LeadsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [rows, team, cities] = await Promise.all([
    leadsList(user, sp),
    assignees(user),
    citiesByState(),
  ]);
  const today = todayIST();

  return (
    <>
      <PageHeader
        title="Leads"
        sub={`${seesAllSales(user.role) ? "" : "Your leads only. "}Sorted by next follow-up so the most urgent are on top.`}
      >
        <NewLeadButton team={team} cities={cities} defaultAssignee={team.some((t) => t.id === user.id) ? user.id : ""} />
      </PageHeader>
      <LeadFilters />
      <Table
        head={["Lead", "School", "City", "Source", "Status", "Category", "Owner", "Next follow-up"]}
        empty={sp.q || sp.temp || sp.src || (sp.status && sp.status !== "Active") ? "No leads match these filters." : "No leads yet. Add your first lead."}
      >
        {rows.map((l) => (
          <tr key={l.id} className="click">
            <td className="faint">
              <Link href={`/leads/${l.id}`} className="text-inherit no-underline">
                {leadCode(l.number)}
              </Link>
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
              <Pill>{TEMPERATURE_LABEL[l.temperature]}</Pill>
            </td>
            <td>
              <AvatarName id={l.owner.id} name={l.owner.name} />
            </td>
            <td className="whitespace-nowrap">
              <FollowUp date={l.nextFollowUpDate} today={today} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

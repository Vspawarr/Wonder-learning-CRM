import Link from "next/link";
import { notFound } from "next/navigation";
import { LEAD_STATUS_LABEL, STAGE_LABEL, TEMPERATURE_LABEL, leadCode, oppCode } from "@/lib/constants";
import { fmtDate, istDate, todayIST } from "@/lib/dates";
import { ActivityLog } from "@/components/activity";
import { Card, DueTag, FollowUp, Pill } from "@/components/ui";
import { requireUser } from "@/server/session";
import { assignees, citiesByState, leadDetail, productOptions } from "@/server/queries";
import { isActiveLead } from "@/server/rules";
import { LeadActions, LeadEditor } from "./lead-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const lead = await leadDetail(user, (await params).id);
  return { title: lead?.schoolName ?? "Lead" };
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const lead = await leadDetail(user, (await params).id);
  if (!lead) notFound();
  const [products, team, cities] = await Promise.all([productOptions(), assignees(user), citiesByState()]);
  const active = isActiveLead(lead.status);
  const today = todayIST();
  // A reassigned lead keeps showing its current owner even if they're not a choice for this user.
  const teamWithOwner = team.some((t) => t.id === lead.assignedTo.id) ? team : [lead.assignedTo, ...team];

  return (
    <>
      <div className="mb-2">
        <Link href="/leads" className="small no-underline">
          ← All leads
        </Link>
      </div>
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1>{lead.schoolName}</h1>
          <div className="muted mt-1">
            {lead.contactName}
            {lead.designation ? ` · ${lead.designation}` : ""} · {lead.mobile} · {lead.city}, {lead.state}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill>{LEAD_STATUS_LABEL[lead.status]}</Pill>
            <Pill>{TEMPERATURE_LABEL[lead.temperature]}</Pill>
            <span className="tag">{lead.source}</span>
            <span className="tag">{leadCode(lead.number)}</span>
            <span className="small faint">
              Added {fmtDate(istDate(lead.createdAt), today)} by {lead.createdBy}
            </span>
          </div>
        </div>
        <LeadActions lead={lead} />
      </div>

      {lead.status === "DISQUALIFIED" ? (
        <div className="note">
          <b>Disqualified: {lead.disqualifyReason}.</b> {lead.disqualifyRemarks}
        </div>
      ) : null}
      {lead.opportunity ? (
        <div className="note ok">
          Converted to{" "}
          <Link href={`/pipeline?opp=${lead.opportunity.id}`}>
            opportunity {oppCode(lead.opportunity.number)}
          </Link>{" "}
          · {STAGE_LABEL[lead.opportunity.stage]}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[1101px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card">
          {active ? (
            <LeadEditor key={lead.updatedAt} lead={lead} products={products} team={teamWithOwner} cities={cities} />
          ) : (
            <ReadOnlyLead lead={lead} />
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Card title="Next follow-up">
            <div className="text-[15px]">
              <FollowUp date={lead.nextFollowUpDate} today={today} />
              {lead.followUpType ? <span className="muted"> · {lead.followUpType}</span> : null}
            </div>
            {lead.followUpRemark ? <div className="small muted mt-1">{lead.followUpRemark}</div> : null}
            {lead.openTasks.length ? (
              <div className="mt-3">
                {lead.openTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 border-b border-line py-1.5 last:border-0">
                    <span className="min-w-0 truncate">
                      {t.title} <span className="small faint">· {t.type} · {t.assignee}</span>
                    </span>
                    <span className="small whitespace-nowrap">
                      <DueTag date={t.dueDate} today={today} />
                    </span>
                  </div>
                ))}
                <Link href="/tasks" className="small mt-2 inline-block">
                  Open follow-ups →
                </Link>
              </div>
            ) : null}
          </Card>
          <Card title="Activity">
            <ActivityLog items={lead.activities} />
          </Card>
        </div>
      </div>
    </>
  );
}

function ReadOnlyLead({ lead }: { lead: Awaited<ReturnType<typeof leadDetail>> & object }) {
  const facts: [string, React.ReactNode][] = [
    ["Owner / contact", lead.contactName],
    ["Designation", lead.designation],
    ["Mobile", lead.mobile],
    ["Email", lead.email],
    ["City, state", `${lead.city}, ${lead.state}`],
    ["Area", lead.area],
    ["Address", lead.address],
    ["Current curriculum", lead.currentCurriculum],
    ["Student strength", lead.studentStrength],
    ["Branches", lead.branches],
    ["Source", lead.source],
    ["Reference name", lead.referenceName],
    ["Interested in", lead.interests.map((p) => p.name).join(", ")],
    ["Assigned to", lead.assignedTo.name],
    ["Remarks", lead.remarks],
  ];
  return (
    <>
      <h2 className="mb-3">About this lead</h2>
      <dl className="facts">
        {facts
          .filter(([, v]) => v !== null && v !== "" && v !== undefined)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{k}</dt>
              <dd className="whitespace-pre-line">{v}</dd>
            </div>
          ))}
      </dl>
      <p className="small faint mt-4">
        {LEAD_STATUS_LABEL[lead.status]} leads are read-only.
      </p>
    </>
  );
}

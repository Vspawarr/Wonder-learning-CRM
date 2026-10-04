import Link from "next/link";
import { notFound } from "next/navigation";
import { LEAD_STATUS_LABEL, STAGE_LABEL, leadCode, oppCode } from "@/lib/constants";
import { fmtDateTimeIST, todayIST } from "@/lib/dates";
import { ActivityLog } from "@/components/activity";
import { BackLink, Card, ContactFacts, DueTag, FollowUp, Pill } from "@/components/ui";
import { requireUser } from "@/server/session";
import { assignees, leadDetail, productOptions } from "@/server/queries";
import { isEmailConfigured } from "@/server/mailer";
import { QuotationsPanel } from "../../pipeline/quotations";
import { getLocations } from "@/server/locations";
import { isActiveLead } from "@/server/rules";
import { LeadActions, LeadEditor } from "./lead-client";
import { SchoolDetailsButton } from "@/components/school-details";
import { schoolValues } from "@/lib/school-values";
import type { Locations } from "@/server/locations";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const lead = await leadDetail(user, (await params).id);
  return { title: lead?.schoolName ?? "Lead" };
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const lead = await leadDetail(user, (await params).id);
  if (!lead) notFound();
  const [team, locations, products] = await Promise.all([assignees(user), getLocations(), productOptions()]);
  const active = isActiveLead(lead.status);
  const today = todayIST();
  // A reassigned lead keeps showing its current owner even if they're not a choice for this user.
  const teamWithOwner = team.some((t) => t.id === lead.assignedTo.id) ? team : [lead.assignedTo, ...team];

  return (
    <>
      <div className="mb-2">
        <BackLink href="/leads">All leads</BackLink>
      </div>
      <div className="mb-[18px] grid grid-cols-1 items-start gap-4 min-[1101px]:grid-cols-[minmax(0,1fr)_minmax(0,auto)]">
        <div className="min-w-0">
          <h1>{lead.schoolName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill>{LEAD_STATUS_LABEL[lead.status]}</Pill>
            <span className="tag">{lead.source}</span>
            <span className="tag">{leadCode(lead.number)}</span>
          </div>
          <div className="small faint mt-2 break-words">
            Added {fmtDateTimeIST(lead.createdAt)} by {lead.createdBy}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <ContactFacts
            rows={[
              ["Contact person", lead.contactName],
              ["Designation", lead.designation],
              [
                "Mobile",
                <a key="m" href={`tel:${lead.mobile.replace(/[^\d+]/g, "")}`}>
                  {lead.mobile}
                </a>,
              ],
              ["Email", lead.email ? <a key="e" href={`mailto:${lead.email}`}>{lead.email}</a> : null],
              ["Location", [lead.area, lead.city, lead.state].filter(Boolean).join(", ")],
              ["Assigned to", lead.assignedTo.name],
              ["Next follow-up", lead.nextFollowUpDate ? <FollowUp key="f" date={lead.nextFollowUpDate} today={today} /> : null],
            ]}
          />
          <LeadActions lead={lead} />
        </div>
      </div>

      {lead.status === "DISQUALIFIED" ? (
        <div className="note">
          <b>Disqualified: {lead.disqualifyReason}.</b> {lead.disqualifyRemarks}
        </div>
      ) : null}
      {lead.opportunity ? (
        <div className="note ok">
          Converted to{" "}
          <Link href={`/opportunities?opp=${lead.opportunity.id}`}>
            opportunity {oppCode(lead.opportunity.number)}
          </Link>{" "}
          · {STAGE_LABEL[lead.opportunity.stage]}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[1101px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card">
          {active ? (
            <LeadEditor key={lead.updatedAt} lead={lead} team={teamWithOwner} locations={locations} />
          ) : (
            <ReadOnlyLead lead={lead} locations={locations} />
          )}
        </div>
        <div className="flex flex-col gap-4">
          {active || lead.quotations.length ? (
            <Card title="Quotations">
              {active ? (
                <p className="small muted mb-2">
                  Some schools ask for a quotation straight away: make it here. When the lead becomes an opportunity, its quotations move with it.
                </p>
              ) : null}
              <QuotationsPanel
                heading={false}
                target={{
                  parent: { leadId: lead.id },
                  schoolName: lead.schoolName,
                  closed: !active,
                  stage: null,
                  email: lead.email,
                  mobile: lead.mobile,
                  quotations: lead.quotations,
                }}
                products={products}
                emailReady={isEmailConfigured()}
                me={{ name: user.name }}
              />
            </Card>
          ) : null}
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

function ReadOnlyLead({ lead, locations }: { lead: Awaited<ReturnType<typeof leadDetail>> & object; locations: Locations }) {
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2>About this lead</h2>
        {/* Converted or disqualified, the school's details can still be corrected (R35). */}
        <SchoolDetailsButton target={{ leadId: lead.id }} initial={schoolValues(lead)} locations={locations} small />
      </div>
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

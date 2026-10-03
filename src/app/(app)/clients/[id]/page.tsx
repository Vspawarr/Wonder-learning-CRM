import Link from "next/link";
import { notFound } from "next/navigation";
import { CLIENT_STATUS_LABEL, clientCode, leadCode, oppCode } from "@/lib/constants";
import { fmtDate, istDate, todayIST } from "@/lib/dates";
import { ActivityLog } from "@/components/activity";
import { BackLink, Card, DueTag, Pill, Ribbon, Ring } from "@/components/ui";
import { Tabs, type TabDef } from "@/components/tabs";
import { inr } from "@/lib/format";
import { isEmailConfigured } from "@/server/mailer";
import { requireUser } from "@/server/session";
import { assignees, clientDetail, productOptions } from "@/server/queries";
import { getLocations } from "@/server/locations";
import { getFeatures } from "@/server/features";
import { seesAllSales } from "@/lib/permissions";
import { EditClientButton } from "./edit-client";
import { ContactsCard, DocumentsCard } from "./extras";
import { RenewalButton } from "@/components/renewals";
import { renewalCandidates } from "@/server/renewals";
import { QuotationsPanel } from "../../pipeline/quotations";
import { ClientActions } from "./client-actions";
import { InvoicesPanel, PaymentsPanel, SalesOrdersPanel } from "./finance";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const c = await clientDetail(user, (await params).id);
  return { title: c?.schoolName ?? "Client" };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const [c0, products, team, locations, features] = await Promise.all([
    clientDetail(user, (await params).id),
    productOptions(),
    assignees(user),
    getLocations(),
    getFeatures(),
  ]);
  if (!c0) notFound();
  // With extra contacts switched off, messages go to the main contact only.
  const c = features.contacts ? c0 : { ...c0, people: [] };
  const renewal = features.renewals ? await renewalCandidates(user, c0.id) : null;
  const today = todayIST();
  const emailReady = isEmailConfigured();
  const me = { name: user.name };
  const m = c.money;

  const facts: [string, React.ReactNode][] = [
    ["Owner / contact", c.contactName],
    ["Designation", c.designation],
    ["Mobile", c.mobile],
    ["Email", c.email],
    ["City, state", `${c.city}, ${c.state}`],
    ["Area", c.area],
    ["Address", c.address],
    ["Current curriculum", c.currentCurriculum],
    ["Student strength", c.studentStrength],
    ["Branches", c.branches],
    ["Assigned to (salesperson)", c.owner.name],
  ];

  const live = c.invoices.filter((i) => i.state !== "CANCELLED").length;
  const collected = m.invoiced > 0 ? Math.round((m.received / m.invoiced) * 100) : null;
  const liveOrders = c.salesOrders.filter((o) => o.status !== "CANCELLED").length;

  const about = (
    <Card title="About this school">
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
      <div className="small muted mt-4">
        From <Link href={`/opportunities?opp=${c.opportunity.id}`}>opportunity {oppCode(c.opportunity.number)}</Link>
        {c.opportunity.leadId && c.opportunity.lead ? (
          <>
            {" "}
            · <Link href={`/leads/${c.opportunity.leadId}`}>lead {leadCode(c.opportunity.lead.number)}</Link>
          </>
        ) : null}
      </div>
    </Card>
  );

  const followUps = (
    <Card title="Open follow-ups">
      {c.openTasks.length ? (
        c.openTasks.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 border-b border-line py-1.5 last:border-0">
            <span className="min-w-0">
              {t.title}{" "}
              <span className="small faint">
                · {t.type} · {t.assignee}
              </span>
            </span>
            <span className="small whitespace-nowrap">
              <DueTag date={t.dueDate} today={today} />
            </span>
          </div>
        ))
      ) : (
        <div className="small muted">Nothing open.</div>
      )}
      <Link href="/tasks" className="small mt-2 inline-block">
        Open follow-ups →
      </Link>
    </Card>
  );

  const tabs: TabDef[] = [
    {
      id: "sales",
      label: "Quotations & orders",
      count: c.quotations.length + liveOrders,
      panel: (
        <div className="flex flex-col gap-4">
          <Card title="Quotations">
            <QuotationsPanel
              heading={false}
              target={{
                parent: { clientId: c.id },
                schoolName: c.schoolName,
                closed: false,
                stage: null,
                email: c.email,
                mobile: c.mobile,
                quotations: c.quotations,
              }}
              products={products}
              emailReady={emailReady}
              me={me}
            />
          </Card>
          <Card title="Purchase orders & sales orders">
            <SalesOrdersPanel client={c} products={products} me={me} emailReady={emailReady} />
          </Card>
        </div>
      ),
    },
    {
      id: "money",
      label: "Invoices & payments",
      count: live,
      panel: (
        <div className="flex flex-col gap-4">
          <Card title="Invoices & payments due">
            <InvoicesPanel client={c} emailReady={emailReady} me={me} />
          </Card>
          <Card title="Payments received">
            <PaymentsPanel client={c} emailReady={emailReady} me={me} />
          </Card>
        </div>
      ),
    },
    ...(features.documents
      ? [{ id: "docs", label: "Documents", panel: <Card title="Documents"><DocumentsCard client={c} /></Card> }]
      : []),
    { id: "activity", label: "Timeline", panel: <Card title="Activity"><ActivityLog items={c.activities} /></Card> },
  ];

  return (
    <>
      <div className="mb-3">
        <BackLink href="/clients">All clients</BackLink>
      </div>
      <div className="card hero mb-4">
        <Ring pct={collected} caption="collected" />
        <div className="min-w-0">
          <h1 className="text-[24px] max-[900px]:text-[20px]">{c.schoolName}</h1>
          <div className="muted mt-1">
            {c.contactName} · {c.mobile} · {c.city}, {c.state}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone={c.status === "ACTIVE" ? "ok" : "warn"}>{CLIENT_STATUS_LABEL[c.status]}</Pill>
            <span className="tag">{clientCode(c.number)}</span>
            <span className="tag">Since {fmtDate(istDate(c.since), today)}</span>
            {c.status === "ACTIVE" && c.onboardingCompletedAt ? (
              <span className="tag">Onboarded {fmtDate(istDate(c.onboardingCompletedAt), today)}</span>
            ) : null}
            <span className="tag">Salesperson: {c.owner.name}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditClientButton client={c} team={team} locations={locations} canChangeOwner={seesAllSales(user.role)} />
          {renewal?.clients.length ? <RenewalButton clientId={c.id} ay={renewal.ay.label} /> : null}
          <ClientActions id={c.id} mobile={c.mobile} onboarding={c.status === "ONBOARDING"} />
        </div>
      </div>

      {c.status === "ONBOARDING" ? (
        <div className="note warn">Onboarding in progress. Work through the onboarding follow-ups, then mark onboarding complete.</div>
      ) : null}

      <Ribbon
        mini
        steps={[
          { label: "Quotations", value: c.quotations.length, color: "#C77A00", href: "?tab=sales" },
          { label: "Sales orders", value: liveOrders, color: "#C2417A", href: "?tab=sales" },
          { label: `Invoiced · ${live} invoice(s)`, value: inr(m.invoiced), color: "#1C86C4", href: "?tab=money" },
          { label: `Received · ${c.payments.length} payment(s)`, value: inr(m.received), color: "#0E8F79", href: "?tab=money" },
          { label: "Outstanding", value: inr(m.outstanding), color: "#3D3BA8", href: "?tab=money" },
          {
            label: m.overdueCount ? `Overdue · ${m.overdueCount} invoice(s)` : "Overdue",
            value: inr(m.overdue),
            color: m.overdue ? "#D9412D" : "#5B6B8C",
            href: "?tab=money",
          },
        ]}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 min-[1101px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4 max-[1100px]:order-2">
          {about}
          {followUps}
          {features.contacts ? (
            <Card title="Contacts">
              <ContactsCard client={c} />
            </Card>
          ) : null}
        </div>
        <div className="min-w-0">
          <Tabs tabs={tabs} />
        </div>
      </div>
    </>
  );
}

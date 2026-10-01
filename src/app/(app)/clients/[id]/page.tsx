import Link from "next/link";
import { notFound } from "next/navigation";
import { CLIENT_STATUS_LABEL, clientCode, leadCode, oppCode } from "@/lib/constants";
import { fmtDate, istDate, todayIST } from "@/lib/dates";
import { ActivityLog } from "@/components/activity";
import { Card, DueTag, Kpi, Pill } from "@/components/ui";
import { inr } from "@/lib/format";
import { isEmailConfigured } from "@/server/mailer";
import { requireUser } from "@/server/session";
import { clientDetail, productOptions } from "@/server/queries";
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
  const [c, products] = await Promise.all([clientDetail(user, (await params).id), productOptions()]);
  if (!c) notFound();
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
    ["Account owner", c.owner.name],
  ];

  return (
    <>
      <div className="mb-2">
        <Link href="/clients" className="small no-underline">
          ← All clients
        </Link>
      </div>
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1>{c.schoolName}</h1>
          <div className="muted mt-1">
            {c.contactName} · {c.mobile} · {c.city}, {c.state}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone={c.status === "ACTIVE" ? "ok" : "warn"}>{CLIENT_STATUS_LABEL[c.status]}</Pill>
            <span className="tag">{clientCode(c.number)}</span>
            <span className="small faint">Client since {fmtDate(istDate(c.since), today)}</span>
          </div>
        </div>
        <ClientActions id={c.id} mobile={c.mobile} onboarding={c.status === "ONBOARDING"} />
      </div>

      {c.status === "ONBOARDING" ? (
        <div className="note warn">
          Onboarding in progress. Work through the onboarding follow-ups, then mark onboarding complete.
        </div>
      ) : (
        <div className="note ok">
          Onboarding completed{c.onboardingCompletedAt ? ` on ${fmtDate(istDate(c.onboardingCompletedAt), today)}` : ""}.
        </div>
      )}

      <div className="kgrid kgrid-2 my-4">
        <Kpi label="Invoiced" value={inr(m.invoiced)} sub={`${c.invoices.filter((i) => i.state !== "CANCELLED").length} invoice(s)`} color="#1C86C4" />
        <Kpi label="Received" value={inr(m.received)} sub={`${c.payments.length} payment(s)`} color="#0E8F79" />
        <Kpi label="Outstanding" value={inr(m.outstanding)} sub="Still to collect" color="#C77A00" />
        <Kpi label="Overdue" value={inr(m.overdue)} sub={m.overdueCount ? `${m.overdueCount} invoice(s) past due` : "Nothing past due"} color="#D9412D" />
      </div>

      <div className="grid grid-cols-1 gap-4 min-[1101px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <Card title="Invoices & payments due">
            <InvoicesPanel client={c} emailReady={emailReady} me={me} />
          </Card>
          <Card title="Sales orders">
            <SalesOrdersPanel client={c} products={products} />
          </Card>
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
          <Card title="School details">
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
              From{" "}
              <Link href={`/opportunities?stage=All&opp=${c.opportunity.id}`}>opportunity {oppCode(c.opportunity.number)}</Link>
              {c.opportunity.leadId && c.opportunity.lead ? (
                <>
                  {" "}
                  · <Link href={`/leads/${c.opportunity.leadId}`}>lead {leadCode(c.opportunity.lead.number)}</Link>
                </>
              ) : null}
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card title="Open follow-ups">
            {c.openTasks.length ? (
              c.openTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 border-b border-line py-1.5 last:border-0">
                  <span className="min-w-0">
                    {t.title} <span className="small faint">· {t.type} · {t.assignee}</span>
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
          <Card title="Payments received">
            <PaymentsPanel client={c} />
          </Card>
          <Card title="Activity">
            <ActivityLog items={c.activities} />
          </Card>
        </div>
      </div>
    </>
  );
}

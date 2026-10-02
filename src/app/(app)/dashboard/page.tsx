import { ExportButtons } from "@/components/export-buttons";
import Link from "next/link";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/constants";
import { fmtDate, todayIST } from "@/lib/dates";
import { inrS } from "@/lib/format";
import { seesAllSales } from "@/lib/permissions";
import { AvatarName, Card, DueTag, Empty, HBars, Kpi, PageHeader, Ribbon, Table, VBars } from "@/components/ui";
import { requireUser } from "@/server/session";
import { lifecycleCounts, salesDashboard, serviceSummary, type DashFilters } from "@/server/dashboard";
import { collectionsSummary, outstandingList } from "@/server/finance/service";
import { renewalCandidates } from "@/server/renewals";
import { getFeatures } from "@/server/features";
import { targetProgress } from "@/server/targets";
import { assignees } from "@/server/queries";
import { DashFilterBar } from "./filters";
import { SectionPicker } from "./sections";
import { DASH_SECTIONS, parseSections, type DashSection } from "@/lib/dashboard-sections";
import { cookies } from "next/headers";
import { getLocations } from "@/server/locations";

export const metadata = { title: "Dashboard" };

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev && !now) return <>vs previous period</>;
  if (!prev) return <span className="font-semibold text-mint">new this period</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  return (
    <span className={`font-semibold ${pct >= 0 ? "text-mint" : "text-coral"}`}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}% vs previous
    </span>
  );
}

function SectionHead({ id, sub }: { id: DashSection; sub?: string }) {
  const [, label, color] = DASH_SECTIONS.find(([k]) => k === id)!;
  return (
    <div className="dhead" style={{ "--c": color } as React.CSSProperties}>
      <h2>{label}</h2>
      {sub ? <span className="small muted">{sub}</span> : null}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashFilters & { show?: string }> }) {
  const user = await requireUser();
  const f = await searchParams;
  const shown = parseSections(f.show ?? (await cookies()).get("dash_sections")?.value);
  const has = (s: DashSection) => shown.includes(s);
  const all = seesAllSales(user.role);
  const exec = all ? f.exec : undefined;
  const features = await getFeatures();
  const [d, team, locations, life, svc, owed, renewals] = await Promise.all([
    salesDashboard(user, f),
    all ? assignees(user) : Promise.resolve([]),
    getLocations(),
    lifecycleCounts(user),
    has("service") ? serviceSummary(user, f) : null,
    has("finance") ? outstandingList(user, { owner: exec }) : null,
    has("service") && features.renewals ? renewalCandidates(user) : null,
  ]);
  const today = todayIST();
  const k = d.kpis;
  const targets = features.targets && has("team") ? await targetProgress(user) : null;
  const cash = await collectionsSummary(user, { exec, state: f.state }, d.range.from, d.range.to);
  const first = user.name.split(" ")[0];
  const period = `${fmtDate(d.range.from, today)} – ${fmtDate(d.range.to, today)}`;

  return (
    <>
      <PageHeader title={`Hello, ${first}`} sub={`${all ? "The whole business" : "Your numbers"} · ${period}. Tap any number to see the records behind it.`}>
        <ExportButtons report="dashboard" />
      </PageHeader>
      <Ribbon
        steps={[
          { label: "Active leads", value: life.leads, color: "#1C86C4", href: "/leads" },
          { label: "Opportunities", value: life.opps, color: "#7A48B8", href: "/pipeline" },
          { label: "Quotations open", value: life.quotes, color: "#C77A00", href: "/pipeline" },
          { label: "Open sales orders", value: life.orders, color: "#C2417A", href: "/clients" },
          { label: "Clients", value: life.clients, color: "#3D3BA8", href: "/clients" },
          { label: life.overdue ? `Unpaid · ${life.overdue} overdue` : "Unpaid invoices", value: life.unpaid, color: "#D9412D", href: "/outstanding" },
          { label: "To-dos due", value: life.todos, color: "#0E8F79", href: "/tasks" },
        ]}
      />
      <div className="card mt-4">
        <div className="small strong muted mb-2">Show</div>
        <SectionPicker shown={shown} />
        <div className="mt-3 border-t border-line pt-3">
          <DashFilterBar team={all ? team : null} states={locations.states} />
        </div>
      </div>

      {has("sales") ? (
        <>
          <SectionHead id="sales" sub={period} />
          <div className="kgrid kgrid-2 mb-4">
            <Kpi label="Leads created" value={k.leads} sub={<Delta now={k.leads} prev={k.leadsPrev} />} color="#1C86C4" href="/leads?status=All" />
            <Kpi label="Hot opportunities" value={k.hot} sub="Open, category Hot" color="#D9412D" href="/opportunities?cat=HOT" />
            <Kpi label="Converted" value={k.converted} sub="Leads converted in period" color="#0E8F79" href="/leads?status=Converted" />
            <Kpi
              label="Open pipeline"
              value={inrS(k.openValue)}
              sub={`${k.openCount} opportunit${k.openCount === 1 ? "y" : "ies"}`}
              color="#7A48B8"
              href="/pipeline"
            />
            <Kpi label="Weighted forecast" value={inrS(k.weighted)} sub="Value × probability" color="#C77A00" href="/pipeline" />
            <Kpi label="Won" value={inrS(k.wonValue)} sub={`${k.wonCount} deal(s)`} color="#0E8F79" />
          </div>
          {k.noValue ? (
            <div className="note warn">
              {k.noValue} open opportunit{k.noValue === 1 ? "y has" : "ies have"} no expected value yet, so rupee totals are understated.
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 min-[901px]:grid-cols-2">
            <Card title="New leads, week by week">
              <VBars data={d.weeks} />
              <div className="small muted mt-3">Last 8 weeks. The orange bar is this week.</div>
            </Card>
            <Card title="Pipeline by stage">
              <HBars
                data={d.byStage.map((s) => ({
                  label: `${STAGE_LABEL[s.stage]} (${s.count})`,
                  value: s.value,
                  color: STAGE_COLOR[s.stage],
                  href: "/pipeline",
                }))}
                format={inrS}
              />
            </Card>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 min-[901px]:grid-cols-2">
            <Card title="Lead sources">
              <Table head={["Source", ["Leads", "num"], ["Converted", "num"], ["Rate", "num"]]} empty="No leads in this period.">
                {d.sources.map((r) => (
                  <tr key={r.source}>
                    <td>
                      <Link href={`/leads?status=All&src=${encodeURIComponent(r.source)}`} className="text-ink">
                        {r.source}
                      </Link>
                    </td>
                    <td className="num">{r.leads}</td>
                    <td className="num">{r.converted}</td>
                    <td className="num">
                      <b>{Math.round((r.converted / r.leads) * 100)}%</b>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="Biggest open deals">
              {d.biggest.length ? (
                d.biggest.map((o) => (
                  <Link
                    key={o.id}
                    href={`/opportunities?opp=${o.id}`}
                    className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-ink no-underline last:border-0"
                  >
                    <span className="min-w-0">
                      <b className="block truncate">{o.school}</b>
                      <span className="small muted">
                        {STAGE_LABEL[o.stage]} · {o.probability}%
                      </span>
                    </span>
                    <b>{inrS(o.value)}</b>
                  </Link>
                ))
              ) : (
                <Empty>No open deals.</Empty>
              )}
            </Card>
          </div>
        </>
      ) : null}

      {has("finance") && owed ? (
        <>
          <SectionHead id="finance" sub={`Collected in ${period}; amounts owed as of today`} />
          <div className="kgrid kgrid-2 mb-4">
            <Kpi
              label="Collected"
              value={inrS(cash.collected)}
              sub={`${cash.collectedCount} payment(s) in period`}
              color="#0E8F79"
              href="/outstanding?show=all"
            />
            <Kpi label="Outstanding" value={inrS(cash.outstanding)} sub="Invoiced, not yet received" color="#C77A00" href="/outstanding" />
            <Kpi
              label="Overdue"
              value={inrS(cash.overdue)}
              sub={`${cash.overdueCount} invoice(s) past due`}
              color="#D9412D"
              href="/outstanding?show=overdue"
            />
            <Kpi
              label="Cheques not cleared"
              value={inrS(owed.forecast.chequesPending)}
              sub="Received, waiting for the bank"
              color="#1C86C4"
              href="/outstanding"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 min-[901px]:grid-cols-2">
            <Card title="How late is the money owed">
              {owed.ageing.some((a) => a.amount) ? (
                <HBars
                  data={owed.ageing.map((a, i) => ({
                    label: `${a.label} (${a.count})`,
                    value: a.amount,
                    color: ["#0E8F79", "#E8930C", "#D97706", "#D9412D", "#9F1239"][i],
                    href: "/outstanding",
                  }))}
                  format={inrS}
                />
              ) : (
                <Empty>Nothing owed right now.</Empty>
              )}
            </Card>
            <Card title="Expected collections">
              {owed.forecast.buckets.some((b) => b.amount) ? (
                <HBars
                  data={owed.forecast.buckets.map((b, i) => ({
                    label: `${b.label} (${b.count})`,
                    value: b.amount,
                    color: ["#D9412D", "#0E8F79", "#1C86C4", "#8B88A6"][i],
                    href: "/outstanding",
                  }))}
                  format={inrS}
                />
              ) : (
                <Empty>Nothing to collect.</Empty>
              )}
              <div className="small muted mt-3">By promised payment date where one was given, otherwise by due date.</div>
            </Card>
          </div>
        </>
      ) : null}

      {has("team") ? (
        <>
          <SectionHead id="team" sub={all ? "How each person is doing" : "Your performance"} />
          <div className="kgrid kgrid-2 mb-4">
            <Kpi label="Win rate" value={k.winRate === null ? "–" : `${k.winRate}%`} sub="Won ÷ (won + lost)" color="#3D3BA8" />
            <Kpi label="Lost" value={inrS(k.lostValue)} sub={`${k.lostCount} deal(s)`} color="#8B88A6" />
            <Kpi
              label="Interactions logged"
              value={d.team.reduce((t, r) => t + r.interactions, 0)}
              sub="Calls, visits, messages"
              color="#1C86C4"
            />
            <Kpi label="People" value={d.team.length} sub={all ? "In the sales team" : "Just you"} color="#7A48B8" />
          </div>
          {targets && targets.rows.some((r) => r.salesTarget || r.collectionTarget) ? (
            <Card
              title={`Targets · ${new Date(`${targets.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`}
              className="mb-4"
            >
              {targets.rows
                .filter((r) => r.salesTarget || r.collectionTarget)
                .map((r) => (
                  <div
                    key={r.userId}
                    className="grid grid-cols-1 gap-2 border-b border-line py-2 last:border-0 min-[701px]:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] min-[701px]:items-center"
                  >
                    <b>{r.name}</b>
                    <Progress label="Sales" done={r.sales} target={r.salesTarget} />
                    <Progress label="Collection" done={r.collection} target={r.collectionTarget} />
                  </div>
                ))}
            </Card>
          ) : null}
          <Card title={all ? "Sales team" : "My numbers"}>
            <Table
              head={["Person", ["Leads", "num"], ["Interactions", "num"], ["Open pipeline", "num"], ["Won", "num"]]}
              empty="No sales team members yet."
            >
              {d.team.map((r) => (
                <tr key={r.id}>
                  <td>
                    <AvatarName id={r.id} name={r.name} />
                  </td>
                  <td className="num">{r.leads}</td>
                  <td className="num">{r.interactions}</td>
                  <td className="num">{inrS(r.open)}</td>
                  <td className="num">
                    <b>{inrS(r.won)}</b> <span className="small muted">{r.wonCount}</span>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
          <div className="mt-4 grid grid-cols-1 gap-4 min-[901px]:grid-cols-2">
            <Card title="Why deals were lost">
              {d.lostReasons.length ? (
                <HBars data={d.lostReasons.map((r) => ({ ...r, color: "#D9412D" }))} />
              ) : (
                <Empty>No lost deals in this period.</Empty>
              )}
            </Card>
            <Card title="Competitors met">
              {d.competitors.length ? <HBars data={d.competitors.map((r) => ({ ...r, color: "#E8930C" }))} /> : <Empty>None recorded.</Empty>}
            </Card>
          </div>
        </>
      ) : null}

      {has("service") && svc ? (
        <>
          <SectionHead id="service" sub="Work still to do for signed clients, as of today" />
          <div className="kgrid kgrid-2 mb-4">
            <Kpi label="Follow-ups overdue" value={svc.tasks.overdue} sub="Past their date" color="#D9412D" href="/tasks" />
            <Kpi label="Due today" value={svc.tasks.dueToday} sub={`${svc.tasks.nextWeek} more in the next 7 days`} color="#E8930C" href="/tasks" />
            <Kpi label="Orders to deliver" value={svc.orders.length} sub="Confirmed, not yet delivered" color="#C2417A" href="/clients" />
            {features.dispatch ? <Kpi label="Kits in transit" value={svc.inTransit} sub="Dispatched, not yet received" color="#7A48B8" /> : null}
            <Kpi label="Onboarding" value={svc.onboarding} sub="New clients being set up" color="#1C86C4" href="/clients" />
            {renewals ? (
              <Kpi label="Renewals due" value={renewals.clients.length} sub={`For ${renewals.ay.label}`} color="#0E8F79" href="/clients" />
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 min-[901px]:grid-cols-2">
            <Card title="Follow-ups due">
              {d.due.length ? (
                d.due.map((t) => (
                  <div key={t.id} className="border-b border-line py-1.5 last:border-0">
                    <div className="font-semibold">{t.title}</div>
                    <div className="small muted">
                      {t.related ? <Link href={t.related.href}>{t.related.label}</Link> : null}
                      {t.related ? " · " : ""}
                      <DueTag date={t.dueDate} today={today} />
                      {all ? ` · ${t.assignee.name}` : ""}
                    </div>
                  </div>
                ))
              ) : (
                <Empty>Nothing due.</Empty>
              )}
              <Link href="/tasks" className="small mt-2 inline-block">
                All follow-ups →
              </Link>
            </Card>
            <Card title="Orders waiting for delivery">
              {svc.orders.length ? (
                svc.orders.slice(0, 8).map((o) => (
                  <Link
                    key={o.id}
                    href={`/clients/${o.client.id}`}
                    className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-ink no-underline last:border-0"
                  >
                    <span className="min-w-0">
                      <b className="block truncate">{o.client.schoolName}</b>
                      <span className="small muted">{o.number}</span>
                    </span>
                    <span className="small whitespace-nowrap muted">since {fmtDate(o.date, today)}</span>
                  </Link>
                ))
              ) : (
                <Empty>Every order has been delivered.</Empty>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}

function Progress({ label, done, target }: { label: string; done: number; target: number }) {
  if (!target) return <span className="small faint">{label}: no target</span>;
  const pct = Math.round((done / target) * 100);
  return (
    <div className="small">
      <div className="flex justify-between gap-2">
        <span>
          {label} {inrS(done)} of {inrS(target)}
        </span>
        <b className={pct >= 100 ? "text-mint" : ""}>{pct}%</b>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surf2">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: pct >= 100 ? "var(--mint)" : "var(--brand)",
          }}
        />
      </div>
    </div>
  );
}

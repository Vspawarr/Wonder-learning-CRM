import Link from "next/link";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/constants";
import { fmtDate, todayIST } from "@/lib/dates";
import { inrS } from "@/lib/format";
import { seesAllSales } from "@/lib/permissions";
import { AvatarName, Card, DueTag, Empty, HBars, Kpi, PageHeader, Table, VBars } from "@/components/ui";
import { requireUser } from "@/server/session";
import { salesDashboard, type DashFilters } from "@/server/dashboard";
import { collectionsSummary } from "@/server/finance/service";
import { assignees } from "@/server/queries";
import { DashFilterBar } from "./filters";
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashFilters> }) {
  const user = await requireUser();
  const f = await searchParams;
  const all = seesAllSales(user.role);
  const [d, team, locations] = await Promise.all([
    salesDashboard(user, f),
    all ? assignees(user) : Promise.resolve([]),
    getLocations(),
  ]);
  const today = todayIST();
  const k = d.kpis;
  const cash = await collectionsSummary(user, { exec: all ? f.exec : undefined, state: f.state }, d.range.from, d.range.to);
  const first = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Hello, ${first}`}
        sub={`${all ? "Sales across the team" : "Your numbers"} · ${fmtDate(d.range.from, today)} – ${fmtDate(d.range.to, today)}`}
      />
      <DashFilterBar team={all ? team : null} states={locations.states} />

      <div className="kgrid kgrid-2 my-4">
        <Kpi label="Leads created" value={k.leads} sub={<Delta now={k.leads} prev={k.leadsPrev} />} color="#1C86C4" href="/leads?status=All" />
        <Kpi label="Hot opportunities" value={k.hot} sub="Open, category Hot" color="#D9412D" href="/opportunities?cat=HOT" />
        <Kpi label="Converted" value={k.converted} sub="Leads converted in period" color="#0E8F79" href="/leads?status=Converted" />
        <Kpi label="Open pipeline" value={inrS(k.openValue)} sub={`${k.openCount} opportunit${k.openCount === 1 ? "y" : "ies"}`} color="#7A48B8" href="/pipeline" />
        <Kpi label="Weighted forecast" value={inrS(k.weighted)} sub="Value × probability" color="#C77A00" href="/pipeline" />
        <Kpi label="Won" value={inrS(k.wonValue)} sub={`${k.wonCount} deal(s)`} color="#0E8F79" />
        <Kpi label="Lost" value={inrS(k.lostValue)} sub={`${k.lostCount} deal(s)`} color="#8B88A6" />
        <Kpi label="Win rate" value={k.winRate === null ? "–" : `${k.winRate}%`} sub="Won ÷ (won + lost)" color="#3D3BA8" />
      </div>
      <div className="kgrid kgrid-2 mb-4">
        <Kpi label="Collected" value={inrS(cash.collected)} sub={`${cash.collectedCount} payment(s) in period`} color="#0E8F79" href="/outstanding?show=all" />
        <Kpi label="Outstanding" value={inrS(cash.outstanding)} sub="Invoiced, not yet received" color="#C77A00" href="/outstanding" />
        <Kpi label="Overdue" value={inrS(cash.overdue)} sub={`${cash.overdueCount} invoice(s) past due`} color="#D9412D" href="/outstanding?show=overdue" />
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
            data={d.byStage.map((s) => ({ label: `${STAGE_LABEL[s.stage]} (${s.count})`, value: s.value, color: STAGE_COLOR[s.stage], href: "/pipeline" }))}
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
        <Card title={all ? "Sales team" : "My numbers"}>
          <Table head={["Person", ["Leads", "num"], ["Interactions", "num"], ["Open pipeline", "num"], ["Won", "num"]]} empty="No sales team members yet.">
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
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 min-[1101px]:grid-cols-4 min-[901px]:grid-cols-2">
        <Card title="Why deals were lost">
          {d.lostReasons.length ? <HBars data={d.lostReasons.map((r) => ({ ...r, color: "#D9412D" }))} /> : <Empty>No lost deals in this period.</Empty>}
        </Card>
        <Card title="Competitors met">
          {d.competitors.length ? <HBars data={d.competitors.map((r) => ({ ...r, color: "#E8930C" }))} /> : <Empty>None recorded.</Empty>}
        </Card>
        <Card title="Biggest open deals">
          {d.biggest.length ? (
            d.biggest.map((o) => (
              <Link key={o.id} href={`/opportunities?opp=${o.id}`} className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-ink no-underline last:border-0">
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
      </div>
    </>
  );
}

import Link from "next/link";
import { STAGE_COLOR, STAGE_LABEL, oppCode } from "@/lib/constants";
import { fmtDate, todayIST } from "@/lib/dates";
import { inrS } from "@/lib/format";
import { seesAllSales } from "@/lib/permissions";
import { AvatarName, DueTag, Empty, PageHeader, Pill, Table } from "@/components/ui";
import { requireUser } from "@/server/session";
import { assignees, oppDetail, pipelineCards, productOptions, type PipelineCard } from "@/server/queries";
import { OppDrawer } from "../pipeline/opp-drawer";
import { OppFilterBar } from "./filters";

export const metadata = { title: "Opportunities" };

type SP = Promise<{ q?: string; stage?: string; owner?: string; opp?: string }>;

export default async function OpportunitiesPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const all = seesAllSales(user.role);
  const stage = sp.stage ?? "Open";
  const [rows, team, detail, products] = await Promise.all([
    pipelineCards(user, { q: sp.q, stage: stage === "All" ? undefined : stage, owner: sp.owner }),
    assignees(user),
    sp.opp ? oppDetail(user, sp.opp) : null,
    sp.opp ? productOptions() : [],
  ]);
  const today = todayIST();
  const total = rows.reduce((n, r) => n + r.value, 0);
  const filtered = !!(sp.q || sp.owner || stage !== "Open");
  const href = (id: string) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "opp" && v) as [string, string][]);
    p.set("opp", id);
    return `/opportunities?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Opportunities"
        sub={`${all ? "" : "Your opportunities only. "}${rows.length} shown · ${inrS(total)} total value.`}
      >
        <Link className="btn" href="/pipeline">
          Board view
        </Link>
      </PageHeader>
      <OppFilterBar team={all ? team : null} />

      {/* Computer: table */}
      <div className="hidden min-[901px]:block">
        <Table
          head={["Opportunity", "School", "Stage", ["Value", "num"], ["Chance", "num"], "Expected close", "Next action", "Owner"]}
          empty={filtered ? "No opportunities match these filters." : "No open opportunities. Leads become opportunities when marked Qualified."}
        >
          {rows.map((o) => (
            <tr key={o.id} className="click">
              <td className="faint">
                <Link href={href(o.id)} scroll={false} className="text-inherit no-underline">
                  {oppCode(o.number)}
                </Link>
              </td>
              <td>
                <Link href={href(o.id)} scroll={false} className="font-bold text-ink no-underline hover:underline">
                  {o.schoolName}
                </Link>
                <div className="small muted">{[o.contactName, o.city].filter(Boolean).join(" · ")}</div>
              </td>
              <td>
                <StagePill o={o} />
              </td>
              <td className="num">
                {inrS(o.value)}
                {o.unpriced ? <div className="small faint">+{o.unpriced} unpriced</div> : null}
              </td>
              <td className="num">{o.probability}%</td>
              <td className="whitespace-nowrap">{fmtDate(o.expectedCloseDate, today)}</td>
              <td className="small">
                <NextAction o={o} today={today} />
              </td>
              <td>
                <AvatarName id={o.owner.id} name={o.owner.name} />
              </td>
            </tr>
          ))}
        </Table>
      </div>

      {/* Phone: cards */}
      <div className="flex flex-col gap-2.5 min-[901px]:hidden">
        {rows.map((o) => (
          <Link
            key={o.id}
            href={href(o.id)}
            scroll={false}
            className="card block border-l-4 p-3.5 text-ink no-underline"
            style={{ borderLeftColor: STAGE_COLOR[o.stage] }}
          >
            <div className="flex items-start justify-between gap-2">
              <b className="min-w-0">{o.schoolName}</b>
              <StagePill o={o} />
            </div>
            <div className="small muted mt-0.5">{[o.contactName, o.city].filter(Boolean).join(" · ")}</div>
            <div className="small mt-1.5">
              <b>{inrS(o.value)}</b>
              {o.unpriced ? <span className="faint"> +{o.unpriced} unpriced</span> : null} · {o.probability}% · {o.owner.name}
            </div>
            <div className="small mt-1">
              <NextAction o={o} today={today} />
            </div>
          </Link>
        ))}
        {!rows.length ? (
          <div className="card">
            <Empty>{filtered ? "No opportunities match these filters." : "No open opportunities yet."}</Empty>
          </div>
        ) : null}
      </div>

      {sp.opp && detail ? <OppDrawer key={detail.id + detail.stage} opp={detail} products={products} team={team} /> : null}
    </>
  );
}

function StagePill({ o }: { o: PipelineCard }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Pill>{STAGE_LABEL[o.stage]}</Pill>
      {o.clientId ? <Pill tone="ok">Client</Pill> : null}
    </span>
  );
}

function NextAction({ o, today }: { o: PipelineCard; today: string }) {
  if (o.stage === "LOST") return <span className="muted">Lost: {o.lostReason}</span>;
  if (o.stage === "WON") return <span className="muted">{o.clientId ? "Converted to client" : "Won · ready to convert to client"}</span>;
  if (!o.nextActionDate) return <span className="faint">{o.nextAction ?? "—"}</span>;
  return (
    <>
      {o.nextAction ?? "Next action"} · <DueTag date={o.nextActionDate} today={today} />
    </>
  );
}

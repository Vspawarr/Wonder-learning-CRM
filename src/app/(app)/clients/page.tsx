import { DateRangeFilter } from "@/components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import Link from "next/link";
import { CLIENT_STATUS_LABEL, clientCode } from "@/lib/constants";
import { fmtDate, istDate, todayIST } from "@/lib/dates";
import { seesAllSales } from "@/lib/permissions";
import { AvatarName, Empty, PageHeader, Pill, Table } from "@/components/ui";
import { requireUser } from "@/server/session";
import { YEAR_STANDING_LABEL, clientsList, type YearStanding } from "@/server/queries";
import { selectedRange } from "@/server/year";
import { financialYear, fyLabel } from "@/lib/fy";
import { inr } from "@/lib/format";
import { ClientFilterBar } from "./filters";
import { RenewalsBanner } from "@/components/renewals";
import { getFeatures } from "@/server/features";
import { renewalCandidates } from "@/server/renewals";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; yr?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const year = await selectedRange();
  const [rows, features] = await Promise.all([clientsList(user, { ...sp, year }), getFeatures()]);
  const yl = year ? fyLabel(financialYear(year.from).start) : null;
  const renewals = features.renewals ? await renewalCandidates(user) : null;
  const today = todayIST();
  const filtered = !!(sp.q || sp.status || sp.yr);
  const empty = filtered ? "No clients match these filters." : "No clients yet. Won opportunities can be converted to clients.";

  return (
    <>
      <PageHeader
        title="Clients"
        sub={`${seesAllSales(user.role) ? "" : "Your clients only. "}Every school that signed up, whatever the year, so schools that didn't renew can be contacted again.${yl ? ` "In ${yl}" shows who ordered this year.` : ""}`}
      >
        <ExportButtons report="clients" />
      </PageHeader>
      {renewals ? <RenewalsBanner ay={renewals.ay.label} count={renewals.clients.length} canCreate={seesAllSales(user.role)} /> : null}
      <ClientFilterBar year={yl} />
      <div className="mb-3">
        <DateRangeFilter label="Client since" />
      </div>

      <div className="hidden min-[901px]:block">
        <Table head={["Client", "School", "City", "Mobile", "Status", yl ? `In ${yl}` : "Last order", "Since", "Assigned to"]} empty={empty}>
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
              <td className="whitespace-nowrap">
                <YearCell standing={c.standing} amount={c.yearAmount} last={c.lastOrdered} />
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
              {clientCode(c.number)} · since {fmtDate(istDate(c.since), today)} · Assigned to {c.owner.name}
            </div>
            <div className="mt-1.5">
              <YearCell standing={c.standing} amount={c.yearAmount} last={c.lastOrdered} />
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

const STANDING_TONE: Record<YearStanding, "ok" | "info" | "bad" | "mute"> = {
  RENEWED: "ok",
  NEW: "info",
  BACK: "ok",
  NOT_RENEWED: "bad",
  NONE: "mute",
};

/** The client's standing in the chosen year, or the last year they ordered (All years). */
function YearCell({ standing, amount, last }: { standing: YearStanding | null; amount: number | null; last: string | null }) {
  if (!standing) return <span className="small muted">{last ? `Last order ${last}` : "No orders yet"}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Pill tone={STANDING_TONE[standing]}>{YEAR_STANDING_LABEL[standing]}</Pill>
      {amount ? <span className="small muted">{inr(amount)}</span> : null}
      {/* A school that didn't order this year: when it last did, so it can be contacted again. */}
      {!amount && last ? <span className="small faint">last {last}</span> : null}
    </span>
  );
}

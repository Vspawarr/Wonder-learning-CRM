import Link from "next/link";
import { clientCode } from "@/lib/constants";
import { dmy, inrExact as money } from "@/lib/format";
import { seesAllSales } from "@/lib/permissions";
import { Empty, Kpi, PageHeader, Table } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { ledgerClients, ledgerSummary, resolvePeriod } from "@/server/finance/ledger";
import { ClientStatement } from "./statement";
import { assignees } from "@/server/queries";
import { requireUser } from "@/server/session";
import { selectedRange, yearAnchor } from "@/server/year";
import { LedgerFilters } from "./filters";

export const metadata = { title: "Ledger" };

type SP = Promise<{ client?: string; period?: string; from?: string; to?: string; owner?: string }>;

const Bal = ({ n }: { n: number }) => <span className={n > 0 ? "text-coral" : ""}>{money(n)}</span>;

export default async function LedgerPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const all = seesAllSales(user.role);
  // Periods are worked out inside the financial year chosen after login.
  const period = resolvePeriod(sp, yearAnchor(await selectedRange()));
  const [clients, owners] = await Promise.all([ledgerClients(user), all ? assignees(user) : Promise.resolve(null)]);
  const chosen = sp.client && clients.some((c) => c.id === sp.client) ? sp.client : null;
  const range = `${period.label} · ${dmy(period.from)} – ${dmy(period.to)}`;

  return (
    <>
      <PageHeader title="Ledger" sub={`Built automatically from invoices (debit) and payments (credit). ${all ? "" : "Your clients only."}`}>
        <ExportButtons report="ledger" />
      </PageHeader>
      <LedgerFilters clients={clients} owners={owners} />
      {chosen ? <ClientStatement user={user} clientId={chosen} period={period} range={range} showClient /> : <Summary user={user} period={period} owner={sp.owner} range={range} />}
    </>
  );
}

async function Summary({ user, period, owner, range }: { user: Awaited<ReturnType<typeof requireUser>>; period: ReturnType<typeof resolvePeriod>; owner?: string; range: string }) {
  const s = await ledgerSummary(user, period, { owner });
  const t = s.totals;
  return (
    <>
      <div className="kgrid kgrid-2 mb-4">
        <Kpi label="Opening balance" value={money(t.opening)} sub={dmy(period.from)} color="#8B88A6" />
        <Kpi label="Invoiced (debit)" value={money(t.debit)} sub={period.label} color="#1C86C4" />
        <Kpi label="Received (credit)" value={money(t.credit)} sub={period.label} color="#0E8F79" />
        <Kpi label="Closing balance" value={money(t.closing)} sub={dmy(period.to)} color="#C77A00" />
      </div>
      <div className="small muted mb-2">All clients · {range}. Pick a client above for the full statement.</div>
      <div className="hidden min-[901px]:block">
        <Table head={["Client", "School", "City", "Assigned to", ["Opening", "num"], ["Invoiced", "num"], ["Received", "num"], ["Closing", "num"]]} empty="No invoices or payments in this period.">
          {s.rows.map((r) => (
            <tr key={r.clientId}>
              <td className="faint">{clientCode(r.number)}</td>
              <td>
                <Link href={`/ledger?client=${r.clientId}`} className="font-bold text-ink no-underline hover:underline">
                  {r.schoolName}
                </Link>
              </td>
              <td>{r.city}</td>
              <td>{r.owner}</td>
              <td className="num">{money(r.opening)}</td>
              <td className="num">{money(r.debit)}</td>
              <td className="num">{money(r.credit)}</td>
              <td className="num font-bold">
                <Bal n={r.closing} />
              </td>
            </tr>
          ))}
          {s.rows.length ? (
            <tr className="font-bold">
              <td />
              <td>Total</td>
              <td />
              <td />
              <td className="num">{money(t.opening)}</td>
              <td className="num">{money(t.debit)}</td>
              <td className="num">{money(t.credit)}</td>
              <td className="num">{money(t.closing)}</td>
            </tr>
          ) : null}
        </Table>
      </div>
      <div className="flex flex-col gap-2.5 min-[901px]:hidden">
        {s.rows.map((r) => (
          <Link key={r.clientId} href={`/ledger?client=${r.clientId}`} className="card block p-3.5 text-ink no-underline">
            <div className="flex items-start justify-between gap-2">
              <b className="min-w-0">{r.schoolName}</b>
              <b>
                <Bal n={r.closing} />
              </b>
            </div>
            <div className="small muted mt-0.5">
              {r.city} · Assigned to {r.owner}
            </div>
            <div className="small mt-1.5 grid grid-cols-3 gap-2">
              <span>
                Opening
                <br />
                <b>{money(r.opening)}</b>
              </span>
              <span>
                Invoiced
                <br />
                <b>{money(r.debit)}</b>
              </span>
              <span>
                Received
                <br />
                <b>{money(r.credit)}</b>
              </span>
            </div>
          </Link>
        ))}
        {!s.rows.length ? (
          <div className="card">
            <Empty>No invoices or payments in this period.</Empty>
          </div>
        ) : null}
      </div>
    </>
  );
}

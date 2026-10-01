import Link from "next/link";
import { clientCode } from "@/lib/constants";
import { dmy, inrExact as money } from "@/lib/format";
import { seesAllSales } from "@/lib/permissions";
import { Card, Empty, Kpi, PageHeader, Table } from "@/components/ui";
import { ExportButtons } from "@/components/export-buttons";
import { clientLedger, ledgerClients, ledgerSummary, resolvePeriod } from "@/server/finance/ledger";
import { assignees } from "@/server/queries";
import { requireUser } from "@/server/session";
import { LedgerFilters } from "./filters";

export const metadata = { title: "Ledger" };

type SP = Promise<{ client?: string; period?: string; from?: string; to?: string; owner?: string }>;

const Bal = ({ n }: { n: number }) => <span className={n > 0 ? "text-coral" : ""}>{money(n)}</span>;

export default async function LedgerPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const all = seesAllSales(user.role);
  const period = resolvePeriod(sp);
  const [clients, owners] = await Promise.all([ledgerClients(user), all ? assignees(user) : Promise.resolve(null)]);
  const chosen = sp.client && clients.some((c) => c.id === sp.client) ? sp.client : null;
  const range = `${period.label} · ${dmy(period.from)} – ${dmy(period.to)}`;

  return (
    <>
      <PageHeader title="Ledger" sub={`Built automatically from invoices (debit) and payments (credit). ${all ? "" : "Your clients only."}`}>
        <ExportButtons report="ledger" />
      </PageHeader>
      <LedgerFilters clients={clients} owners={owners} />
      {chosen ? <ClientStatement user={user} clientId={chosen} period={period} range={range} /> : <Summary user={user} period={period} owner={sp.owner} range={range} />}
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
        <Table head={["Client", "School", "City", "Owner", ["Opening", "num"], ["Invoiced", "num"], ["Received", "num"], ["Closing", "num"]]} empty="No invoices or payments in this period.">
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
              {r.city} · {r.owner}
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

async function ClientStatement({ user, clientId, period, range }: { user: Awaited<ReturnType<typeof requireUser>>; clientId: string; period: ReturnType<typeof resolvePeriod>; range: string }) {
  const l = await clientLedger(user, clientId, period);
  return (
    <>
      <div className="kgrid kgrid-2 mb-4">
        <Kpi label="Opening balance" value={money(l.opening)} sub={dmy(period.from)} color="#8B88A6" />
        <Kpi label="Invoiced (debit)" value={money(l.debit)} sub={period.label} color="#1C86C4" />
        <Kpi label="Received (credit)" value={money(l.credit)} sub={period.label} color="#0E8F79" />
        <Kpi label="Closing balance" value={money(l.closing)} sub={dmy(period.to)} color="#C77A00" />
      </div>
      <Card
        title={
          <span>
            <Link href={`/clients/${l.client.id}`} className="text-ink">
              {l.client.schoolName}
            </Link>{" "}
            <span className="small muted font-normal">
              {clientCode(l.client.number)} · {l.client.city} · {range}
            </span>
          </span>
        }
      >
        <div className="hidden min-[901px]:block">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-ink3">
                <th className="py-2 pr-2 font-semibold">Date</th>
                <th className="py-2 pr-2 font-semibold">Ref. No.</th>
                <th className="py-2 pr-2 font-semibold">Particulars</th>
                <th className="py-2 pr-2 text-right font-semibold">Debit</th>
                <th className="py-2 pr-2 text-right font-semibold">Credit</th>
                <th className="py-2 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="py-2 pr-2">{dmy(period.from)}</td>
                <td />
                <td className="py-2 pr-2 italic">Opening balance</td>
                <td />
                <td />
                <td className="py-2 text-right">{money(l.opening)}</td>
              </tr>
              {l.entries.map((e, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-2 pr-2 whitespace-nowrap">{dmy(e.date)}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{e.ref}</td>
                  <td className="py-2 pr-2">{e.particulars}</td>
                  <td className="py-2 pr-2 text-right">{e.debit ? money(e.debit) : ""}</td>
                  <td className="py-2 pr-2 text-right text-mint">{e.credit ? money(e.credit) : ""}</td>
                  <td className="py-2 text-right font-semibold">
                    <Bal n={e.balance} />
                  </td>
                </tr>
              ))}
              <tr className="font-bold">
                <td />
                <td />
                <td className="py-2 pr-2">Closing balance</td>
                <td className="py-2 pr-2 text-right">{money(l.debit)}</td>
                <td className="py-2 pr-2 text-right">{money(l.credit)}</td>
                <td className="py-2 text-right">
                  <Bal n={l.closing} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col min-[901px]:hidden">
          <div className="small flex justify-between border-b border-line py-2 italic">
            <span>Opening balance · {dmy(period.from)}</span>
            <b>{money(l.opening)}</b>
          </div>
          {l.entries.map((e, i) => (
            <div key={i} className="border-b border-line py-2">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <b>{e.ref}</b> <span className="small muted">· {dmy(e.date)}</span>
                </span>
                <span className={`whitespace-nowrap font-semibold ${e.credit ? "text-mint" : ""}`}>{e.credit ? `− ${money(e.credit)}` : `+ ${money(e.debit)}`}</span>
              </div>
              <div className="small muted">{e.particulars}</div>
              <div className="small">
                Balance <b>{money(e.balance)}</b>
              </div>
            </div>
          ))}
          <div className="flex justify-between py-2 font-bold">
            <span>Closing balance</span>
            <Bal n={l.closing} />
          </div>
        </div>
        {!l.entries.length ? <div className="small muted mt-2">No invoices or payments in this period.</div> : null}
      </Card>
    </>
  );
}

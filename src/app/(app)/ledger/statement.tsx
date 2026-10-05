import Link from "next/link";
import { ExportButtons } from "@/components/export-buttons";
import { Card, Kpi } from "@/components/ui";
import { clientCode } from "@/lib/constants";
import { dmy, inrExact as money } from "@/lib/format";
import type { SessionUser } from "@/lib/permissions";
import { clientLedger, type LedgerPeriod } from "@/server/finance/ledger";

const Bal = ({ n }: { n: number }) => <span className={n > 0 ? "text-coral" : ""}>{money(n)}</span>;

/** One client's statement (R41: also on the client's own page, with the PO number of each entry). */
export async function ClientStatement({
  user,
  clientId,
  period,
  range,
  showClient = false,
}: {
  user: SessionUser;
  clientId: string;
  period: LedgerPeriod;
  range: string;
  /** On the Ledger page: the school's name links to its page. On the client page: link to the full Ledger instead. */
  showClient?: boolean;
}) {
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
          showClient ? (
            <span>
              <Link href={`/clients/${l.client.id}`} className="text-ink">
                {l.client.schoolName}
              </Link>{" "}
              <span className="small muted font-normal">
                {clientCode(l.client.number)} · {l.client.city} · {range}
              </span>
            </span>
          ) : (
            <span>
              Statement <span className="small muted font-normal">· {range}</span>
            </span>
          )
        }
      >
        {!showClient ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ExportButtons report="ledger" extra={{ client: l.client.id }} />
            <Link href={`/ledger?client=${l.client.id}`} className="btn sm">
              Other periods
            </Link>
          </div>
        ) : null}
        <div className="hidden min-[901px]:block">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-ink3">
                <th className="py-2 pr-2 font-semibold">Date</th>
                <th className="py-2 pr-2 font-semibold">Ref. No.</th>
                <th className="py-2 pr-2 font-semibold">PO No.</th>
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
                  <td className="py-2 pr-2 whitespace-nowrap">{e.po ?? ""}</td>
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
              <div className="small muted">
                {e.particulars}
                {e.po ? ` · PO ${e.po}` : ""}
              </div>
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

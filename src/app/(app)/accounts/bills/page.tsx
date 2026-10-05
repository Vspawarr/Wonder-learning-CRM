import { DateRangeFilter } from "@/components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { Card, Empty, Kpi, PageHeader, Pill, type Tone } from "@/components/ui";
import { billCode } from "@/lib/constants";
import { dmy, inr, inrExact as money } from "@/lib/format";
import { billList, type BillState } from "@/server/company";
import { periodOrYear } from "@/server/year";
import { AddBillButton, DecideButtons, DeleteButton, PayBillButton, ShowChips } from "../company-client";
import { companyPage } from "../guard";

export const metadata = { title: "Bills to pay" };

const STATE: Record<BillState, [string, Tone]> = {
  WAITING: ["Waiting for approval", "warn"],
  REJECTED: ["Rejected", "bad"],
  UNPAID: ["To pay", "info"],
  PARTIAL: ["Part paid", "info"],
  OVERDUE: ["Overdue", "bad"],
  PAID: ["Paid", "ok"],
};

/** Accounts → Bills (R39): supplier bills (press, paper, courier, software…), approval, and payments against them. */
export default async function BillsPage({ searchParams }: { searchParams: Promise<{ show?: string; from?: string; to?: string }> }) {
  const { options, canApprove, approver } = await companyPage();
  const sp = await searchParams;
  const period = await periodOrYear(sp.from, sp.to);
  // "To pay" and "Waiting" show every open bill, whatever its date.
  const [rows, open] = await Promise.all([billList(sp.show ? { show: sp.show } : period), billList({ show: "topay" })]);
  const waiting = await billList({ show: "waiting" });
  const toPay = open.reduce((t, b) => t + b.balance, 0);
  const overdue = open.filter((b) => b.state === "OVERDUE");
  return (
    <>
      <PageHeader title="Bills to pay" sub="Bills the company owes suppliers. Add the bill with its photo; the Director approves; then pay it (all at once or in parts) from the right account.">
        <ExportButtons report="bills" />
        <AddBillButton />
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 min-[901px]:grid-cols-4">
        <Kpi label="Still to pay" value={inr(toPay)} sub={`${open.length} bill${open.length === 1 ? "" : "s"}`} color="#1C86C4" />
        <Kpi label="Overdue" value={inr(overdue.reduce((t, b) => t + b.balance, 0))} sub={`${overdue.length} past the due date`} color="#D9412D" />
        <Kpi label="Waiting for approval" value={String(waiting.length)} sub={inr(waiting.reduce((t, b) => t + b.total, 0))} color="#E8930C" />
        <Kpi label="Bills in the list" value={inr(rows.filter((b) => b.state !== "REJECTED").reduce((t, b) => t + b.total, 0))} sub="Including GST" color="#0E8F79" />
      </div>
      <div className="note mb-3">
        Bills are approved by <b>{approver}</b>.{canApprove ? "" : " The Approve buttons are on the Director's login."}
      </div>
      <Card title={`Bills (${rows.length})`}>
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <ShowChips options={[["", "All"], ["topay", "To pay"], ["waiting", "Waiting for approval"]]} />
          {!sp.show ? <DateRangeFilter label="Bill date" /> : null}
        </div>
        {rows.length ? (
          <div className="grid grid-cols-1 gap-2.5 min-[1101px]:grid-cols-2">
            {rows.map((b) => (
              <div key={b.id} className="rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className={`text-[17px] ${b.state === "REJECTED" ? "text-coral line-through" : ""}`}>{money(b.total)}</b> <Pill tone={STATE[b.state][1]}>{STATE[b.state][0]}</Pill>
                    <div className="mt-0.5 font-semibold">{b.vendor}</div>
                  </div>
                  <span className="tag whitespace-nowrap">{billCode(b.number)}</span>
                </div>
                <div className="small mt-1">
                  {b.category} · {b.description}
                </div>
                <div className="small muted">
                  {b.billNo ? `Bill ${b.billNo} · ` : ""}dated {dmy(b.billDate)}
                  {b.dueDate ? ` · pay by ${dmy(b.dueDate)}` : ""}
                  {b.gstAmount ? ` · ${money(b.amount)} + GST ${b.gstRate}% ${money(b.gstAmount)}` : ""} · added by {b.by}
                </div>
                {b.rejectReason ? <div className="small text-coral">Rejected: {b.rejectReason}</div> : null}
                {b.payments.length ? (
                  <ul className="small mt-1.5 flex flex-col gap-0.5 border-t border-line pt-1.5">
                    {b.payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-1">
                        <span>
                          Paid {money(p.amount)} on {dmy(p.date)}
                          {p.account ? ` from ${p.account}` : ""}
                          {p.mode ? ` · ${p.mode}` : ""}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </span>
                        <DeleteButton what="this payment" kind="bill-payment" id={p.id} />
                      </li>
                    ))}
                    {b.balance > 0 ? <li className="font-semibold">Still to pay: {money(b.balance)}</li> : null}
                  </ul>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {b.state === "WAITING" && canApprove ? <DecideButtons kind="bill" id={b.id} what={`${billCode(b.number)} (${money(b.total)})`} /> : null}
                  {["UNPAID", "PARTIAL", "OVERDUE"].includes(b.state) ? <PayBillButton bill={b} accounts={options} /> : null}
                  {b.hasFile ? (
                    <a className="btn sm" href={`/api/company/files/bill/${b.id}`} target="_blank" rel="noreferrer">
                      View bill
                    </a>
                  ) : null}
                  {!b.payments.length ? <DeleteButton what={`bill ${billCode(b.number)}`} kind="bill" id={b.id} /> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{sp.show ? "Nothing here." : "No bills in this period. Add the first one with “Add bill”."}</Empty>
        )}
      </Card>
    </>
  );
}

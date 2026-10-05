import { ExportButtons } from "@/components/export-buttons";
import { Card, Empty, Kpi, PageHeader, Pill } from "@/components/ui";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { dmy, inr, inrExact as money } from "@/lib/format";
import { salaryList } from "@/server/company";
import { periodOrYear } from "@/server/year";
import { AddSalaryButton, DecideButtons, DeleteButton } from "../company-client";
import { companyPage } from "../guard";

export const metadata = { title: "Salaries" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

/** Accounts → Salaries (R39): the monthly salary register, kept apart from bills. */
export default async function SalariesPage() {
  const { options, canApprove, approver } = await companyPage();
  const period = await periodOrYear();
  const [rows, people] = await Promise.all([
    salaryList(period),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const counted = rows.filter((s) => s.status === "APPROVED");
  const months = [...new Set(rows.map((s) => s.month))];
  const thisMonth = todayIST().slice(0, 7);
  const now = counted.filter((s) => s.month === thisMonth);
  const waiting = rows.filter((s) => s.status === "PENDING");
  return (
    <>
      <PageHeader title="Salaries" sub="Salary paid to each person, month by month. Gross, deductions and the take-home that left the bank.">
        <ExportButtons report="salaries" />
        <AddSalaryButton people={people} accounts={options} month={thisMonth} />
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 min-[901px]:grid-cols-4">
        <Kpi label="This month (take-home)" value={inr(now.reduce((t, s) => t + s.net, 0))} sub={`${now.length} people paid`} color="#3D3BA8" />
        <Kpi label="Gross in the year" value={inr(counted.reduce((t, s) => t + s.gross, 0))} sub="Approved salaries" color="#0E8F79" />
        <Kpi label="Deductions in the year" value={inr(counted.reduce((t, s) => t + s.deductions, 0))} sub="PF, TDS, recoveries" color="#1C86C4" />
        <Kpi label="Waiting for approval" value={String(waiting.length)} sub={inr(waiting.reduce((t, s) => t + s.net, 0))} color="#E8930C" />
      </div>
      {waiting.length ? (
        <div className="note mb-3">
          Salaries entered by Accounts are approved by <b>{approver}</b>.
        </div>
      ) : null}
      {months.length ? (
        <div className="flex flex-col gap-4">
          {months.map((m) => {
            const list = rows.filter((s) => s.month === m);
            const ok = list.filter((s) => s.status === "APPROVED");
            return (
              <Card key={m} title={`${monthName(m)} · ${money(ok.reduce((t, s) => t + s.net, 0))} take-home`}>
                <ul className="flex flex-col">
                  {list.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
                      <span className="min-w-0">
                        <b className={s.status === "REJECTED" ? "text-coral line-through" : ""}>{s.employeeName}</b>{" "}
                        {s.status === "PENDING" ? <Pill tone="warn">Waiting</Pill> : s.status === "REJECTED" ? <Pill tone="bad">Rejected</Pill> : null}
                        <span className="small block muted">
                          Gross {money(s.gross)}
                          {s.deductions ? ` − ${money(s.deductions)}` : ""} = <b className="text-ink">{money(s.net)}</b> · paid {dmy(s.paidOn)}
                          {s.account ? ` from ${s.account}` : ""}
                          {s.mode ? ` · ${s.mode}` : ""}
                          {s.reference ? ` · ${s.reference}` : ""}
                          {s.note ? ` · ${s.note}` : ""}
                        </span>
                        {s.rejectReason ? <span className="small block text-coral">Rejected: {s.rejectReason}</span> : null}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {s.status === "PENDING" && canApprove ? <DecideButtons kind="salary" id={s.id} what={`${s.employeeName}'s salary`} /> : null}
                        <DeleteButton what={`${s.employeeName}'s ${monthName(s.month)} salary`} kind="salary" id={s.id} />
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty>No salaries entered for this year yet. Use “Add salary” after paying each person.</Empty>
        </Card>
      )}
    </>
  );
}

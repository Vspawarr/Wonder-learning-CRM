import { notFound } from "next/navigation";
import { DateRangeFilter } from "@/components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { Card, Empty, Kpi, PageHeader } from "@/components/ui";
import { inr } from "@/lib/format";
import { canManageExpenses } from "@/lib/permissions";
import { advanceList, expenseBalances, expenseList } from "@/server/expenses";
import { getFeatures } from "@/server/features";
import { taskTargets } from "@/server/queries";
import { requireUser } from "@/server/session";
import { selectedRange } from "@/server/year";
import { AddExpenseButton, ExpenseCard, ExpenseFilters } from "./expenses-client";

export const metadata = { title: "Expenses" };

const dmy = (d: string) => d.split("-").reverse().join("/");

/** My expenses (R37): spends with bills, what's waiting, what the company owes me, and my advance. */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ status?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  if (!(await getFeatures()).expenses) notFound();
  const sp = await searchParams;
  const accounts = canManageExpenses(user.role);
  const [rows, [bal], advances, targets] = await Promise.all([
    expenseList(user, { ...sp, person: accounts ? user.id : undefined, year: await selectedRange() }),
    expenseBalances(user, user.id),
    advanceList(user, user.id),
    taskTargets(user),
  ]);
  const spent = rows.filter((r) => r.status === "APPROVED").reduce((t, r) => t + r.amount, 0);
  return (
    <>
      <PageHeader
        title="My expenses"
        sub="Travel, hotel, meals and other spends for work, each with its bill. Accounts approves them; spends from your own money are paid back."
      >
        <ExportButtons report="expenses" extra={{ person: user.id }} />
        <AddExpenseButton accounts={accounts} people={[{ id: user.id, name: user.name }]} targets={targets} me={user.id} />
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 min-[901px]:grid-cols-4">
        <Kpi label="Advance with me" value={inr(bal?.advanceBalance ?? 0)} sub={`Given ${inr(bal?.advanceGiven ?? 0)} · spent ${inr(bal?.spentFromAdvance ?? 0)}`} color="#3D3BA8" />
        <Kpi label="To be paid back to me" value={inr(bal?.toReimburse ?? 0)} sub="Approved, own money" color="#0E8F79" />
        <Kpi label="Waiting for approval" value={inr(bal?.waiting ?? 0)} sub="Sent to Accounts" color="#E8930C" />
        <Kpi label="Approved this year" value={inr(spent)} sub="In the chosen financial year" color="#1C86C4" />
      </div>
      {(bal?.advanceBalance ?? 0) < 0 ? (
        <div className="note warn mb-3">You have spent {inr(-(bal?.advanceBalance ?? 0))} more than your advance. Accounts will settle it.</div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <ExpenseFilters accounts={false} />
        <DateRangeFilter label="Spent" />
      </div>
      <Card title={`Expenses (${rows.length})`}>
        {rows.length ? (
          <div className="grid grid-cols-1 gap-2.5 min-[1101px]:grid-cols-2">
            {rows.map((e) => (
              <ExpenseCard key={e.id} e={e} me={user.id} accounts={false} showPerson={false} />
            ))}
          </div>
        ) : (
          <Empty>No expenses here yet. Use “Add expense” and take a photo of the bill.</Empty>
        )}
      </Card>
      {advances.length ? (
        <div className="mt-4">
          <Card title="Advances from the company">
            <ul className="flex flex-col">
              {advances.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
                  <span>
                    <b>{a.kind === "GIVEN" ? "Received" : "Returned"} {inr(a.amount)}</b>
                    <span className="small muted">
                      {" "}
                      · {dmy(a.date)}
                      {a.mode ? ` · ${a.mode}` : ""}
                      {a.reference ? ` · ${a.reference}` : ""}
                      {a.note ? ` · ${a.note}` : ""}
                    </span>
                  </span>
                  <span className="small faint">by {a.by}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </>
  );
}

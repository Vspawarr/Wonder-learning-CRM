import { notFound } from "next/navigation";
import { DateRangeFilter } from "@/components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { Card, Empty, Kpi, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { canManageExpenses } from "@/lib/permissions";
import { advanceList, canApproveExpenses, expenseApprover, expenseBalances, expenseList } from "@/server/expenses";
import { getFeatures } from "@/server/features";
import { listAccounts } from "@/server/company";
import { taskTargets } from "@/server/queries";
import { requireUser } from "@/server/session";
import { selectedRange } from "@/server/year";
import { AddExpenseButton, ExpenseCard, ExpenseFilters } from "../../expenses/expenses-client";
import { AdvanceButton, DeleteAdvance, PayBackButton, PersonFilter } from "./accounts-expenses-client";

export const metadata = { title: "Expenses (Accounts)" };

const dmy = (d: string) => d.split("-").reverse().join("/");

/** Accounts → Expenses (R37): approve claims, pay people back, give advances, record company expenses. */
export default async function AccountsExpensesPage({ searchParams }: { searchParams: Promise<{ status?: string; person?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  if (!canManageExpenses(user.role) || !(await getFeatures()).expenses) notFound();
  const sp = await searchParams;
  const year = await selectedRange();
  const [waiting, rows, balances, advances, people, targets, canApprove, approver, features, moneyAccounts] = await Promise.all([
    expenseList(user, { status: "waiting" }),
    expenseList(user, { ...sp, year }),
    expenseBalances(user),
    advanceList(user),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    taskTargets(user),
    canApproveExpenses(user),
    expenseApprover(),
    getFeatures(),
    listAccounts(),
  ]);
  // R39: which company account the money moved through (once accounts are set up).
  const acc = features.companyAccounts ? moneyAccounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name, kind: a.kind, active: a.active })) : [];
  const bankCash = acc.filter((a) => a.kind !== "CARD");
  const toPay = balances.reduce((t, b) => t + b.toReimburse, 0);
  const out = balances.reduce((t, b) => t + Math.max(0, b.advanceBalance), 0);
  const approved = rows.filter((r) => r.status === "APPROVED").reduce((t, r) => t + r.amount, 0);
  return (
    <>
      <PageHeader title="Expenses" sub="The team's bills and company spends. Approve claims, pay people back, give advances. Everything is counted here.">
        <ExportButtons report="expenses" />
        <AdvanceButton people={people} accounts={bankCash} />
        <AddExpenseButton accounts people={people} targets={targets} me={user.id} label="Add expense" company moneyAccounts={bankCash} />
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 min-[901px]:grid-cols-4">
        <Kpi label="Waiting for approval" value={String(waiting.length)} sub={inr(waiting.reduce((t, e) => t + e.amount, 0))} color="#E8930C" />
        <Kpi label="To pay back" value={inr(toPay)} sub="Approved own-money spends" color="#0E8F79" />
        <Kpi label="Advances with employees" value={inr(out)} sub="Not yet spent" color="#3D3BA8" />
        <Kpi label="Approved (list below)" value={inr(approved)} sub="Chosen year and filters" color="#1C86C4" />
      </div>

      <div className="note mb-3">
        Expenses are approved by <b>{approver}</b>.{canApprove ? "" : " You can see them here; the Approve buttons are on the Director's login."}
      </div>
      <Card title={`Waiting for approval (${waiting.length})`}>
        {waiting.length ? (
          <div className="grid grid-cols-1 gap-2.5 min-[1101px]:grid-cols-2">
            {waiting.map((e) => (
              <ExpenseCard key={e.id} e={e} me={user.id} accounts showPerson canApprove={canApprove} />
            ))}
          </div>
        ) : (
          <Empty>Nothing waiting.</Empty>
        )}
      </Card>

      <div className="mt-4">
        <Card title="People: advances and money owed">
          {balances.length ? (
            <div className="grid grid-cols-1 gap-2.5 min-[701px]:grid-cols-2 min-[1101px]:grid-cols-3">
              {balances.map((b) => (
                <div key={b.id} className="rounded-lg border border-line p-3">
                  <b>{b.name}</b>
                  <dl className="facts mt-1.5">
                    <dt>Advance with them</dt>
                    <dd className={b.advanceBalance < 0 ? "text-coral" : ""}>
                      {inr(b.advanceBalance)}
                      {b.advanceBalance < 0 ? " (spent more than given)" : ""}
                    </dd>
                    <dt>Given / spent</dt>
                    <dd>
                      {inr(b.advanceGiven)} / {inr(b.spentFromAdvance)}
                    </dd>
                    <dt>To pay back</dt>
                    <dd>{inr(b.toReimburse)}</dd>
                    <dt>Waiting approval</dt>
                    <dd>{inr(b.waiting)}</dd>
                  </dl>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {b.toReimburse > 0 ? <PayBackButton person={b} amount={b.toReimburse} accounts={bankCash} /> : null}
                    <AdvanceButton people={people} person={b} small accounts={bankCash} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No advances or claims yet.</Empty>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card title={`All expenses (${rows.length})`}>
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <PersonFilter people={people} />
            <ExpenseFilters accounts />
            <DateRangeFilter label="Spent" />
          </div>
          {rows.length ? (
            <div className="grid grid-cols-1 gap-2.5 min-[1101px]:grid-cols-2">
              {rows.map((e) => (
                <ExpenseCard key={e.id} e={e} me={user.id} accounts showPerson canApprove={canApprove} />
              ))}
            </div>
          ) : (
            <Empty>No expenses match.</Empty>
          )}
        </Card>
      </div>

      {advances.length ? (
        <div className="mt-4">
          <Card title="Advance entries">
            <ul className="flex flex-col">
              {advances.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
                  <span className="min-w-0">
                    <b>
                      {a.user}: {a.kind === "GIVEN" ? "given" : "returned"} {inr(a.amount)}
                    </b>
                    <span className="small muted">
                      {" "}
                      · {dmy(a.date)}
                      {a.mode ? ` · ${a.mode}` : ""}
                      {a.reference ? ` · ${a.reference}` : ""}
                      {a.note ? ` · ${a.note}` : ""} · by {a.by}
                    </span>
                  </span>
                  <DeleteAdvance id={a.id} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </>
  );
}

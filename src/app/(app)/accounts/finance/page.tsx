import Link from "next/link";
import { DateRangeFilter } from "@/components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { Card, Empty, HBars, Kpi, PageHeader } from "@/components/ui";
import { MONEY_ACCOUNT_KIND_LABEL } from "@/lib/constants";
import { dmy, inr, inrS } from "@/lib/format";
import { financeOverview } from "@/server/company-books";
import { periodOrYear } from "@/server/year";
import { companyPage } from "../guard";

export const metadata = { title: "Company finance" };

function Facts({ rows }: { rows: [React.ReactNode, number, string?][] }) {
  return (
    <dl className="flex flex-col">
      {rows.map(([label, value, cls], i) => (
        <div key={i} className={`flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0 ${cls ?? ""}`}>
          <dt className="min-w-0">{label}</dt>
          <dd className="whitespace-nowrap font-semibold">{inr(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Accounts → Company finance (R39): money in, money out, balances, what is to come in and go out, income vs expense, GST. */
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { user } = await companyPage();
  const sp = await searchParams;
  const period = await periodOrYear(sp.from, sp.to);
  const f = await financeOverview(user, period.from, period.to);
  const max = Math.max(1, ...f.months.flatMap((m) => [m.in, m.out]));
  const toReceive = f.toReceive.schools + f.toReceive.chequesInHand + f.toReceive.awaitingApproval;
  const toPay = f.toPay.bills + f.toPay.staffPayBacks + f.toPay.cardDues;
  return (
    <>
      <PageHeader
        title="Company finance"
        sub={`The company's money for ${dmy(period.from)} – ${dmy(period.to)}: what came in, what went out, what is in each account, and what is still to come in or go out.`}
      >
        <ExportButtons report="finance" />
      </PageHeader>
      <div className="mb-3">
        <DateRangeFilter label="Period" />
      </div>
      {f.pendingSpend ? (
        <div className="note mb-3">
          {f.pendingSpend} payment{f.pendingSpend > 1 ? "s are" : " is"} waiting for the Director&apos;s approval (bills, salaries or other payments). They are not counted until approved.
        </div>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-3 min-[901px]:grid-cols-4">
        <Kpi label="Money in" value={inrS(f.moneyIn)} sub="Received in the period" color="#0E8F79" />
        <Kpi label="Money out" value={inrS(f.moneyOut)} sub="Spent in the period" color="#D9412D" />
        <Kpi label="Net" value={inrS(f.net)} sub={f.net >= 0 ? "More came in than went out" : "More went out than came in"} color="#3D3BA8" />
        <Kpi label="In bank & cash now" value={inrS(f.totalBalance)} sub="All accounts except the card" color="#1C86C4" href="/accounts/books" />
      </div>

      <div className="grid grid-cols-1 gap-4 min-[1101px]:grid-cols-2">
        <Card title="Money in and out by month">
          {f.months.length ? (
            <div className="flex flex-col gap-1.5">
              {f.months.map((m) => (
                <div key={m.key} className="grid grid-cols-[52px_1fr] items-center gap-2 text-[13px]">
                  <span className="muted">{m.label}</span>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 rounded-sm bg-mint" style={{ width: `${(m.in / max) * 80}%` }} />
                      <span className="whitespace-nowrap">{m.in ? inrS(m.in) : ""}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 rounded-sm bg-coral" style={{ width: `${(m.out / max) * 80}%` }} />
                      <span className="whitespace-nowrap">{m.out ? inrS(m.out) : ""}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="small muted mt-1 flex gap-4">
                <span>
                  <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-mint" />
                  In
                </span>
                <span>
                  <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-coral" />
                  Out
                </span>
              </div>
            </div>
          ) : (
            <Empty>No months in this period.</Empty>
          )}
        </Card>
        <Card title="Balances today">
          {f.balances.accounts.length ? (
            <Facts
              rows={[
                ...f.balances.accounts.map(
                  (a) =>
                    [
                      <Link key={a.id} href={`/accounts/books?acc=${a.id}`}>
                        {a.name} <span className="small muted">({MONEY_ACCOUNT_KIND_LABEL[a.kind]})</span>
                      </Link>,
                      a.balance,
                      a.balance < 0 ? "text-coral" : "",
                    ] as [React.ReactNode, number, string],
                ),
                ...(f.balances.unassigned.count
                  ? [[<Link key="none" href="/accounts/books?acc=none">Not assigned to an account ({f.balances.unassigned.count})</Link>, f.balances.unassigned.net, "muted"] as [React.ReactNode, number, string]]
                  : []),
              ]}
            />
          ) : (
            <Empty>
              No accounts set up yet. <Link href="/accounts/books">Add the bank accounts, cash and card</Link> to see balances.
            </Empty>
          )}
        </Card>

        <Card title="Where the money came from">
          {f.inBy.length ? <HBars data={f.inBy.map((x) => ({ label: x.label, value: x.value, color: "var(--mint)" }))} format={inrS} /> : <Empty>Nothing received in this period.</Empty>}
        </Card>
        <Card title="Where the money went">
          {f.outBy.length ? <HBars data={f.outBy.map((x) => ({ label: x.label, value: x.value, color: "var(--coral)" }))} format={inrS} /> : <Empty>Nothing spent in this period.</Empty>}
        </Card>

        <Card title={`Still to come in · ${inr(toReceive)}`}>
          <Facts
            rows={[
              [<Link key="o" href="/outstanding">Schools still owe (invoices)</Link>, f.toReceive.schools],
              ["of which overdue", f.toReceive.overdue, "small muted pl-3"],
              ["Cheques in hand, not yet cleared", f.toReceive.chequesInHand],
              [<Link key="a" href="/accounts">Payments waiting for approval</Link>, f.toReceive.awaitingApproval],
            ]}
          />
        </Card>
        <Card title={`Still to pay · ${inr(toPay)}`}>
          <Facts
            rows={[
              [<Link key="b" href="/accounts/bills?show=topay">Supplier bills</Link>, f.toPay.bills],
              ["of which overdue", f.toPay.billsOverdue, "small muted pl-3"],
              ["due in the next 7 days", f.toPay.billsDueWeek, "small muted pl-3"],
              [<Link key="e" href="/accounts/expenses">Pay back to employees</Link>, f.toPay.staffPayBacks],
              ["Company credit card dues", f.toPay.cardDues],
            ]}
          />
        </Card>

        <Card title="Income and expense (profit / loss view)">
          <Facts
            rows={[
              ["Sales (invoices before GST, less credit notes)", f.incomeExpense.sales],
              ["Other income", f.incomeExpense.otherIncome],
              ["Total income", f.incomeExpense.income, "font-bold"],
              ...f.incomeExpense.costs.map((c) => [c.label, c.value, "small"] as [string, number, string]),
              ["Total expenses", f.incomeExpense.totalCosts, "font-bold"],
              [f.incomeExpense.result >= 0 ? "Profit" : "Loss", f.incomeExpense.result, f.incomeExpense.result >= 0 ? "font-bold text-mint" : "font-bold text-coral"],
            ]}
          />
          <p className="small muted mt-2">
            By the date of the sale or the spend (not when the money moved). GST, loans, capital and owner withdrawals are left out. A management view; your CA&apos;s books remain the official accounts.
          </p>
        </Card>
        <Card title="GST summary">
          <Facts
            rows={[
              ["GST on sales (invoices issued)", f.gst.onSales],
              ["GST on supplier bills", f.gst.onBills],
              [f.gst.onSales - f.gst.onBills >= 0 ? "Difference (sales GST more)" : "Difference (bills GST more)", Math.abs(f.gst.onSales - f.gst.onBills), "font-bold"],
            ]}
          />
          <p className="small muted mt-2">A guide for your CA when filing GST; only bills entered here with a GST % are counted.</p>
        </Card>
      </div>
    </>
  );
}

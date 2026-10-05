import Link from "next/link";
import { DateRangeFilter } from "@/components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { MONEY_ACCOUNT_KIND_LABEL, entryCode } from "@/lib/constants";
import { db } from "@/lib/db";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { dmy, inrExact as money } from "@/lib/format";
import { entryList } from "@/server/company";
import { accountBook, balances } from "@/server/company-books";
import { periodOrYear } from "@/server/year";
import { AccountButton, BookPicker, DecideButtons, DeleteButton, MatchTick, MoneyEntryButton, ReassignSelect, TransferButton } from "../company-client";
import { companyPage } from "../guard";

export const metadata = { title: "Account books" };

/** Accounts → Account books (R39): the money accounts, each account's day-by-day book, transfers and other money in / out. */
export default async function BooksPage({ searchParams }: { searchParams: Promise<{ acc?: string; from?: string; to?: string }> }) {
  const { user, accounts, options, canApprove, approver } = await companyPage();
  const sp = await searchParams;
  const period = await periodOrYear(sp.from, sp.to);
  const accId = sp.acc === "none" ? null : (accounts.find((a) => a.id === sp.acc)?.id ?? accounts.find((a) => a.active)?.id ?? null);
  const [bal, book, entries, transfers] = await Promise.all([
    balances(user),
    accountBook(user, accId, period.from, period.to),
    entryList(period),
    db.accountTransfer.findMany({
      where: { date: { gte: toDbDate(period.from), lte: toDbDate(period.to) } },
      include: { fromAccount: { select: { name: true } }, toAccount: { select: { name: true } } },
      orderBy: { date: "desc" },
    }),
  ]);
  const balanceOf = new Map(bal.accounts.map((a) => [a.id, a.balance]));
  return (
    <>
      <PageHeader title="Account books" sub="Every rupee in and out of each bank account, the cash box and the company card, with a running balance. Tick each line once you see it in the bank statement.">
        <ExportButtons report="book" extra={{ acc: accId ?? "none" }} />
        <TransferButton accounts={options} />
        <MoneyEntryButton direction="IN" accounts={options} />
        <MoneyEntryButton direction="OUT" accounts={options} />
      </PageHeader>

      <Card title="Money accounts">
        {accounts.length ? (
          <div className="grid grid-cols-1 gap-2.5 min-[701px]:grid-cols-2 min-[1101px]:grid-cols-3">
            {accounts.map((a) => {
              const b = balanceOf.get(a.id) ?? 0;
              return (
                <div key={a.id} className={`rounded-lg border border-line p-3 ${a.active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/accounts/books?acc=${a.id}`} className="font-semibold">
                        {a.name}
                      </Link>
                      <div className="small muted">
                        {MONEY_ACCOUNT_KIND_LABEL[a.kind]}
                        {a.number ? ` · ${a.number}` : ""}
                        {a.active ? "" : " · not in use"}
                      </div>
                    </div>
                    <AccountButton account={a} />
                  </div>
                  <div className={`mt-1 text-[19px] font-bold ${b < 0 ? "text-coral" : ""}`}>{money(b)}</div>
                  <div className="small muted">
                    {a.kind === "CARD" && b < 0 ? "Owed on the card · " : ""}Opening {money(a.openingBalance)} on {dmy(a.openingDate)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>No accounts yet. Add the company&apos;s bank accounts, the office cash and the company credit card with their opening balances.</Empty>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <AccountButton />
          {bal.unassigned.count ? (
            <Link href="/accounts/books?acc=none" className="small">
              {bal.unassigned.count} entries are not in any account yet (net {money(bal.unassigned.net)}): open them to choose the account
            </Link>
          ) : null}
        </div>
      </Card>

      <div className="mt-4">
        <Card title={`Book: ${book.account.name}`}>
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <BookPicker accounts={options} current={accId ?? "none"} />
            <DateRangeFilter label="Dates" />
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2 text-[14px] min-[701px]:grid-cols-4">
            <div>
              <span className="small muted block">Opening ({dmy(period.from)})</span>
              <b>{money(book.opening)}</b>
            </div>
            <div>
              <span className="small muted block">Money in</span>
              <b className="text-mint">{money(book.totalIn)}</b>
            </div>
            <div>
              <span className="small muted block">Money out</span>
              <b className="text-coral">{money(book.totalOut)}</b>
            </div>
            <div>
              <span className="small muted block">Closing</span>
              <b>{money(book.closing)}</b>
            </div>
          </div>
          {book.rows.length ? (
            <ul className="flex flex-col">
              {[...book.rows].reverse().map((r) => (
                <li key={r.key} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-line py-2 last:border-0">
                  <span className="min-w-0">
                    <span className="small muted">{dmy(r.date)} · {r.kind}</span>
                    <span className="block">{r.href ? <Link href={r.href}>{r.particulars}</Link> : r.particulars}</span>
                  </span>
                  <span className="text-right">
                    <b className={r.in ? "text-mint" : "text-coral"}>{r.in ? `+${money(r.in)}` : `−${money(r.out)}`}</b>
                    <span className="small muted block">Bal. {money(r.balance)}</span>
                  </span>
                  <span className="col-span-2 flex flex-wrap items-center gap-3">
                    <MatchTick k={r.key} on={r.matched} />
                    <ReassignSelect k={r.key} accountId={r.accountId} accounts={options} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing in this account for these dates.</Empty>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 min-[1101px]:grid-cols-2">
        <Card title={`Other money in / out (${entries.length})`}>
          {entries.some((e) => e.status === "PENDING") ? <div className="note mb-2">Payments here are approved by <b>{approver}</b>.</div> : null}
          {entries.length ? (
            <ul className="flex flex-col">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
                  <span className="min-w-0">
                    <b className={e.status === "REJECTED" ? "text-coral line-through" : e.direction === "IN" ? "text-mint" : ""}>
                      {e.direction === "IN" ? "+" : "−"}
                      {money(e.amount)}
                    </b>{" "}
                    {e.category} {e.status === "PENDING" ? <Pill tone="warn">Waiting</Pill> : e.status === "REJECTED" ? <Pill tone="bad">Rejected</Pill> : null}
                    <span className="small block muted">
                      {entryCode(e.number)} · {dmy(e.date)}
                      {e.party ? ` · ${e.party}` : ""}
                      {e.account ? ` · ${e.account}` : ""}
                      {e.reference ? ` · ${e.reference}` : ""}
                      {e.note ? ` · ${e.note}` : ""} · by {e.by}
                    </span>
                    {e.rejectReason ? <span className="small block text-coral">Rejected: {e.rejectReason}</span> : null}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {e.status === "PENDING" && canApprove ? <DecideButtons kind="entry" id={e.id} what={`${entryCode(e.number)} (${money(e.amount)})`} /> : null}
                    {e.hasFile ? (
                      <a className="btn sm" href={`/api/company/files/entry/${e.id}`} target="_blank" rel="noreferrer">
                        Voucher
                      </a>
                    ) : null}
                    <DeleteButton what={entryCode(e.number)} kind="entry" id={e.id} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No other money in or out in these dates.</Empty>
          )}
        </Card>
        <Card title={`Transfers between accounts (${transfers.length})`}>
          {transfers.length ? (
            <ul className="flex flex-col">
              {transfers.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
                  <span className="min-w-0">
                    <b>{money(Number(t.amount))}</b> {t.fromAccount.name} → {t.toAccount.name}
                    <span className="small block muted">
                      {dmy(fromDbDate(t.date))}
                      {t.reference ? ` · ${t.reference}` : ""}
                      {t.note ? ` · ${t.note}` : ""}
                    </span>
                  </span>
                  <DeleteButton what="this transfer" kind="transfer" id={t.id} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No transfers in these dates.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

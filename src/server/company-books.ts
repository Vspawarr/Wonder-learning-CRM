// Company accounts (R39): every rupee that moved in or out of the company's accounts, from wherever it was entered
// (school payments, company / card expenses, pay-backs, advances, bills, salaries, other entries, transfers).
// Balances, account books and the finance overview are all built from this one list.
import { db } from "@/lib/db";
import { NON_EXPENSE_CATEGORIES, billCode, entryCode, expenseCode } from "@/lib/constants";
import { addDays, fromDbDate, isDateStr, toDbDate, todayIST, type DateStr } from "@/lib/dates";
import { canManageCompanyAccounts, type SessionUser } from "@/lib/permissions";
import { DomainError } from "./errors";
import { COUNTED_WHERE, outstandingSummary } from "./finance/money";
import { invoiceRows } from "./finance/service";
import { billList, r2 } from "./company";

export type Movement = {
  /** "payment:<id>", "expense:<id>", "reimburse:<id>", "advance:<id>", "bill-payment:<id>", "salary:<id>", "entry:<id>", "transfer-out:<id>", "transfer-in:<id>" */
  key: string;
  date: DateStr;
  accountId: string | null;
  in: number;
  out: number;
  /** What kind of money: School payment, Expense, Salary… (used to group the overview). */
  kind: string;
  /** Category inside the kind (expense category, bill category, entry category). */
  category: string;
  particulars: string;
  href: string | null;
};

/** IST calendar date of a timestamp. */
const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

/** All money movements, optionally only up to a date. */
export async function movements(to?: DateStr): Promise<Movement[]> {
  const upTo = to ? toDbDate(to) : undefined;
  const dateTo = upTo ? { lte: upTo } : undefined;
  const [payments, expenses, reimbursed, advances, billPays, salaries, entries, transfers] = await Promise.all([
    db.payment.findMany({
      where: { ...COUNTED_WHERE },
      include: { client: { select: { id: true, schoolName: true, number: true } }, invoice: { select: { number: true } }, salesOrder: { select: { number: true } } },
    }),
    db.expense.findMany({ where: { status: "APPROVED", paidBy: { in: ["COMPANY", "COMPANY_CARD"] }, ...(dateTo ? { date: dateTo } : {}) }, include: { user: { select: { name: true } } } }),
    db.expense.findMany({ where: { status: "APPROVED", paidBy: "OWN", reimbursedAt: { not: null } }, include: { user: { select: { name: true } } } }),
    db.employeeAdvance.findMany({ where: dateTo ? { date: dateTo } : {}, include: { user: { select: { name: true } } } }),
    db.billPayment.findMany({ where: { bill: { status: "APPROVED" }, ...(dateTo ? { date: dateTo } : {}) }, include: { bill: { select: { number: true, vendor: true, category: true } } } }),
    db.salaryPayment.findMany({ where: { status: "APPROVED", ...(dateTo ? { paidOn: dateTo } : {}) } }),
    db.companyEntry.findMany({ where: { status: "APPROVED", ...(dateTo ? { date: dateTo } : {}) } }),
    db.accountTransfer.findMany({ where: dateTo ? { date: dateTo } : {}, include: { fromAccount: { select: { name: true } }, toAccount: { select: { name: true } } } }),
  ]);
  const m: Movement[] = [];
  for (const p of payments) {
    // A cheque reaches the bank when it clears.
    const day = p.status === "CLEARED" && p.statusAt ? istDay(p.statusAt) : fromDbDate(p.date);
    m.push({
      key: `payment:${p.id}`,
      date: day,
      accountId: p.moneyAccountId,
      in: Number(p.amount),
      out: 0,
      kind: "School payments",
      category: p.mode,
      particulars: `Receipt ${p.number ?? "—"} · ${p.client.schoolName} (${p.invoice ? p.invoice.number : `advance, ${p.salesOrder?.number ?? ""}`}) · ${p.mode}`,
      href: `/clients/${p.client.id}?tab=money`,
    });
  }
  for (const e of expenses)
    m.push({
      key: `expense:${e.id}`,
      date: fromDbDate(e.date),
      accountId: e.moneyAccountId,
      in: 0,
      out: Number(e.amount),
      kind: "Expenses",
      category: e.category,
      particulars: `${expenseCode(e.number)} · ${e.category} · ${e.description}${e.user ? ` (${e.user.name})` : ""}${e.paidBy === "COMPANY_CARD" ? " · company card" : ""}`,
      href: "/accounts/expenses",
    });
  for (const e of reimbursed)
    m.push({
      key: `reimburse:${e.id}`,
      date: fromDbDate(e.reimbursedAt!),
      accountId: e.reimburseAccountId,
      in: 0,
      out: Number(e.amount),
      kind: "Expenses",
      category: e.category,
      particulars: `Paid back ${expenseCode(e.number)} to ${e.user?.name ?? "employee"} · ${e.description}${e.reimburseRef ? ` · ${e.reimburseRef}` : ""}`,
      href: "/accounts/expenses",
    });
  for (const a of advances)
    m.push({
      key: `advance:${a.id}`,
      date: fromDbDate(a.date),
      accountId: a.moneyAccountId,
      in: a.kind === "RETURNED" ? Number(a.amount) : 0,
      out: a.kind === "GIVEN" ? Number(a.amount) : 0,
      kind: "Advances to employees",
      category: a.kind === "GIVEN" ? "Advance given" : "Advance returned",
      particulars: `${a.kind === "GIVEN" ? "Advance to" : "Advance returned by"} ${a.user.name}${a.note ? ` · ${a.note}` : ""}`,
      href: "/accounts/expenses",
    });
  for (const b of billPays)
    m.push({
      key: `bill-payment:${b.id}`,
      date: fromDbDate(b.date),
      accountId: b.moneyAccountId,
      in: 0,
      out: Number(b.amount),
      kind: "Bills",
      category: b.bill.category,
      particulars: `${billCode(b.bill.number)} · ${b.bill.vendor}${b.reference ? ` · ${b.reference}` : ""}`,
      href: "/accounts/bills",
    });
  for (const s of salaries)
    m.push({
      key: `salary:${s.id}`,
      date: fromDbDate(s.paidOn),
      accountId: s.moneyAccountId,
      in: 0,
      out: Number(s.net),
      kind: "Salaries",
      category: "Salary",
      particulars: `Salary ${s.month} · ${s.employeeName}`,
      href: "/accounts/salaries",
    });
  for (const e of entries)
    m.push({
      key: `entry:${e.id}`,
      date: fromDbDate(e.date),
      accountId: e.moneyAccountId,
      in: e.direction === "IN" ? Number(e.amount) : 0,
      out: e.direction === "OUT" ? Number(e.amount) : 0,
      kind: e.direction === "IN" ? "Other money in" : "Other payments",
      category: e.category,
      particulars: `${entryCode(e.number)} · ${e.category}${e.party ? ` · ${e.party}` : ""}${e.note ? ` · ${e.note}` : ""}`,
      href: "/accounts/books",
    });
  for (const t of transfers) {
    const day = fromDbDate(t.date);
    m.push({ key: `transfer-out:${t.id}`, date: day, accountId: t.fromAccountId, in: 0, out: Number(t.amount), kind: "Transfers", category: "Transfer", particulars: `Transfer to ${t.toAccount.name}${t.note ? ` · ${t.note}` : ""}`, href: null });
    m.push({ key: `transfer-in:${t.id}`, date: day, accountId: t.toAccountId, in: Number(t.amount), out: 0, kind: "Transfers", category: "Transfer", particulars: `Transfer from ${t.fromAccount.name}${t.note ? ` · ${t.note}` : ""}`, href: null });
  }
  return (to ? m.filter((x) => x.date <= to) : m).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

function assertAccess(user: SessionUser) {
  if (!canManageCompanyAccounts(user.role)) throw new DomainError("Only Accounts can see company accounts.");
}

/** Balance of each account on a date (default today): opening balance + everything since its opening date. */
export async function balances(user: SessionUser, on: DateStr = todayIST()) {
  assertAccess(user);
  const [accounts, all] = await Promise.all([db.moneyAccount.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }), movements(on)]);
  const rows = accounts.map((a) => {
    const from = fromDbDate(a.openingDate);
    const mine = all.filter((x) => x.accountId === a.id && x.date >= from);
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      number: a.number,
      active: a.active,
      balance: r2(Number(a.openingBalance) + mine.reduce((t, x) => t + x.in - x.out, 0)),
    };
  });
  // Money recorded without an account (before accounts were set up): shown so nothing is missed.
  const loose = all.filter((x) => !x.accountId);
  return { accounts: rows, unassigned: { count: loose.length, net: r2(loose.reduce((t, x) => t + x.in - x.out, 0)) } };
}

/** One account's book for a period: opening balance, each movement with a running balance, closing balance. */
export async function accountBook(user: SessionUser, accountId: string | null, from: DateStr, to: DateStr) {
  assertAccess(user);
  const acc = accountId ? await db.moneyAccount.findUnique({ where: { id: accountId } }) : null;
  if (accountId && !acc) throw new DomainError("Account not found.");
  const [all, matches] = await Promise.all([movements(to), db.bookMatch.findMany({ select: { key: true } })]);
  const matched = new Set(matches.map((x) => x.key));
  const start = acc ? fromDbDate(acc.openingDate) : "0000-01-01";
  const mine = all.filter((x) => x.accountId === (accountId ?? null) && x.date >= start);
  const before = mine.filter((x) => x.date < from);
  const opening = r2(Number(acc?.openingBalance ?? 0) + before.reduce((t, x) => t + x.in - x.out, 0));
  let bal = opening;
  const rows = mine
    .filter((x) => x.date >= from)
    .map((x) => {
      bal = r2(bal + x.in - x.out);
      return { ...x, balance: bal, matched: matched.has(x.key) };
    });
  return {
    account: acc ? { id: acc.id, name: acc.name, kind: acc.kind } : { id: null, name: "Not assigned to an account", kind: "OTHER" as const },
    opening,
    rows,
    totalIn: r2(rows.reduce((t, x) => t + x.in, 0)),
    totalOut: r2(rows.reduce((t, x) => t + x.out, 0)),
    closing: bal,
  };
}

/** Move a money movement to another account (e.g. a payment that went to a different bank). */
export async function reassign(user: SessionUser, key: string, accountId: string | null) {
  assertAccess(user);
  const [kind, id] = key.split(":");
  if (accountId && !(await db.moneyAccount.count({ where: { id: accountId } }))) throw new DomainError("Account not found.");
  const data = { moneyAccountId: accountId };
  switch (kind) {
    case "payment":
      await db.payment.update({ where: { id }, data });
      break;
    case "expense":
      await db.expense.update({ where: { id }, data });
      break;
    case "reimburse":
      await db.expense.update({ where: { id }, data: { reimburseAccountId: accountId } });
      break;
    case "advance":
      await db.employeeAdvance.update({ where: { id }, data });
      break;
    case "bill-payment":
      await db.billPayment.update({ where: { id }, data });
      break;
    case "salary":
      await db.salaryPayment.update({ where: { id }, data });
      break;
    case "entry":
      await db.companyEntry.update({ where: { id }, data });
      break;
    case "transfer-out":
    case "transfer-in": {
      if (!accountId) throw new DomainError("A transfer needs both accounts.");
      const t = await db.accountTransfer.findUniqueOrThrow({ where: { id } });
      const field = kind === "transfer-out" ? "fromAccountId" : "toAccountId";
      if ((kind === "transfer-out" ? t.toAccountId : t.fromAccountId) === accountId) throw new DomainError("Choose two different accounts.");
      await db.accountTransfer.update({ where: { id }, data: { [field]: accountId } });
      break;
    }
    default:
      throw new DomainError("Unknown entry.");
  }
}

/** Tick / untick "matched with the bank statement". */
export async function toggleMatch(user: SessionUser, key: string) {
  assertAccess(user);
  const found = await db.bookMatch.findUnique({ where: { key } });
  if (found) await db.bookMatch.delete({ where: { key } });
  else await db.bookMatch.create({ data: { key, byId: user.id } });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthsBetween = (from: DateStr, to: DateStr) => {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let mo = Number(from.slice(5, 7));
  const endKey = to.slice(0, 7);
  for (let i = 0; i < 36; i++) {
    const k = `${y}-${String(mo).padStart(2, "0")}`;
    out.push(k);
    if (k >= endKey) break;
    mo++;
    if (mo > 12) {
      mo = 1;
      y++;
    }
  }
  return out;
};

const sumBy = <T,>(rows: T[], key: (r: T) => string, val: (r: T) => number) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), r2((m.get(key(r)) ?? 0) + val(r)));
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

/** The company finance overview for a period (R39). */
export async function financeOverview(user: SessionUser, from: DateStr, to: DateStr) {
  assertAccess(user);
  if (!isDateStr(from) || !isDateStr(to) || from > to) throw new DomainError("Choose a valid period.");
  const [all, bal, invoices, inv, credit, expenses, bills, billsOpen, salaries, entries, owedToStaff, cheques, awaiting, pendingSpend] = await Promise.all([
    movements(),
    balances(user),
    invoiceRows(user, { status: { not: "CANCELLED" } }),
    db.invoice.aggregate({ where: { status: "ISSUED", date: { gte: toDbDate(from), lte: toDbDate(to) } }, _sum: { subtotal: true, gstAmount: true, total: true } }),
    db.creditNote.aggregate({ where: { date: { gte: toDbDate(from), lte: toDbDate(to) } }, _sum: { amount: true } }),
    db.expense.findMany({ where: { status: "APPROVED", date: { gte: toDbDate(from), lte: toDbDate(to) } }, select: { category: true, amount: true } }),
    db.bill.findMany({ where: { status: "APPROVED", billDate: { gte: toDbDate(from), lte: toDbDate(to) } }, select: { category: true, amount: true, gstAmount: true } }),
    db.bill.findMany({ where: { status: "APPROVED" }, select: { total: true, dueDate: true, payments: { select: { amount: true } } } }),
    db.salaryPayment.findMany({ where: { status: "APPROVED", paidOn: { gte: toDbDate(from), lte: toDbDate(to) } }, select: { gross: true } }),
    db.companyEntry.findMany({ where: { status: "APPROVED", date: { gte: toDbDate(from), lte: toDbDate(to) } }, select: { direction: true, category: true, amount: true } }),
    db.expense.aggregate({ where: { status: "APPROVED", paidBy: "OWN", reimbursedAt: null }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { approval: "APPROVED", status: { in: ["IN_HAND", "DEPOSITED"] } }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { approval: "PENDING" }, _sum: { amount: true } }),
    db.bill.count({ where: { status: "PENDING" } }).then(async (b) => b + (await db.salaryPayment.count({ where: { status: "PENDING" } })) + (await db.companyEntry.count({ where: { status: "PENDING" } }))),
  ]);
  // Cash flow: money that moved in the period (transfers between own accounts are not money in or out).
  const period = all.filter((x) => x.date >= from && x.date <= to && x.kind !== "Transfers");
  const moneyIn = r2(period.reduce((t, x) => t + x.in, 0));
  const moneyOut = r2(period.reduce((t, x) => t + x.out, 0));
  const months = monthsBetween(from, to).map((k) => {
    const rows = period.filter((x) => x.date.startsWith(k));
    return { key: k, label: `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`, in: r2(rows.reduce((t, x) => t + x.in, 0)), out: r2(rows.reduce((t, x) => t + x.out, 0)) };
  });
  // To receive / to pay, today.
  const owed = outstandingSummary(invoices);
  const today = todayIST();
  const billBal = billsOpen.map((b) => ({ due: b.dueDate ? fromDbDate(b.dueDate) : null, left: r2(Number(b.total) - b.payments.reduce((t, p) => t + Number(p.amount), 0)) })).filter((b) => b.left > 0.001);
  const cardDues = r2(bal.accounts.filter((a) => a.kind === "CARD" && a.balance < 0).reduce((t, a) => t - a.balance, 0));
  // Income vs expense (by the date of the sale / spend, GST left out).
  const nonExpense = NON_EXPENSE_CATEGORIES as readonly string[];
  const sales = r2(Number(inv._sum.subtotal ?? 0) - Number(credit._sum.amount ?? 0));
  const otherIncome = r2(entries.filter((e) => e.direction === "IN" && !nonExpense.includes(e.category)).reduce((t, e) => t + Number(e.amount), 0));
  const costRows = [
    ...expenses.map((e) => ({ label: `Expenses · ${e.category}`, value: Number(e.amount) })),
    ...bills.map((b) => ({ label: `Bills · ${b.category}`, value: Number(b.amount) })),
    ...salaries.map((s) => ({ label: "Salaries", value: Number(s.gross) })),
    ...entries.filter((e) => e.direction === "OUT" && !nonExpense.includes(e.category)).map((e) => ({ label: e.category, value: Number(e.amount) })),
  ];
  const costs = sumBy(costRows, (r) => r.label, (r) => r.value);
  const totalCosts = r2(costs.reduce((t, c) => t + c.value, 0));
  return {
    period: { from, to },
    moneyIn,
    moneyOut,
    net: r2(moneyIn - moneyOut),
    inBy: sumBy(period.filter((x) => x.in > 0), (x) => (x.kind === "Other money in" ? x.category : x.kind), (x) => x.in),
    outBy: sumBy(period.filter((x) => x.out > 0), (x) => (x.kind === "Expenses" || x.kind === "Bills" ? `${x.kind} · ${x.category}` : x.kind === "Other payments" ? x.category : x.kind), (x) => x.out),
    months,
    balances: bal,
    totalBalance: r2(bal.accounts.filter((a) => a.kind !== "CARD").reduce((t, a) => t + a.balance, 0)),
    toReceive: {
      schools: owed.outstanding,
      overdue: owed.overdue,
      chequesInHand: r2(Number(cheques._sum.amount ?? 0)),
      awaitingApproval: r2(Number(awaiting._sum.amount ?? 0)),
    },
    toPay: {
      bills: r2(billBal.reduce((t, b) => t + b.left, 0)),
      billsOverdue: r2(billBal.filter((b) => b.due && b.due < today).reduce((t, b) => t + b.left, 0)),
      billsDueWeek: r2(billBal.filter((b) => b.due && b.due >= today && b.due <= addDays(today, 7)).reduce((t, b) => t + b.left, 0)),
      staffPayBacks: r2(Number(owedToStaff._sum.amount ?? 0)),
      cardDues,
    },
    incomeExpense: { sales, otherIncome, income: r2(sales + otherIncome), costs, totalCosts, result: r2(sales + otherIncome - totalCosts) },
    gst: {
      onSales: r2(Number(inv._sum.gstAmount ?? 0)),
      onBills: r2(bills.reduce((t, b) => t + Number(b.gstAmount), 0)),
    },
    pendingSpend,
  };
}

/** Bank & cash today and supplier bills still to pay (dashboard Finance section). */
export async function companySnapshot(user: SessionUser) {
  const [bal, bills] = await Promise.all([balances(user), billList({ show: "topay" })]);
  return {
    cash: r2(bal.accounts.filter((a) => a.kind !== "CARD").reduce((t, a) => t + a.balance, 0)),
    bills: r2(bills.reduce((t, b) => t + b.balance, 0)),
    billCount: bills.length,
  };
}

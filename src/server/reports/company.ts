// Company accounts exports (R39): finance overview, bills, salaries and an account book, with the screens' filters.
import { MONEY_ACCOUNT_KIND_LABEL, billCode, entryCode } from "@/lib/constants";
import { isDateStr, todayIST } from "@/lib/dates";
import { financialYear, fyRange, parseYearCookie } from "@/lib/fy";
import { canManageCompanyAccounts, type SessionUser } from "@/lib/permissions";
import { billList, entryList, salaryList } from "../company";
import { accountBook, financeOverview } from "../company-books";
import { DomainError } from "../errors";
import type { Report } from "./types";

type Params = Record<string, string | undefined>;
const dmy = (s: string | null | undefined) => (s ? s.split("-").reverse().join("/") : "");

function guard(user: SessionUser) {
  if (!canManageCompanyAccounts(user.role)) throw new DomainError("Only Accounts can export company accounts.");
}

/** ?from / ?to if set, else the chosen year (All years → this year), as on the screens. */
function periodOf(p: Params) {
  const y = p.fy ? parseYearCookie(p.fy, todayIST()) : null;
  const r = fyRange(y ?? financialYear(todayIST()).start);
  return { from: p.from && isDateStr(p.from) ? p.from : r.from, to: p.to && isDateStr(p.to) ? p.to : r.to };
}
const periodLine = (x: { from: string; to: string }) => `${dmy(x.from)} – ${dmy(x.to)}`;

const KV = [
  { key: "k", header: "", width: 3 },
  { key: "v", header: "Amount", width: 1, kind: "money" as const },
];

export async function finance(user: SessionUser, p: Params): Promise<Report> {
  guard(user);
  const per = periodOf(p);
  const f = await financeOverview(user, per.from, per.to);
  return {
    title: "Company finance",
    subtitle: periodLine(per),
    sections: [
      {
        heading: "Summary",
        columns: KV,
        rows: [
          { k: "Money in", v: f.moneyIn },
          { k: "Money out", v: f.moneyOut },
          { k: "Net", v: f.net },
          { k: "In bank & cash today (all accounts except the card)", v: f.totalBalance },
        ],
      },
      {
        heading: "Money in and out by month",
        columns: [
          { key: "m", header: "Month", width: 1 },
          { key: "in", header: "In", width: 1, kind: "money" },
          { key: "out", header: "Out", width: 1, kind: "money" },
          { key: "net", header: "Net", width: 1, kind: "money" },
        ],
        rows: f.months.map((m) => ({ m: m.label, in: m.in, out: m.out, net: m.in - m.out })),
        totals: { m: "Total", in: f.moneyIn, out: f.moneyOut, net: f.net },
      },
      { heading: "Where the money came from", columns: KV, rows: f.inBy.map((x) => ({ k: x.label, v: x.value })), empty: "Nothing received." },
      { heading: "Where the money went", columns: KV, rows: f.outBy.map((x) => ({ k: x.label, v: x.value })), empty: "Nothing spent." },
      {
        heading: "Balances today",
        columns: KV,
        rows: [
          ...f.balances.accounts.map((a) => ({ k: `${a.name} (${MONEY_ACCOUNT_KIND_LABEL[a.kind]})`, v: a.balance })),
          ...(f.balances.unassigned.count ? [{ k: `Not assigned to an account (${f.balances.unassigned.count} entries)`, v: f.balances.unassigned.net }] : []),
        ],
        empty: "No accounts set up yet.",
      },
      {
        heading: "Still to come in",
        columns: KV,
        rows: [
          { k: "Schools still owe (invoices)", v: f.toReceive.schools },
          { k: "   of which overdue", v: f.toReceive.overdue },
          { k: "Cheques in hand, not yet cleared", v: f.toReceive.chequesInHand },
          { k: "Payments waiting for approval", v: f.toReceive.awaitingApproval },
        ],
      },
      {
        heading: "Still to pay",
        columns: KV,
        rows: [
          { k: "Supplier bills", v: f.toPay.bills },
          { k: "   of which overdue", v: f.toPay.billsOverdue },
          { k: "Pay back to employees", v: f.toPay.staffPayBacks },
          { k: "Company credit card dues", v: f.toPay.cardDues },
        ],
      },
      {
        heading: "Income and expense (management view; GST, loans, capital and withdrawals left out)",
        columns: KV,
        rows: [
          { k: "Sales (before GST, less credit notes)", v: f.incomeExpense.sales },
          { k: "Other income", v: f.incomeExpense.otherIncome },
          { k: "Total income", v: f.incomeExpense.income },
          ...f.incomeExpense.costs.map((c) => ({ k: `   ${c.label}`, v: c.value })),
          { k: "Total expenses", v: f.incomeExpense.totalCosts },
          { k: f.incomeExpense.result >= 0 ? "Profit" : "Loss", v: f.incomeExpense.result },
        ],
      },
      {
        heading: "GST summary",
        columns: KV,
        rows: [
          { k: "GST on sales (invoices issued)", v: f.gst.onSales },
          { k: "GST on supplier bills", v: f.gst.onBills },
        ],
      },
    ],
  };
}

const BILL_STATE: Record<string, string> = { WAITING: "Waiting for approval", REJECTED: "Rejected", UNPAID: "To pay", PARTIAL: "Part paid", OVERDUE: "Overdue", PAID: "Paid" };

export async function bills(user: SessionUser, p: Params): Promise<Report> {
  guard(user);
  const per = periodOf(p);
  const rows = await billList(p.show ? { show: p.show } : per);
  const live = rows.filter((b) => b.state !== "REJECTED");
  return {
    title: "Bills to pay",
    subtitle: p.show === "topay" ? "Bills still to pay" : p.show === "waiting" ? "Waiting for approval" : `Bill date ${periodLine(per)}`,
    landscape: true,
    sections: [
      {
        columns: [
          { key: "no", header: "No.", width: 0.5 },
          { key: "date", header: "Bill date", width: 0.7 },
          { key: "vendor", header: "Supplier", width: 1.4 },
          { key: "billNo", header: "Their no.", width: 0.7 },
          { key: "category", header: "For", width: 1.1 },
          { key: "desc", header: "Description", width: 1.8 },
          { key: "amount", header: "Before GST", width: 0.8, kind: "money" },
          { key: "gst", header: "GST", width: 0.7, kind: "money" },
          { key: "total", header: "Total", width: 0.8, kind: "money" },
          { key: "paid", header: "Paid", width: 0.8, kind: "money" },
          { key: "balance", header: "To pay", width: 0.8, kind: "money" },
          { key: "due", header: "Due", width: 0.7 },
          { key: "state", header: "Status", width: 0.9 },
        ],
        rows: rows.map((b) => ({
          no: billCode(b.number),
          date: dmy(b.billDate),
          vendor: b.vendor,
          billNo: b.billNo ?? "",
          category: b.category,
          desc: b.description,
          amount: b.amount,
          gst: b.gstAmount,
          total: b.total,
          paid: b.paid,
          balance: b.state === "REJECTED" ? 0 : b.balance,
          due: dmy(b.dueDate),
          state: BILL_STATE[b.state],
        })),
        totals: {
          no: "Total",
          amount: live.reduce((t, b) => t + b.amount, 0),
          gst: live.reduce((t, b) => t + b.gstAmount, 0),
          total: live.reduce((t, b) => t + b.total, 0),
          paid: live.reduce((t, b) => t + b.paid, 0),
          balance: live.filter((b) => b.state !== "WAITING").reduce((t, b) => t + b.balance, 0),
        },
        empty: "No bills.",
      },
    ],
  };
}

export async function salaries(user: SessionUser, p: Params): Promise<Report> {
  guard(user);
  const per = periodOf(p);
  const rows = await salaryList(per);
  const ok = rows.filter((s) => s.status === "APPROVED");
  return {
    title: "Salaries",
    subtitle: periodLine(per),
    landscape: true,
    sections: [
      {
        columns: [
          { key: "month", header: "Month", width: 0.7 },
          { key: "name", header: "Employee", width: 1.4 },
          { key: "gross", header: "Gross", width: 0.9, kind: "money" },
          { key: "ded", header: "Deductions", width: 0.9, kind: "money" },
          { key: "net", header: "Take-home", width: 0.9, kind: "money" },
          { key: "paid", header: "Paid on", width: 0.7 },
          { key: "account", header: "From", width: 1 },
          { key: "ref", header: "Mode / ref.", width: 1.1 },
          { key: "status", header: "Status", width: 0.9 },
        ],
        rows: rows.map((s) => ({
          month: s.month,
          name: s.employeeName,
          gross: s.gross,
          ded: s.deductions,
          net: s.net,
          paid: dmy(s.paidOn),
          account: s.account ?? "",
          ref: [s.mode, s.reference].filter(Boolean).join(" · "),
          status: s.status === "APPROVED" ? "Approved" : s.status === "PENDING" ? "Waiting" : `Rejected: ${s.rejectReason ?? ""}`,
        })),
        totals: { month: "Total", gross: ok.reduce((t, s) => t + s.gross, 0), ded: ok.reduce((t, s) => t + s.deductions, 0), net: ok.reduce((t, s) => t + s.net, 0) },
        empty: "No salaries.",
      },
    ],
  };
}

export async function book(user: SessionUser, p: Params): Promise<Report> {
  guard(user);
  const per = periodOf(p);
  const b = await accountBook(user, p.acc && p.acc !== "none" ? p.acc : null, per.from, per.to);
  const entries = await entryList(per);
  return {
    title: `Account book - ${b.account.name}`,
    subtitle: `${periodLine(per)} · opening ${b.opening.toLocaleString("en-IN")} · closing ${b.closing.toLocaleString("en-IN")}`,
    landscape: true,
    sections: [
      {
        columns: [
          { key: "date", header: "Date", width: 0.7 },
          { key: "kind", header: "Type", width: 1 },
          { key: "part", header: "Particulars", width: 3 },
          { key: "in", header: "In", width: 0.8, kind: "money" },
          { key: "out", header: "Out", width: 0.8, kind: "money" },
          { key: "bal", header: "Balance", width: 0.9, kind: "money" },
          { key: "m", header: "Matched", width: 0.6 },
        ],
        rows: [
          { date: dmy(per.from), kind: "", part: "Opening balance", in: null, out: null, bal: b.opening, m: "" },
          ...b.rows.map((r) => ({ date: dmy(r.date), kind: r.kind, part: r.particulars, in: r.in || null, out: r.out || null, bal: r.balance, m: r.matched ? "Yes" : "" })),
        ],
        totals: { date: "Total", in: b.totalIn, out: b.totalOut, bal: b.closing },
      },
      {
        heading: "Other money in / out (all accounts)",
        columns: [
          { key: "no", header: "No.", width: 0.5 },
          { key: "date", header: "Date", width: 0.7 },
          { key: "dir", header: "In / out", width: 0.6 },
          { key: "cat", header: "What", width: 1.2 },
          { key: "party", header: "Party", width: 1.2 },
          { key: "acc", header: "Account", width: 1 },
          { key: "amount", header: "Amount", width: 0.8, kind: "money" },
          { key: "status", header: "Status", width: 0.8 },
        ],
        rows: entries.map((e) => ({
          no: entryCode(e.number),
          date: dmy(e.date),
          dir: e.direction === "IN" ? "In" : "Out",
          cat: e.category,
          party: e.party ?? "",
          acc: e.account ?? "",
          amount: e.amount,
          status: e.status === "APPROVED" ? "Approved" : e.status === "PENDING" ? "Waiting" : "Rejected",
        })),
        empty: "None.",
      },
    ],
  };
}

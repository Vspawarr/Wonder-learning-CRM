// Expenses (R37): the team's spends on visits (travel, hotel, meals…) and company costs (services,
// licences…), each with its bill photo (or, when there is none, a description). Employees submit; the Director
// approves or rejects (R38; Admin while there is no Director login); Accounts pays back own-money spends and
// keeps track of advances given to employees.
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { EXPENSE_CATEGORIES, EXPENSE_MODES } from "@/lib/constants";
import { addDays, fromDbDate, isDateStr, toDbDate, todayIST } from "@/lib/dates";
import { canManageExpenses, type SessionUser } from "@/lib/permissions";
import { clientScope, leadScope, oppScope } from "./access";
import { DomainError, NotFoundError } from "./errors";
import { getFeatures } from "./features";
import { PO_MAX_BYTES, PO_TYPES } from "./finance/po";
import { parse } from "./validation";
import { accountOrDefault, defaultAccountId } from "./money-accounts";

const r2 = (n: number) => Math.round(n * 100) / 100;
const inr = (n: number) => `₹${r2(n).toLocaleString("en-IN")}`;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => s || null);
/** Payment mode; a blank choice ("Not specified") is allowed. */
const optMode = z.preprocess((v) => (v === "" ? null : v), z.enum(EXPENSE_MODES).nullish()).transform((s) => s ?? null);
const amount = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? Number(v.replace(/,/g, "").trim() || NaN) : v))
  .refine((n) => Number.isFinite(n) && n > 0 && n < 1e8, "Enter the amount.");

export const expenseInput = z.object({
  date: z.string().refine(isDateStr, "Enter the date of the spend."),
  category: z.enum(EXPENSE_CATEGORIES, { error: "Choose the kind of expense." }),
  amount,
  description: z.string().trim().min(2, "Write what it was for (e.g. Hotel in Nashik for school visits).").max(300),
  city: text(100),
  paidTo: text(150),
  paidBy: z.enum(["OWN", "ADVANCE", "COMPANY_CARD", "COMPANY"], { error: "Choose who paid." }),
  /** Is there a bill? "no" needs a description of the spend and why there is no bill (R38). */
  billAvailable: z.enum(["yes", "no"]).default("yes"),
  noBillReason: text(500),
  mode: optMode,
  reference: text(100),
  /** Accounts may enter a spend for an employee; empty = their own (or a company expense). */
  userId: text(50),
  /** "lead:<id>", "opp:<id>" or "client:<id>": the school it was for. */
  related: text(80),
  /** Company expenses: the account that paid (R39); card spends go to the company card. */
  moneyAccountId: text(50),
});

export const advanceInput = z.object({
  userId: z.string().min(1, "Choose the employee."),
  kind: z.enum(["GIVEN", "RETURNED"]).default("GIVEN"),
  amount,
  date: z.string().refine(isDateStr, "Enter the date."),
  mode: optMode,
  reference: text(100),
  note: text(300),
  /** Company account it was paid from / returned into (R39). */
  moneyAccountId: text(50),
});

export const reimburseInput = z.object({
  date: z.string().refine(isDateStr, "Enter the date paid."),
  reference: text(100),
  /** Company account the money was paid from (R39); default: the bank. */
  moneyAccountId: text(50),
});

export type BillFile = { name: string; type: string; bytes: Uint8Array };

async function assertOn() {
  if (!(await getFeatures()).expenses) throw new DomainError("Expenses are switched off in Settings → Features.");
}
function assertAccounts(user: SessionUser) {
  if (!canManageExpenses(user.role)) throw new DomainError("Only Accounts can do this.");
}

/**
 * Who approves expenses (R38): the Director. Until a Director login exists, Admin approves so claims don't wait
 * forever; once a Director is active, Admin's own expenses go to the Director too.
 */
export async function canApproveExpenses(user: SessionUser) {
  if (user.role === "DIRECTOR") return true;
  if (user.role !== "ADMIN") return false;
  return (await db.user.count({ where: { role: "DIRECTOR", active: true } })) === 0;
}

/** For the screens: who expense claims go to. */
export async function expenseApprover() {
  const d = await db.user.findFirst({ where: { role: "DIRECTOR", active: true }, select: { name: true }, orderBy: { createdAt: "asc" } });
  return d ? `Director (${d.name})` : "Admin (until a Director login is created)";
}

async function assertApprover(user: SessionUser) {
  if (!(await canApproveExpenses(user))) throw new DomainError("Expenses are approved by the Director.");
}

/** Saves an expense with its bill(s). Employees: own spends only (own money or advance). Accounts: also company or for someone. */
export async function createExpense(user: SessionUser, raw: unknown, files: BillFile[]) {
  await assertOn();
  const d = parse(expenseInput, raw);
  const accounts = canManageExpenses(user.role);
  if (d.paidBy === "COMPANY" && !accounts) throw new DomainError("Company-account expenses are entered by Accounts.");
  if (d.date > todayIST()) throw new DomainError("The date can't be in the future.");
  if (d.date < addDays(todayIST(), -400)) throw new DomainError("That date is more than a year ago.");
  const userId = d.paidBy === "COMPANY" ? (d.userId ?? null) : accounts && d.userId ? d.userId : user.id;
  if (userId && userId !== user.id && !(await db.user.count({ where: { id: userId, active: true } }))) throw new NotFoundError("Employee");
  const noBill = d.billAvailable === "no";
  if (noBill) {
    if (!d.noBillReason || d.noBillReason.length < 10) throw new DomainError("No bill: describe the expense and why there is no bill (at least a few words).");
    files = [];
  } else if (!files.length) throw new DomainError("Attach the bill (photo or PDF), or choose “No bill” and describe the expense.");
  if (files.length > 4) throw new DomainError("Attach up to 4 bills per expense.");
  for (const f of files) {
    if (!PO_TYPES[f.type]) throw new DomainError("Bills must be photos (JPG / PNG) or PDFs.");
    if (!f.bytes.length) throw new DomainError("A bill file is empty.");
    if (f.bytes.length > PO_MAX_BYTES) throw new DomainError("A bill is larger than 4 MB. Please take a smaller photo.");
  }
  // The school it was for, if the person may see it.
  let leadId: string | null = null;
  let clientId: string | null = null;
  if (d.related) {
    const [kind, id] = d.related.split(":");
    if (kind === "lead" && (await db.lead.count({ where: { id, ...leadScope(user) } }))) leadId = id;
    else if (kind === "client" && (await db.client.count({ where: { id, ...clientScope(user) } }))) clientId = id;
    else if (kind === "opp") {
      const o = await db.opportunity.findFirst({ where: { id, ...oppScope(user) }, select: { leadId: true, client: { select: { id: true } } } });
      clientId = o?.client?.id ?? null;
      leadId = clientId ? null : (o?.leadId ?? null);
    }
  }
  // The approver's own entries need no approval (R38: the Director; Admin while there is no Director).
  const approved = await canApproveExpenses(user);
  // Which company account paid (R39): the card for card spends; for company-account spends the chosen one or the bank.
  const moneyAccountId =
    d.paidBy === "COMPANY_CARD" ? await defaultAccountId("CARD") : d.paidBy === "COMPANY" ? await accountOrDefault(accounts ? d.moneyAccountId : null, d.mode) : null;
  const e = await db.expense.create({
    data: {
      date: toDbDate(d.date),
      category: d.category,
      amount: d.amount,
      description: d.description,
      city: d.city,
      paidTo: d.paidTo,
      paidBy: d.paidBy,
      mode: d.mode,
      reference: d.reference,
      noBillReason: noBill ? d.noBillReason : null,
      moneyAccountId,
      userId,
      leadId,
      clientId,
      status: approved ? "APPROVED" : "SUBMITTED",
      decidedById: approved ? user.id : null,
      decidedAt: approved ? new Date() : null,
      createdById: user.id,
      files: { create: files.map((f) => ({ fileName: f.name.slice(0, 200) || "bill", contentType: f.type, size: f.bytes.length, data: Buffer.from(f.bytes) })) },
    },
  });
  return { id: e.id, number: e.number, approved };
}

/** Who may see an expense: its employee, whoever entered it, and Accounts. */
const expenseScope = (user: SessionUser): Prisma.ExpenseWhereInput =>
  canManageExpenses(user.role) ? {} : { OR: [{ userId: user.id }, { createdById: user.id }] };

export async function expenseFile(user: SessionUser, fileId: string) {
  const f = await db.expenseFile.findFirst({ where: { id: fileId, expense: expenseScope(user) } });
  if (!f) throw new NotFoundError("Bill");
  return f;
}

/** Remove an expense: the employee while it waits or after a rejection; Accounts any time before it's paid back. */
export async function deleteExpense(user: SessionUser, id: string) {
  const e = await db.expense.findFirst({ where: { id, ...expenseScope(user) } });
  if (!e) throw new NotFoundError("Expense");
  const accounts = canManageExpenses(user.role);
  if (!accounts && e.status === "APPROVED") throw new DomainError("This expense is approved. Ask Accounts if it must be removed.");
  if (e.reimbursedAt) throw new DomainError("This expense has already been paid back, so it can't be deleted.");
  await db.expense.delete({ where: { id } });
}

export async function approveExpense(user: SessionUser, id: string) {
  await assertApprover(user);
  const e = await db.expense.findUnique({ where: { id } });
  if (!e) throw new NotFoundError("Expense");
  if (e.status !== "SUBMITTED") throw new DomainError(`This expense is already ${e.status === "APPROVED" ? "approved" : "rejected"}.`);
  await db.expense.update({ where: { id, status: "SUBMITTED" }, data: { status: "APPROVED", decidedById: user.id, decidedAt: new Date(), rejectReason: null } });
}

export const rejectExpenseInput = z.object({ reason: z.string().trim().min(3, "Write why it is rejected (e.g. bill not clear).").max(300) });

export async function rejectExpense(user: SessionUser, id: string, raw: unknown) {
  await assertApprover(user);
  const { reason } = parse(rejectExpenseInput, raw);
  const e = await db.expense.findUnique({ where: { id } });
  if (!e) throw new NotFoundError("Expense");
  if (e.status !== "SUBMITTED") throw new DomainError(`This expense is already ${e.status === "APPROVED" ? "approved" : "rejected"}.`);
  await db.$transaction(async (tx) => {
    await tx.expense.update({ where: { id }, data: { status: "REJECTED", rejectReason: reason, decidedById: user.id, decidedAt: new Date() } });
    const to = e.userId ?? e.createdById;
    if (to !== user.id)
      await tx.task.create({
        data: {
          type: "Other",
          title: `Expense E-${e.number} (${inr(Number(e.amount))}) rejected by Accounts`,
          remark: `${reason}. Fix it and add the expense again (delete the rejected one).`,
          dueDate: toDbDate(todayIST()),
          priority: "MEDIUM",
          isAuto: true,
          assigneeId: to,
          createdById: user.id,
        },
      });
  });
}

/** Pay an employee back for their approved own-money spends (all of them, or the ones chosen). */
export async function reimburseExpenses(user: SessionUser, userId: string, raw: unknown, ids?: string[]) {
  assertAccounts(user);
  const d = parse(reimburseInput, raw);
  const r = await db.expense.updateMany({
    where: { userId, paidBy: "OWN", status: "APPROVED", reimbursedAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { reimbursedAt: toDbDate(d.date), reimbursedById: user.id, reimburseRef: d.reference, reimburseAccountId: await accountOrDefault(d.moneyAccountId, "Bank") },
  });
  if (!r.count) throw new DomainError("Nothing approved is waiting to be paid back to this person.");
  return r.count;
}

export async function recordAdvance(user: SessionUser, raw: unknown) {
  assertAccounts(user);
  await assertOn();
  const d = parse(advanceInput, raw);
  if (!(await db.user.count({ where: { id: d.userId } }))) throw new NotFoundError("Employee");
  await db.employeeAdvance.create({
    data: {
      userId: d.userId,
      kind: d.kind,
      amount: d.amount,
      date: toDbDate(d.date),
      mode: d.mode,
      reference: d.reference,
      note: d.note,
      moneyAccountId: await accountOrDefault(d.moneyAccountId, d.mode),
      createdById: user.id,
    },
  });
}

export async function deleteAdvance(user: SessionUser, id: string) {
  assertAccounts(user);
  await db.employeeAdvance.delete({ where: { id } });
}

/* ---------- read models ---------- */

const listInclude = {
  user: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  decidedBy: { select: { name: true } },
  client: { select: { id: true, schoolName: true } },
  lead: { select: { id: true, schoolName: true } },
  files: { select: { id: true, fileName: true, contentType: true } },
} as const;

const row = (e: Prisma.ExpenseGetPayload<{ include: typeof listInclude }>) => ({
  id: e.id,
  number: e.number,
  date: fromDbDate(e.date),
  category: e.category,
  amount: Number(e.amount),
  description: e.description,
  city: e.city,
  paidTo: e.paidTo,
  paidBy: e.paidBy,
  mode: e.mode,
  reference: e.reference,
  noBillReason: e.noBillReason,
  status: e.status,
  rejectReason: e.rejectReason,
  decidedBy: e.decidedBy?.name ?? null,
  reimbursedOn: e.reimbursedAt ? fromDbDate(e.reimbursedAt) : null,
  reimburseRef: e.reimburseRef,
  user: e.user,
  enteredBy: e.createdBy,
  school: e.client ? { label: e.client.schoolName, href: `/clients/${e.client.id}` } : e.lead ? { label: e.lead.schoolName, href: `/leads/${e.lead.id}` } : null,
  files: e.files,
});
export type ExpenseRow = ReturnType<typeof row>;

export type ExpenseFilters = { status?: string; person?: string; category?: string; from?: string; to?: string; year?: { from: string; to: string } };

/** Expenses the user may see, newest first, with the screen's filters and the chosen financial year. */
export async function expenseList(user: SessionUser, f: ExpenseFilters = {}) {
  const where: Prisma.ExpenseWhereInput = { AND: [expenseScope(user)] };
  const and = where.AND as Prisma.ExpenseWhereInput[];
  if (f.status === "waiting") and.push({ status: "SUBMITTED" });
  else if (f.status === "approved") and.push({ status: "APPROVED" });
  else if (f.status === "rejected") and.push({ status: "REJECTED" });
  else if (f.status === "topay") and.push({ status: "APPROVED", paidBy: "OWN", reimbursedAt: null });
  if (f.person === "company") and.push({ userId: null });
  else if (f.person && canManageExpenses(user.role)) and.push({ userId: f.person });
  if (f.category && (EXPENSE_CATEGORIES as readonly string[]).includes(f.category)) and.push({ category: f.category });
  const from = [f.year?.from, f.from && isDateStr(f.from) ? f.from : undefined].filter(Boolean).sort().pop();
  const to = [f.year?.to, f.to && isDateStr(f.to) ? f.to : undefined].filter(Boolean).sort()[0];
  if (from || to) and.push({ date: { ...(from ? { gte: toDbDate(from) } : {}), ...(to ? { lte: toDbDate(to) } : {}) } });
  const rows = await db.expense.findMany({ where, include: listInclude, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500 });
  return rows.map(row);
}

/** Where each person stands today: advance with them, spends waiting, and what the company owes them. */
export async function expenseBalances(user: SessionUser, onlyUserId?: string) {
  const forOne = !canManageExpenses(user.role) ? user.id : onlyUserId;
  const [advances, expenses, people] = await Promise.all([
    db.employeeAdvance.groupBy({ by: ["userId", "kind"], where: forOne ? { userId: forOne } : {}, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["userId", "paidBy", "status"], where: { userId: forOne ? forOne : { not: null }, reimbursedAt: null }, _sum: { amount: true } }),
    db.user.findMany({ where: forOne ? { id: forOne } : {}, select: { id: true, name: true, active: true }, orderBy: { name: "asc" } }),
  ]);
  const spentFromAdvance = await db.expense.groupBy({
    by: ["userId"],
    where: { userId: forOne ? forOne : { not: null }, paidBy: "ADVANCE", status: "APPROVED" },
    _sum: { amount: true },
  });
  const sum = (v: { _sum: { amount: Prisma.Decimal | null } } | undefined) => Number(v?._sum.amount ?? 0);
  return people
    .map((p) => {
      const given = sum(advances.find((a) => a.userId === p.id && a.kind === "GIVEN"));
      const returned = sum(advances.find((a) => a.userId === p.id && a.kind === "RETURNED"));
      const spent = sum(spentFromAdvance.find((s) => s.userId === p.id));
      const toPay = sum(expenses.find((x) => x.userId === p.id && x.paidBy === "OWN" && x.status === "APPROVED"));
      const waiting = expenses.filter((x) => x.userId === p.id && x.status === "SUBMITTED").reduce((t, x) => t + sum(x), 0);
      return {
        id: p.id,
        name: p.name,
        active: p.active,
        advanceGiven: r2(given - returned),
        spentFromAdvance: r2(spent),
        /** Positive: still with the employee. Negative: they spent more than the advance. */
        advanceBalance: r2(given - returned - spent),
        toReimburse: r2(toPay),
        waiting: r2(waiting),
      };
    })
    .filter((p) => forOne || p.advanceGiven || p.spentFromAdvance || p.toReimburse || p.waiting);
}

export async function advanceList(user: SessionUser, onlyUserId?: string) {
  const forOne = !canManageExpenses(user.role) ? user.id : onlyUserId;
  const rows = await db.employeeAdvance.findMany({
    where: forOne ? { userId: forOne } : {},
    include: { user: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((a) => ({
    id: a.id,
    user: a.user.name,
    kind: a.kind,
    amount: Number(a.amount),
    date: fromDbDate(a.date),
    mode: a.mode,
    reference: a.reference,
    note: a.note,
    by: a.createdBy.name,
  }));
}

/** Approved spending in a period (dashboard): everyone's for Accounts, otherwise the person's own. */
export async function expenseTotal(user: SessionUser, from: string, to: string) {
  const r = await db.expense.aggregate({
    where: { ...expenseScope(user), status: "APPROVED", date: { gte: toDbDate(from), lte: toDbDate(to) } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return { amount: Number(r._sum.amount ?? 0), count: r._count._all };
}

export async function expenseWaitingCount() {
  return db.expense.count({ where: { status: "SUBMITTED" } });
}

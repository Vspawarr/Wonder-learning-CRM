// Company accounts (R39): where the money sits (bank / cash / card), other money in and out, transfers between
// accounts, supplier bills (payables) and salaries. A management view of the company's money; the CA keeps the
// statutory books and gets Excel exports. Outgoing money entered by anyone but the approver waits for the Director
// (Admin while there is no Director login), the same rule as expenses (R38).
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { BILL_CATEGORIES, COMPANY_IN_CATEGORIES, COMPANY_OUT_CATEGORIES, EXPENSE_MODES } from "@/lib/constants";
import { addDays, fromDbDate, isDateStr, toDbDate, todayIST } from "@/lib/dates";
import { canManageCompanyAccounts, type SessionUser } from "@/lib/permissions";
import { DomainError, NotFoundError } from "./errors";
import { canApproveExpenses } from "./expenses";
import { getFeatures } from "./features";
import { PO_MAX_BYTES, PO_TYPES } from "./finance/po";
import { parse } from "./validation";

export const r2 = (n: number) => Math.round(n * 100) / 100;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => s || null);
const money = (min = 0.01) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v.replace(/,/g, "").trim() || NaN) : v))
    .refine((n) => Number.isFinite(n) && n >= min && n < 1e10, "Enter the amount.");
/** Optional number: blank / missing counts as 0. */
const optNum = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v == null ? 0 : typeof v === "string" ? Number(v.replace(/,/g, "").trim() || 0) : v));
const date = (what: string) => z.string().refine(isDateStr, `Enter the ${what}.`);
const optDate = z
  .string()
  .nullish()
  .transform((s) => (s && isDateStr(s) ? s : null));
const optMode = z.preprocess((v) => (v === "" ? null : v), z.enum(EXPENSE_MODES).nullish()).transform((s) => s ?? null);
const accountId = text(50);

export type Attachment = { name: string; type: string; bytes: Uint8Array };

async function assertAccess(user: SessionUser) {
  if (!canManageCompanyAccounts(user.role)) throw new DomainError("Only Accounts can do this.");
  if (!(await getFeatures()).companyAccounts) throw new DomainError("Company accounts are switched off in Settings → Features.");
}

function checkFile(f: Attachment | null | undefined) {
  if (!f) return null;
  if (!PO_TYPES[f.type]) throw new DomainError("Attach a photo (JPG / PNG) or a PDF.");
  if (f.bytes.length > PO_MAX_BYTES) throw new DomainError("The file is larger than 4 MB.");
  return f.bytes.length ? { fileName: f.name.slice(0, 200) || "file", fileType: f.type, fileData: Buffer.from(f.bytes) } : null;
}

async function assertAccount(id: string | null) {
  if (id && !(await db.moneyAccount.count({ where: { id } }))) throw new NotFoundError("Money account");
  return id;
}

export { accountForMode, defaultAccountId } from "./money-accounts";

/* ---------- money accounts ---------- */

export const accountInput = z.object({
  name: z.string().trim().min(2, "Name the account (e.g. HDFC Current, Office cash, Company card).").max(80),
  kind: z.enum(["BANK", "CASH", "CARD", "OTHER"]),
  number: text(40),
  openingBalance: optNum.refine((n) => Number.isFinite(n) && Math.abs(n) < 1e11, "Enter the opening balance (0 if new; minus for card dues)."),
  openingDate: date("date of the opening balance"),
  active: z.boolean().default(true),
});

export async function listAccounts() {
  const rows = await db.moneyAccount.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    number: a.number,
    openingBalance: Number(a.openingBalance),
    openingDate: fromDbDate(a.openingDate),
    active: a.active,
  }));
}
export type MoneyAccountRow = Awaited<ReturnType<typeof listAccounts>>[number];

export async function saveAccount(user: SessionUser, id: string | null, raw: unknown) {
  await assertAccess(user);
  const d = parse(accountInput, raw);
  const data = { name: d.name, kind: d.kind, number: d.number, openingBalance: d.openingBalance, openingDate: toDbDate(d.openingDate), active: d.active };
  try {
    if (id) await db.moneyAccount.update({ where: { id }, data });
    else {
      const last = await db.moneyAccount.aggregate({ _max: { sortOrder: true } });
      await db.moneyAccount.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    }
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new DomainError("An account with this name already exists.");
    throw e;
  }
}

/* ---------- approval (outgoing money) ---------- */

async function approvalFor(user: SessionUser) {
  const ok = await canApproveExpenses(user);
  return ok ? { status: "APPROVED" as const, decidedById: user.id, decidedAt: new Date() } : { status: "PENDING" as const };
}

export const decideInput = z.object({ approve: z.boolean(), reason: text(300) });

/** Director (or Admin while there is no Director login) approves or rejects a bill, salary or money-out entry. */
export async function decide(user: SessionUser, kind: "bill" | "salary" | "entry", id: string, raw: unknown) {
  if (!(await canApproveExpenses(user))) throw new DomainError("This is approved by the Director.");
  const d = parse(decideInput, raw);
  if (!d.approve && (!d.reason || d.reason.length < 3)) throw new DomainError("Write why it is rejected.");
  const data = { status: d.approve ? ("APPROVED" as const) : ("REJECTED" as const), decidedById: user.id, decidedAt: new Date(), rejectReason: d.approve ? null : d.reason };
  const where = { id, status: "PENDING" as const };
  const r =
    kind === "bill"
      ? await db.bill.updateMany({ where, data })
      : kind === "salary"
        ? await db.salaryPayment.updateMany({ where, data })
        : await db.companyEntry.updateMany({ where, data });
  if (!r.count) throw new DomainError("This is no longer waiting for approval.");
}

/** Everything waiting for the Director in company accounts (for the overview and the bell). */
export async function pendingSpend() {
  const [bills, salaries, entries] = await Promise.all([
    db.bill.count({ where: { status: "PENDING" } }),
    db.salaryPayment.count({ where: { status: "PENDING" } }),
    db.companyEntry.count({ where: { status: "PENDING" } }),
  ]);
  return { bills, salaries, entries };
}
export async function pendingSpendCount() {
  const p = await pendingSpend();
  return p.bills + p.salaries + p.entries;
}

/* ---------- other money in / out ---------- */

export const entryInput = z
  .object({
    date: date("date"),
    direction: z.enum(["IN", "OUT"]),
    category: z.string().trim().min(1, "Choose what it is."),
    amount: money(),
    party: text(150),
    reference: text(100),
    note: text(300),
    moneyAccountId: accountId,
  })
  .refine((d) => ((d.direction === "IN" ? COMPANY_IN_CATEGORIES : COMPANY_OUT_CATEGORIES) as readonly string[]).includes(d.category), {
    message: "Choose what it is.",
    path: ["category"],
  });

export async function createEntry(user: SessionUser, raw: unknown, file?: Attachment | null) {
  await assertAccess(user);
  const d = parse(entryInput, raw);
  if (d.date > todayIST()) throw new DomainError("The date can't be in the future.");
  await assertAccount(d.moneyAccountId);
  const approval = d.direction === "IN" ? { status: "APPROVED" as const, decidedById: user.id, decidedAt: new Date() } : await approvalFor(user);
  const e = await db.companyEntry.create({
    data: { ...d, date: toDbDate(d.date), ...approval, ...(checkFile(file) ?? {}), createdById: user.id },
  });
  return { id: e.id, number: e.number, approved: approval.status === "APPROVED" };
}

export async function deleteEntry(user: SessionUser, id: string) {
  await assertAccess(user);
  await db.companyEntry.delete({ where: { id } });
}

export async function entryList(f: { from?: string; to?: string } = {}) {
  const rows = await db.companyEntry.findMany({
    where: f.from || f.to ? { date: { ...(f.from ? { gte: toDbDate(f.from) } : {}), ...(f.to ? { lte: toDbDate(f.to) } : {}) } } : {},
    include: { moneyAccount: { select: { name: true } }, createdBy: { select: { name: true } }, decidedBy: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  return rows.map((e) => ({
    id: e.id,
    number: e.number,
    date: fromDbDate(e.date),
    direction: e.direction,
    category: e.category,
    amount: Number(e.amount),
    party: e.party,
    reference: e.reference,
    note: e.note,
    account: e.moneyAccount?.name ?? null,
    status: e.status,
    rejectReason: e.rejectReason,
    hasFile: !!e.fileName,
    by: e.createdBy.name,
  }));
}

/* ---------- transfers ---------- */

export const transferInput = z
  .object({
    date: date("date"),
    amount: money(),
    fromAccountId: z.string().min(1, "Choose where the money came from."),
    toAccountId: z.string().min(1, "Choose where it went."),
    reference: text(100),
    note: text(300),
  })
  .refine((d) => d.fromAccountId !== d.toAccountId, { message: "Choose two different accounts.", path: ["toAccountId"] });

export async function createTransfer(user: SessionUser, raw: unknown) {
  await assertAccess(user);
  const d = parse(transferInput, raw);
  await assertAccount(d.fromAccountId);
  await assertAccount(d.toAccountId);
  await db.accountTransfer.create({ data: { ...d, date: toDbDate(d.date), createdById: user.id } });
}

export async function deleteTransfer(user: SessionUser, id: string) {
  await assertAccess(user);
  await db.accountTransfer.delete({ where: { id } });
}

/* ---------- bills (payables) ---------- */

export const billInput = z.object({
  vendor: z.string().trim().min(2, "Who is the bill from (supplier / press)?").max(150),
  billNo: text(60),
  billDate: date("bill date"),
  dueDate: optDate,
  category: z.enum(BILL_CATEGORIES, { error: "Choose what the bill is for." }),
  description: z.string().trim().min(2, "Write what the bill is for.").max(300),
  amount: money(),
  gstRate: optNum.refine((n) => Number.isFinite(n) && n >= 0 && n <= 28, "GST must be between 0 and 28%."),
});

export async function createBill(user: SessionUser, raw: unknown, file?: Attachment | null) {
  await assertAccess(user);
  const d = parse(billInput, raw);
  if (d.dueDate && d.dueDate < d.billDate) throw new DomainError("The due date can't be before the bill date.");
  const gstAmount = r2((d.amount * d.gstRate) / 100);
  const b = await db.bill.create({
    data: {
      ...d,
      billDate: toDbDate(d.billDate),
      dueDate: d.dueDate ? toDbDate(d.dueDate) : null,
      gstAmount,
      total: r2(d.amount + gstAmount),
      ...(await approvalFor(user)),
      ...(checkFile(file) ?? {}),
      createdById: user.id,
    },
  });
  return { id: b.id, number: b.number, approved: b.status === "APPROVED" };
}

export const billPaymentInput = z.object({
  date: date("date paid"),
  amount: money(),
  moneyAccountId: accountId,
  mode: optMode,
  reference: text(100),
});

export async function payBill(user: SessionUser, billId: string, raw: unknown) {
  await assertAccess(user);
  const d = parse(billPaymentInput, raw);
  const b = await db.bill.findUnique({ where: { id: billId }, include: { payments: true } });
  if (!b) throw new NotFoundError("Bill");
  if (b.status !== "APPROVED") throw new DomainError("The bill must be approved by the Director before it is paid.");
  const balance = r2(Number(b.total) - b.payments.reduce((t, p) => t + Number(p.amount), 0));
  if (d.amount > balance + 0.001) throw new DomainError(`That's more than the ₹${balance.toLocaleString("en-IN")} still to pay.`);
  await assertAccount(d.moneyAccountId);
  await db.billPayment.create({ data: { ...d, billId, date: toDbDate(d.date), createdById: user.id } });
}

export async function deleteBillPayment(user: SessionUser, id: string) {
  await assertAccess(user);
  await db.billPayment.delete({ where: { id } });
}

export async function deleteBill(user: SessionUser, id: string) {
  await assertAccess(user);
  if (await db.billPayment.count({ where: { billId: id } })) throw new DomainError("Delete the bill's payments first.");
  await db.bill.delete({ where: { id } });
}

export type BillState = "WAITING" | "REJECTED" | "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";

export async function billList(f: { from?: string; to?: string; show?: string } = {}) {
  const rows = await db.bill.findMany({
    where: f.from || f.to ? { billDate: { ...(f.from ? { gte: toDbDate(f.from) } : {}), ...(f.to ? { lte: toDbDate(f.to) } : {}) } } : {},
    include: { payments: { include: { moneyAccount: { select: { name: true } } }, orderBy: { date: "asc" } }, createdBy: { select: { name: true } } },
    orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  const today = todayIST();
  const out = rows.map((b) => {
    const paid = r2(b.payments.reduce((t, p) => t + Number(p.amount), 0));
    const total = Number(b.total);
    const balance = r2(total - paid);
    const due = b.dueDate ? fromDbDate(b.dueDate) : null;
    const state: BillState =
      b.status === "PENDING" ? "WAITING" : b.status === "REJECTED" ? "REJECTED" : balance <= 0 ? "PAID" : due && due < today ? "OVERDUE" : paid > 0 ? "PARTIAL" : "UNPAID";
    return {
      id: b.id,
      number: b.number,
      vendor: b.vendor,
      billNo: b.billNo,
      billDate: fromDbDate(b.billDate),
      dueDate: due,
      category: b.category,
      description: b.description,
      amount: Number(b.amount),
      gstRate: Number(b.gstRate),
      gstAmount: Number(b.gstAmount),
      total,
      paid,
      balance,
      state,
      rejectReason: b.rejectReason,
      hasFile: !!b.fileName,
      by: b.createdBy.name,
      payments: b.payments.map((p) => ({ id: p.id, date: fromDbDate(p.date), amount: Number(p.amount), account: p.moneyAccount?.name ?? null, mode: p.mode, reference: p.reference })),
    };
  });
  const show = f.show ?? "";
  return show === "topay" ? out.filter((b) => ["UNPAID", "PARTIAL", "OVERDUE"].includes(b.state)) : show === "waiting" ? out.filter((b) => b.state === "WAITING") : out;
}
export type BillRow = Awaited<ReturnType<typeof billList>>[number];

/* ---------- salaries ---------- */

export const salaryInput = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose the month."),
    userId: text(50),
    employeeName: text(120),
    gross: money(),
    deductions: optNum.refine((n) => Number.isFinite(n) && n >= 0, "Enter deductions (0 if none)."),
    paidOn: date("date paid"),
    moneyAccountId: accountId,
    mode: optMode,
    reference: text(100),
    note: text(300),
  })
  .refine((d) => d.deductions <= d.gross, { message: "Deductions can't be more than the gross salary.", path: ["deductions"] });

export async function createSalary(user: SessionUser, raw: unknown) {
  await assertAccess(user);
  const d = parse(salaryInput, raw);
  const u = d.userId ? await db.user.findUnique({ where: { id: d.userId }, select: { name: true } }) : null;
  const name = u?.name ?? d.employeeName;
  if (!name) throw new DomainError("Choose the employee or type their name.");
  if (d.paidOn > todayIST()) throw new DomainError("The date paid can't be in the future.");
  await assertAccount(d.moneyAccountId);
  if (await db.salaryPayment.count({ where: { month: d.month, employeeName: name, status: { not: "REJECTED" } } }))
    throw new DomainError(`${name}'s salary for this month is already entered.`);
  await db.salaryPayment.create({
    data: {
      month: d.month,
      userId: u ? d.userId : null,
      employeeName: name,
      gross: d.gross,
      deductions: d.deductions,
      net: r2(d.gross - d.deductions),
      paidOn: toDbDate(d.paidOn),
      moneyAccountId: d.moneyAccountId,
      mode: d.mode,
      reference: d.reference,
      note: d.note,
      ...(await approvalFor(user)),
      createdById: user.id,
    },
  });
}

export async function deleteSalary(user: SessionUser, id: string) {
  await assertAccess(user);
  await db.salaryPayment.delete({ where: { id } });
}

export async function salaryList(f: { from?: string; to?: string } = {}) {
  const where: Prisma.SalaryPaymentWhereInput =
    f.from || f.to ? { month: { ...(f.from ? { gte: f.from.slice(0, 7) } : {}), ...(f.to ? { lte: f.to.slice(0, 7) } : {}) } } : {};
  const rows = await db.salaryPayment.findMany({
    where,
    include: { moneyAccount: { select: { name: true } } },
    orderBy: [{ month: "desc" }, { employeeName: "asc" }],
    take: 1000,
  });
  return rows.map((s) => ({
    id: s.id,
    month: s.month,
    employeeName: s.employeeName,
    userId: s.userId,
    gross: Number(s.gross),
    deductions: Number(s.deductions),
    net: Number(s.net),
    paidOn: fromDbDate(s.paidOn),
    account: s.moneyAccount?.name ?? null,
    mode: s.mode,
    reference: s.reference,
    note: s.note,
    status: s.status,
    rejectReason: s.rejectReason,
  }));
}
export type SalaryRow = Awaited<ReturnType<typeof salaryList>>[number];

/** Attachments on bills and entries. */
export async function companyFile(user: SessionUser, kind: "bill" | "entry", id: string) {
  await assertAccess(user);
  const f =
    kind === "bill"
      ? await db.bill.findUnique({ where: { id }, select: { fileName: true, fileType: true, fileData: true } })
      : await db.companyEntry.findUnique({ where: { id }, select: { fileName: true, fileType: true, fileData: true } });
  if (!f?.fileData) throw new NotFoundError("File");
  return { name: f.fileName ?? "file", type: f.fileType ?? "application/octet-stream", data: f.fileData };
}

/** Bills due in the next week or already late (bell, overview). */
export async function billsDueSoon() {
  const soon = toDbDate(addDays(todayIST(), 7));
  const rows = await db.bill.findMany({ where: { status: "APPROVED", dueDate: { lte: soon } }, include: { payments: { select: { amount: true } } } });
  return rows.filter((b) => Number(b.total) - b.payments.reduce((t, p) => t + Number(p.amount), 0) > 0.001).length;
}

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import {
  approveExpense,
  createExpense,
  deleteExpense,
  expenseBalances,
  expenseFile,
  expenseList,
  recordAdvance,
  reimburseExpenses,
  rejectExpense,
} from "@/server/expenses";
import { makeUser, resetData } from "./helpers";

let exA: SessionUser, exB: SessionUser, admin: SessionUser;
const today = todayIST();
const bill = { name: "bill.jpg", type: "image/jpeg", bytes: new Uint8Array([255, 216, 255, 0, 1, 2]) };
const spend = (over: Record<string, unknown> = {}) => ({
  date: today,
  category: "Hotel / stay",
  amount: "2400",
  description: "Hotel in Nashik, 2 nights, school visits",
  city: "Nashik",
  paidBy: "OWN",
  // As the form sends it when left blank.
  mode: "",
  related: "",
  userId: "",
  ...over,
});

beforeEach(async () => {
  await resetData();
  exA = await makeUser("SALES_EXECUTIVE");
  exB = await makeUser("SALES_EXECUTIVE");
  admin = await makeUser("ADMIN");
});

describe("expenses (R37)", () => {
  it("a salesperson submits a spend with its bill; it waits for Accounts and only they (and Accounts) see it", async () => {
    await expect(createExpense(exA, spend(), [])).rejects.toThrow(/Attach the bill/);
    await expect(createExpense(exA, spend({ paidBy: "COMPANY" }), [bill])).rejects.toThrow(/Accounts/);
    await expect(createExpense(exA, spend({ date: addDays(today, 2) }), [bill])).rejects.toThrow(/future/);
    await expect(createExpense(exA, spend(), [{ ...bill, type: "text/plain" }])).rejects.toThrow(/photos/);
    const r = await createExpense(exA, spend(), [bill]);
    expect(r.approved).toBe(false);
    const [row] = await expenseList(exA);
    expect(row).toMatchObject({ status: "SUBMITTED", amount: 2400, paidBy: "OWN", user: { id: exA.id } });
    expect(await expenseList(exB)).toHaveLength(0);
    expect((await expenseList(admin)).map((e) => e.id)).toContain(r.id);
    await expect(expenseFile(exB, row.files[0].id)).rejects.toThrow(/not found/);
    expect((await expenseFile(exA, row.files[0].id)).contentType).toBe("image/jpeg");
    await expect(approveExpense(exA, r.id)).rejects.toThrow(/Only Accounts/);
  });

  it("approved own-money spends are paid back; rejected ones go back with a reason", async () => {
    const a = await createExpense(exA, spend(), [bill]);
    const b = await createExpense(exA, spend({ amount: 350, category: "Meals", description: "Lunch on visit" }), [bill]);
    await approveExpense(admin, a.id);
    await expect(rejectExpense(admin, b.id, { reason: "" })).rejects.toThrow(/why/);
    await rejectExpense(admin, b.id, { reason: "Bill not readable" });
    expect(await db.task.count({ where: { assigneeId: exA.id, title: { contains: "rejected by Accounts" } } })).toBe(1);
    let [bal] = await expenseBalances(exA);
    expect(bal).toMatchObject({ toReimburse: 2400, waiting: 0 });
    // Approved: the employee can no longer delete it; the rejected one they can.
    await expect(deleteExpense(exA, a.id)).rejects.toThrow(/approved/);
    await deleteExpense(exA, b.id);
    expect(await reimburseExpenses(admin, exA.id, { date: today, reference: "UTR55" })).toBe(1);
    [bal] = await expenseBalances(exA);
    expect(bal.toReimburse).toBe(0);
    expect((await expenseList(exA))[0]).toMatchObject({ reimbursedOn: today, reimburseRef: "UTR55" });
    await expect(reimburseExpenses(admin, exA.id, { date: today })).rejects.toThrow(/Nothing/);
    await expect(deleteExpense(admin, a.id)).rejects.toThrow(/paid back/);
  });

  it("advances: given, spent from by approved bills, returned; Accounts' own entries count at once", async () => {
    await expect(recordAdvance(exA, { userId: exA.id, amount: 5000, date: today })).rejects.toThrow(/Only Accounts/);
    await recordAdvance(admin, { userId: exA.id, amount: 5000, date: today, mode: "UPI" });
    const x = await createExpense(exA, spend({ paidBy: "ADVANCE", amount: 1800 }), [bill]);
    let [bal] = await expenseBalances(exA);
    expect(bal).toMatchObject({ advanceGiven: 5000, spentFromAdvance: 0, advanceBalance: 5000, waiting: 1800 });
    await approveExpense(admin, x.id);
    [bal] = await expenseBalances(exA);
    expect(bal).toMatchObject({ spentFromAdvance: 1800, advanceBalance: 3200, toReimburse: 0 });
    await recordAdvance(admin, { userId: exA.id, kind: "RETURNED", amount: 1200, date: today });
    [bal] = await expenseBalances(exA);
    expect(bal.advanceBalance).toBe(2000);
    // A company-account expense by Accounts: no bill needed, approved straight away, no employee.
    const c = await createExpense(admin, spend({ paidBy: "COMPANY", category: "Software / licences", description: "CRM hosting, October", userId: "" }), []);
    expect(c.approved).toBe(true);
    expect((await db.expense.findUniqueOrThrow({ where: { id: c.id } })).userId).toBeNull();
    expect((await expenseList(admin, { person: "company" })).map((e) => e.id)).toEqual([c.id]);
  });
});

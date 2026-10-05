import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { convertToClient } from "@/server/clients";
import { convertLead, createLead } from "@/server/leads";
import { moveOpportunity } from "@/server/opportunities";
import { approvePayment, createInvoice, createSalesOrder, recordPayment } from "@/server/finance/service";
import { createExpense } from "@/server/expenses";
import { createBill, createEntry, createSalary, createTransfer, decide, listAccounts, payBill, saveAccount, billList } from "@/server/company";
import { accountBook, balances, financeOverview, reassign, toggleMatch } from "@/server/company-books";
import { leadData, makeUser, resetData } from "./helpers";

const today = todayIST();
const start = addDays(today, -60);
let admin: SessionUser, exA: SessionUser;
let bank: string, cash: string;

beforeEach(async () => {
  await resetData();
  await db.appSetting.deleteMany({ where: { key: "features" } });
  admin = await makeUser("ADMIN");
  exA = await makeUser("SALES_EXECUTIVE");
  await saveAccount(admin, null, { name: "HDFC Current", kind: "BANK", openingBalance: 100000, openingDate: start });
  await saveAccount(admin, null, { name: "Office cash", kind: "CASH", openingBalance: 5000, openingDate: start });
  await saveAccount(admin, null, { name: "Company card", kind: "CARD", openingBalance: 0, openingDate: start });
  const accs = await listAccounts();
  [bank, cash] = ["HDFC Current", "Office cash"].map((n) => accs.find((a) => a.name === n)!.id);
});

async function schoolPaysCash(amount: number) {
  const opp = await convertLead(exA, await createLead(exA, leadData(exA.id, { schoolName: "Cash School" })), { temperature: "WARM" });
  await moveOpportunity(exA, opp, { stage: "WON" });
  const client = await convertToClient(exA, opp);
  const so = await createSalesOrder(exA, client, { date: today, items: [{ description: "Kit", qty: 10, price: 3000, gstRate: 0 }] });
  const inv = await createInvoice(exA, so, { date: today, dueDate: addDays(today, 45) });
  const r = await recordPayment(exA, inv, { amount, date: today, mode: "Cash" });
  return r.paymentId;
}

describe("company accounts (R39)", () => {
  it("only Accounts may set up accounts; names are unique", async () => {
    await expect(saveAccount(exA, null, { name: "My bank", kind: "BANK", openingBalance: 0, openingDate: today })).rejects.toThrow(/Accounts/);
    await expect(saveAccount(admin, null, { name: "HDFC Current", kind: "BANK", openingBalance: 0, openingDate: today })).rejects.toThrow(/already exists/);
  });

  it("every rupee lands in an account: cash from a school, bills, salaries, card spends, other money, transfers", async () => {
    // A salesperson collects cash; Accounts approves it into office cash (default for cash).
    const pid = await schoolPaysCash(8000);
    await approvePayment(admin, pid);
    expect((await db.payment.findUniqueOrThrow({ where: { id: pid } })).moneyAccountId).toBe(cash);

    // A printing bill with 18% GST, paid in part from the bank.
    const b = await createBill(admin, { vendor: "Sai Printers", billDate: today, dueDate: addDays(today, 10), category: "Printing / books", description: "Text books", amount: 10000, gstRate: 18 });
    expect(b.approved).toBe(true); // no Director login yet: Admin approves
    await expect(payBill(admin, b.id, { date: today, amount: 20000, moneyAccountId: bank })).rejects.toThrow(/more than/);
    await payBill(admin, b.id, { date: today, amount: 5000, moneyAccountId: bank });
    expect((await billList()).find((x) => x.id === b.id)).toMatchObject({ total: 11800, gstAmount: 1800, paid: 5000, balance: 6800, state: "PARTIAL" });

    // Salary (no duplicate for the same month), other money in / out, a card spend, cash deposited in the bank.
    await createSalary(admin, { month: today.slice(0, 7), userId: exA.id, gross: 25000, deductions: 1800, paidOn: today, moneyAccountId: bank });
    await expect(createSalary(admin, { month: today.slice(0, 7), userId: exA.id, gross: 25000, paidOn: today })).rejects.toThrow(/already entered/);
    await createEntry(admin, { date: today, direction: "IN", category: "Interest", amount: 250, moneyAccountId: bank });
    await createEntry(admin, { date: today, direction: "OUT", category: "Rent", amount: 15000, moneyAccountId: bank, party: "Landlord" });
    await createExpense(admin, { date: today, category: "Software / licences", amount: 1999, description: "Domain", paidBy: "COMPANY_CARD", billAvailable: "no", noBillReason: "Online renewal, invoice by email" }, []);
    await createTransfer(admin, { date: today, amount: 10000, fromAccountId: cash, toAccountId: bank });

    const { accounts } = await balances(admin);
    const by = Object.fromEntries(accounts.map((a) => [a.name, a.balance]));
    expect(by).toEqual({
      "HDFC Current": 100000 - 5000 - 23200 + 250 - 15000 + 10000,
      "Office cash": 5000 + 8000 - 10000,
      "Company card": -1999,
    });

    const ov = await financeOverview(admin, start, today);
    expect(ov.moneyIn).toBe(8000 + 250);
    expect(ov.moneyOut).toBe(5000 + 23200 + 15000 + 1999);
    expect(ov.toPay).toMatchObject({ bills: 6800, cardDues: 1999 });
    expect(ov.gst.onBills).toBe(1800);
    expect(ov.incomeExpense.totalCosts).toBe(1999 + 10000 + 25000 + 15000);

    // The bank book: opening, running balance, ticks and moving an entry to another account.
    const book = await accountBook(admin, bank, start, today);
    expect(book.opening).toBe(100000);
    expect(book.closing).toBe(by["HDFC Current"]);
    const rent = book.rows.find((r) => r.particulars.includes("Rent"))!;
    await toggleMatch(admin, rent.key);
    expect((await accountBook(admin, bank, start, today)).rows.find((r) => r.key === rent.key)?.matched).toBe(true);
    await reassign(admin, rent.key, cash);
    expect((await balances(admin)).accounts.find((a) => a.id === cash)?.balance).toBe(3000 - 15000);
  });

  it("once a Director login exists, Admin's bills / salaries / payments wait for the Director", async () => {
    const director = await makeUser("DIRECTOR");
    const b = await createBill(admin, { vendor: "Courier Co", billDate: today, category: "Transport / courier", description: "Kits to Nashik", amount: 3000, gstRate: 0 });
    expect(b.approved).toBe(false);
    await expect(payBill(admin, b.id, { date: today, amount: 3000 })).rejects.toThrow(/approved by the Director/);
    await expect(decide(admin, "bill", b.id, { approve: true })).rejects.toThrow(/Director/);
    await expect(decide(director, "bill", b.id, { approve: false })).rejects.toThrow(/why/);
    await decide(director, "bill", b.id, { approve: true });
    await payBill(admin, b.id, { date: today, amount: 3000 }); // no account chosen: counted as "not assigned"
    expect((await balances(admin)).unassigned).toMatchObject({ count: 1, net: -3000 });
    const e = await createEntry(admin, { date: today, direction: "OUT", category: "Bank charges", amount: 59, moneyAccountId: bank });
    expect(e.approved).toBe(false);
    const inn = await createEntry(admin, { date: today, direction: "IN", category: "Refund received", amount: 500, moneyAccountId: bank });
    expect(inn.approved).toBe(true); // money coming in needs no approval
  });
});

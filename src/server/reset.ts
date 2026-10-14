import { db } from "@/lib/db";
import { canManageSettings, type SessionUser } from "@/lib/permissions";
import { DomainError } from "./errors";

// "Clear test data" (R23, again for R43): empties everything people typed in while testing, and keeps
// the set-up: logins, products, states/cities, document texts and numbering settings, feature switches.

/** Tables emptied. Every table pointing at these is in the list too, so no CASCADE is needed. */
const DATA_TABLES = [
  "LeadInterest",
  "OpportunityItem",
  "OpportunityStageChange",
  "QuotationItem",
  "SalesOrderItem",
  "InvoiceItem",
  "DispatchItem",
  "CreditNote",
  "Payment",
  "Invoice",
  "Dispatch",
  "PurchaseOrderFile",
  "SalesOrder",
  "Quotation",
  "ClientFile",
  "ClientContact",
  "Task",
  "Activity",
  "Client",
  "Opportunity",
  "Lead",
  "Target",
  "PasswordReset",
  "ExpenseFile",
  "Expense",
  "EmployeeAdvance",
  "BookMatch",
  "BillPayment",
  "Bill",
  "SalaryPayment",
  "CompanyEntry",
  "AccountTransfer",
  "MoneyAccount",
  "OwnerTransfer",
] as const;

export const CLEAR_WORD = "CLEAR";

export async function testDataCounts() {
  const [leads, opportunities, quotations, clients, salesOrders, invoices, payments, tasks, activities, targets, expenses, company, transfers] =
    await Promise.all([
      db.lead.count(),
      db.opportunity.count(),
      db.quotation.count(),
      db.client.count(),
      db.salesOrder.count(),
      db.invoice.count(),
      db.payment.count(),
      db.task.count(),
      db.activity.count(),
      db.target.count(),
      Promise.all([db.expense.count(), db.employeeAdvance.count()]).then(([a, b]) => a + b),
      Promise.all([db.moneyAccount.count(), db.bill.count(), db.salaryPayment.count(), db.companyEntry.count(), db.accountTransfer.count()]).then((n) =>
        n.reduce((t, x) => t + x, 0),
      ),
      db.ownerTransfer.count(),
    ]);
  return { leads, opportunities, quotations, clients, salesOrders, invoices, payments, tasks, activities, targets, expenses, company, transfers };
}

export async function keptCounts() {
  const [users, products, states, cities, settings] = await Promise.all([
    db.user.count(),
    db.product.count(),
    db.state.count(),
    db.city.count(),
    db.appSetting.count(),
  ]);
  return { users, products, states, cities, settings };
}

export async function clearTestData(user: SessionUser, confirm: string) {
  if (!canManageSettings(user.role)) throw new DomainError("Only an Admin or Director can clear the data.");
  if (confirm.trim().toUpperCase() !== CLEAR_WORD) throw new DomainError(`Type ${CLEAR_WORD} to confirm.`);
  await db.$transaction([
    db.$executeRawUnsafe(`TRUNCATE ${DATA_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY`),
    // Numbers start again from the first one: L-1001, O-2001, C-101 (E-1, B-1, M-1 and documents restart by themselves).
    db.$executeRawUnsafe(`ALTER SEQUENCE "Lead_number_seq" RESTART WITH 1001`),
    db.$executeRawUnsafe(`ALTER SEQUENCE "Opportunity_number_seq" RESTART WITH 2001`),
    db.$executeRawUnsafe(`ALTER SEQUENCE "Client_number_seq" RESTART WITH 101`),
  ]);
}

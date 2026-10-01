import { db } from "@/lib/db";
import { canManageSettings, type SessionUser } from "@/lib/permissions";
import { DomainError } from "./errors";

// "Clear test data": empties everything people typed in while testing, and keeps
// the set-up: logins, products, states/cities, quotation template text, feature switches.

/** Tables emptied, children first. Every table pointing at these is in the list too, so no CASCADE is needed. */
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
] as const;

export const CLEAR_WORD = "CLEAR";

export async function testDataCounts() {
  const [leads, opportunities, quotations, clients, salesOrders, invoices, payments, tasks, activities, targets] = await Promise.all([
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
  ]);
  return { leads, opportunities, quotations, clients, salesOrders, invoices, payments, tasks, activities, targets };
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
    db.$executeRawUnsafe(`TRUNCATE ${DATA_TABLES.map((t) => `"${t}"`).join(", ")}`),
    // Numbers start again from the first one: L-1001, O-2001, C-101 (documents restart at /001 by themselves).
    db.$executeRawUnsafe(`ALTER SEQUENCE "Lead_number_seq" RESTART WITH 1001`),
    db.$executeRawUnsafe(`ALTER SEQUENCE "Opportunity_number_seq" RESTART WITH 2001`),
    db.$executeRawUnsafe(`ALTER SEQUENCE "Client_number_seq" RESTART WITH 101`),
  ]);
}

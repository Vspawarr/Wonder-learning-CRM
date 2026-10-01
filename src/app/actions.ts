"use server";

// Thin server-action layer: authenticate, call the domain service, revalidate.
// All rules and access checks live in src/server/*.
import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import type { SessionUser } from "@/lib/permissions";
import { requireUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import * as leads from "@/server/leads";
import * as opps from "@/server/opportunities";
import * as tasks from "@/server/tasks";
import * as activities from "@/server/activities";
import * as settings from "@/server/settings";
import * as clients from "@/server/clients";
import * as quotes from "@/server/quotation/service";
import * as fin from "@/server/finance/service";
import * as features from "@/server/features";
import * as po from "@/server/finance/po";
import * as dispatch from "@/server/finance/dispatch";
import * as files from "@/server/files";
import * as contacts from "@/server/contacts";
import * as renewals from "@/server/renewals";
import * as targets from "@/server/targets";
import * as search from "@/server/search";
import * as reset from "@/server/reset";
import { contentSchema, resetQuotationContent, saveQuotationContent } from "@/server/quotation/content";
import { canManageSettings } from "@/lib/permissions";
import { parse } from "@/server/validation";
import { lockMessage, requestPasswordReset as requestReset, resetPassword as doReset } from "@/server/password";
import { headers } from "next/headers";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: (u: SessionUser) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  try {
    const data = await fn(user);
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* top bar (read-only, so no revalidate) */
export const globalSearch = async (q: string) => search.globalSearch(await requireUser(), q);
export const attentionAlerts = async () => search.attentionAlerts(await requireUser());

/* settings: clear test data (Admin / Director only, checked in the service) */
export const clearTestData = async (confirm: string) => run((u) => reset.clearTestData(u, confirm));

/* auth */
export async function login(_: string | null, form: FormData): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirectTo: "/dashboard",
    });
    return null;
  } catch (e) {
    if (e instanceof AuthError)
      return (await lockMessage(String(form.get("email") ?? ""))) ?? "Email or password is incorrect, or the account is inactive.";
    throw e; // redirect on success
  }
}

/** Public: emails a reset link (if email is set up). */
export async function requestPasswordReset(_: unknown, form: FormData): Promise<{ done: boolean; emailReady: boolean } | null> {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  try {
    const r = await requestReset(String(form.get("email") ?? ""), origin);
    return { done: true, emailReady: r.sent };
  } catch (e) {
    console.error(e);
    return { done: true, emailReady: true };
  }
}

/** Public: sets a new password from a reset link. */
export async function resetPassword(token: string, password: string): Promise<ActionResult> {
  try {
    await doReset(token, password);
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

export async function changePassword(current: string, next: string) {
  return run((u) => settings.changeOwnPassword(u, current, next));
}

/* leads */
export const findDuplicateLeads = async (data: { schoolName?: string; mobile?: string; city?: string; excludeLeadId?: string }) =>
  run((u) => leads.findDuplicateLeads(u, data));
export const createLead = async (data: unknown) => run((u) => leads.createLead(u, data));
export const updateLead = async (id: string, data: unknown) => run((u) => leads.updateLead(u, id, data));
export const disqualifyLead = async (id: string, data: unknown) => run((u) => leads.disqualifyLead(u, id, data));

export const convertLead = async (id: string, data: unknown) => run((u) => leads.convertLead(u, id, data));

/* opportunities */
export const updateOpportunity = async (id: string, data: unknown) => run((u) => opps.updateOpportunity(u, id, data));
export const moveOpportunity = async (id: string, data: unknown) => run((u) => opps.moveOpportunity(u, id, data));

/* clients */
export const convertToClient = async (opportunityId: string) => run((u) => clients.convertToClient(u, opportunityId));
export const updateClient = async (id: string, data: unknown) => run((u) => clients.updateClient(u, id, data));
export const saveContact = async (clientId: string, id: string | null, data: unknown) => run((u) => contacts.saveContact(u, clientId, id, data));
export const deleteContact = async (id: string) => run((u) => contacts.deleteContact(u, id));
export const createRenewals = async (clientId?: string) => run((u) => renewals.createRenewals(u, clientId));
export const completeOnboarding = async (id: string) => run((u) => clients.completeOnboarding(u, id));

/* quotations */
export const quotationDefaults = async (parent: string | quotes.QuoteParent) => run((u) => quotes.quotationDefaults(u, parent));
export const quotationForEdit = async (id: string) => run((u) => quotes.quotationForEdit(u, id));
export const createQuotation = async (parent: string | quotes.QuoteParent, data: unknown) => run((u) => quotes.createQuotation(u, parent, data));
export const updateQuotation = async (id: string, data: unknown) => run((u) => quotes.updateQuotation(u, id, data));
export const deleteQuotation = async (id: string) => run((u) => quotes.deleteQuotation(u, id));
export const reviseQuotation = async (id: string) => run((u) => quotes.reviseQuotation(u, id));
export const markQuotationSent = async (id: string, via: "download" | "whatsapp") =>
  run((u) => quotes.markQuotationSent(u, id, via === "whatsapp" ? "whatsapp" : "download"));
export const emailQuotation = async (id: string, data: unknown) => run((u) => quotes.emailQuotation(u, id, data));
export const saveQuotationSettings = async (data: unknown) =>
  run(async (u) => {
    if (!canManageSettings(u.role)) throw new DomainError("Only a Director or Admin can change the quotation text.");
    await saveQuotationContent(u.id, parse(contentSchema, data));
  });
export const resetQuotationSettings = async () =>
  run(async (u) => {
    if (!canManageSettings(u.role)) throw new DomainError("Only a Director or Admin can change the quotation text.");
    await resetQuotationContent();
  });

/* sales orders, invoices & payments */
export const orderableQuotations = async (clientId: string) => run((u) => fin.orderableQuotations(u, clientId));
export const salesOrderDefaults = async (clientId: string, quotationId: string | null) =>
  run((u) => fin.salesOrderDefaults(u, clientId, quotationId));
export const salesOrderForEdit = async (id: string) => run((u) => fin.salesOrderForEdit(u, id));
export const createSalesOrder = async (clientId: string, data: unknown) => run((u) => fin.createSalesOrder(u, clientId, data));
export const updateSalesOrder = async (id: string, data: unknown) => run((u) => fin.updateSalesOrder(u, id, data));
export const setPurchaseOrder = async (salesOrderId: string, data: unknown) => run((u) => po.setPurchaseOrder(u, salesOrderId, data));
export const createDispatch = async (salesOrderId: string, data: unknown) => run((u) => dispatch.createDispatch(u, salesOrderId, data));
export const markDispatchReceived = async (id: string, date: string) => run((u) => dispatch.markDispatchReceived(u, id, date));
export const deleteDispatch = async (id: string) => run((u) => dispatch.deleteDispatch(u, id));
export const deleteClientFile = async (id: string) => run((u) => files.deleteClientFile(u, id));
export const markDelivered = async (id: string, date: string) => run((u) => fin.markDelivered(u, id, date));
export const cancelSalesOrder = async (id: string) => run((u) => fin.cancelSalesOrder(u, id));
export const invoiceDefaults = async (salesOrderId: string) => run((u) => fin.invoiceDefaults(u, salesOrderId));
export const createInvoice = async (salesOrderId: string, data: unknown) => run((u) => fin.createInvoice(u, salesOrderId, data));
export const cancelInvoice = async (id: string) => run((u) => fin.cancelInvoice(u, id));
export const recordPayment = async (invoiceId: string, data: unknown) => run((u) => fin.recordPayment(u, invoiceId, data));
export const logReceiptShared = async (paymentId: string) => run((u) => fin.logReceiptShared(u, paymentId));
export const emailReceipt = async (paymentId: string, data: unknown) => run((u) => fin.emailReceipt(u, paymentId, data));
export const recordAdvance = async (salesOrderId: string, data: unknown) => run((u) => fin.recordAdvance(u, salesOrderId, data));
export const setChequeStatus = async (paymentId: string, status: "DEPOSITED" | "CLEARED" | "BOUNCED") =>
  run((u) => fin.setChequeStatus(u, paymentId, status));
export const createCreditNote = async (invoiceId: string, data: unknown) => run((u) => fin.createCreditNote(u, invoiceId, data));
export const deleteCreditNote = async (id: string) => run((u) => fin.deleteCreditNote(u, id));
export const deletePayment = async (id: string) => run((u) => fin.deletePayment(u, id));
export const logInvoiceWhatsApp = async (id: string, kind: "invoice" | "reminder") =>
  run(async (u) => (kind === "reminder" ? fin.logReminder(u, id, "whatsapp") : fin.logInvoiceShared(u, id)));
export const emailInvoice = async (id: string, data: unknown, kind: "invoice" | "reminder") =>
  run((u) => fin.emailInvoice(u, id, data, kind === "reminder" ? "reminder" : "invoice"));

/* tasks & activity */
export const createTask = async (data: unknown) => run((u) => tasks.createTask(u, data));
export const postponeTask = async (id: string, data: unknown) => run((u) => tasks.postponeTask(u, id, data));
export const cancelTask = async (id: string, data: unknown) => run((u) => tasks.cancelTask(u, id, data));
export const completeTask = async (id: string, data: unknown) => run((u) => tasks.completeTask(u, id, data));
export const logActivity = async (data: unknown) => run((u) => activities.logActivity(u, data));

/* settings */
export const saveTargets = async (month: string, rows: unknown) => run((u) => targets.saveTargets(u, month, rows));
export const setFeature = async (key: string, on: boolean) => run((u) => features.setFeature(u, key, on));
export const createUser = async (data: unknown) => run((u) => settings.createUser(u, data));
export const openWorkOf = async (userId: string) =>
  run(async (u) => {
    if (!canManageSettings(u.role) && u.role !== "SALES_HEAD") throw new DomainError("Not allowed.");
    return settings.openWorkOf(userId);
  });
export const handOverWork = async (fromId: string, toId: string) => run((u) => settings.handOverWork(u, fromId, toId));
export const updateUser = async (id: string, data: unknown) => run((u) => settings.updateUser(u, id, data));
export const deleteProduct = async (id: string) => run((u) => settings.deleteProduct(u, id));
export const saveProduct = async (id: string | null, data: unknown) => run((u) => settings.saveProduct(u, id, data));
export const addState = async (data: unknown) => run((u) => settings.addState(u, data));
export const setStateActive = async (id: string, active: boolean) => run((u) => settings.setStateActive(u, id, active));
export const addCity = async (data: unknown) => run((u) => settings.addCity(u, data));
export const setCityActive = async (id: string, active: boolean) => run((u) => settings.setCityActive(u, id, active));

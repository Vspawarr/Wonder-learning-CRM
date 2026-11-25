// R53: material problems after dispatch: kits that arrived short, damaged or wrong, or that the school sent back.
// Each is settled one of two ways (the owner: "sometimes money returned, sometimes replaced"): a replacement
// dispatch (its own challan, not counted against the order's kits) or a refund / money adjustment (a credit note on
// the invoice, or money already paid back). Or closed with a note when nothing more is needed.
import { z } from "zod";
import { db } from "@/lib/db";
import { isDateStr, toDbDate, todayIST } from "@/lib/dates";
import { inr } from "@/lib/format";
import { canManageFinance, type SessionUser } from "@/lib/permissions";
import { clientScope } from "../access";
import { DomainError, NotFoundError } from "../errors";
import { getFeatures } from "../features";
import { parse } from "../validation";
import { createCreditNote, loadOrder, withNextNumber } from "./service";
import { dispatchMoves, returnMoves } from "../inventory";

export const ISSUE_KINDS = { SHORT: "Short (not received)", DAMAGED: "Damaged or wrong", RETURNED: "Returned by the school" } as const;
export type IssueKind = keyof typeof ISSUE_KINDS;

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => s || null);

export const issueInput = z.object({
  kind: z.enum(["SHORT", "DAMAGED", "RETURNED"], { message: "Choose what happened." }),
  itemId: z.string().min(1, "Choose the order line."),
  qty: z.coerce.number().int("Kits must be whole numbers.").min(1, "Enter how many kits are affected."),
  detail: optText(300),
  date: z.string().refine(isDateStr, "Enter the date."),
  dispatchId: optText(40),
  /** R54: material that came back into our store: as good or damaged stock (empty: nothing came back). */
  backTo: z.enum(["GOOD", "DAMAGED"]).nullish(),
  /** The stock item that came back (the kit, or one of its items); empty: the kit. */
  stockItemId: optText(40),
});

/** Records a problem with delivered (or returned) material on an order. */
export async function reportIssue(user: SessionUser, salesOrderId: string, raw: unknown) {
  const d = parse(issueInput, raw);
  const so = await loadOrder(user, salesOrderId);
  const item = so.items.find((i) => i.id === d.itemId);
  if (!item) throw new DomainError("That line doesn't belong to this order.");
  if (d.qty > item.qty) throw new DomainError(`The order has only ${item.qty} kit(s) of ${item.description}.`);
  if (d.dispatchId && !(await db.dispatch.count({ where: { id: d.dispatchId, salesOrderId: so.id } })))
    throw new DomainError("That challan doesn't belong to this order.");
  if (d.backTo && d.kind === "SHORT") throw new DomainError("Nothing comes back for kits that were short.");
  const issue = await db.materialIssue.create({
    data: {
      backTo: d.backTo ?? null,
      clientId: so.clientId,
      salesOrderId: so.id,
      dispatchId: d.dispatchId,
      salesOrderItemId: item.id,
      kind: d.kind,
      qty: d.qty,
      detail: d.detail,
      date: toDbDate(d.date),
      createdById: user.id,
    },
  });
  if (d.backTo) await db.$transaction((tx) => returnMoves(tx, user, issue.id, d.backTo!, d.stockItemId, d.qty));
  await db.activity.create({
    data: {
      type: "SYSTEM",
      subject: `Material problem on ${so.number}: ${ISSUE_KINDS[d.kind].toLowerCase()}, ${d.qty} × ${item.description}${d.detail ? ` (${d.detail})` : ""}`,
      byId: user.id,
      clientId: so.clientId,
    },
  });
  return issue.id;
}

async function loadIssue(user: SessionUser, id: string) {
  const i = await db.materialIssue.findFirst({
    where: { id, client: clientScope(user) },
    include: { salesOrder: { include: { invoices: true } }, salesOrderItem: true },
  });
  if (!i) throw new NotFoundError("Material problem");
  if (i.status !== "OPEN") throw new DomainError("This problem is already settled.");
  return i;
}

export const replacementInput = z.object({
  date: z.string().refine(isDateStr, "Enter the dispatch date."),
  /** R54: what leaves the store: the kit (empty) or one of its items. */
  stockItemId: optText(40),
  transporter: optText(120),
  docketNo: optText(60),
  vehicleNo: optText(30),
});

/** Settles a problem by sending the items again on their own (replacement) challan. */
export async function sendReplacement(user: SessionUser, id: string, raw: unknown) {
  if (!(await getFeatures()).dispatch) throw new DomainError("Dispatch is switched off in Settings → Features.");
  const d = parse(replacementInput, raw);
  const i = await loadIssue(user, id);
  return withNextNumber("dispatch", "DC", async (tx, n) => {
    const dc = await tx.dispatch.create({
      data: {
        ...n,
        salesOrderId: i.salesOrderId,
        clientId: i.clientId,
        date: toDbDate(d.date),
        transporter: d.transporter,
        docketNo: d.docketNo,
        vehicleNo: d.vehicleNo,
        notes: `Replacement for ${ISSUE_KINDS[i.kind as IssueKind].toLowerCase()} material`,
        isReplacement: true,
        createdById: user.id,
        items: { create: [{ salesOrderItemId: i.salesOrderItemId, qty: i.qty, note: i.detail ? `replacement: ${i.detail}` : "replacement" }] },
      },
    });
    await tx.materialIssue.update({ where: { id: i.id }, data: { status: "REPLACED", replacementId: dc.id, resolvedOn: toDbDate(d.date) } });
    await dispatchMoves(tx, user, dc.id, [{ salesOrderItemId: i.salesOrderItemId, qty: i.qty, stockItemId: d.stockItemId }]);
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Replacement sent on ${i.salesOrder.number}: ${i.qty} × ${i.salesOrderItem.description}${i.detail ? ` (${i.detail})` : ""} · challan ${dc.number}`,
        byId: user.id,
        clientId: i.clientId,
      },
    });
    return dc.id;
  });
}

export const refundInput = z.object({
  amount: z.coerce.number().min(0.01, "Enter the amount."),
  date: z.string().refine(isDateStr, "Enter the date."),
  /** "credit": a credit note on the invoice lowers what the school owes; "paid": the money was paid back. */
  how: z.enum(["credit", "paid"]),
  note: optText(300),
});

/** Settles a problem with money: a credit note on the order's invoice, or a note that it was paid back. Admin / Sales Head only. */
export async function refundIssue(user: SessionUser, id: string, raw: unknown) {
  if (!canManageFinance(user.role)) throw new DomainError("Only an Admin or the Sales Head can refund or adjust money. Please ask them.");
  const d = parse(refundInput, raw);
  const i = await loadIssue(user, id);
  const what = `${ISSUE_KINDS[i.kind as IssueKind].toLowerCase()}: ${i.qty} × ${i.salesOrderItem.description}${i.detail ? ` (${i.detail})` : ""}`;
  if (d.how === "credit") {
    const inv = i.salesOrder.invoices.find((x) => x.status === "ISSUED");
    if (!inv) throw new DomainError("This order has no invoice yet. Correct the order's kits before invoicing instead, or record the money as paid back.");
    const cnId = await createCreditNote(user, inv.id, { date: d.date, amount: d.amount, reason: `Material ${what}`.slice(0, 300) });
    await db.materialIssue.update({
      where: { id: i.id },
      data: { status: "REFUNDED", creditNoteId: cnId, refundAmount: d.amount, resolvedOn: toDbDate(d.date), resolvedNote: d.note },
    });
    return;
  }
  await db.$transaction([
    db.materialIssue.update({ where: { id: i.id }, data: { status: "REFUNDED", refundAmount: d.amount, resolvedOn: toDbDate(d.date), resolvedNote: d.note } }),
    db.activity.create({
      data: { type: "SYSTEM", subject: `${inr(d.amount)} paid back for material ${what} on ${i.salesOrder.number}${d.note ? ` · ${d.note}` : ""}`, byId: user.id, clientId: i.clientId },
    }),
  ]);
}

/** Closes a problem that needs nothing more (e.g. the school kept the kits after all), with a note. */
export async function closeIssue(user: SessionUser, id: string, note: string) {
  const text = note.trim();
  if (text.length < 3) throw new DomainError("Write why it's closed.");
  const i = await loadIssue(user, id);
  await db.$transaction([
    db.materialIssue.update({ where: { id: i.id }, data: { status: "CLOSED", resolvedOn: toDbDate(todayIST()), resolvedNote: text.slice(0, 300) } }),
    db.activity.create({ data: { type: "SYSTEM", subject: `Material problem on ${i.salesOrder.number} closed: ${text.slice(0, 200)}`, byId: user.id, clientId: i.clientId } }),
  ]);
}


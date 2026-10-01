// Dispatch: kits leave in one or more lots, each with a numbered delivery
// challan (DC/YYYY/MM/NNN), transporter details and the school's proof of delivery.
import { z } from "zod";
import { db } from "@/lib/db";
import { fromDbDate, isDateStr, toDbDate } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { clientScope } from "../access";
import { DomainError, NotFoundError } from "../errors";
import { getFeatures } from "../features";
import { getQuotationContent } from "../quotation/content";
import { parse } from "../validation";
import { renderChallanPdf } from "./challan-pdf";
import { loadOrder, withNextNumber } from "./service";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => s || null);

export const dispatchInput = z.object({
  date: z.string().refine(isDateStr, "Enter the dispatch date."),
  transporter: optText(120),
  docketNo: optText(60),
  vehicleNo: optText(30),
  notes: optText(500),
  lines: z.array(z.object({ itemId: z.string().min(1), qty: z.coerce.number().int("Kits must be whole numbers.").min(0) })).min(1),
});

/** Kits ordered and already sent, per order line. */
async function sentPerLine(salesOrderId: string) {
  const rows = await db.dispatchItem.groupBy({ by: ["salesOrderItemId"], where: { dispatch: { salesOrderId } }, _sum: { qty: true } });
  return new Map(rows.map((r) => [r.salesOrderItemId, r._sum.qty ?? 0]));
}

export async function createDispatch(user: SessionUser, salesOrderId: string, raw: unknown) {
  if (!(await getFeatures()).dispatch) throw new DomainError("Dispatch is switched off in Settings → Features.");
  const d = parse(dispatchInput, raw);
  const so = await loadOrder(user, salesOrderId);
  if (so.status === "CANCELLED") throw new DomainError("This order is cancelled.");
  const sent = await sentPerLine(so.id);
  const lines = d.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new DomainError("Enter the number of kits going in this lot.");
  for (const l of lines) {
    const item = so.items.find((i) => i.id === l.itemId);
    if (!item) throw new DomainError("A line doesn't belong to this order.");
    const left = item.qty - (sent.get(item.id) ?? 0);
    if (l.qty > left) throw new DomainError(`Only ${left} kit(s) of ${item.description} are left to send.`);
  }
  return withNextNumber("dispatch", "DC", async (tx, n) => {
    const dc = await tx.dispatch.create({
      data: {
        ...n,
        salesOrderId: so.id,
        clientId: so.clientId,
        date: toDbDate(d.date),
        transporter: d.transporter,
        docketNo: d.docketNo,
        vehicleNo: d.vehicleNo,
        notes: d.notes,
        createdById: user.id,
        items: { create: lines.map((l) => ({ salesOrderItemId: l.itemId, qty: l.qty })) },
      },
    });
    const kits = lines.reduce((t, l) => t + l.qty, 0);
    const ordered = so.items.reduce((t, i) => t + i.qty, 0);
    const already = [...sent.values()].reduce((t, q) => t + q, 0);
    const done = already + kits >= ordered;
    // Everything sent: the order counts as delivered.
    if (done) await tx.salesOrder.update({ where: { id: so.id }, data: { status: "DELIVERED", deliveredOn: toDbDate(d.date) } });
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Dispatched ${kits} kit(s) on ${so.number} · challan ${dc.number}${d.transporter ? ` · ${d.transporter}` : ""}${d.docketNo ? ` ${d.docketNo}` : ""}${done ? " · order fully dispatched" : ` · ${ordered - already - kits} kit(s) still to send`}`,
        byId: user.id,
        clientId: so.clientId,
      },
    });
    return dc.id;
  });
}

async function loadDispatch(user: SessionUser, id: string) {
  const dc = await db.dispatch.findFirst({
    where: { id, client: clientScope(user) },
    include: { items: { include: { salesOrderItem: true } }, salesOrder: true, client: true },
  });
  if (!dc) throw new NotFoundError("Dispatch");
  return dc;
}

export async function markDispatchReceived(user: SessionUser, id: string, date: string) {
  if (!isDateStr(date)) throw new DomainError("Enter the date the school received the kits.");
  const dc = await loadDispatch(user, id);
  await db.$transaction([
    db.dispatch.update({ where: { id }, data: { receivedOn: toDbDate(date) } }),
    db.activity.create({ data: { type: "SYSTEM", subject: `School received challan ${dc.number}`, byId: user.id, clientId: dc.clientId } }),
  ]);
}

export async function deleteDispatch(user: SessionUser, id: string) {
  const dc = await loadDispatch(user, id);
  await db.$transaction([
    db.dispatch.delete({ where: { id } }),
    ...(dc.salesOrder.status === "DELIVERED"
      ? [db.salesOrder.update({ where: { id: dc.salesOrderId }, data: { status: "CONFIRMED", deliveredOn: null } })]
      : []),
    db.activity.create({ data: { type: "SYSTEM", subject: `Challan ${dc.number} deleted`, byId: user.id, clientId: dc.clientId } }),
  ]);
}

const dmy = (d: Date) => fromDbDate(d).split("-").reverse().join("-");

export async function challanPdf(user: SessionUser, id: string) {
  const dc = await loadDispatch(user, id);
  const content = await getQuotationContent();
  const c = dc.client;
  const pdf = await renderChallanPdf({
    number: dc.number,
    date: dmy(dc.date),
    orderNumber: dc.salesOrder.number,
    poNumber: dc.salesOrder.poNumber,
    schoolName: c.schoolName,
    contactName: c.contactName,
    mobile: c.mobile,
    address: [c.address, c.area, c.city].filter(Boolean).join(", ") || null,
    transporter: dc.transporter,
    docketNo: dc.docketNo,
    vehicleNo: dc.vehicleNo,
    notes: dc.notes,
    items: dc.items.map((i) => ({ description: i.salesOrderItem.description, qty: i.qty })),
    footerLines: content.footerLines,
    company: content.company,
  });
  return { number: dc.number, pdf };
}

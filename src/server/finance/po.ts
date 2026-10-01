// Purchase orders: the PO template we hand to schools (pre-filled from a sent
// quotation, to sign, seal and send back), and the signed PO they return,
// stored on the sales order with its PO number.
import { z } from "zod";
import { db } from "@/lib/db";
import { isDateStr, toDbDate } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { DomainError } from "../errors";
import { getQuotationContent } from "../quotation/content";
import { loadQuotation } from "../quotation/service";
import { parse } from "../validation";
import { renderPoTemplatePdf } from "./po-pdf";
import { loadOrder } from "./service";

export const PO_MAX_BYTES = 4 * 1024 * 1024; // Vercel accepts uploads up to about 4.5 MB
export const PO_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
};

const poInput = z.object({
  poNumber: z.string().trim().min(1, "Enter the PO number.").max(60),
  poDate: z
    .string()
    .nullish()
    .transform((s) => s || null)
    .refine((s) => s === null || isDateStr(s), "Enter a valid PO date."),
});

/** Sets the PO number/date on an order at any time (also after invoicing: the invoice shows it). */
export async function setPurchaseOrder(user: SessionUser, salesOrderId: string, raw: unknown) {
  const d = parse(poInput, raw);
  const so = await loadOrder(user, salesOrderId);
  if (so.status === "CANCELLED") throw new DomainError("This order is cancelled.");
  await db.$transaction([
    db.salesOrder.update({ where: { id: so.id }, data: { poNumber: d.poNumber, poDate: d.poDate ? toDbDate(d.poDate) : null } }),
    ...(so.poNumber !== d.poNumber
      ? [db.activity.create({ data: { type: "SYSTEM", subject: `PO ${d.poNumber} recorded on ${so.number}`, byId: user.id, clientId: so.clientId } })]
      : []),
  ]);
}

/** Stores (or replaces) the signed PO file for an order. */
export async function savePoFile(user: SessionUser, salesOrderId: string, file: { name: string; type: string; bytes: Uint8Array }) {
  const so = await loadOrder(user, salesOrderId);
  if (!PO_TYPES[file.type]) throw new DomainError("Upload the PO as a PDF or a photo (JPG or PNG).");
  if (!file.bytes.length) throw new DomainError("The file is empty.");
  if (file.bytes.length > PO_MAX_BYTES) throw new DomainError("The file is larger than 4 MB. Please upload a smaller PDF or photo.");
  const data = {
    fileName: file.name.slice(0, 200) || "purchase-order",
    contentType: file.type,
    size: file.bytes.length,
    data: Buffer.from(file.bytes),
    uploadedById: user.id,
    uploadedAt: new Date(),
  };
  await db.$transaction([
    db.purchaseOrderFile.upsert({ where: { salesOrderId: so.id }, create: { salesOrderId: so.id, ...data }, update: data }),
    db.activity.create({
      data: { type: "SYSTEM", subject: `Signed PO uploaded for ${so.number}${so.poNumber ? ` (PO ${so.poNumber})` : ""}`, byId: user.id, clientId: so.clientId },
    }),
  ]);
}

export async function poFile(user: SessionUser, salesOrderId: string) {
  const so = await loadOrder(user, salesOrderId);
  const f = await db.purchaseOrderFile.findUnique({ where: { salesOrderId: so.id } });
  if (!f) throw new DomainError("No PO file has been uploaded for this order.");
  return f;
}

/* ---------- PO template ---------- */

type QuoteForPo = { number: string; date: Date; schoolName: string; toLine: string; address: string | null; items: { description: string; price: unknown }[] };

async function templateFor(q: QuoteForPo, kits: (number | null)[]) {
  const content = await getQuotationContent();
  const [y, m, d] = q.date.toISOString().slice(0, 10).split("-");
  return renderPoTemplatePdf({
    schoolName: q.schoolName,
    address: q.address,
    quotationNumber: q.number,
    quotationDate: `${d}-${m}-${y}`,
    items: q.items.map((i, idx) => ({ description: i.description, price: Number(i.price), qty: kits[idx] ?? null })),
    supplierName: content.company.replace(/^For\s+/i, ""),
    supplierLines: content.footerLines,
    paymentTerms: content.payment,
  });
}

/** "40,25,," → [40, 25, null, null]: optional kits per quotation line. */
export function parseKits(raw: string | null | undefined): (number | null)[] {
  return (raw ?? "").split(",").map((s) => {
    const n = Number(s.trim());
    return s.trim() && Number.isInteger(n) && n > 0 && n < 1e6 ? n : null;
  });
}

export const poTemplateFileName = (school: string) => `PO-template-${school.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;

export async function poTemplatePdf(user: SessionUser, quotationId: string, kits: (number | null)[]) {
  const q = await loadQuotation(user, quotationId);
  if (q.status !== "SENT") throw new DomainError("Send the quotation first; the PO template is made from a sent quotation.");
  return { schoolName: q.schoolName, pdf: await templateFor(q, kits) };
}

/** Public: the school opens it from the quotation's WhatsApp link. */
export async function poTemplatePdfByToken(token: string, kits: (number | null)[]) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const q = await db.quotation.findUnique({ where: { shareToken: token }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!q || q.status !== "SENT") return null;
  return { schoolName: q.schoolName, pdf: await templateFor(q, kits) };
}

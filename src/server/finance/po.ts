// Purchase orders: the PO template we hand to schools (pre-filled from a sent
// quotation, to sign, seal and send back), and the signed PO they return,
// stored on the sales order with its PO number.
import { quotationChecklistKits, quotationExclusions } from "../products/checklist";
import { z } from "zod";
import { db } from "@/lib/db";
import { fromDbDate, isDateStr, toDbDate, todayIST } from "@/lib/dates";
import { financialYear } from "@/lib/fy";
import { Prisma } from "@/generated/prisma/client";
import { getDocumentSettings, startingNumber } from "../documents";
import type { SessionUser } from "@/lib/permissions";
import { DomainError } from "../errors";
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

/* ---------- PO template (the client's PO format) ---------- */

export const poDetailsInput = z.object({
  /** Kits demanded per quotation line (blank = the school fills it in). */
  kits: z.array(z.coerce.number().int().min(1).max(100000).nullable()).max(50).default([]),
  requisitioner: z.string().trim().max(120).default(""),
  deliveryDate: z
    .string()
    .nullish()
    .transform((s) => s || null)
    .refine((s) => s === null || isDateStr(s), "Enter a valid expected delivery date."),
  shipVia: z.string().trim().max(80).default(""),
  shippingTerms: z.string().trim().max(80).default(""),
  remarks: z.array(z.string().trim().max(200)).max(8).default([]),
  /** YES / NO per customisation line, in the order of Settings → Documents. */
  customise: z.array(z.boolean()).max(10).default([]),
  cheques: z
    .array(
      z.object({
        mode: z.string().trim().max(30),
        date: z
          .string()
          .nullish()
          .transform((s) => s || null)
          .refine((s) => s === null || isDateStr(s), "Enter valid cheque dates."),
        amount: z.coerce.number().min(0).max(1e10).nullable(),
      }),
    )
    .max(6)
    .default([]),
});
export type PoDetails = z.output<typeof poDetailsInput>;

const readDetails = (v: unknown): PoDetails => {
  const r = poDetailsInput.safeParse(v ?? {});
  return r.success ? r.data : poDetailsInput.parse({});
};

const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("-");
const ddmmyy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y.slice(2)}`;
};

/** Next PO number of this financial year, e.g. PO/2627/93 (never below Settings → Documents' starting number). */
async function nextPoNumber() {
  const fy = financialYear(todayIST());
  const prefix = `PO/${fy.compact}/`;
  const used = await db.quotation.findMany({ where: { poNumber: { startsWith: prefix } }, select: { poNumber: true } });
  const max = Math.max(0, ...used.map((u) => Number(u.poNumber!.slice(prefix.length)) || 0));
  return `${prefix}${Math.max(max + 1, await startingNumber("po", fy.label))}`;
}

/** Saves what the PO template prints and gives the quotation its PO number the first time. */
export async function savePoTemplate(user: SessionUser, quotationId: string, raw: unknown) {
  const q = await loadQuotation(user, quotationId);
  if (q.status !== "SENT") throw new DomainError("Send the quotation first; the PO template is made from a sent quotation.");
  const d = parse(poDetailsInput, raw);
  for (let attempt = 0; attempt < 5; attempt++) {
    const poNumber = q.poNumber ?? (await nextPoNumber());
    try {
      await db.quotation.update({ where: { id: q.id }, data: { poNumber, poDetails: d } });
      // The deal's value (pipeline, dashboard) from kits × rate, unless someone has typed one (R33).
      const value = q.items.reduce((t, it, i) => t + (d.kits[i] ?? 0) * Number(it.price), 0);
      if (q.opportunityId && value > 0) await db.opportunity.updateMany({ where: { id: q.opportunityId, expectedValue: null }, data: { expectedValue: Math.round(value) } });
      return poNumber;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && !q.poNumber) continue;
      throw e;
    }
  }
  throw new DomainError("Couldn't number the PO. Please try again.");
}

type QuoteForPo = {
  id: string;
  number: string;
  date: Date;
  sentAt: Date | null;
  schoolName: string;
  toLine: string;
  address: string | null;
  poNumber: string | null;
  poDetails: unknown;
  opportunityId: string | null;
  clientId: string | null;
  leadId: string | null;
  items: { description: string; price: unknown }[];
  preparedBy: { name: string; mobile: string | null; email: string };
};

async function templateFor(q: QuoteForPo) {
  const [docs, d] = [await getDocumentSettings(), readDetails(q.poDetails)];
  // The school's phone and email: from the client, else from the deal's lead.
  const contact = q.clientId
    ? await db.client.findUnique({ where: { id: q.clientId }, select: { mobile: true, email: true, contactName: true } })
    : q.opportunityId
      ? (await db.opportunity.findUnique({ where: { id: q.opportunityId }, select: { lead: { select: { mobile: true, email: true, contactName: true } } } }))?.lead
      : q.leadId
        ? await db.lead.findUnique({ where: { id: q.leadId }, select: { mobile: true, email: true, contactName: true } })
        : null;
  const issued = fromDbDate(q.sentAt ?? q.date);
  const fy = financialYear(issued);
  return renderPoTemplatePdf({
    poNumber: q.poNumber ?? "",
    issueDate: ddmmyyyy(issued),
    academicYear: `${fy.start} - ${String((fy.start + 1) % 100).padStart(2, "0")}`,
    seller: { name: "Wonder Learning India Pvt. Ltd", lines: docs.sellerLines },
    buyer: {
      name: q.schoolName,
      lines: [
        ...(q.address ? q.address.split(/\n|,\s*(?=\S)/).reduce<string[]>((out, part) => {
          const last = out[out.length - 1];
          if (last && (last + ", " + part).length <= 46) out[out.length - 1] = `${last}, ${part}`;
          else out.push(part);
          return out;
        }, []) : []),
        ...(contact?.mobile ? [`Tel. : ${contact.mobile}`] : []),
        ...(contact?.email ? [`email : ${contact.email}`] : []),
      ],
    },
    requisitioner: d.requisitioner || contact?.contactName || "",
    deliveryDate: d.deliveryDate ? ddmmyy(d.deliveryDate) : null,
    shipVia: d.shipVia,
    shippingTerms: d.shippingTerms || docs.poShippingTerms,
    items: q.items.map((i, idx) => ({ description: i.description, rate: Number(i.price), qty: d.kits[idx] ?? null })),
    remarks: d.remarks.filter(Boolean),
    terms: docs.poTerms,
    cheques: d.cheques.filter((c) => c.mode || c.date || c.amount).map((c) => ({ mode: c.mode, date: c.date ? ddmmyyyy(c.date) : null, amount: c.amount })),
    customise: docs.poCustomise.map((label, i) => ({ label, yes: d.customise[i] ?? true })),
    bankLines: docs.bankLines,
    executive: { name: q.preparedBy.name, mobile: q.preparedBy.mobile, email: q.preparedBy.email },
    exclude: await quotationExclusions(q.id),
    checklist: await quotationChecklistKits(q.id),
  });
}

export const poTemplateFileName = (school: string) => `PO-template-${school.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;

export async function poTemplatePdf(user: SessionUser, quotationId: string) {
  const q = await loadQuotation(user, quotationId);
  if (q.status !== "SENT") throw new DomainError("Send the quotation first; the PO template is made from a sent quotation.");
  return { schoolName: q.schoolName, pdf: await templateFor(q) };
}

/** Public: the school opens it from the WhatsApp link (the quotation's secret). */
export async function poTemplatePdfByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const q = await db.quotation.findUnique({
    where: { shareToken: token },
    include: { items: { orderBy: { sortOrder: "asc" } }, preparedBy: { select: { name: true, mobile: true, email: true } } },
  });
  if (!q || q.status !== "SENT") return null;
  return { schoolName: q.schoolName, pdf: await templateFor(q) };
}

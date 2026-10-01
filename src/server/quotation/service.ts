import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CLOSED_STAGES } from "@/lib/constants";
import { fromDbDate, isDateStr, todayIST, toDbDate } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { oppScope } from "../access";
import { DomainError, NotFoundError } from "../errors";
import { isEmailConfigured, sendMail } from "../mailer";
import { moveOpportunity } from "../opportunities";
import { parse } from "../validation";
import { getQuotationContent } from "./content";
import { renderQuotationPdf, type QuotationPdfData } from "./pdf";

const money = z
  .union([z.number(), z.string()])
  // A blank box is "missing", not zero.
  .transform((v) => (typeof v === "string" ? (v.trim() === "" ? NaN : Number(v.replace(/,/g, "").trim())) : v))
  .refine((n) => Number.isFinite(n) && n >= 0 && n < 1e9, "Enter a valid amount.");

export const quotationInput = z.object({
  date: z.string().refine(isDateStr, "Enter the quotation date."),
  validityDays: z.coerce.number().int().min(1, "Validity must be at least 1 day.").max(365),
  toLine: z.string().trim().min(1, "Enter who the quotation is addressed to (e.g. The Director).").max(120),
  schoolName: z.string().trim().min(1, "Enter the school name.").max(200),
  address: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((s) => s || null),
  items: z
    .array(
      z.object({
        productId: z
          .string()
          .nullish()
          .transform((s) => s || null),
        description: z.string().trim().min(1, "Each line needs a description.").max(200),
        mrp: money,
        price: money,
      }),
    )
    .min(1, "Add at least one product.")
    .max(50),
});

export const emailInput = z.object({
  to: z.string().trim().pipe(z.email("Enter the school's email address.")),
  cc: z
    .string()
    .trim()
    .nullish()
    .transform((s) => s || null)
    .refine((s) => s === null || s.split(",").every((x) => z.email().safeParse(x.trim()).success), "Check the CC email address."),
  message: z.string().trim().min(1, "Write a short message.").max(4000),
});

const formatNumber = (y: number, m: number, seq: number) => `QUO/${y}/${String(m).padStart(2, "0")}/${String(seq).padStart(3, "0")}`;

async function loadOpp(user: SessionUser, opportunityId: string) {
  const opp = await db.opportunity.findFirst({ where: { id: opportunityId, ...oppScope(user) }, include: { lead: true } });
  if (!opp) throw new NotFoundError("Opportunity");
  return opp;
}

async function loadQuotation(user: SessionUser, id: string) {
  const q = await db.quotation.findFirst({
    where: { id, opportunity: oppScope(user) },
    include: { opportunity: true, items: { orderBy: { sortOrder: "asc" } }, preparedBy: true },
  });
  if (!q) throw new NotFoundError("Quotation");
  return q;
}

/** Suggested values for a new quotation on this opportunity. */
export async function quotationDefaults(user: SessionUser, opportunityId: string) {
  const opp = await loadOpp(user, opportunityId);
  const content = await getQuotationContent();
  const items = await db.opportunityItem.findMany({ where: { opportunityId }, include: { product: true } });
  const l = opp.lead;
  return {
    date: todayIST(),
    validityDays: content.defaultValidityDays,
    toLine: "The Director",
    schoolName: opp.schoolName,
    address: l ? [l.address, l.area, l.city].filter(Boolean).join(", ") : "",
    items: items.map((i) => ({ productId: i.productId, description: i.product.name, mrp: "", price: "" })),
  };
}

/** A draft's saved values, in the editor's shape. */
export async function quotationForEdit(user: SessionUser, id: string) {
  const q = await loadQuotation(user, id);
  return {
    date: fromDbDate(q.date),
    validityDays: String(q.validityDays),
    toLine: q.toLine,
    schoolName: q.schoolName,
    address: q.address ?? "",
    items: q.items.map((i) => ({ productId: i.productId, description: i.description, mrp: String(Number(i.mrp)), price: String(Number(i.price)) })),
  };
}

export async function createQuotation(user: SessionUser, opportunityId: string, raw: unknown) {
  const d = parse(quotationInput, raw);
  const opp = await loadOpp(user, opportunityId);
  if (CLOSED_STAGES.includes(opp.stage)) throw new DomainError("Quotations can't be created for a closed deal.");
  const [y, m] = todayIST().split("-").map(Number);
  // Running number per month; retry if two people create one at the same moment.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const last = await tx.quotation.aggregate({ where: { year: y, month: m }, _max: { seq: true } });
        const seq = (last._max.seq ?? 0) + 1;
        const q = await tx.quotation.create({
          data: {
            number: formatNumber(y, m, seq),
            year: y,
            month: m,
            seq,
            opportunityId,
            date: toDbDate(d.date),
            validityDays: d.validityDays,
            toLine: d.toLine,
            schoolName: d.schoolName,
            address: d.address,
            shareToken: randomBytes(24).toString("base64url"),
            preparedById: user.id,
            items: { create: d.items.map((it, i) => ({ ...it, sortOrder: i })) },
          },
        });
        await tx.activity.create({
          data: { type: "SYSTEM", subject: `Quotation ${q.number} drafted`, byId: user.id, opportunityId, leadId: opp.leadId },
        });
        return q.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new DomainError("Couldn't number the quotation. Please try again.");
}

export async function updateQuotation(user: SessionUser, id: string, raw: unknown) {
  const d = parse(quotationInput, raw);
  const q = await loadQuotation(user, id);
  if (q.status !== "DRAFT") throw new DomainError("A sent quotation can't be changed. Use Revise to make a new version.");
  await db.$transaction([
    db.quotationItem.deleteMany({ where: { quotationId: id } }),
    db.quotation.update({
      where: { id },
      data: {
        date: toDbDate(d.date),
        validityDays: d.validityDays,
        toLine: d.toLine,
        schoolName: d.schoolName,
        address: d.address,
        items: { create: d.items.map((it, i) => ({ ...it, sortOrder: i })) },
      },
    }),
  ]);
}

export async function deleteQuotation(user: SessionUser, id: string) {
  const q = await loadQuotation(user, id);
  if (q.status !== "DRAFT") throw new DomainError("Only a draft can be deleted.");
  await db.quotation.delete({ where: { id } });
}

/** A new draft copied from an existing quotation (e.g. after a price change). */
export async function reviseQuotation(user: SessionUser, id: string) {
  const q = await loadQuotation(user, id);
  return createQuotation(user, q.opportunityId, {
    date: todayIST(),
    validityDays: q.validityDays,
    toLine: q.toLine,
    schoolName: q.schoolName,
    address: q.address,
    items: q.items.map((i) => ({ productId: i.productId, description: i.description, mrp: Number(i.mrp), price: Number(i.price) })),
  });
}

export type SentVia = "download" | "whatsapp" | "email";

/** Records that the quotation went out; an early-stage deal moves to Proposal Sent. */
export async function markQuotationSent(user: SessionUser, id: string, via: SentVia, emailedTo?: string) {
  const q = await loadQuotation(user, id);
  const label = { download: "downloaded to send", whatsapp: "shared on WhatsApp", email: `emailed to ${emailedTo}` }[via];
  await db.$transaction([
    db.quotation.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: q.sentAt ?? new Date(),
        sentVia: via,
        ...(emailedTo ? { emailedTo } : {}),
      },
    }),
    db.activity.create({
      data: {
        type: via === "email" ? "EMAIL" : via === "whatsapp" ? "WHATSAPP" : "NOTE",
        subject: `Quotation ${q.number} ${label}`,
        byId: user.id,
        opportunityId: q.opportunityId,
        leadId: q.opportunity.leadId,
      },
    }),
  ]);
  if (q.opportunity.stage === "INTERESTED" || q.opportunity.stage === "DEMO_SCHEDULED")
    await moveOpportunity(user, q.opportunityId, { stage: "PROPOSAL_SENT" });
}

function pdfData(q: Awaited<ReturnType<typeof loadQuotation>>, content: Awaited<ReturnType<typeof getQuotationContent>>): QuotationPdfData {
  const [y, m, d] = fromDbDate(q.date).split("-");
  return {
    number: q.number,
    date: `${d}-${m}-${y}`,
    validityDays: q.validityDays,
    toLine: q.toLine,
    schoolName: q.schoolName,
    address: q.address,
    preparedBy: q.preparedBy.name,
    preparedByMobile: q.preparedBy.mobile,
    items: q.items.map((i) => ({ description: i.description, mrp: Number(i.mrp), price: Number(i.price) })),
    content,
  };
}

export const pdfFileName = (number: string) => `Quotation-${number.replace(/\//g, "-")}.pdf`;

export async function quotationPdf(user: SessionUser, id: string) {
  const q = await loadQuotation(user, id);
  return { number: q.number, pdf: await renderQuotationPdf(pdfData(q, await getQuotationContent())) };
}

/** For the WhatsApp link: anyone with the secret link may view that one PDF. */
export async function quotationPdfByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const q = await db.quotation.findUnique({
    where: { shareToken: token },
    include: { opportunity: true, items: { orderBy: { sortOrder: "asc" } }, preparedBy: true },
  });
  if (!q || q.status !== "SENT") return null;
  return { number: q.number, pdf: await renderQuotationPdf(pdfData(q, await getQuotationContent())) };
}

export async function emailQuotation(user: SessionUser, id: string, raw: unknown) {
  if (!isEmailConfigured()) throw new DomainError("Email sending isn't set up yet. Download or share on WhatsApp instead.");
  const d = parse(emailInput, raw);
  const q = await loadQuotation(user, id);
  const pdf = await renderQuotationPdf(pdfData(q, await getQuotationContent()));
  try {
    await sendMail({
      to: d.to,
      cc: d.cc ?? undefined,
      replyTo: q.preparedBy.email,
      subject: `Quotation ${q.number} – Wonder Learning`,
      text: d.message,
      attachments: [{ filename: pdfFileName(q.number), content: pdf, contentType: "application/pdf" }],
    });
  } catch (e) {
    console.error(e);
    throw new DomainError("The email couldn't be sent. Check the address and try again, or download the PDF instead.");
  }
  await markQuotationSent(user, id, "email", d.to);
}

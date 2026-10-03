// Settings for the PO template and the payment receipt, in the client's own formats
// (Settings → Documents). Stored as one AppSetting row; defaults are copied from the
// client's sample PO (Caring Hood Preschool) and receipt (117/26-27).
import { z } from "zod";
import { db } from "@/lib/db";
import { financialYear } from "@/lib/fy";
import { todayIST } from "@/lib/dates";
import { parse } from "./validation";

export type DocumentSettings = {
  /** Seller block on the PO (the office that issues it). */
  sellerLines: string[];
  /** Address under the company name on receipts. */
  receiptLines: string[];
  /** Name under the signature on receipts, e.g. "Mr. Viren Dogra". */
  signatory: string;
  /** Bank details printed on the PO ("A/c Name: …" one per line). */
  bankLines: string[];
  poTerms: string[];
  /** "Items to be customised with school name & logo" rows (YES / NO chosen per PO). */
  poCustomise: string[];
  poShippingTerms: string;
  /** Next numbers for the current financial year; the CRM never goes below the highest number already used. */
  numbering: { fy: string; nextReceipt: number | null; nextPo: number | null };
};

export const DEFAULT_DOCUMENTS: DocumentSettings = {
  sellerLines: [
    "Flat No. 5, Guruprasad Apartment, Sun City Rd,",
    "Anand Nagar, Pune, Maharashtra 411051",
    "Tel: 8956022183",
    "Email: wonderlearningindia@gmail.com",
    "Web: www.wonderlearning.in",
  ],
  receiptLines: ["E24/85, Near Dexon Casting, chikalthana MIDC,", "Chh. Sambhajinagar, Maharashtra - 431006"],
  signatory: "Mr. Viren Dogra",
  bankLines: [
    "A/c Name: Wonder Learning India Pvt. Ltd.",
    "A/C Number: 50200030887625",
    "Bank Name: HDFC Bank · Branch: Bhandarkar Rd",
    "IFSC Code: HDFC0000007",
  ],
  poTerms: [
    "Advance payment is non-refundable.",
    "Goods **once sold will not be taken back** under any circumstances",
    "Delivery within 45 days on payment clearance and subject to stock",
    "Mode of Payment : Cheque /Demand Draft / NEFT",
    'Payment payable to "**Wonder Learning India Pvt. Ltd.**"',
  ],
  poCustomise: [
    "Cover pages of all the Textbooks & Notebooks",
    "Cover page of Memory Album",
    "Student ID Card, Report card",
    "Sport Cert, Graduation Cert & Medal",
  ],
  poShippingTerms: "Door Delivery",
  numbering: { fy: "", nextReceipt: null, nextPo: null },
};

const KEY = "documents";
const lines = (max: number) => z.array(z.string().trim().min(1).max(300)).max(max);
const next = z.coerce.number().int().min(1).max(999999).nullable();
export const documentsSchema = z.object({
  sellerLines: lines(8),
  receiptLines: lines(4),
  signatory: z.string().trim().min(1).max(80),
  bankLines: lines(6),
  poTerms: lines(12),
  poCustomise: lines(10),
  poShippingTerms: z.string().trim().max(80),
  numbering: z.object({ fy: z.string().max(9), nextReceipt: next, nextPo: next }),
});

export async function getDocumentSettings(): Promise<DocumentSettings> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  const parsed = row ? documentsSchema.safeParse({ ...DEFAULT_DOCUMENTS, ...(row.value as object) }) : null;
  return parsed?.success ? parsed.data : DEFAULT_DOCUMENTS;
}

export async function saveDocumentSettings(userId: string, raw: unknown) {
  const d = parse(documentsSchema, raw);
  // Starting numbers belong to the financial year they were set in.
  d.numbering.fy = financialYear(todayIST()).label;
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: d, updatedById: userId }, update: { value: d, updatedById: userId } });
}

/** The starting number set for this kind in this financial year, if any. */
export async function startingNumber(kind: "receipt" | "po", fyLabel: string): Promise<number> {
  const n = (await getDocumentSettings()).numbering;
  if (n.fy !== fyLabel) return 1;
  return (kind === "receipt" ? n.nextReceipt : n.nextPo) ?? 1;
}

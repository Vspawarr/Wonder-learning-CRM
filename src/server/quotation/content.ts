// The quotation's standard text: page 1 terms box, page 2 (kit components &
// services), page 3 (terms, payment schedule, notes) and the footer address.
// Defaults are Wonder Learning's quotation format; Directors/Admins edit them in
// Settings → Quotation. Stored as one AppSetting row.
import { z } from "zod";
import { db } from "@/lib/db";

import type { KitSection } from "@/lib/quotation-text";

export type { KitSection };

export type QuotationContent = {
  defaultValidityDays: number;
  footerLines: string[];
  quoteTerms: string[];
  kitLeft: KitSection[];
  kitRight: KitSection[];
  /** Lines starting with "!" print in red; **text** prints in bold. */
  terms: string[];
  payment: string[];
  notes: string[];
  closing: string[];
  company: string;
};

export const DEFAULT_CONTENT: QuotationContent = {
  defaultValidityDays: 3,
  footerLines: [
    "Flat No. 5, Guruprasad Apartment, Sun City Rd,",
    "Anand Nagar, Sinhgad Rd, Pune, MH - 411051",
    "Contact: 8956022183 | Web: wonderlearning.in",
    "Email: wonderlearningindia@gmail.com",
  ],
  quoteTerms: [
    "The quotation is valid for two weeks from the date provided.",
    "To accept this quotation, sign and send it to the email address mentioned above.",
  ],
  kitLeft: [
    { title: "Study Kit", items: ["Text Books", "Note Books (Pre-written)", "Assessment (4 Units-Hard copy)", "Checklist - Kit Contents", "Kit Packing Box"] },
    {
      title: "Optional",
      items: [
        "Hindi Swar TB & NB",
        "Hindi Vyanjan TB & NB",
        "Hindi Shabad Gyan TB & NB",
        "Hindi Matra Gyan TB & NB",
        "Cursive Text Book",
        "My Reader Book- Phonics",
        "Nursery Practice Notebooks- 2",
      ],
    },
    { title: "Admin Support", items: ["School ERP", "Teachers App", "Parents App"] },
    {
      title: "Support & Services",
      items: [
        "DTP (Daily Teaching Plan- Soft Copy)",
        "Monthly & Weekly lesson plans- Printed Copy",
        "Teachers Manual",
        "Teachers Training- 1 (Cumulative)",
        "Audit/Observation visits- 1",
        "Continuous academic support over call/video",
        "Digital Library",
        "ERP System",
        "Parent App.",
        "Teachers App.",
      ],
    },
  ],
  kitRight: [
    {
      title: "Common Kit",
      items: [
        "School Bag",
        "Student Diary",
        "Student Memory Album",
        "Student I-card with sling",
        "Parents Escort card",
        "10- Invitation Cards for various events",
        "Students Annual Report Card",
        "Sports Day Medal",
        "Sports Day Certificate",
        "Student Convocation Certificate",
      ],
    },
    {
      title: "Resource Kit",
      items: [
        "Portfolio File & Portfolio Book",
        "64 Flash Cards (F/B)",
        "10 Academic Poster",
        "20 Art & Craft Activities",
        "3 Tracing Slate with Marker",
        "Feber Castell- Jumbo Crayons",
        "Feber Castell Conical Crayon (PG)",
        "Feber Castell Play Dough (PG)",
      ],
    },
    {
      title: "Items to be customized",
      items: [
        "Books & Notebooks Cover Pages",
        "School Bag",
        "Memory Album",
        "ID-Card with customized Lanyard",
        "Annual Report Card",
        "Student Diary",
        "Sport Cert. & Sport Medal",
        "Graduation Cert",
      ],
    },
  ],
  terms: [
    "!School will get school Bags, Text Books, Work Books, Note Books, Student Diary, Annual Report card & other merchandised material customised with their logo & name on the cumulative order of 150 or above 150 student kits.",
    "School with order less than 150 student kits can avail the customised stuff by paying **Rs. 200/- per student kit extra**",
    "Any Shipment takes min. 45 days to deliver goods.",
    "Min. 50 kits order is required",
  ],
  payment: [
    "An advance payment of 40% of PO value via CDC (Current Dated Chq.) should be made along with PO.",
    "A PDC for 30% payment of PO value should be presented against Proforma Invoice & handed over to the representative of Wonder Learning at the time of delivery.",
    "A PDC for 30% payment of PO value should be given along with PO to be cleared within 45 days after delivery of the material.",
  ],
  notes: [
    "School will make the payment through NEFT/Cheques only.",
    "Payment should be made by cheques “payable at par in India” of Nationalised/ private Banks only.",
    "Co-operative banking cheques will not be acceptable.",
    "Payment should be made to “Wonder Learning India Pvt. Ltd” only",
    "Kit cost is all inclusive.. No extra GST.",
    "School will provide 1 CDC & 2 PDCs (Post Dated Cheque) along with the Purchase Order (P.O.).",
  ],
  closing: [
    "Looking forward to our fruitful & healthy business relationships soon.",
    "Thanking you and assuring our best services at all times.",
  ],
  company: "For Wonder Learning India Pvt. Ltd.",
};

const KEY = "quotation.content";

const sections = z.array(z.object({ title: z.string().trim().min(1).max(80), items: z.array(z.string().trim().min(1).max(300)).max(40) })).max(10);
const lines = (max: number) => z.array(z.string().trim().min(1).max(600)).max(max);
export const contentSchema = z.object({
  defaultValidityDays: z.coerce.number().int().min(1).max(365),
  footerLines: lines(6),
  quoteTerms: lines(8),
  kitLeft: sections,
  kitRight: sections,
  terms: lines(20),
  payment: lines(20),
  notes: lines(20),
  closing: lines(6),
  company: z.string().trim().min(1).max(120),
});

export async function getQuotationContent(): Promise<QuotationContent> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  const parsed = row ? contentSchema.safeParse(row.value) : null;
  return parsed?.success ? parsed.data : DEFAULT_CONTENT;
}

export async function saveQuotationContent(userId: string, content: QuotationContent) {
  await db.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: content, updatedById: userId },
    update: { value: content, updatedById: userId },
  });
}

export async function resetQuotationContent() {
  await db.appSetting.deleteMany({ where: { key: KEY } });
}

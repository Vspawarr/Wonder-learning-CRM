import { canManageSettings } from "@/lib/permissions";
import { todayIST } from "@/lib/dates";
import { currentUser } from "@/server/session";
import { getQuotationContent } from "@/server/quotation/content";
import { renderQuotationPdf } from "@/server/quotation/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sample quotation using the saved standard text, for checking edits in Settings. */
export async function GET() {
  const user = await currentUser();
  if (!user || !canManageSettings(user.role)) return new Response("Not allowed.", { status: 403 });
  const [y, m, d] = todayIST().split("-");
  const content = await getQuotationContent();
  const pdf = await renderQuotationPdf({
    number: `QUO/${y}/${m}/000`,
    date: `${d}-${m}-${y}`,
    validityDays: content.defaultValidityDays,
    toLine: "The Director",
    schoolName: "Sample Preschool",
    address: "School address, Area, City",
    preparedBy: user.name,
    preparedByMobile: null,
    items: [
      { description: "PG Academic Kit", mrp: 3700, price: 2800 },
      { description: "NUR Academic Kit", mrp: 4800, price: 3400 },
    ],
    content,
  });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="Quotation-sample.pdf"', "Cache-Control": "no-store" },
  });
}

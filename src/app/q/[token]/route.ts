import { pdfFileName, quotationPdfByToken } from "@/server/quotation/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shareable link to one sent quotation's PDF (sent to the school on WhatsApp). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const found = await quotationPdfByToken((await params).token);
  if (!found) return new Response("This quotation link is not valid.", { status: 404 });
  return new Response(new Uint8Array(found.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName(found.number)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

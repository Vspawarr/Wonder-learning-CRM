import { receiptFileName, receiptPdfByToken } from "@/server/finance/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shareable link to one payment receipt (sent to the school on WhatsApp). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const found = await receiptPdfByToken((await params).token);
  if (!found) return new Response("This receipt link is not valid.", { status: 404 });
  return new Response(new Uint8Array(found.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${receiptFileName(found.number)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

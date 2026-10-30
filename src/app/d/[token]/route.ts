import { sharedPdf } from "@/server/share-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Private link to a proforma invoice, delivery challan or credit note PDF (sent to the school on WhatsApp). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const found = await sharedPdf((await params).token);
  if (!found) return new Response("This link is not valid.", { status: 404 });
  return new Response(new Uint8Array(found.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${found.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

import { parseKits, poTemplateFileName, poTemplatePdfByToken } from "@/server/finance/po";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shareable PO template link (sent to the school on WhatsApp with the quotation's secret). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const found = await poTemplatePdfByToken((await params).token, parseKits(new URL(req.url).searchParams.get("kits")));
  if (!found) return new Response("This link is not valid.", { status: 404 });
  return new Response(new Uint8Array(found.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${poTemplateFileName(found.schoolName)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

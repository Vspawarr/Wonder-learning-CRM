import { db } from "@/lib/db";
import { CHECKLIST_FILE, checklistForQuotation } from "@/server/products/checklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shareable kit checklist for a quotation (the kits it quotes), sent with the quotation / PO template. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const q = /^[A-Za-z0-9_-]{20,}$/.test(token) ? await db.quotation.findUnique({ where: { shareToken: token }, select: { id: true } }) : null;
  const pdf = q ? await checklistForQuotation(q.id) : null;
  if (!pdf) return new Response("This link is not valid.", { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${CHECKLIST_FILE}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
